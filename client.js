window.__ModuleLoader__.load({
	id: "dsh-scrapling-platform",
	factory(require) {
		const React = require("react");
		const h = React.createElement;
		const { useState, useEffect, useRef, useCallback, useMemo } = React;

		const API = "/scrapling-api";

		const C = {
			bg: "var(--dsw-alias-bg-base)",
			layer1: "var(--dsw-alias-bg-layer-1)",
			layer2: "var(--dsw-alias-bg-layer-2)",
			border: "var(--dsw-alias-border-l1)",
			border2: "var(--dsw-alias-border-l2)",
			text: "var(--dsw-alias-label-primary)",
			sub: "var(--dsw-alias-label-secondary)",
			brand: "var(--dsw-alias-brand-primary)",
			ok: "var(--dsw-alias-state-success-primary)",
			warn: "var(--dsw-alias-state-warn-primary)",
			err: "var(--dsw-alias-state-error-primary)",
			idle: "var(--dsw-alias-state-idle-primary)",
		};

		const card = {
			background: C.layer1,
			border: "1px solid " + C.border,
			borderRadius: 14,
			padding: 16,
		};

		const labelStyle = {
			display: "block",
			fontSize: 12,
			fontWeight: 600,
			color: C.sub,
			marginBottom: 6,
			letterSpacing: "0.02em",
		};

		const inputStyle = {
			width: "100%",
			boxSizing: "border-box",
			height: 34,
			padding: "0 10px",
			fontSize: 13,
			color: C.text,
			background: C.bg,
			border: "1px solid " + C.border2,
			borderRadius: 8,
			outline: "none",
		};

		const mono = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

		function statusTone(status) {
			if (status === "running") return C.brand;
			if (status === "done") return C.ok;
			if (status === "error") return C.err;
			if (status === "cancelled") return C.warn;
			return C.idle;
		}

		function statusText(status) {
			if (status === "running") return "运行中";
			if (status === "done") return "已完成";
			if (status === "error") return "失败";
			if (status === "cancelled") return "已停止";
			return "空闲";
		}

		function Pill(props) {
			const tone = props.tone || C.idle;
			return h(
				"span",
				{
					style: {
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						height: 22,
						padding: "0 9px",
						borderRadius: 999,
						fontSize: 11,
						fontWeight: 600,
						color: tone,
						background: "color-mix(in srgb, " + tone + " 14%, transparent)",
						border: "1px solid color-mix(in srgb, " + tone + " 32%, transparent)",
						whiteSpace: "nowrap",
					},
				},
				h("span", {
					style: {
						width: 6,
						height: 6,
						borderRadius: 999,
						background: tone,
						animation: props.pulse ? "scrapling-pulse 1.2s ease-in-out infinite" : "none",
					},
				}),
				props.text,
			);
		}

		function Icon(props) {
			const size = props.size || 18;
			const color = props.color || "currentColor";
			return h(
				"svg",
				{
					width: size,
					height: size,
					viewBox: "0 0 32 32",
					fill: "none",
					"aria-hidden": true,
					style: { display: "block", flex: "none" },
				},
				h("g", {
					stroke: color,
					strokeWidth: 1.9,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}, [
					h("circle", { key: "c", cx: 16, cy: 16, r: 4.2 }),
					h("path", { key: "p1", d: "M16 11.8V6M16 20.2V26M11.8 16H6M20.2 16H26" }),
					h("path", { key: "p2", d: "M13 13 9 9M19 13l4-4M13 19l-4 4M19 19l4 4" }),
				]),
			);
		}

		/** Sidebar rail icon. Receives { size, active } from the sidebar owner. */
		function SidebarIcon(props) {
			const active = Boolean(props && props.active);
			return h(
				"span",
				{
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "100%",
						height: "100%",
						color: active ? C.brand : "inherit",
					},
				},
				h(Icon, { size: (props && props.size) || 18 }),
			);
		}

		function Field(props) {
			return h(
				"div",
				{ style: { marginBottom: 12 } },
				h("label", { style: labelStyle }, props.label),
				props.children,
				props.hint ? h("div", { style: { marginTop: 4, fontSize: 11, color: C.sub } }, props.hint) : null,
			);
		}

		function TextInput(props) {
			return h("input", {
				type: "text",
				value: props.value,
				placeholder: props.placeholder,
				onChange: (event) => props.onChange(event.target.value),
				style: inputStyle,
				spellCheck: false,
			});
		}

		function Select(props) {
			return h(
				"select",
				{
					value: props.value,
					onChange: (event) => props.onChange(event.target.value),
					style: Object.assign({}, inputStyle, { cursor: "pointer" }),
				},
				props.options.map((option) =>
					h("option", { key: option.value, value: option.value }, option.label),
				),
			);
		}

		function Toggle(props) {
			return h(
				"div",
				{ style: { padding: "2px 0 6px" } },
				h(
					"label",
					{
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							fontSize: 12,
							color: C.text,
							cursor: "pointer",
						},
					},
					h("input", {
						type: "checkbox",
						checked: Boolean(props.value),
						onChange: (event) => props.onChange(event.target.checked),
						style: { accentColor: C.brand, width: 14, height: 14, cursor: "pointer" },
					}),
					props.label,
				),
				props.hint
					? h(
							"div",
							{ style: { marginLeft: 22, marginTop: 2, fontSize: 11, color: C.sub, lineHeight: 1.5 } },
							props.hint,
						)
					: null,
			);
		}

		function Button(props) {
			const kind = props.kind || "ghost";
			const base = {
				height: 34,
				padding: "0 14px",
				borderRadius: 9,
				fontSize: 13,
				fontWeight: 600,
				cursor: props.disabled ? "not-allowed" : "pointer",
				opacity: props.disabled ? 0.5 : 1,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 6,
				transition: "filter 120ms ease",
			};
			const kinds = {
				primary: { background: C.brand, color: C.bg, border: "1px solid " + C.brand },
				danger: { background: "transparent", color: C.err, border: "1px solid " + C.err },
				ghost: { background: C.layer2, color: C.text, border: "1px solid " + C.border2 },
			};
			return h(
				"button",
				{
					type: "button",
					disabled: props.disabled,
					onClick: props.onClick,
					style: Object.assign(base, kinds[kind] || kinds.ghost),
				},
				props.children,
			);
		}

		const STAGES = [
			{ key: "launch", label: "启动" },
			{ key: "fetch", label: "抓取" },
			{ key: "parse", label: "解析" },
			{ key: "done", label: "完成" },
		];

		const MODE_HINT = {
			http: "直接下载 HTML，最快。页面内容靠 JS 生成时可能抓不到，那就换浏览器模式。",
			browser: "开一个真浏览器渲染页面，能执行 JS、应付多数反爬。比 HTTP 慢，也吃内存。",
			spider: "从入口页顺着链接继续抓，多页并发。只抓入口页就把「跟随页内链接」关掉。",
		};

		function Stepper(props) {
			const status = props.status;
			const stage = props.stage;
			const activeIndex = STAGES.findIndex((item) => item.key === stage);
			const failed = status === "error";
			return h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
				STAGES.map((item, index) => {
					const reached = activeIndex >= index || status === "done";
					const current = item.key === stage && status === "running";
					const tone = failed && index === Math.max(activeIndex, 0) ? C.err : reached ? C.brand : C.idle;
					return h(
						"div",
						{ key: item.key, style: { display: "flex", alignItems: "center", gap: 6 } },
						h(
							"div",
							{
								style: {
									display: "flex",
									alignItems: "center",
									gap: 5,
									padding: "3px 9px",
									borderRadius: 999,
									fontSize: 11,
									fontWeight: 600,
									color: reached ? tone : C.sub,
									background: current ? "color-mix(in srgb, " + tone + " 14%, transparent)" : "transparent",
									border: "1px solid " + (reached ? "color-mix(in srgb, " + tone + " 40%, transparent)" : C.border),
								},
							},
							h("span", {
								style: { width: 5, height: 5, borderRadius: 999, background: reached ? tone : C.idle },
							}),
							item.label,
						),
						index < STAGES.length - 1
							? h("span", { style: { color: C.border2, fontSize: 11 } }, "→")
							: null,
					);
				}),
			);
		}

		function StatCard(props) {
			return h(
				"div",
				{
					style: {
						flex: "1 1 0",
						minWidth: 86,
						padding: "10px 12px",
						borderRadius: 10,
						border: "1px solid " + C.border,
						background: C.layer2,
					},
				},
				h("div", { style: { fontSize: 11, color: C.sub, marginBottom: 2 } }, props.label),
				h("div", { style: { fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" } }, props.value),
			);
		}

		function Empty(props) {
			return h(
				"div",
				{
					style: {
						padding: "36px 16px",
						textAlign: "center",
						color: C.sub,
						fontSize: 12,
						lineHeight: 1.7,
					},
				},
				h(Icon, { size: 26, color: C.border2 }),
				h("div", { style: { marginTop: 10 } }, props.text),
			);
		}

		function toCsv(columns, rows) {
			const escape = (value) => {
				const text = String(value == null ? "" : value);
				return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
			};
			return [columns.map(escape).join(",")]
				.concat(rows.map((row) => columns.map((key) => escape(row[key])).join(",")))
				.join("\n");
		}

		function DataTab(props) {
			const job = props.job;
			const [filter, setFilter] = useState("");
			const [sort, setSort] = useState({ key: null, dir: 1 });

			let rows = [];
			let columns = [];
			if (job.items && job.items.length) {
				rows = job.items.map((row) => row || {});
				for (const row of rows.slice(0, 50)) {
					for (const key of Object.keys(row)) {
						if (!columns.includes(key) && columns.length < 8) columns.push(key);
					}
				}
			} else if (job.hits && job.hits.length) {
				rows = job.hits.map((hit) => ({
					序号: hit.index,
					文本: hit.text || "",
					标签: hit.tag || "",
					链接: hit.href || "",
				}));
				columns = ["序号", "文本", "标签", "链接"];
			}

			if (!rows.length) {
				return h(Empty, {
					text:
						job.status === "running"
							? "正在抓取，命中结果会实时出现在这里"
							: "还没有抓取结果。在上方填写参数后点开始。",
				});
			}

			const keyword = filter.trim().toLowerCase();
			let view = keyword
				? rows.filter((row) => columns.some((key) => String(row[key] ?? "").toLowerCase().includes(keyword)))
				: rows.slice();
			if (sort.key) {
				view.sort((a, b) => {
					const left = a[sort.key] ?? "";
					const right = b[sort.key] ?? "";
					const numeric = Number(left) - Number(right);
					const compare =
						!Number.isNaN(numeric) && String(left) !== "" && String(right) !== ""
							? numeric
							: String(left).localeCompare(String(right), "zh-CN");
					return compare * sort.dir;
				});
			}
			view = view.slice(0, 300);

			const download = () => {
				try {
					const blob = new Blob(["\ufeff" + toCsv(columns, view)], { type: "text/csv;charset=utf-8" });
					const url = URL.createObjectURL(blob);
					const link = document.createElement("a");
					link.href = url;
					link.download = "scrapling-result.csv";
					link.click();
					setTimeout(() => URL.revokeObjectURL(url), 2000);
				} catch (error) {
					/* ignore */
				}
			};

			return h(
				"div",
				null,
				h(
					"div",
					{ style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 } },
					h("input", {
						type: "text",
						value: filter,
						placeholder: "过滤当前结果…",
						onChange: (event) => setFilter(event.target.value),
						style: Object.assign({}, inputStyle, { height: 30, flex: 1, fontSize: 12 }),
					}),
					h(
						"span",
						{ style: { fontSize: 11, color: C.sub, whiteSpace: "nowrap" } },
						`${view.length} / ${rows.length}`,
					),
					h(Button, { onClick: download }, "导出 CSV"),
				),
				h(
					"div",
					{ style: { overflow: "auto", maxHeight: 420 } },
					h(
						"table",
						{ style: { borderCollapse: "collapse", width: "100%", fontSize: 12 } },
						h(
							"thead",
							null,
							h(
								"tr",
								null,
								columns.map((key) =>
									h(
										"th",
										{
											key,
											onClick: () =>
												setSort((current) =>
													current.key === key ? { key, dir: -current.dir } : { key, dir: 1 },
												),
											style: {
												position: "sticky",
												top: 0,
												background: C.layer2,
												color: sort.key === key ? C.text : C.sub,
												fontWeight: 600,
												textAlign: "left",
												padding: "7px 10px",
												borderBottom: "1px solid " + C.border,
												whiteSpace: "nowrap",
												cursor: "pointer",
												userSelect: "none",
											},
										},
										key + (sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""),
									),
								),
							),
						),
						h(
							"tbody",
							null,
							view.map((row, index) =>
								h(
									"tr",
									{ key: index, style: { borderBottom: "1px solid " + C.border } },
									columns.map((key) =>
										h(
											"td",
											{
												key,
												style: {
													padding: "7px 10px",
													color: C.text,
													verticalAlign: "top",
													maxWidth: 320,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												},
												title: String(row ? row[key] ?? "" : ""),
											},
											String(row ? row[key] ?? "" : ""),
										),
									),
								),
							),
						),
					),
				),
			);
		}

		function MarkdownTab(props) {
			const text = props.job.markdown || "";
			if (!text) return h(Empty, { text: "暂无正文。解析完成后，Markdown / 文本 / HTML 会显示在这里。" });
			return h(
				"div",
				null,
				h(
					"div",
					{ style: { display: "flex", justifyContent: "flex-end", marginBottom: 8 } },
					h(
						Button,
						{
							onClick: () => {
								try {
									navigator.clipboard.writeText(text);
								} catch (error) {
									/* ignore */
								}
							},
						},
						"复制全文",
					),
				),
				h(
					"pre",
					{
						style: {
							margin: 0,
							padding: 14,
							maxHeight: 440,
							overflow: "auto",
							background: C.bg,
							border: "1px solid " + C.border,
							borderRadius: 10,
							fontSize: 12,
							lineHeight: 1.7,
							color: C.text,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
						},
					},
					text,
				),
			);
		}

		function ImagesTab(props) {
			const job = props.job;
			const images = job.images || [];
			const okImages = images.filter((image) => image.ok && image.name);
			if (!images.length) {
				return h(Empty, {
					text: job.status === "running" ? "正在查找图片…" : "这次没有下载图片。勾选左侧「同时下载页面图片」再跑一次。",
				});
			}
			const totalBytes = okImages.reduce((sum, image) => sum + (image.bytes || 0), 0);
			return h(
				"div",
				null,
				h(
					"div",
					{
						style: {
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginBottom: 10,
							fontSize: 11.5,
							color: C.sub,
							flexWrap: "wrap",
						},
					},
					h("span", null, `已下载 ${okImages.length} 张，共 ${(totalBytes / 1024).toFixed(0)} KB`),
					job.downloadDir
						? h(
								"button",
								{
									type: "button",
									onClick: () => {
										try {
											navigator.clipboard.writeText(job.downloadDir);
										} catch (error) {
											/* ignore */
										}
									},
									style: {
										border: "1px solid " + C.border,
										background: C.layer2,
										color: C.text,
										borderRadius: 7,
										padding: "3px 8px",
										fontSize: 11,
										cursor: "pointer",
										maxWidth: 420,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									},
									title: "点击复制保存路径",
								},
								"保存到：" + job.downloadDir,
							)
						: null,
				),
				h(
					"div",
					{
						style: {
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
							gap: 8,
							maxHeight: 420,
							overflow: "auto",
						},
					},
					images.map((image, index) =>
						image.ok && image.name
							? h(
									"a",
									{
										key: index,
										href: `${API}/file?job=${encodeURIComponent(job.id)}&name=${encodeURIComponent(image.name)}`,
										target: "_blank",
										rel: "noreferrer",
										style: {
											display: "block",
											border: "1px solid " + C.border,
											borderRadius: 9,
											overflow: "hidden",
											background: C.layer2,
											textDecoration: "none",
										},
										title: image.url,
									},
									h("img", {
										src: `${API}/file?job=${encodeURIComponent(job.id)}&name=${encodeURIComponent(image.name)}`,
										alt: "",
										loading: "lazy",
										style: { display: "block", width: "100%", height: 88, objectFit: "cover" },
									}),
									h(
										"div",
										{
											style: {
												padding: "4px 6px",
												fontSize: 10,
												color: C.sub,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											},
										},
										`${(image.bytes / 1024).toFixed(0)} KB · ${image.name}`,
									),
								)
							: h(
									"div",
									{
										key: index,
										style: {
											padding: "8px",
											borderRadius: 9,
											border: "1px solid color-mix(in srgb, " + C.err + " 30%, transparent)",
											background: "color-mix(in srgb, " + C.err + " 8%, transparent)",
											fontSize: 10.5,
											color: C.err,
											overflow: "hidden",
										},
										title: image.url + "\n" + (image.err || ""),
									},
									"下载失败",
									h(
										"div",
										{
											style: {
												marginTop: 4,
												color: C.sub,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											},
										},
										image.url,
									),
								),
					),
				),
			);
		}

		function PagesTab(props) {
			const pages = props.job.pages || [];
			if (!pages.length) return h(Empty, { text: "还没有访问记录。" });
			return h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" } },
				pages.map((page, index) =>
					h(
						"div",
						{
							key: index,
							style: {
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "8px 10px",
								borderRadius: 8,
								background: C.layer2,
								border: "1px solid " + C.border,
								fontSize: 12,
							},
						},
						h(
							"span",
							{
								style: {
									flex: "none",
									fontFamily: mono,
									fontSize: 11,
									padding: "1px 6px",
									borderRadius: 5,
									color: page.status >= 400 ? C.err : C.ok,
									background: "color-mix(in srgb, " + (page.status >= 400 ? C.err : C.ok) + " 12%, transparent)",
								},
							},
							page.status || "—",
						),
						h(
							"span",
							{
								style: {
									color: C.text,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								},
								title: page.url,
							},
							page.url,
						),
						page.ms
							? h("span", { style: { marginLeft: "auto", color: C.sub, flex: "none" } }, page.ms + " ms")
							: null,
					),
				),
			);
		}

		function LogTab(props) {
			const logs = props.job.logs || [];
			return h(
				"div",
				{
					ref: props.scrollRef,
					style: {
						maxHeight: 420,
						overflow: "auto",
						background: C.bg,
						border: "1px solid " + C.border,
						borderRadius: 10,
						padding: "10px 12px",
						fontFamily: mono,
						fontSize: 11.5,
						lineHeight: 1.75,
						color: C.sub,
					},
				},
				logs.length
					? logs.map((item, index) =>
							h(
								"div",
								{ key: index },
								h("span", { style: { color: C.border2 } }, new Date(item.ts).toLocaleTimeString()),
								"  ",
								h("span", { style: { color: C.text } }, item.msg),
							),
						)
					: h("div", null, "等待任务启动…"),
			);
		}

		function TextArea(props) {
			return h("textarea", {
				value: props.value,
				placeholder: props.placeholder,
				rows: props.rows || 3,
				onChange: (event) => props.onChange(event.target.value),
				style: Object.assign({}, inputStyle, {
					height: "auto",
					padding: "8px 10px",
					resize: "vertical",
					fontFamily: mono,
					fontSize: 11.5,
					lineHeight: 1.5,
				}),
			});
		}

		const MC_PLATFORMS = [
			{ value: "xhs", label: "小红书" },
			{ value: "dy", label: "抖音" },
			{ value: "ks", label: "快手" },
			{ value: "bili", label: "B 站" },
			{ value: "wb", label: "微博" },
			{ value: "tieba", label: "百度贴吧" },
			{ value: "zhihu", label: "知乎" },
		];

		function MediaCrawlerForm(props) {
			const form = props.form;
			const patch = props.patch;
			const env = props.env;
			const mc = env && env.mediacrawler;
			const ready = Boolean(mc && mc.dirReady && mc.pythonReady);
			return h(
				"div",
				{ style: Object.assign({}, card, { flex: "0 1 340px", minWidth: 300 }) },
				h("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } }, "MediaCrawler 参数"),

				!ready
					? h(
							"div",
							{
								style: {
									marginBottom: 12,
									padding: "9px 12px",
									borderRadius: 9,
									fontSize: 11.5,
									lineHeight: 1.6,
									color: C.warn,
									background: "color-mix(in srgb, " + C.warn + " 10%, transparent)",
									border: "1px solid color-mix(in srgb, " + C.warn + " 30%, transparent)",
								},
							},
							"环境未就绪：",
							h("div", null, "项目目录：" + ((mc && mc.dir) || "未找到")),
							h("div", null, "Python：" + ((mc && mc.python) || "未配置")),
						)
					: null,

				h(
					Field,
					{ label: "平台", hint: "不同平台的登录方式、可用字段都不一样。" },
					h(Select, {
						value: form.platform,
						onChange: (value) => patch("platform", value),
						options: MC_PLATFORMS,
					}),
				),

				h(
					Field,
					{ label: "关键词", hint: "多个关键词用英文逗号分隔，例如：红米手机,小米14。" },
					h(TextInput, {
						value: form.keywords,
						placeholder: "红米手机",
						onChange: (value) => patch("keywords", value),
					}),
				),

				h(
					Field,
					{ label: "抓取类型", hint: "search=按关键词搜；detail=按 ID 抓详情；creator=按创作者主页抓。" },
					h(Select, {
						value: form.crawlType,
						onChange: (value) => patch("crawlType", value),
						options: [
							{ value: "search", label: "关键词搜索" },
							{ value: "detail", label: "指定内容 ID" },
							{ value: "creator", label: "指定创作者" },
						],
					}),
				),

				h(
					Field,
					{ label: "登录方式", hint: "扫码最省事：会弹出浏览器窗口，用 App 扫一下即可。" },
					h(Select, {
						value: form.loginType,
						onChange: (value) => {
							patch("loginType", value);
							if (value === "qrcode") patch("headless", false);
						},
						options: [
							{ value: "qrcode", label: "扫码登录" },
							{ value: "cookie", label: "粘贴 Cookie" },
							{ value: "phone", label: "手机号" },
						],
					}),
				),

				form.loginType === "cookie"
					? h(
							Field,
							{ label: "Cookie", hint: "浏览器开发者工具 → Network → 任一请求 → 复制整段 Cookie。" },
							h(TextArea, {
								value: form.cookies,
								placeholder: "粘贴 Cookie 字符串",
								rows: 4,
								onChange: (value) => patch("cookies", value),
							}),
						)
					: null,

				form.crawlType !== "search"
					? h(
							Field,
							{
								label: form.crawlType === "detail" ? "内容 ID / URL" : "创作者 ID / URL",
								hint: "多个用英文逗号分隔。",
							},
							h(TextArea, {
								value: form.crawlType === "detail" ? form.specifiedId || "" : form.creatorId || "",
								placeholder: "多个用逗号分隔",
								rows: 3,
								onChange: (value) =>
									patch(form.crawlType === "detail" ? "specifiedId" : "creatorId", value),
							}),
						)
					: null,

				h(Toggle, {
					label: "无头运行",
					hint: "扫码登录时必须关掉，否则看不到二维码窗口。",
					value: form.headless,
					onChange: (value) => patch("headless", value),
				}),

				h(Toggle, {
					label: "抓取评论",
					hint: "会额外请求评论接口，速度明显变慢；不需要就别开。",
					value: form.comments,
					onChange: (value) => patch("comments", value),
				}),

				h(
					Field,
					{ label: "并发数", hint: "同时处理几个请求，调大容易被平台限流。" },
					h(TextInput, {
						value: String(form.concurrency),
						onChange: (value) => patch("concurrency", Number(value) || 1),
					}),
				),

				h(
					"div",
					{ style: { display: "flex", gap: 10 } },
					h(
						"div",
						{ style: { flex: 1 } },
						h(
							Field,
							{ label: "起始页", hint: "从第几页开始翻，配合限流跳页用。" },
							h(TextInput, {
								value: String(form.startPage),
								onChange: (value) => patch("startPage", Number(value) || 1),
							}),
						),
					),
					h(
						"div",
						{ style: { flex: 1 } },
						h(
							Field,
							{ label: "每篇评论数", hint: "每个内容最多抓多少条一级评论。" },
							h(TextInput, {
								value: String(form.maxComments),
								onChange: (value) => patch("maxComments", Number(value) || 1),
							}),
						),
					),
				),

				h(Toggle, {
					label: "抓取二级评论",
					hint: "回复楼中楼，数据更全但请求量翻倍。",
					value: form.subComments,
					onChange: (value) => patch("subComments", value),
				}),

				h(
					Field,
					{
						label: "保存格式",
						hint: "jsonl 才能解析成面板表格；csv/excel 适合直接打开看。",
					},
					h(Select, {
						value: form.saveOption,
						onChange: (value) => patch("saveOption", value),
						options: [
							{ value: "jsonl", label: "JSONL（面板可解析）" },
							{ value: "json", label: "JSON" },
							{ value: "csv", label: "CSV" },
							{ value: "excel", label: "Excel" },
							{ value: "sqlite", label: "SQLite" },
						],
					}),
				),

				h(Toggle, {
					label: "启用 IP 代理",
					hint: "需要先在 MediaCrawler 里配好代理服务商，否则会报错。",
					value: form.ipProxy,
					onChange: (value) => patch("ipProxy", value),
				}),
				form.ipProxy
					? h(
							"div",
							{ style: { display: "flex", gap: 10 } },
							h(
								"div",
								{ style: { flex: 1 } },
								h(
									Field,
									{ label: "服务商", hint: "kuaidaili 或 wandouhttp。" },
									h(TextInput, {
										value: form.ipProxyProvider,
										placeholder: "kuaidaili",
										onChange: (value) => patch("ipProxyProvider", value),
									}),
								),
							),
							h(
								"div",
								{ style: { width: 100 } },
								h(
									Field,
									{ label: "池大小", hint: "代理池数量。" },
									h(TextInput, {
										value: String(form.ipProxyCount),
										onChange: (value) => patch("ipProxyCount", Number(value) || 0),
									}),
								),
							),
						)
					: null,

				h(
					"div",
					{ style: { marginTop: 10, fontSize: 11, color: C.sub, lineHeight: 1.6 } },
					"结果保存到：" + ((env && env.outputRoot) || "（未配置）"),
				),

				h(
					"div",
					{ style: { display: "flex", gap: 8, marginTop: 16 } },
					h(
						Button,
						{
							kind: "primary",
							onClick: props.start,
							disabled: props.starting || props.running || !String(form.keywords || "").trim(),
						},
						props.starting ? "启动中…" : "开始抓取",
					),
					h(Button, { kind: "danger", onClick: props.stop, disabled: !props.running }, "停止"),
				),
			);
		}

		const DS_MODES = [
			{ value: "search", label: "关键词搜索" },
			{ value: "fetch", label: "网页抓取" },
		];

		function DeepSeekForm(props) {
			const form = props.form;
			const patch = props.patch;
			const env = props.env;
			const ready = Boolean(env && env.deepseek && env.deepseek.ready);
			const mode = form.dsMode || "search";
			const hasInput = mode === "search" ? String(form.query || "").trim() : String(form.dsUrl || "").trim();
			return h(
				"div",
				{ style: Object.assign({}, card, { flex: "0 1 340px", minWidth: 300 }) },
				h("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } }, "DeepSeek 网页参数"),

				!ready
					? h(
							"div",
							{
								style: {
									marginBottom: 12,
									padding: "9px 12px",
									borderRadius: 9,
									fontSize: 11.5,
									lineHeight: 1.6,
									color: C.warn,
									background: "color-mix(in srgb, " + C.warn + " 10%, transparent)",
									border: "1px solid color-mix(in srgb, " + C.warn + " 30%, transparent)",
								},
							},
							"当前 DSH 未提供网页服务（ctx.web），这个引擎不可用。",
						)
					: null,

				h(
					Field,
					{ label: "任务类型", hint: "搜索=给关键词拿结果列表；抓取=给一个 URL 拿正文。" },
					h(Select, {
						value: mode,
						onChange: (value) => patch("dsMode", value),
						options: DS_MODES,
					}),
				),

				mode === "search"
					? h(
							Field,
							{ label: "关键词", hint: "DeepSeek 自研搜索，支持 site: 等语法。" },
							h(TextInput, {
								value: form.query || "",
								placeholder: "DeepSeek V4 发布",
								onChange: (value) => patch("query", value),
							}),
						)
					: h(
							Field,
							{ label: "URL", hint: "DeepSeek 侧抓取并转成 Markdown，不做浏览器渲染。" },
							h(TextInput, {
								value: form.dsUrl || "",
								placeholder: "https://example.com/article",
								onChange: (value) => patch("dsUrl", value),
							}),
						),

				mode === "search"
					? h(
							Field,
							{ label: "结果条数", hint: "1–20，条数不影响计费（按次计费）。" },
							h(TextInput, {
								value: String(form.maxResults || 5),
								onChange: (value) => patch("maxResults", Number(value) || 1),
							}),
						)
					: null,

				h(
					"div",
					{ style: { marginTop: 6, fontSize: 11, color: C.sub, lineHeight: 1.6 } },
					"不消耗本地浏览器与代理；按 DeepSeek 官方计费（当前 DSH 内调用暂不计费）。",
				),

				h(
					"div",
					{ style: { marginTop: 10, fontSize: 11, color: C.sub, lineHeight: 1.6 } },
					"结果保存到：" + ((env && env.outputRoot) || "（未配置）"),
				),

				h(
					"div",
					{ style: { display: "flex", gap: 8, marginTop: 16 } },
					h(
						Button,
						{
							kind: "primary",
							onClick: props.start,
							disabled: props.starting || props.running || !hasInput,
						},
						props.starting ? "启动中…" : "开始",
					),
					h(Button, { kind: "danger", onClick: props.stop, disabled: !props.running }, "停止"),
				),
			);
		}

		function HistoryPanel(props) {
			const items = props.items || [];
			if (!items.length) {
				return h(Empty, { text: "还没有历史记录。跑一次任务后，结果会出现在这里。" });
			}
			return h(
				"div",
				{ style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto" } },
				items.map((item) =>
					h(
						"div",
						{
							key: item.dir,
							style: {
								padding: "9px 11px",
								borderRadius: 9,
								background: C.layer2,
								border: "1px solid " + C.border,
							},
						},
						h(
							"div",
							{
								style: {
									fontSize: 12,
									fontWeight: 600,
									color: C.text,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								},
								title: item.dir,
							},
							(item.engine || "scrapling") + " · " + (item.target || item.name),
						),
						h(
							"div",
							{ style: { marginTop: 2, fontSize: 11, color: C.sub } },
							`${item.results || 0} 条 · ${item.finishedAt || new Date(item.mtime).toLocaleString()}`,
						),
						h(
							"div",
							{ style: { display: "flex", gap: 6, marginTop: 6 } },
							h(Button, { onClick: () => props.onLoad(item) }, "载入"),
							h(
								Button,
								{
									onClick: () => {
										try {
											navigator.clipboard.writeText(item.dir);
										} catch (error) {
											/* ignore */
										}
									},
								},
								"复制路径",
							),
						),
					),
				),
			);
		}

		function Panel() {
			const [form, setForm] = useState({
				engine: "scrapling",
				url: "",
				mode: "http",
				selector: "",
				output: "markdown",
				timeout: 30,
				headless: true,
				solveCloudflare: false,
				networkIdle: false,
				waitSelector: "",
				proxy: "",
				maxPages: 5,
				follow: false,
				concurrency: 4,
				images: false,
				imageLimit: 20,
				impersonate: "chrome",
				http3: false,
				retries: 0,
				retryDelay: 0,
				headers: "",
				cookies: "",
				useragent: "",
				locale: "",
				timezoneId: "",
				wait: 0,
				disableResources: false,
				blockAds: false,
				blockWebrtc: false,
				hideCanvas: false,
				pierceShadow: false,
				realChrome: false,
				loadDom: true,
				mainContentOnly: true,
				imageSelector: "",
				fields: "",
				respectRobots: false,
				downloadDelay: 0,
				concurrencyPerDomain: 0,
				platform: "xhs",
				keywords: "",
				crawlType: "search",
				loginType: "qrcode",
				comments: false,
				subComments: false,
				maxComments: 10,
				startPage: 1,
				saveOption: "jsonl",
				specifiedId: "",
				creatorId: "",
				ipProxy: false,
				ipProxyProvider: "",
				ipProxyCount: 0,
				dsMode: "search",
				query: "",
				dsUrl: "",
				maxResults: 5,
			});
			const [job, setJob] = useState(null);
			const [restorable, setRestorable] = useState(null);
			const [history, setHistory] = useState([]);
			const [loadedHistory, setLoadedHistory] = useState(false);
			const [presets, setPresets] = useState(() => {
				try {
					return JSON.parse(localStorage.getItem("dsh-scrapling-presets") || "{}") || {};
				} catch (error) {
					return {};
				}
			});
			const [presetName, setPresetName] = useState("");
			const [env, setEnv] = useState(null);
			const [notice, setNotice] = useState(null);
			const [starting, setStarting] = useState(false);
			const [tab, setTab] = useState("data");
			const logRef = useRef(null);

			const patch = useCallback((key, value) => {
				setForm((current) => Object.assign({}, current, { [key]: value }));
			}, []);

			const refresh = useCallback(async () => {
				try {
					const response = await fetch(API + "/state", { cache: "no-store" });
					const data = await response.json();
					if (data && data.job) setJob(data.job);
				} catch (error) {
					/* transient */
				}
			}, []);

			useEffect(() => {
				let alive = true;
				fetch(API + "/env", { cache: "no-store" })
					.then((response) => response.json())
					.then((data) => {
						if (alive) setEnv(data);
					})
					.catch(() => {});
				fetch(API + "/history", { cache: "no-store" })
					.then((response) => response.json())
					.then((data) => {
						if (alive && data && data.items) setHistory(data.items);
					})
					.catch(() => {});
				// Open clean: a finished job is only offered as "restore", never shown by default.
				fetch(API + "/state", { cache: "no-store" })
					.then((response) => response.json())
					.then((data) => {
						if (!alive || !data || !data.job) return;
						if (data.job.status === "running") setJob(data.job);
						else setRestorable(data.job);
					})
					.catch(() => {});
				return () => {
					alive = false;
				};
			}, []);

			const running = job && job.status === "running";

			useEffect(() => {
				if (!running) return undefined;
				const timer = setInterval(refresh, 700);
				return () => clearInterval(timer);
			}, [running, refresh]);

			useEffect(() => {
				if (tab !== "log" || !logRef.current) return;
				logRef.current.scrollTop = logRef.current.scrollHeight;
			}, [job && job.logs ? job.logs.length : 0, tab]);

			const start = async () => {
				setStarting(true);
				setNotice(null);
				setLoadedHistory(false);
				try {
					const response = await fetch(API + "/run", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(form),
					});
					const data = await response.json();
					if (!response.ok || (data && data.error)) {
						setNotice({ kind: "error", text: (data && data.error) || "启动失败" });
					} else {
						setTab("data");
						await refresh();
					}
				} catch (error) {
					setNotice({ kind: "error", text: String(error && error.message ? error.message : error) });
				} finally {
					setStarting(false);
				}
			};

			const stop = async () => {
				try {
					await fetch(API + "/cancel", { method: "POST" });
					await refresh();
				} catch (error) {
					/* ignore */
				}
			};

			const clear = async () => {
				if (running) return;
				setJob(null);
				setRestorable(null);
				setLoadedHistory(false);
				setNotice(null);
				setTab("data");
				try {
					await fetch(API + "/clear", { method: "POST" });
					const response = await fetch(API + "/history", { cache: "no-store" });
					const data = await response.json();
					if (data && data.items) setHistory(data.items);
				} catch (error) {
					/* ignore */
				}
			};

			const loadHistory = async (item) => {
				try {
					const response = await fetch(API + "/load?dir=" + encodeURIComponent(item.dir), {
						cache: "no-store",
					});
					const data = await response.json();
					if (data && data.job) {
						setJob(data.job);
						setRestorable(null);
						setLoadedHistory(true);
						setTab("data");
					} else {
						setNotice({ kind: "error", text: (data && data.error) || "载入失败" });
					}
				} catch (error) {
					setNotice({ kind: "error", text: String(error && error.message ? error.message : error) });
				}
			};

			const backToHistory = async () => {
				setJob(null);
				setLoadedHistory(false);
				setNotice(null);
				setTab("data");
				try {
					const response = await fetch(API + "/history", { cache: "no-store" });
					const data = await response.json();
					if (data && data.items) setHistory(data.items);
				} catch (error) {
					/* ignore */
				}
			};

			const elapsed = job
				? job.status === "running"
					? Math.max(0, (Date.now() - job.startedAt) / 1000)
					: job.stats && job.stats.elapsed
						? job.stats.elapsed
						: 0
				: 0;

			const engineReady = env
				? form.engine === "mediacrawler"
					? Boolean(env.mediacrawler && env.mediacrawler.dirReady && env.mediacrawler.pythonReady)
					: form.engine === "deepseek"
						? Boolean(env.deepseek && env.deepseek.ready)
						: Boolean(env.pythonReady && env.chromeReady)
				: true;
			const envBad = Boolean(env) && !engineReady;
			const envText = !env
				? ""
				: engineReady
					? "环境就绪"
					: form.engine === "mediacrawler"
						? "MediaCrawler 未就绪"
						: form.engine === "deepseek"
							? "网页服务不可用"
							: env.pythonReady
								? "Chrome 未找到"
								: "Python 未找到";

			const tabs = [
				{ key: "data", label: job && job.items && job.items.length ? "数据 (" + job.items.length + ")" : "数据" },
				{ key: "markdown", label: "正文" },
			];
			if (job && ((job.images && job.images.length) || (job.params && job.params.images))) {
				tabs.push({ key: "images", label: "图片 (" + (job.images ? job.images.length : 0) + ")" });
			}
			tabs.push({ key: "pages", label: "页面" });
			tabs.push({ key: "log", label: "日志" });

			return h(
				"div",
				{
					style: {
						height: "100%",
						overflow: "auto",
						background: C.bg,
						color: C.text,
						padding: "20px 24px 40px",
						boxSizing: "border-box",
					},
				},
				h(
					"div",
					{ style: { maxWidth: 1180, margin: "0 auto" } },

					h(
						"div",
						{
							style: {
								display: "flex",
								alignItems: "center",
								gap: 12,
								flexWrap: "wrap",
								marginBottom: 16,
							},
						},
						h(
							"div",
							{
								style: {
									width: 36,
									height: 36,
									borderRadius: 10,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background: "color-mix(in srgb, " + C.brand + " 12%, transparent)",
									color: C.brand,
								},
							},
							h(Icon, { size: 20 }),
						),
						h(
							"div",
							null,
							h("div", { style: { fontSize: 16, fontWeight: 700, lineHeight: 1.3 } }, "Scrapling 爬虫台"),
							h(
								"div",
								{ style: { fontSize: 12, color: C.sub, marginTop: 2 } },
								"设置参数 → 实时观察 → 拿结果",
							),
						),
						h("div", { style: { flex: 1 } }),
						Pill({
							text: loadedHistory ? "历史记录" : statusText(job ? job.status : "idle"),
							tone: loadedHistory ? C.warn : statusTone(job ? job.status : "idle"),
							pulse: running,
						}),
						env
							? h(Pill, {
									text: envText,
									tone: envBad ? C.warn : C.ok,
								})
							: null,
						job && !running
							? h(Button, { onClick: backToHistory }, "← 返回历史")
							: null,
						job || restorable
							? h(Button, { onClick: clear, disabled: running }, "清空")
							: null,
					),

					notice
						? h(
								"div",
								{
									style: {
										marginBottom: 12,
										padding: "9px 12px",
										borderRadius: 9,
										fontSize: 12,
										color: C.err,
										background: "color-mix(in srgb, " + C.err + " 10%, transparent)",
										border: "1px solid color-mix(in srgb, " + C.err + " 30%, transparent)",
									},
								},
								notice.text,
							)
						: null,

					h(
						"div",
						{ style: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" } },
						h(Select, {
							value: "",
							onChange: (name) => {
								if (name && presets[name]) setForm(Object.assign({}, form, presets[name]));
							},
							options: [{ value: "", label: "套用预设…" }].concat(
								Object.keys(presets).map((name) => ({ value: name, label: name })),
							),
						}),
						h("input", {
							type: "text",
							value: presetName,
							placeholder: "预设名",
							onChange: (event) => setPresetName(event.target.value),
							style: Object.assign({}, inputStyle, { width: 140, height: 30, fontSize: 12 }),
						}),
						h(
							Button,
							{
								onClick: () => {
									const name = presetName.trim();
									if (!name) return;
									const next = Object.assign({}, presets, { [name]: form });
									setPresets(next);
									setPresetName("");
									try {
										localStorage.setItem("dsh-scrapling-presets", JSON.stringify(next));
									} catch (error) {
										/* ignore */
									}
								},
							},
							"保存预设",
						),
						h(
							Button,
							{
								onClick: () => {
									const name = presetName.trim();
									if (!name || !presets[name]) return;
									const next = Object.assign({}, presets);
									delete next[name];
									setPresets(next);
									try {
										localStorage.setItem("dsh-scrapling-presets", JSON.stringify(next));
									} catch (error) {
										/* ignore */
									}
								},
							},
							"删除",
						),
					),

					h(
						"div",
						{ style: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" } },
						[
							{ key: "scrapling", label: "Scrapling 网页", hint: "任意网址" },
							{ key: "mediacrawler", label: "MediaCrawler 社媒", hint: "关键词搜内容" },
							{ key: "deepseek", label: "DeepSeek 网页", hint: "免登录、免代理" },
						].map((item) =>
							h(
								"button",
								{
									key: item.key,
									type: "button",
									onClick: () => patch("engine", item.key),
									style: {
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "8px 14px",
										cursor: "pointer",
										fontSize: 12.5,
										fontWeight: 600,
										borderRadius: 10,
										color: form.engine === item.key ? C.text : C.sub,
										border: "1px solid " + (form.engine === item.key ? C.brand : C.border),
										background:
											form.engine === item.key
												? "color-mix(in srgb, " + C.brand + " 12%, transparent)"
												: C.layer1,
									},
								},
								item.label,
								h("span", { style: { fontSize: 10.5, fontWeight: 400, color: C.sub } }, item.hint),
							),
						),
					),

					h(
						"div",
						{ style: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } },

						// ---------- parameter form ----------
						form.engine === "scrapling" ? h(
							"div",
							{ style: Object.assign({}, card, { flex: "0 1 340px", minWidth: 300 }) },
							h("div", { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } }, "抓取参数"),

							h(
								Field,
								{ label: "目标 URL", hint: "要抓的页面地址。不写 http:// 会自动补上 https://。" },
								h(TextInput, {
									value: form.url,
									placeholder: "https://example.com",
									onChange: (value) => patch("url", value),
								}),
							),

							h(
								Field,
								{ label: "抓取模式", hint: MODE_HINT[form.mode] || MODE_HINT.http },
								h(Select, {
									value: form.mode,
									onChange: (value) => patch("mode", value),
									options: [
										{ value: "http", label: "HTTP 请求（快，静态页）" },
										{ value: "browser", label: "隐身浏览器（JS / 反爬）" },
										{ value: "spider", label: "整站爬取（多页并发）" },
									],
								}),
							),

							h(
								Field,
								{
									label: "CSS 选择器",
									hint: "留空 = 抓整页正文。填 .quote 抓所有这类元素；article h2 抓文章标题。",
								},
								h(TextInput, {
									value: form.selector,
									placeholder: ".quote 或 article h2",
									onChange: (value) => patch("selector", value),
								}),
							),

							h(
								Field,
								{ label: "输出格式", hint: "Markdown 给大模型读最省 token；纯文本去标签；HTML 保留原结构。" },
								h(Select, {
									value: form.output,
									onChange: (value) => patch("output", value),
									options: [
										{ value: "markdown", label: "Markdown" },
										{ value: "text", label: "纯文本" },
										{ value: "html", label: "HTML" },
									],
								}),
							),

							h(
								Field,
								{ label: "超时(秒)", hint: "单次请求最多等多久，超时就判失败。抓大页面可调大。" },
								h(TextInput, {
									value: String(form.timeout),
									onChange: (value) => patch("timeout", Number(value) || 0),
								}),
							),

							h(Toggle, {
								label: "同时下载页面图片",
								hint: "抓页面里的 <img>（含懒加载 data-src），下载到本地并在这里预览。不支持整站模式。",
								value: form.images,
								onChange: (value) => patch("images", value),
							}),
							form.images
								? h(
										Field,
										{ label: "最多下载张数", hint: "只取页面前 N 张，避免一次下太多。" },
										h(TextInput, {
											value: String(form.imageLimit),
											onChange: (value) => patch("imageLimit", Number(value) || 1),
										}),
									)
								: null,

							form.mode === "browser"
								? h(
										"div",
										{ style: { marginBottom: 10 } },
										h(Toggle, {
											label: "无头运行",
											hint: "不弹出浏览器窗口，后台默默跑。想看渲染过程就关掉它。",
											value: form.headless,
											onChange: (value) => patch("headless", value),
										}),
										h(Toggle, {
											label: "尝试过 Cloudflare",
											hint: "遇到「正在验证您是否是真人」这类拦截页时，自动尝试通过。",
											value: form.solveCloudflare,
											onChange: (value) => patch("solveCloudflare", value),
										}),
										h(Toggle, {
											label: "等待网络空闲",
											hint: "等页面 0.5 秒没有新请求了再解析，适合慢慢加载的站。会变慢。",
											value: form.networkIdle,
											onChange: (value) => patch("networkIdle", value),
										}),
										h(
											Field,
											{
												label: "等待选择器",
												hint: "等到这个元素出现才开始解析，专治内容异步加载。留空 = 不等。",
											},
											h(TextInput, {
												value: form.waitSelector,
												placeholder: ".content",
												onChange: (value) => patch("waitSelector", value),
											}),
										),
									)
								: null,

							form.mode === "spider"
								? h(
										"div",
										{ style: { marginBottom: 10 } },
										h(
											"div",
											{ style: { display: "flex", gap: 10 } },
											h(
												"div",
												{ style: { flex: 1 } },
												h(
													Field,
													{ label: "最多页数", hint: "这次最多访问几个页面，防火墙试水先设小一点。" },
													h(TextInput, {
														value: String(form.maxPages),
														onChange: (value) => patch("maxPages", Number(value) || 1),
													}),
												),
											),
											h(
												"div",
												{ style: { flex: 1 } },
												h(
													Field,
													{ label: "并发数", hint: "同时发几个请求。太大容易被限流或封 IP。" },
													h(TextInput, {
														value: String(form.concurrency),
														onChange: (value) => patch("concurrency", Number(value) || 1),
													}),
												),
											),
										),
										h(
											"div",
											{ style: { display: "flex", gap: 10 } },
											h(
												"div",
												{ style: { flex: 1 } },
												h(
													Field,
													{ label: "请求间隔(秒)", hint: "每个请求之间强制等待，礼貌抓取用。" },
													h(TextInput, {
														value: String(form.downloadDelay),
														onChange: (value) => patch("downloadDelay", Number(value) || 0),
													}),
												),
											),
											h(
												"div",
												{ style: { flex: 1 } },
												h(
													Field,
													{ label: "单域名并发", hint: "0 = 不限制，按总并发走。" },
													h(TextInput, {
														value: String(form.concurrencyPerDomain),
														onChange: (value) => patch("concurrencyPerDomain", Number(value) || 0),
													}),
												),
											),
										),
										h(Toggle, {
											label: "跟随页内链接",
											hint: "打开才会从当前页继续找链接往下抓；关掉就只抓入口这一页。",
											value: form.follow,
											onChange: (value) => patch("follow", value),
										}),
										h(Toggle, {
											label: "遵守 robots.txt",
											hint: "按目标站规则跳过禁止抓取的路径，合规优先时打开。",
											value: form.respectRobots,
											onChange: (value) => patch("respectRobots", value),
										}),
									)
								: null,

							h(
								Field,
								{
									label: "代理（可选）",
									hint: "需要换出口 IP 时填 http://user:pass@host:port，留空直连。",
								},
								h(TextInput, {
									value: form.proxy,
									placeholder: "留空 = 直连",
									onChange: (value) => patch("proxy", value),
								}),
							),

							h(
								"div",
								{ style: { marginTop: 10, fontSize: 11, color: C.sub, lineHeight: 1.6 } },
								"结果保存到：" + ((env && env.outputRoot) || "（未配置）"),
							),

							h(
								"details",
								{ style: { marginTop: 12, borderTop: "1px solid " + C.border, paddingTop: 10 } },
								h(
									"summary",
									{ style: { cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.text } },
									"高级选项",
								),
								h(
									Field,
									{ label: "浏览器指纹", hint: "伪装成哪种浏览器发请求，换着试可以绕过部分风控。" },
									h(Select, {
										value: form.impersonate,
										onChange: (value) => patch("impersonate", value),
										options: [
											{ value: "chrome", label: "Chrome（最新）" },
											{ value: "chrome131", label: "Chrome 131" },
											{ value: "safari", label: "Safari" },
											{ value: "edge", label: "Edge" },
											{ value: "firefox", label: "Firefox" },
										],
									}),
								),
								h(Toggle, {
									label: "启用 HTTP/3",
									hint: "走 QUIC 协议，部分站点更快；可能与指纹伪装冲突。",
									value: form.http3,
									onChange: (value) => patch("http3", value),
								}),
								h(
									"div",
									{ style: { display: "flex", gap: 10 } },
									h(
										"div",
										{ style: { flex: 1 } },
										h(
											Field,
											{ label: "重试次数", hint: "0 = 不重试。" },
											h(TextInput, {
												value: String(form.retries),
												onChange: (value) => patch("retries", Number(value) || 0),
											}),
										),
									),
									h(
										"div",
										{ style: { flex: 1 } },
										h(
											Field,
											{ label: "重试间隔(秒)", hint: "两次重试之间等多久。" },
											h(TextInput, {
												value: String(form.retryDelay),
												onChange: (value) => patch("retryDelay", Number(value) || 0),
											}),
										),
									),
								),
								h(
									Field,
									{ label: "自定义请求头", hint: 'JSON 对象，例如 {"Referer":"https://x.com"}。' },
									h(TextArea, {
										value: form.headers,
										placeholder: '{"Accept-Language":"zh-CN"}',
										rows: 3,
										onChange: (value) => patch("headers", value),
									}),
								),
								h(
									Field,
									{ label: "Cookie", hint: "key=value; key2=value2，需要登录态时用。" },
									h(TextArea, {
										value: form.cookies,
										placeholder: "sessionid=...",
										rows: 3,
										onChange: (value) => patch("cookies", value),
									}),
								),
								h(
									Field,
									{ label: "User-Agent", hint: "留空则按指纹自动生成。" },
									h(TextInput, {
										value: form.useragent,
										placeholder: "留空自动",
										onChange: (value) => patch("useragent", value),
									}),
								),
								h(
									"div",
									{ style: { display: "flex", gap: 10 } },
									h(
										"div",
										{ style: { flex: 1 } },
										h(
											Field,
											{ label: "语言", hint: "如 zh-CN。" },
											h(TextInput, {
												value: form.locale,
												placeholder: "zh-CN",
												onChange: (value) => patch("locale", value),
											}),
										),
									),
									h(
										"div",
										{ style: { flex: 1 } },
										h(
											Field,
											{ label: "时区", hint: "如 Asia/Shanghai。" },
											h(TextInput, {
												value: form.timezoneId,
												placeholder: "Asia/Shanghai",
												onChange: (value) => patch("timezoneId", value),
											}),
										),
									),
								),
								h(
									Field,
									{ label: "图片选择器", hint: "只下某块区域里的图，留空 = 全页 <img>。" },
									h(TextInput, {
										value: form.imageSelector,
										placeholder: ".gallery img",
										onChange: (value) => patch("imageSelector", value),
									}),
								),
								h(
									Field,
									{
										label: "字段映射",
										hint: 'JSON 对象，按选择器抽结构化字段：{"标题":".title::text","链接":"a::attr(href)"}。以容器选择器为每一行。',
									},
									h(TextArea, {
										value: form.fields || "",
										placeholder: '{"标题":".title::text","价格":".price::text"}',
										rows: 3,
										onChange: (value) => patch("fields", value),
									}),
								),
								h(Toggle, {
									label: "跳过图片/样式等资源",
									hint: "只下 HTML，明显更快；页面布局可能异常。",
									value: form.disableResources,
									onChange: (value) => patch("disableResources", value),
								}),
								h(Toggle, {
									label: "屏蔽广告与追踪",
									hint: "拦掉约 3500 个广告域名，省流量也更快。",
									value: form.blockAds,
									onChange: (value) => patch("blockAds", value),
								}),
								h(Toggle, {
									label: "禁止 WebRTC 泄露",
									hint: "用代理时打开，防止真实 IP 暴露。",
									value: form.blockWebrtc,
									onChange: (value) => patch("blockWebrtc", value),
								}),
								h(Toggle, {
									label: "Canvas 加噪",
									hint: "干扰 Canvas 指纹，进一步降低被识别概率。",
									value: form.hideCanvas,
									onChange: (value) => patch("hideCanvas", value),
								}),
								h(Toggle, {
									label: "穿透 Shadow DOM",
									hint: "页面用 Web Components 时，打开才能选到内部元素。",
									value: form.pierceShadow,
									onChange: (value) => patch("pierceShadow", value),
								}),
								h(Toggle, {
									label: "使用本机 Chrome",
									hint: "不用自带 Chromium，直接拉起安装版 Chrome。",
									value: form.realChrome,
									onChange: (value) => patch("realChrome", value),
								}),
								h(Toggle, {
									label: "等待 DOM 加载完成",
									hint: "关闭可以更早拿到内容，但可能不完整。",
									value: form.loadDom,
									onChange: (value) => patch("loadDom", value),
								}),
								h(Toggle, {
									label: "只取正文区域",
									hint: "开启会去掉导航、页脚等噪音，适合喂给大模型。",
									value: form.mainContentOnly,
									onChange: (value) => patch("mainContentOnly", value),
								}),
								h(
									Field,
									{ label: "额外等待(毫秒)", hint: "浏览器模式下页面就绪后再等一会。" },
									h(TextInput, {
										value: String(form.wait),
										onChange: (value) => patch("wait", Number(value) || 0),
									}),
								),
							),

							h(
								"div",
								{ style: { display: "flex", gap: 8, marginTop: 16 } },
								h(
									Button,
									{ kind: "primary", onClick: start, disabled: starting || running || !form.url.trim() },
									starting ? "启动中…" : "开始抓取",
								),
								h(Button, { kind: "danger", onClick: stop, disabled: !running }, "停止"),
							),
						)
						: form.engine === "mediacrawler"
							? h(MediaCrawlerForm, {
									form,
									patch,
									env,
									start,
									stop,
									running,
									starting,
								})
							: h(DeepSeekForm, {
									form,
									patch,
									env,
									start,
									stop,
									running,
									starting,
								}),

						// ---------- visualization ----------
						h(
							"div",
							{ style: Object.assign({}, card, { flex: "1 1 560px", minWidth: 320 }) },

							h(
								"div",
								{
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 12,
										flexWrap: "wrap",
										marginBottom: 12,
									},
								},
								h("div", { style: { fontSize: 13, fontWeight: 700 } }, "运行看板"),
								h(Stepper, { stage: job ? job.stage : "launch", status: job ? job.status : "idle" }),
							),

							h(
								"div",
								{ style: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" } },
								h(StatCard, {
									label: "页面",
									value: Math.max(
										job && job.pages ? job.pages.length : 0,
										job && job.stats ? job.stats.pages || 0 : 0,
									),
								}),
								h(StatCard, { label: "条目", value: job && job.items ? job.items.length : job && job.stats ? job.stats.items : 0 }),
								h(StatCard, { label: "命中", value: job ? job.hitsCount || (job.hits ? job.hits.length : 0) : 0 }),
								h(StatCard, { label: "耗时", value: elapsed ? elapsed.toFixed(1) + "s" : "—" }),
							),

							h(
								"div",
								{
									style: {
										display: "flex",
										gap: 4,
										borderBottom: "1px solid " + C.border,
										marginBottom: 12,
									},
								},
								tabs.map((item) =>
									h(
										"button",
										{
											key: item.key,
											type: "button",
											onClick: () => setTab(item.key),
											style: {
												border: 0,
												background: "transparent",
												cursor: "pointer",
												padding: "7px 10px",
												fontSize: 12,
												fontWeight: 600,
												color: tab === item.key ? C.text : C.sub,
												borderBottom: "2px solid " + (tab === item.key ? C.brand : "transparent"),
												marginBottom: -1,
											},
										},
										item.label,
									),
								),
							),

							job && job.error
								? h(
										"div",
										{
											style: {
												marginBottom: 10,
												padding: "9px 12px",
												borderRadius: 9,
												fontSize: 12,
												color: C.err,
												background: "color-mix(in srgb, " + C.err + " 10%, transparent)",
												border: "1px solid color-mix(in srgb, " + C.err + " 30%, transparent)",
												whiteSpace: "pre-wrap",
											},
										},
										job.error,
									)
								: null,

							job
								? tab === "data"
									? h(DataTab, { job })
									: tab === "markdown"
										? h(MarkdownTab, { job })
										: tab === "images"
											? h(ImagesTab, { job })
											: tab === "pages"
												? h(PagesTab, { job })
												: h(LogTab, { job, scrollRef: logRef })
								: h(
										"div",
										null,
										h(
											"div",
											{ style: { fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: C.text } },
											"历史记录",
										),
										h(HistoryPanel, { items: history, onLoad: loadHistory }),
										restorable
											? h(
													"div",
													{ style: { marginTop: 10, fontSize: 11, color: C.sub } },
													"上次任务未在历史中？点下方按钮直接恢复。",
													h(
														"div",
														{ style: { marginTop: 6 } },
														h(
															Button,
															{
																onClick: () => {
																	setJob(restorable);
																	setRestorable(null);
																},
															},
															"恢复上次会话",
														),
													),
												)
											: null,
									),
						),
					),
				),

				h(
					"style",
					null,
					"@keyframes scrapling-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }",
				),
			);
		}

		function apply(ctx) {
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{
						name: "main",
						key: "scrapling",
					},
					Panel,
				),
			);
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{
						name: "sidebar.panellist",
						id: "scrapling",
						order: 45,
						label: "Scrapling 爬虫台",
					},
					SidebarIcon,
				),
			);
		}

		return { inject: ["slots"], apply };
	},
});
