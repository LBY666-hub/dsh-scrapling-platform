import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "runner.py");
const API_PATH = "/scrapling-api";

function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Default venv layout this plugin documents: <DSH_HOME>/.venvs/scrapling */
function defaultPython() {
	const root = join(dshHome(), ".venvs", "scrapling");
	const candidates =
		process.platform === "win32"
			? [join(root, "Scripts", "python.exe")]
			: [join(root, "bin", "python3"), join(root, "bin", "python")];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return process.platform === "win32" ? "python" : "python3";
}

function defaultChrome() {
	const candidates =
		process.platform === "win32"
			? [
					"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
					"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
					join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
					"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
				]
			: process.platform === "darwin"
				? [
						"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
						"/Applications/Chromium.app/Contents/MacOS/Chromium",
					]
				: [
						"/usr/bin/google-chrome",
						"/usr/bin/google-chrome-stable",
						"/usr/bin/chromium",
						"/usr/bin/chromium-browser",
					];
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	return "";
}

const JOBS = new Map();
const MAX_LOG = 600;
const MAX_ITEMS = 400;
const MAX_HITS = 100;
const KEEP_JOBS = 8;

let activeId = null;
let lastId = null;

function json(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	res.end(body);
}

async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 1_000_000) throw new Error("请求体超过 1MB");
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString("utf8").trim();
	return text ? JSON.parse(text) : {};
}

function now() {
	return Date.now();
}

function makeState(params) {
	return {
		id: "",
		status: "running",
		stage: "launch",
		startedAt: now(),
		finishedAt: null,
		params,
		logs: [],
		pages: [],
		items: [],
		hits: [],
		hitsCount: 0,
		images: [],
		downloadDir: "",
		markdown: "",
		stats: { pages: 0, items: 0, bytes: 0, elapsed: 0 },
		error: null,
	};
}

function pushLog(state, message) {
	state.logs.push({ ts: now(), msg: String(message).slice(0, 2000) });
	if (state.logs.length > MAX_LOG) state.logs.splice(0, state.logs.length - MAX_LOG);
}

function applyEvent(state, event) {
	switch (event.t) {
		case "stage":
			state.stage = event.stage || state.stage;
			break;
		case "log":
			pushLog(state, event.msg);
			break;
		case "page":
			state.pages.push({ url: event.url, status: event.status ?? 0, ms: event.ms ?? 0, at: now() });
			if (state.pages.length > 200) state.pages.shift();
			break;
		case "item":
			if (state.items.length < MAX_ITEMS) state.items.push(event.data);
			break;
		case "hits":
			state.hits = (event.items || []).slice(0, MAX_HITS);
			state.hitsCount = event.count || state.hits.length;
			break;
		case "markdown":
			state.markdown = event.text || "";
			break;
		case "image":
			state.images.push({
				index: event.index,
				url: event.url,
				name: event.name || "",
				bytes: event.bytes || 0,
				ok: event.ok !== false,
				err: event.err || "",
			});
			break;
		case "saved":
			state.downloadDir = event.dir || "";
			pushLog(state, `文件已保存到 ${event.dir}`);
			break;
		case "stats":
			state.stats = {
				pages: event.pages ?? state.stats.pages,
				items: event.items ?? state.stats.items,
				bytes: event.bytes ?? state.stats.bytes,
				elapsed: event.elapsed ?? state.stats.elapsed,
			};
			state.pages.length = state.pages.length; // keep page list stable
			break;
		case "done":
			state.status = "done";
			state.stage = "done";
			state.finishedAt = now();
			state.stats.elapsed = event.elapsed ?? state.stats.elapsed;
			pushLog(state, `完成，用时 ${event.elapsed ?? "?"} 秒`);
			break;
		case "error":
			state.status = "error";
			state.stage = "error";
			state.finishedAt = now();
			state.error = event.msg || "未知错误";
			break;
		default:
			break;
	}
}

function trimJobs() {
	if (JOBS.size <= KEEP_JOBS) return;
	const finished = [...JOBS.values()]
		.filter((job) => job.state.status !== "running")
		.sort((a, b) => (a.state.startedAt || 0) - (b.state.startedAt || 0));
	while (JOBS.size > KEEP_JOBS && finished.length) {
		const job = finished.shift();
		JOBS.delete(job.id);
	}
}

