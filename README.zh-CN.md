# dsh-scrapling-platform

[English](https://github.com/LBY666-hub/dsh-scrapling-platform/blob/main/README.md) | **中文**

把 [Scrapling](https://github.com/D4Vinci/Scrapling) 做成 DeepSeek Harness（DSH）原生侧边栏面板：手动填参数、实时看爬取过程、拿走页面 / 条目 / 正文 / 图片，不用写代码。

> **已在 DSH `0.2.1-rc.2` 实测**（Desktop runtime，Cordis `4.0.5`）。需要 DSH 提供 `sidebar.panellist` + `main` 槽位与 `webServer` 路由注册能力，也就是 0.2.x 这一代。

---

## 这是什么

`dsh-scrapling-platform` 是一个 DSH 插件，分两半：

- **Host 半**（`index.js`）：在 DSH 的 web server 上注册一条本地路由 `/scrapling-api`，维护任务状态机，并拉起 Python 子进程。
- **Client 半**（`client.js`）：在 `sidebar.panellist` 注册蜘蛛图标，在 `main` 注册完整工作台。纯 React，无构建步骤，不依赖外部 UI 库。

点侧边栏图标即开面板：左边参数，右边实时运行看板。

## 它和 Scrapling 怎么交互

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

## 环境要求

| 项 | 版本 |
|---|---|
| DeepSeek Harness | 0.2.x（实测 `0.2.1-rc.2`） |
| Node.js | ≥ 20（DSH 自带） |
| Python | ≥ 3.10 |
| Scrapling | 0.5.x（`pip install "scrapling[ai,shell]"`） |
| 浏览器 | 可选，系统 Chrome 即可 |

## 安装

### 1. 拿到代码

```bash
git clone https://github.com/LBY666-hub/dsh-scrapling-platform.git
cd dsh-scrapling-platform
```

没装 Git？在仓库页面点 **Code → Download ZIP**，解压到任意目录即可。

### 2. 作为一个 DSH 插件安装

打开 DSH 的 **设置 → 插件**，把刚下载的文件夹作为本地 bundle 添加
（即 `link:<该文件夹的绝对路径>`）。如果你的 DSH 版本没有「本地目录安装」入口，
可以直接让 DSH 助手把这个文件夹装成插件。

> ⚠️ 不要在某个项目目录里手跑 `npm install` —— 那只会把包装进那个项目，
> DSH 根本不会加载它。插件必须装进 **DSH profile** 才会生效。

### 3. 准备 Python 环境

在插件默认寻找的位置建 venv —— `<DSH_HOME>/.venvs/scrapling`（Windows 为
`%DSH_HOME%\.venvs\scrapling`）—— 并安装 Scrapling：

```bash
python -m venv "$DSH_HOME/.venvs/scrapling"
"$DSH_HOME/.venvs/scrapling/bin/pip" install "scrapling[ai,shell]"
```

想用别的解释器也行：在插件配置里填 `python`，或设环境变量 `SCRAPLING_PYTHON`。

### 4. 可选配置

每项都有默认值，只改需要的：

```yaml
- id: dsh-scrapling-platform
  name: dsh-scrapling-platform
  config:
    python: '/自定义/.venvs/scrapling/bin/python'   # 默认：<DSH_HOME>/.venvs/scrapling
    chrome: '/自定义/chrome'                        # 默认自动探测；留空则用 Scrapling 自带 Chromium
    downloadRoot: '/自定义/下载目录'                 # 默认：<DSH_HOME>/scrapling-downloads
```

### 5. 重启并打开

重启 DSH，点左侧栏的蜘蛛图标。

## 快速上手

1. 点左侧栏的蜘蛛图标。
2. 填一个 URL，比如 `https://quotes.toscrape.com/`，模式保持 **HTTP**。
3. 可选：在 **CSS 选择器** 里填 `.quote`，只保留名言块。
4. 点 **开始抓取**。阶段条会依次走 `启动 → 抓取 → 解析 → 完成`，页面数和条目数实时变化，
   **日志**页签会滚动显示抓取器正在做什么。
5. 看结果：**数据**（命中的元素或整站条目）、**正文**（Markdown / 纯文本 / HTML）、
   **图片**（勾了图片下载才有）、**页面**（访问过的每个 URL）。

需要执行 JS 的页面把模式切到 **浏览器**；要一次抓多页切到 **整站**，再设「最多页数」和「并发数」。

## 双引擎

工作台顶部可以在两个项目之间切换：

| 引擎 | 输入 | 适合 |
|---|---|---|
| **Scrapling** | 一个 URL（+ CSS 选择器） | 任意网页：文章、文档、列表、图片 |
| **MediaCrawler** | 关键词 | 社媒平台：小红书、抖音、快手、B 站、微博、贴吧、知乎 |

### 使用 MediaCrawler

1. 克隆 [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)，把依赖装进它自己的 venv
   （默认 `<DSH_HOME>/.venvs/mediacrawler`），再执行 `python -m playwright install chromium`。
2. 告诉插件项目在哪：插件配置里的 `mediacrawlerDir`，或本包旁边的 `plugin.local.json`：

   ```json
   { "mediacrawlerDir": "D:\\路径\\MediaCrawler-main" }
   ```

3. 选平台、填关键词、选登录方式（`扫码` 要把「无头运行」关掉才看得到二维码；`Cookie` 直接粘贴），点开始。
4. MediaCrawler 的输出会实时进 **日志** 页签；跑完或点「停止」后，它写出的 JSONL 会被解析成 **数据** 表格。

MediaCrawler 采用 **NON-COMMERCIAL LEARNING LICENSE 1.1**，使用前请先读它的 LICENSE。

## 用法

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

## 相对原项目的创新点

1. **原生侧边栏面板，而不是工具调用。** Scrapling 自带 MCP server 和 Agent Skill；本插件把它变成 DSH 里的一等 UI 界面。
2. **事件流可视化。** 不是等一个结果 blob，而是逐条吐出 `stage / log / page / item / image`，能看着页面一个个回来、条目一条条累积。
3. **会自我解释的参数。** 每个控件配一句人话说明，降低非开发者的上手成本。
4. **图片作为一等产物。** 下载、缩略图预览、可复制的保存路径，同一次任务里完成。
5. **进程隔离 + 可中断。** 一任务一子进程，停止或卸载插件即杀；抓取崩了不会拖垮 Harness。
6. **本地路由加固。** 取文件防路径穿越、任务 ID 白名单、不对外网暴露。

## 使用边界（刻意不做的事）

- 不做登录态保存、验证码人工接管、代理池轮换、定时任务、分布式爬取。
- 图片只取 `<img>` 地址：不含 CSS 背景图、视频、PDF/DOCX 等附件。
- 同时只跑一个任务；任务状态在内存里，重启即丢。
- 整站模式不下载图片。
- 不内置浏览器：要么用系统 Chrome，要么自己 `scrapling install`。
- 它不是生产级采集管线，是一个交互式控制台。

## 致谢

- **[Scrapling](https://github.com/D4Vinci/Scrapling)** 作者 **Karim Shoair（D4Vinci）** —— 本面板驱动的全部抓取能力都来自它，BSD-3-Clause。本项目**与 Scrapling 作者无隶属或背书关系**。
- **[MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)** 作者 **NanmiCoder** —— 社媒关键词抓取引擎，**NON-COMMERCIAL LEARNING LICENSE 1.1**；本项目与其作者同样无隶属关系。
- **DeepSeek Harness** 团队 —— 槽位、路由与 bundle API 让原生面板成为可能。
- 社区插件 `dsh-mcp-connector` —— 其 `sidebar.panellist` + `main` 的注册方式是本面板槽位接线的参考。

## 许可证与法律声明

插件源码：MIT（见 `LICENSE`）。Scrapling 本身仍为 BSD-3-Clause，版权归 Karim Shoair。

**仅供代码学习与研究使用，不可用于商业化。** 不可用于恶意攻击——包括但不限于类 DDoS 的请求洪泛、绕过付费墙或访问控制、无合法依据抓取个人信息、违反目标站服务条款或 `robots.txt`。

抓什么、怎么抓，责任在使用者。按所在司法辖区与目标站的不同，未经授权的抓取可能触犯著作权法、数据库权利、计算机犯罪相关条款以及个人信息保护法（如 PIPL、GDPR）。作者不对任何滥用行为或运行本软件产生的后果承担责任。

---

[English](https://github.com/LBY666-hub/dsh-scrapling-platform/blob/main/README.md) | **中文**
