import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

function readJsonlItems(dir) {
	const items = [];
	try {
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".jsonl") || !name.includes("contents")) continue;
			let text = "";
			try {
				text = readFileSync(join(dir, name), "utf8");
			} catch {
				continue;
			}
			for (const line of text.split(/\r?\n/)) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					items.push(JSON.parse(trimmed));
				} catch {
					/* skip malformed line */
				}
				if (items.length >= MAX_ITEMS) return items;
			}
		}
	} catch {
		/* directory missing */
	}
	return items;
}

function stripAnsi(text) {
	return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function startMediaCrawler(options, config) {
	const dir = config.mediacrawlerDir;
	if (!dir || !existsSync(join(dir, "main.py"))) {
		return {
			error: `找不到 MediaCrawler 项目目录：${dir || "(未配置)"}。请在插件配置里设置 mediacrawlerDir，或把 MediaCrawler-main 放在任一工作区目录下`,
		};
	}
	if (!existsSync(config.mediacrawlerPython)) {
		return {
			error: `找不到 MediaCrawler 的 Python：${config.mediacrawlerPython}。请按 README 为它建 venv，或在配置里改 mediacrawlerPython`,
		};
	}
	const keywords = String(options.keywords || "").trim();
	if (!keywords) return { error: "请填写关键词，多个用英文逗号分隔" };

	const id = `job-${Date.now().toString(36)}`;
	const params = {
		engine: "mediacrawler",
		platform: options.platform || "xhs",
		keywords,
		crawlType: options.crawlType || "search",
		loginType: options.loginType || "qrcode",
		headless: options.headless !== false,
		comments: Boolean(options.comments),
		subComments: Boolean(options.subComments),
		maxComments: Number(options.maxComments) || 10,
		concurrency: Number(options.concurrency) || 4,
		startPage: Number(options.startPage) || 1,
		saveOption: options.saveOption || "jsonl",
		specifiedId: options.specifiedId || "",
		creatorId: options.creatorId || "",
		ipProxy: Boolean(options.ipProxy),
		ipProxyProvider: options.ipProxyProvider || "",
		ipProxyCount: Number(options.ipProxyCount) || 0,
	};
	const state = makeState(params);
	state.id = id;
	state.stage = "launch";

	let workDir = "";
	try {
		workDir = makeJobDir(config.outputRoot, "mediacrawler", `${params.platform}-${keywords}`);
		state.downloadDir = workDir;
	} catch (error) {
		return { error: `无法创建结果目录：${error.message}` };
	}

	const args = [
		"main.py",
		"--platform",
		params.platform,
		"--lt",
		params.loginType,
		"--type",
		params.crawlType,
		"--keywords",
		keywords,
		"--start",
		String(params.startPage),
		"--save_data_option",
		params.saveOption,
		"--save_data_path",
		workDir,
		"--headless",
		params.headless ? "yes" : "no",
		"--max_concurrency_num",
		String(params.concurrency),
		"--get_comment",
		params.comments ? "yes" : "no",
		"--get_sub_comment",
		params.subComments ? "yes" : "no",
		"--max_comments_count_singlenotes",
		String(params.maxComments),
	];
	if (options.cookies) args.push("--cookies", String(options.cookies));
	if (params.crawlType === "detail" && params.specifiedId) args.push("--specified_id", params.specifiedId);
	if (params.crawlType === "creator" && params.creatorId) args.push("--creator_id", params.creatorId);
	if (params.ipProxy) {
		args.push("--enable_ip_proxy", "yes");
		if (params.ipProxyProvider) args.push("--ip_proxy_provider_name", params.ipProxyProvider);
		if (params.ipProxyCount) args.push("--ip_proxy_pool_count", String(params.ipProxyCount));
	}
	if (params.saveOption !== "jsonl") {
		pushLog(state, `提示：保存格式为 ${params.saveOption} 时，面板无法解析成条目表格，结果请到输出目录查看`);
	}

	const child = spawn(config.mediacrawlerPython, args, {
		cwd: dir,
		windowsHide: true,
		env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});

	const job = { id, child, state, buffer: "", stderr: "" };
	JOBS.set(id, job);
	activeId = id;
	lastId = id;

	pushLog(state, `MediaCrawler 启动：${params.platform} / ${params.crawlType} / ${keywords}`);

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		job.buffer += chunk;
		let index = job.buffer.indexOf("\n");
		while (index !== -1) {
			const line = stripAnsi(job.buffer.slice(0, index)).trim();
			job.buffer = job.buffer.slice(index + 1);
			if (line) {
				if (state.stage === "launch") state.stage = "fetch";
				pushLog(state, line.slice(0, 500));
			}
			index = job.buffer.indexOf("\n");
		}
	});

	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => {
		const text = stripAnsi(chunk).trim();
		job.stderr = (job.stderr + text).slice(-4000);
		if (text) {
			if (state.stage === "launch") state.stage = "fetch";
			pushLog(state, text.slice(0, 500));
		}
	});

	child.on("error", (error) => {
		state.status = "error";
		state.stage = "error";
		state.error = `无法启动 MediaCrawler：${error.message}`;
		state.finishedAt = now();
		if (activeId === id) activeId = null;
	});

	child.on("close", (code) => {
		if (state.status === "running" || state.status === "cancelled") {
			state.finishedAt = now();
			const items = readJsonlItems(workDir);
			if (items.length) {
				state.items = items;
				state.stats.items = items.length;
				state.stats.pages = items.length;
			}
			state.stats.elapsed = Math.round((state.finishedAt - state.startedAt) / 100) / 10;
			if (code === 0) {
				state.status = "done";
				state.stage = "done";
				pushLog(state, `抓取完成，共 ${items.length} 条`);
			} else if (state.status === "cancelled") {
				/* stopped by the user; keep whatever was collected */
			} else {
				state.status = "error";
				state.stage = "error";
				const tail = job.stderr.split("\n").slice(-6).join("\n");
				state.error = `进程退出码 ${code}${tail ? "：" + tail : ""}`;
			}
		}
		if (activeId === id) activeId = null;
		trimJobs();
	});

	return { id };
}