function startJob(options, config) {
	if (activeId) {
		const running = JOBS.get(activeId);
		return { error: `已有任务在运行（${running ? running.state.params.url : activeId}），请先停止` };
	}
	if (!options || typeof options.url !== "string" || !options.url.trim()) {
		return { error: "请填写要抓取的 URL" };
	}
	if (!existsSync(RUNNER)) {
		return { error: `找不到 runner.py：${RUNNER}` };
	}
	if (config.python.includes("/") || config.python.includes("\\")) {
		if (!existsSync(config.python)) {
			return {
				error: `找不到 Python：${config.python}。请按 README 把 Scrapling 装到 <DSH_HOME>/.venvs/scrapling，或在插件配置里改 python 路径`,
			};
		}
	}

	const id = `job-${Date.now().toString(36)}`;
	const params = {
		url: options.url.trim(),
		mode: options.mode === "browser" || options.mode === "spider" ? options.mode : "http",
		selector: options.selector || "",
		output: options.output || "markdown",
		timeout: Number(options.timeout) || 30,
		headless: options.headless !== false,
		solveCloudflare: Boolean(options.solveCloudflare),
		networkIdle: Boolean(options.networkIdle),
		waitSelector: options.waitSelector || "",
		proxy: options.proxy || "",
		impersonate: options.impersonate || "chrome",
		maxPages: Number(options.maxPages) || 5,
		follow: Boolean(options.follow),
		concurrency: Number(options.concurrency) || 4,
		images: Boolean(options.images),
		imageLimit: Math.min(60, Math.max(1, Number(options.imageLimit) || 20)),
	};
	const state = makeState(params);
	state.id = id;

	if (params.images) {
		try {
			const dir = join(config.downloadRoot, id);
			mkdirSync(dir, { recursive: true });
			state.downloadDir = dir;
		} catch (error) {
			state.downloadDir = "";
			pushLog(state, `无法创建下载目录：${error.message}`);
		}
	}

	const child = spawn(config.python, ["-X", "utf8", RUNNER], {
		cwd: HERE,
		windowsHide: true,
		env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
		stdio: ["pipe", "pipe", "pipe"],
	});

	const job = { id, child, state, buffer: "", stderr: "" };
	JOBS.set(id, job);
	activeId = id;
	lastId = id;

	pushLog(state, `已启动进程 pid=${child.pid || "?"}`);

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		job.buffer += chunk;
		let index = job.buffer.indexOf("\n");
		while (index !== -1) {
			const line = job.buffer.slice(0, index).trim();
			job.buffer = job.buffer.slice(index + 1);
			if (line) {
				try {
					applyEvent(state, JSON.parse(line));
				} catch {
					pushLog(state, line.slice(0, 500));
				}
			}
			index = job.buffer.indexOf("\n");
		}
	});

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => {
		job.stderr = (job.stderr + chunk).slice(-4000);
	});

	child.on("error", (error) => {
		state.status = "error";
		state.stage = "error";
		state.error = `无法启动 Python：${error.message}`;
		state.finishedAt = now();
		activeId = null;
	});

	child.on("close", (code) => {
		if (state.status === "running") {
			if (code === 0) {
				state.status = "done";
				state.stage = "done";
				state.finishedAt = now();
				if (!state.stats.elapsed) state.stats.elapsed = Math.round((state.finishedAt - state.startedAt) / 100) / 10;
			} else {
				state.status = "error";
				state.stage = "error";
				state.finishedAt = now();
				const tail = job.stderr.trim().split("\n").slice(-6).join("\n");
				state.error = state.error || `进程退出码 ${code}${tail ? "：" + tail : ""}`;
			}
		}
		if (activeId === id) activeId = null;
		trimJobs();
	});

	// Feed the job description through stdin so no quoting can break paths.
	try {
		child.stdin.write(
			JSON.stringify({
				...params,
				executablePath: config.chrome,
				downloadDir: state.downloadDir,
			}),
		);
		child.stdin.end();
	} catch (error) {
		pushLog(state, `写入参数失败：${error.message}`);
	}

	return { id };
}

