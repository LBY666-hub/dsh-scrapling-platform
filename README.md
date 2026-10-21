# dsh-scrapling-platform

**English** | [中文](https://github.com/LBY666-hub/dsh-scrapling-platform/blob/main/README.zh-CN.md)

A native Scrapling sidebar panel for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH): set scraping parameters by hand, watch the crawl run live, and collect pages, items, text, and images — without writing code.

> **Tested against DSH `0.2.1-rc.2`** (Desktop runtime, Cordis `4.0.5`). Requires a DSH that exposes the `sidebar.panellist` + `main` slots and the `webServer` route registry — i.e. the 0.2.x line.

---

## What it is

`dsh-scrapling-platform` is a DSH plugin with two halves:

- **Host half** (`index.js`): registers one local HTTP route `/scrapling-api` on the DSH web server, owns the job state machine, and spawns the Python runner.
- **Client half** (`client.js`): registers a spider icon in `sidebar.panellist` and a full workspace in `main`. Pure React, no build step, no external UI dependency.

Clicking the sidebar icon opens the panel: parameters on the left, a live run board on the right.

## How it talks to Scrapling

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

## Requirements

| Item | Version |
|---|---|
| DeepSeek Harness | 0.2.x (tested `0.2.1-rc.2`) |
| Node.js | ≥ 20 (DSH ships its own) |
| Python | ≥ 3.10 |
| Scrapling | 0.5.x (`pip install "scrapling[ai,shell]"`) |
| Browser | optional; system Chrome works |

## Install

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

## Usage

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

## What's new here

1. **Native sidebar panel, not a tool call.** Scrapling ships an MCP server and an agent skill; this plugin makes it a first-class UI surface in DSH.
2. **Event-stream visualization.** Instead of waiting for one result blob, the runner emits `stage / log / page / item / image` events, so you watch pages arrive and items accumulate.
3. **Parameters that explain themselves.** Each control has a plain-language hint, lowering the entry cost for non-developers.
4. **Images as a first-class output.** Download + thumbnail preview + copyable save path, in the same run.
5. **Process isolation and interruptibility.** One child per job, killed on stop or plugin unload; a crashed scrape never takes the Harness down.
6. **Hardened local route.** Path-traversal guard on file serving, job-id whitelist, no remote exposure.

## Boundaries — what it deliberately does not do

- No login/session persistence, CAPTCHA hand-off, proxy-pool rotation, scheduling, or distributed crawling.
- Images means `<img>` sources only: no CSS backgrounds, video, or arbitrary attachments (PDF/DOCX).
- Single job at a time; no durable queue — jobs live in memory and vanish on restart.
- Spider mode does not download images.
- No bundled browser: you supply Chrome, or run `scrapling install`.
- Not a replacement for a production scraping pipeline; it is an interactive console.

## Credits

- **[Scrapling](https://github.com/D4Vinci/Scrapling)** by **Karim Shoair (D4Vinci)** — the entire scraping engine this panel drives. BSD-3-Clause. This project is **not affiliated with or endorsed by** the Scrapling author.
- **DeepSeek Harness** team — the slot, route, and bundle APIs that make a native panel possible.
- The `dsh-mcp-connector` community plugin — its `sidebar.panellist` + `main` registration pattern was the reference for this panel's slot wiring.

## License and legal notice

Plugin source: MIT (see `LICENSE`). Scrapling itself remains BSD-3-Clause, © Karim Shoair.

**For learning and code study only.** Not for commercial use. Not for malicious use — including but not limited to DDoS-like request floods, bypassing paywalls or access controls, scraping personal data without a lawful basis, or violating a site's terms of service or `robots.txt`.

You are solely responsible for what you crawl. Depending on jurisdiction and target, unauthorized scraping may violate copyright law, database rights, computer-misuse statutes, and personal-information laws (e.g. PIPL, GDPR). The authors accept no liability for misuse or for any consequence of running this software.

---

**English** | [中文](https://github.com/LBY666-hub/dsh-scrapling-platform/blob/main/README.zh-CN.md)