function stamp() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeLabel(text) {
	const cleaned = String(text || "")
		.replace(/[^0-9A-Za-z\u4e00-\u9fa5._-]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return cleaned.slice(0, 40) || "run";
}

function makeJobDir(root, engine, label) {
	const dir = join(root, `${engine}-${safeLabel(label)}-${stamp()}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function readLocalConfig() {
	try {
		const file = join(HERE, "plugin.local.json");
		if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) || {};
	} catch {
		/* ignore malformed local config */
	}
	return {};
}

function writeText(dir, name, text) {
	if (!dir) return "";
	try {
		mkdirSync(dir, { recursive: true });
		const file = join(dir, name);
		writeFileSync(file, text == null ? "" : text, "utf8");
		return file;
	} catch {
		return "";
	}
}

function writeJsonlFile(dir, name, rows) {
	const body = (rows || []).map((row) => JSON.stringify(row)).join("\n");
	return writeText(dir, name, body ? body + "\n" : "");
}

function startDeepSeek(options, config) {
	const web = config.web;
	if (!web) {
		return { error: "当前 DSH 没有可用的网页服务（ctx.web），DeepSeek 引擎不可用" };
	}
	const query = String(options.query || "").trim();
	const url = String(options.url || "").trim();
	if (!query && !url) return { error: "请填写关键词或 URL" };

	const id = `job-${Date.now().toString(36)}`;
	const params = {
		engine: "deepseek",
		mode: query ? "search" : "fetch",
		query,
		url,
		maxResults: Math.min(20, Math.max(1, Number(options.maxResults) || 5)),
	};
	const state = makeState(params);
	state.id = id;
	state.stage = "fetch";
	try {
		state.downloadDir = makeJobDir(config.outputRoot, "deepseek", query || url);
	} catch (error) {
		pushLog(state, `无法创建输出目录：${error.message}`);
	}

	const controller = new AbortController();
	const job = { id, child: null, controller, state, buffer: "", stderr: "" };
	JOBS.set(id, job);
	activeId = id;
	lastId = id;
	pushLog(state, query ? `DeepSeek 搜索：${query}` : `DeepSeek 抓取：${url}`);

	(async () => {
		const started = now();
		try {
			if (query) {
				const result = await web.search({ query, maxResults: params.maxResults }, controller.signal);
				const sources = (result && result.sources) || [];
				state.items = sources.map((source, index) => ({
					序号: index + 1,
					标题: source.title || "",
					链接: source.url || "",
					摘要: source.snippet || "",
					时间: source.publishedAt || "",
				}));
				state.stats.items = state.items.length;
				state.stats.pages = state.items.length;
				pushLog(state, `搜索返回 ${state.items.length} 条结果`);
				writeJsonlFile(state.downloadDir, "search.jsonl", state.items);
				if (result && result.content) writeText(state.downloadDir, "摘要.md", result.content);
			} else {
				const result = await web.fetch({ url }, controller.signal);
				const status = Number(result && result.statusCode) || 0;
				const body = (result && result.body) || { kind: "text", content: "" };
				state.pages.push({ url: (result && result.url) || url, status, ms: now() - started, at: now() });
				state.markdown = clipText(body.content || "", 60000);
				state.stats.pages = 1;
				pushLog(state, `HTTP ${status}，正文 ${(body.content || "").length} 字符`);
				writeText(state.downloadDir, body.kind === "html" ? "正文.html" : "正文.md", body.content || "");
			}
			writeText(
				state.downloadDir,
				"meta.json",
				JSON.stringify(
					{
						engine: "deepseek",
						mode: params.mode,
						query: params.query,
						url: params.url,
						results: state.items.length,
						finishedAt: new Date().toISOString(),
					},
					null,
					2,
				),
			);
			state.status = "done";
			state.stage = "done";
			state.finishedAt = now();
			state.stats.elapsed = Math.round((state.finishedAt - started) / 100) / 10;
			if (state.downloadDir) pushLog(state, `结果已保存到 ${state.downloadDir}`);
			pushLog(state, "完成");
		} catch (error) {
			state.finishedAt = now();
			if (controller.signal.aborted) {
				state.status = "cancelled";
				state.stage = "cancelled";
				pushLog(state, "任务已手动停止");
			} else {
				state.status = "error";
				state.stage = "error";
				state.error = `${error && error.message ? error.message : error}`;
				pushLog(state, `失败：${state.error}`);
			}
		} finally {
			if (activeId === id) activeId = null;
			trimJobs();
		}
	})();

	return { id };
}

function clipText(text, limit) {
	const value = String(text || "");
	return value.length <= limit ? value : value.slice(0, limit) + "\n\n…（内容过长，已截断）";
}

function startJob(options, config) {
	if (activeId) {
		const running = JOBS.get(activeId);
		return { error: `已有任务在运行（${running ? running.state.params.url || running.state.params.keywords : activeId}），请先停止` };
	}
	if (options && options.engine === "mediacrawler") {
		return startMediaCrawler(options, config);
	}
	if (options && options.engine === "deepseek") {
		return startDeepSeek(options, config);
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
		wait: Number(options.wait) || 0,
		proxy: options.proxy || "",
		impersonate: options.impersonate || "chrome",
		useragent: options.useragent || "",
		locale: options.locale || "",
		timezoneId: options.timezoneId || "",
		headers: options.headers || "",
		cookies: options.cookies || "",
		http3: Boolean(options.http3),
		retries: Number(options.retries) || 0,
		retryDelay: Number(options.retryDelay) || 0,
		disableResources: Boolean(options.disableResources),
		blockAds: Boolean(options.blockAds),
		blockWebrtc: Boolean(options.blockWebrtc),
		hideCanvas: Boolean(options.hideCanvas),
		pierceShadow: Boolean(options.pierceShadow),
		realChrome: Boolean(options.realChrome),
		loadDom: options.loadDom !== false,
		mainContentOnly: options.mainContentOnly !== false,
		maxPages: Number(options.maxPages) || 5,
		follow: Boolean(options.follow),
		concurrency: Number(options.concurrency) || 4,
		concurrencyPerDomain: Number(options.concurrencyPerDomain) || 0,
		downloadDelay: Number(options.downloadDelay) || 0,
		respectRobots: Boolean(options.respectRobots),
		images: Boolean(options.images),
		imageLimit: Math.min(200, Math.max(1, Number(options.imageLimit) || 20)),
		imageSelector: options.imageSelector || "",
	};
	const state = makeState(params);
	state.id = id;

	try {
		const label = new URL(params.url.includes("://") ? params.url : "https://" + params.url).hostname;
		state.downloadDir = makeJobDir(config.outputRoot, "scrapling", label);
	} catch (error) {
		state.downloadDir = "";
		pushLog(state, `无法创建输出目录：${error.message}`);
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
				outputDir: state.downloadDir,
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
		if (job.child) job.child.kill();
		if (job.controller) job.controller.abort();
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
	const local = readLocalConfig();
	const settings = {
		python: config.python || process.env.SCRAPLING_PYTHON || local.python || defaultPython(),
		chrome: config.chrome || process.env.SCRAPLING_CHROME || local.chrome || defaultChrome(),
		downloadRoot: config.downloadRoot || local.downloadRoot || join(dshHome(), "scrapling-downloads"),
		outputRoot: config.outputRoot || local.outputRoot || join(dshHome(), "scrapling-downloads"),
		web: ctx.get("web"),
		mediacrawlerPython:
			config.mediacrawlerPython ||
			process.env.MEDIACRAWLER_PYTHON ||
			local.mediacrawlerPython ||
			join(dshHome(), ".venvs", "mediacrawler", process.platform === "win32" ? "Scripts\\python.exe" : "bin/python"),
		mediacrawlerDir: config.mediacrawlerDir || process.env.MEDIACRAWLER_DIR || local.mediacrawlerDir || "",
	};

	// Locate a MediaCrawler checkout: explicit config first, then env, then any workspace folder.
	if (!settings.mediacrawlerDir) {
		try {
			const workspaces = ctx.workspaceRegistry ? ctx.workspaceRegistry.list() : [];
			for (const workspace of workspaces) {
				const base = workspace.path || workspace.directory || workspace.cwd;
				if (!base) continue;
				const candidate = join(base, "MediaCrawler-main");
				if (existsSync(join(candidate, "main.py"))) {
					settings.mediacrawlerDir = candidate;
					break;
				}
				if (existsSync(join(base, "main.py"))) {
					settings.mediacrawlerDir = base;
					break;
				}
			}
		} catch {
			/* workspace registry unavailable */
		}
	}

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
							outputRoot: settings.outputRoot,
							deepseek: { ready: Boolean(settings.web) },
							mediacrawler: {
								dir: settings.mediacrawlerDir,
								dirReady: Boolean(settings.mediacrawlerDir) && existsSync(join(settings.mediacrawlerDir, "main.py")),
								python: settings.mediacrawlerPython,
								pythonReady: existsSync(settings.mediacrawlerPython),
							},
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
						const job = JOBS.get(jobId);
						if (!job || !name || !/^(images\/)?[A-Za-z0-9._-]+$/.test(name)) {
							json(res, 400, { error: "参数不合法" });
							return;
						}
						const dir = resolve(job.state.downloadDir || "");
						const file = resolve(dir, name);
						if (!job.state.downloadDir || !file.startsWith(dir)) {
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

					if (method === "POST" && sub === "/clear") {
						if (activeId) {
							json(res, 409, { error: "任务运行中，先停止再清空" });
							return;
						}
						lastId = null;
						json(res, 200, { ok: true });
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

export { readJsonlItems };