function stopJob() {
	if (!activeId) return { ok: false, error: "当前没有运行中的任务" };
	const job = JOBS.get(activeId);
	if (!job) return { ok: false, error: "任务早已结束" };
	try {
		job.child.kill();
	} catch {
		/* ignore */
	}
	job.state.status = "cancelled";
	job.state.stage = "cancelled";
	job.state.finishedAt = now();
	pushLog(job.state, "任务已手动停止");
	activeId = null;
	return { ok: true };
}

function statePayload(id, includeMarkdown) {
	const job = JOBS.get(id || activeId || lastId || "");
	if (!job) return null;
	const state = job.state;
	return {
		id: state.id,
		status: state.status,
		stage: state.stage,
		startedAt: state.startedAt,
		finishedAt: state.finishedAt,
		params: state.params,
		logs: state.logs,
		pages: state.pages,
		items: state.items,
		hits: state.hits,
		hitsCount: state.hitsCount,
		images: state.images,
		downloadDir: state.downloadDir,
		stats: state.stats,
		error: state.error,
		markdown: includeMarkdown || state.status !== "running" ? state.markdown : "",
	};
}

export function apply(ctx, config = {}) {
	const settings = {
		python: config.python || process.env.SCRAPLING_PYTHON || defaultPython(),
		chrome: config.chrome || process.env.SCRAPLING_CHROME || defaultChrome(),
		downloadRoot: config.downloadRoot || join(dshHome(), "scrapling-downloads"),
	};

	ctx.effect(() => {
		return () => {
			for (const job of JOBS.values()) {
				try {
					job.child.kill();
				} catch {
					/* ignore */
				}
			}
			JOBS.clear();
			activeId = null;
		};
	}, "scrapling panel: stop child processes on unload");

	ctx.inject(["webServer"], (webCtx) => {
		return webCtx.webServer.register({
			kind: "prefix",
			path: API_PATH,
			handler: async (req, res) => {
				try {
					const url = new URL(req.url || "/", "http://localhost");
					const sub = url.pathname.slice(API_PATH.length) || "/";
					const method = (req.method || "GET").toUpperCase();

					if (method === "GET" && sub === "/env") {
						json(res, 200, {
							python: settings.python,
							pythonReady: existsSync(settings.python),
							chrome: settings.chrome,
							chromeReady: existsSync(settings.chrome),
							runnerReady: existsSync(RUNNER),
							busy: Boolean(activeId),
						});
						return;
					}

					if (method === "GET" && sub === "/state") {
						const payload = statePayload(url.searchParams.get("id"), url.searchParams.get("full") === "1");
						json(res, 200, { job: payload });
						return;
					}

					if (method === "POST" && sub === "/run") {
						const body = await readJsonBody(req);
						const result = startJob(body, settings);
						json(res, result.error ? 409 : 200, result);
						return;
					}

					if (method === "GET" && sub === "/file") {
						const jobId = url.searchParams.get("job") || "";
						const name = url.searchParams.get("name") || "";
						if (!/^job-[a-z0-9]+$/i.test(jobId) || !name || /[\\/]/.test(name)) {
							json(res, 400, { error: "参数不合法" });
							return;
						}
						const dir = resolve(settings.downloadRoot, jobId);
						const file = resolve(dir, name);
						if (!file.startsWith(dir)) {
							json(res, 400, { error: "路径越界" });
							return;
						}
						if (!existsSync(file)) {
							json(res, 404, { error: "文件不存在" });
							return;
						}
						const types = {
							".png": "image/png",
							".jpg": "image/jpeg",
							".jpeg": "image/jpeg",
							".gif": "image/gif",
							".webp": "image/webp",
							".svg": "image/svg+xml",
						};
						res.writeHead(200, {
							"content-type": types[extname(file).toLowerCase()] || "application/octet-stream",
							"cache-control": "private, max-age=600",
						});
						res.end(readFileSync(file));
						return;
					}

					if (method === "POST" && sub === "/cancel") {
						json(res, 200, stopJob());
						return;
					}

					json(res, 404, { error: `未知路径 ${sub}` });
				} catch (error) {
					json(res, 400, { error: error instanceof Error ? error.message : String(error) });
				}
			},
		});
	});
}
