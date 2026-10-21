# dsh-scrapling-platform

A native Scrapling sidebar panel for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH): set scraping parameters by hand, watch the crawl run live, and collect pages, items, text, and images — without writing code.

把 [Scrapling](https://github.com/D4Vinci/Scrapling) 做成 DSH 原生侧边栏面板：手动填参数、实时看爬取过程、拿走页面 / 条目 / 正文 / 图片，不用写代码。

> **Tested against DSH `0.2.1-rc.2`** (Desktop runtime, Cordis `4.0.5`). Requires a DSH that exposes the `sidebar.panellist` + `main` slots and the `webServer` route registry — i.e. the 0.2.x line.
>
> **已在 DSH `0.2.1-rc.2` 实测**（Desktop runtime，Cordis `4.0.5`）。需要 DSH 提供 `sidebar.panellist` + `main` 槽位与 `webServer` 路由注册能力，也就是 0.2.x 这一代。

---

## English

### What it is

`dsh-scrapling-platform` is a DSH plugin with two halves:

- **Host half** (`index.js`): registers one local HTTP route `/scrapling-api` on the DSH web server, owns the job state machine, and spawns the Python runner.
- **Client half** (`client.js`): registers a spider icon in `sidebar.panellist` and a full workspace in `main`. Pure React, no build step, no external UI dependency.

Clicking the sidebar icon opens the panel: parameters on the left, a live run board on the right.

### How it talks to Scrapling

It does **not** fork, patch, or vendor Scrapling. It only depends on Scrapling's public Python API, installed in any Python 3.10+ environment you point it at:

```
Panel (React)
   │  POST /scrapling-api/run        { url, mode, selector, ... }
   ▼
Host (Node)                          job state, 0.7s polling
   │  spawn python runner.py  ← JSON payload on stdin
   ▼
runner.py (your venv)
   │  Fetcher.get / StealthyFetcher.fetch / Spider.stream
   ▼
Scrapling  ──►  JSON lines on stdout  {t:"stage"|"log"|"page"|"item"|"image"|"done"}
   │
   └──► Host merges events into job state ──► Panel renders
```

Key points:

- **One process per job**, no shared state with Scrapling. Stop = kill the child process.
- **Browser mode reuses your installed Chrome** through `executable_path`, so `scrapling install` (a ~150 MB Chromium download) is optional.
- **No network exposure**: the route only serves the local DSH web server; file serving refuses path traversal and only reads inside the job's download directory.
- If you upgrade Scrapling, nothing here needs to change as long as its public API stays stable.

### Requirements

| Item | Version |
|---|---|
| DeepSeek Harness | 0.2.x (tested `0.2.1-rc.2`) |
| Node.js | ≥ 20 (DSH ships its own) |
| Python | ≥ 3.10 |
| Scrapling | 0.5.x (`pip install "scrapling[ai,shell]"`) |
| Browser | optional; system Chrome works |

### Install

1. Create the venv the plugin looks for by default — `<DSH_HOME>/.venvs/scrapling`
   (Windows: `%DSH_HOME%\.venvs\scrapling`) — and install Scrapling into it:

   ```bash
   python -m venv "$DSH_HOME/.venvs/scrapling"
   "$DSH_HOME/.venvs/scrapling/bin/pip" install "scrapling[ai,shell]"
   ```

   Any other interpreter works too: set `python` in the plugin config, or the
   `SCRAPLING_PYTHON` environment variable.

2. Install the plugin into your DSH profile (Plugins → install from npm, or a local path):

   ```
   npm install dsh-scrapling-platform
   ```

3. Optional config — every field has a working default, set only what you need:

   ```yaml
   - id: dsh-scrapling-platform
     name: dsh-scrapling-platform
     config:
       python: '/custom/path/.venvs/scrapling/bin/python'   # default: <DSH_HOME>/.venvs/scrapling
       chrome: '/custom/path/to/chrome'                     # default: auto-detected; empty = use Scrapling's bundled Chromium
       downloadRoot: '/custom/downloads'                    # default: <DSH_HOME>/scrapling-downloads
   ```

4. Restart DSH, then click the spider icon in the left rail.

### Usage

| Field | Meaning |
|---|---|
| URL | target page; `https://` is added when omitted |
| Mode | `HTTP` (fast, static) · `Browser` (JS / anti-bot) · `Spider` (multi-page) |
| CSS selector | empty = whole page; `.quote` = every matching element |
| Output | Markdown · plain text · HTML |
| Timeout | per-request seconds |
| Headless / Cloudflare / network-idle / wait selector | browser-only options |
| Max pages / concurrency / follow links | spider-only options |
| Images | download `<img>` targets (incl. `data-src`, `srcset`) |

Results appear in tabs: **Data**, **Text**, **Images**, **Pages**, **Log**. Every parameter carries a one-line explanation in the UI.

### What's new here

1. **Native sidebar panel, not a tool call.** Scrapling ships an MCP server and an agent skill; this plugin makes it a first-class UI surface in DSH.
2. **Event-stream visualization.** Instead of waiting for one result blob, the runner emits `stage / log / page / item / image` events, so you watch pages arrive and items accumulate.
3. **Parameters that explain themselves.** Each control has a plain-language hint, lowering the entry cost for non-developers.
4. **Images as a first-class output.** Download + thumbnail preview + copyable save path, in the same run.
5. **Process isolation and interruptibility.** One child per job, killed on stop or plugin unload; a crashed scrape never takes the Harness down.
6. **Hardened local route.** Path-traversal guard on file serving, job-id whitelist, no remote exposure.

### Boundaries — what it deliberately does not do

- No login/session persistence, CAPTCHA hand-off, proxy-pool rotation, scheduling, or distributed crawling.
- Images means `<img>` sources only: no CSS backgrounds, video, or arbitrary attachments (PDF/DOCX).
- Single job at a time; no durable queue — jobs live in memory and vanish on restart.
- Spider mode does not download images.
- No bundled browser: you supply Chrome, or run `scrapling install`.
- Not a replacement for a production scraping pipeline; it is an interactive console.

### Credits

- **[Scrapling](https://github.com/D4Vinci/Scrapling)** by **Karim Shoair (D4Vinci)** — the entire scraping engine this panel drives. BSD-3-Clause. This project is **not affiliated with or endorsed by** the Scrapling author.
- **DeepSeek Harness** team — the slot, route, and bundle APIs that make a native panel possible.
- The `dsh-mcp-connector` community plugin — its `sidebar.panellist` + `main` registration pattern was the reference for this panel's slot wiring.

### License and legal notice

Plugin source: MIT (see `LICENSE`). Scrapling itself remains BSD-3-Clause, © Karim Shoair.

**For learning and code study only.** Not for commercial use. Not for malicious use — including but not limited to DDoS-like request floods, bypassing paywalls or access controls, scraping personal data without a lawful basis, or violating a site's terms of service or `robots.txt`.

You are solely responsible for what you crawl. Depending on jurisdiction and target, unauthorized scraping may violate copyright law, database rights, computer-misuse statutes, and personal-information laws (e.g. PIPL, GDPR). The authors accept no liability for misuse or for any consequence of running this software.

---

## 中文

### 这是什么

`dsh-scrapling-platform` 是一个 DSH 插件，分两半：

- **Host 半**（`index.js`）：在 DSH 的 web server 上注册一条本地路由 `/scrapling-api`，维护任务状态机，并拉起 Python 子进程。
- **Client 半**（`client.js`）：在 `sidebar.panellist` 注册蜘蛛图标，在 `main` 注册完整工作台。纯 React，无构建步骤，不依赖外部 UI 库。

点侧边栏图标即开面板：左边参数，右边实时运行看板。

### 它和 Scrapling 怎么交互

**不分叉、不打补丁、不内嵌** Scrapling 代码，只调用它的公开 Python API；Scrapling 装在你自己指定的 Python 3.10+ 环境里：

```
面板（React）
   │  POST /scrapling-api/run        { url, mode, selector, ... }
   ▼
Host（Node）                          任务状态，0.7 秒轮询
   │  spawn python runner.py  ← stdin 传 JSON 参数
   ▼
runner.py（你的 venv）
   │  Fetcher.get / StealthyFetcher.fetch / Spider.stream
   ▼
Scrapling  ──►  逐行输出 JSON  {t:"stage"|"log"|"page"|"item"|"image"|"done"}
   │
   └──► Host 合并进任务状态 ──► 面板渲染
```

要点：

- **一个任务一个进程**，与 Scrapling 无共享状态；「停止」就是杀掉子进程。
- **浏览器模式复用你已装的 Chrome**（传 `executable_path`），所以 `scrapling install` 那 150 MB 的 Chromium 可以不装。
- **不对外暴露**：路由只挂在本地 DSH web server 上；取图接口做了路径穿越防护，只能读当前任务目录内的文件。
- Scrapling 升级后，只要公开 API 不变，这里不用改。

### 环境要求

| 项 | 版本 |
|---|---|
| DeepSeek Harness | 0.2.x（实测 `0.2.1-rc.2`） |
| Node.js | ≥ 20（DSH 自带） |
| Python | ≥ 3.10 |
| Scrapling | 0.5.x（`pip install "scrapling[ai,shell]"`） |
| 浏览器 | 可选，系统 Chrome 即可 |

### 安装

1. 在插件默认寻找的位置建 venv —— `<DSH_HOME>/.venvs/scrapling`（Windows 为
   `%DSH_HOME%\.venvs\scrapling`）—— 并安装 Scrapling：

   ```bash
   python -m venv "$DSH_HOME/.venvs/scrapling"
   "$DSH_HOME/.venvs/scrapling/bin/pip" install "scrapling[ai,shell]"
   ```

   想用别的解释器也行：在插件配置里填 `python`，或设环境变量 `SCRAPLING_PYTHON`。

2. 把插件装进 DSH（在「插件」里从 npm 安装，或用本地路径）：

   ```
   npm install dsh-scrapling-platform
   ```

3. 可选配置——每项都有默认值，只改需要的：

   ```yaml
   - id: dsh-scrapling-platform
     name: dsh-scrapling-platform
     config:
       python: '/自定义/.venvs/scrapling/bin/python'   # 默认：<DSH_HOME>/.venvs/scrapling
       chrome: '/自定义/chrome'                        # 默认自动探测；留空则用 Scrapling 自带 Chromium
       downloadRoot: '/自定义/下载目录'                 # 默认：<DSH_HOME>/scrapling-downloads
   ```

4. 重启 DSH，点左侧栏的蜘蛛图标。

### 用法

| 参数 | 含义 |
|---|---|
| URL | 要抓的页面；不写协议自动补 `https://` |
| 模式 | `HTTP`（快，静态页）· `浏览器`（JS / 反爬）· `整站`（多页） |
| CSS 选择器 | 留空 = 整页；`.quote` = 所有匹配元素 |
| 输出 | Markdown · 纯文本 · HTML |
| 超时 | 单次请求秒数 |
| 无头 / Cloudflare / 网络空闲 / 等待选择器 | 浏览器模式专用 |
| 最多页数 / 并发 / 跟随链接 | 整站模式专用 |
| 图片 | 下载 `<img>`（含 `data-src`、`srcset`） |

结果分页签：**数据**、**正文**、**图片**、**页面**、**日志**。每个参数在界面上都有一句解释。

### 相对原项目的创新点

1. **原生侧边栏面板，而不是工具调用。** Scrapling 自带 MCP server 和 Agent Skill；本插件把它变成 DSH 里的一等 UI 界面。
2. **事件流可视化。** 不是等一个结果 blob，而是逐条吐出 `stage / log / page / item / image`，能看着页面一个个回来、条目一条条累积。
3. **会自我解释的参数。** 每个控件配一句人话说明，降低非开发者的上手成本。
4. **图片作为一等产物。** 下载、缩略图预览、可复制的保存路径，同一次任务里完成。
5. **进程隔离 + 可中断。** 一任务一子进程，停止或卸载插件即杀；抓取崩了不会拖垮 Harness。
6. **本地路由加固。** 取文件防路径穿越、任务 ID 白名单、不对外网暴露。

### 使用边界（刻意不做的事）

- 不做登录态保存、验证码人工接管、代理池轮换、定时任务、分布式爬取。
- 图片只取 `<img>` 地址：不含 CSS 背景图、视频、PDF/DOCX 等附件。
- 同时只跑一个任务；任务状态在内存里，重启即丢。
- 整站模式不下载图片。
- 不内置浏览器：要么用系统 Chrome，要么自己 `scrapling install`。
- 它不是生产级采集管线，是一个交互式控制台。

### 致谢

- **[Scrapling](https://github.com/D4Vinci/Scrapling)** 作者 **Karim Shoair（D4Vinci）** —— 本面板驱动的全部抓取能力都来自它，BSD-3-Clause。本项目**与 Scrapling 作者无隶属或背书关系**。
- **DeepSeek Harness** 团队 —— 槽位、路由与 bundle API 让原生面板成为可能。
- 社区插件 `dsh-mcp-connector` —— 其 `sidebar.panellist` + `main` 的注册方式是本面板槽位接线的参考。

### 许可证与法律声明

插件源码：MIT（见 `LICENSE`）。Scrapling 本身仍为 BSD-3-Clause，版权归 Karim Shoair。

**仅供代码学习与研究使用，不可用于商业化。** 不可用于恶意攻击——包括但不限于类 DDoS 的请求洪泛、绕过付费墙或访问控制、无合法依据抓取个人信息、违反目标站服务条款或 `robots.txt`。

抓什么、怎么抓，责任在使用者。按所在司法辖区与目标站的不同，未经授权的抓取可能触犯著作权法、数据库权利、计算机犯罪相关条款以及个人信息保护法（如 PIPL、GDPR）。作者不对任何滥用行为或运行本软件产生的后果承担责任。
