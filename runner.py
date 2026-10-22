"""Scrapling runner used by the DSH workbench panel.

Reads one JSON job description from stdin, streams JSON lines to stdout, writes
the result files into the job's output directory, and never writes anything else
on stdout: stdout is the wire between this process and the Host half.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import traceback
from urllib.parse import urljoin, urlparse

try:  # keep UTF-8 on the wire regardless of the Windows console code page
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8", newline="\n")
except Exception:  # pragma: no cover - older interpreters
    pass


def emit(kind: str, **payload) -> None:
    try:
        sys.stdout.write(json.dumps({"t": kind, **payload}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def normalize_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        raise ValueError("URL 不能为空")
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    return url


def clip(text: str, limit: int = 60000) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n…（内容过长，已截断）"


def output_dir(cfg) -> str:
    return (cfg.get("outputDir") or "").strip()


def write_text_file(cfg, name: str, text: str) -> str:
    folder = output_dir(cfg)
    if not folder:
        return ""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text or "")
    return path


def write_jsonl(cfg, name: str, rows) -> str:
    folder = output_dir(cfg)
    if not folder:
        return ""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    return path


def write_meta(cfg, payload) -> str:
    folder = output_dir(cfg)
    if not folder:
        return ""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "meta.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return path


def parse_headers(cfg):
    raw = (cfg.get("headers") or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except Exception:
        emit("log", msg="请求头不是合法 JSON，已忽略")
    return None


def parse_cookies(cfg):
    raw = (cfg.get("cookies") or "").strip()
    if not raw:
        return None
    cookies = {}
    for part in raw.replace("\n", ";").split(";"):
        if "=" in part:
            key, value = part.split("=", 1)
            cookies[key.strip()] = value.strip()
    return cookies or None


def extract_text(page, selector):
    if not selector:
        return page.get_all_text(strip=True)
    nodes = page.css(selector)
    return "\n".join((node.get_all_text(strip=True) or "") for node in nodes[:80])


def extract_html(page, selector):
    if not selector:
        return page.html_content
    nodes = page.css(selector)
    return "\n".join(node.html_content for node in nodes[:40])


def collect_hits(page, selector):
    if not selector:
        return []
    hits = []
    for index, node in enumerate(page.css(selector)[:200]):
        text = (node.get_all_text(strip=True) or "")[:240]
        attrib = getattr(node, "attrib", {}) or {}
        hits.append(
            {
                "index": index + 1,
                "text": text,
                "tag": getattr(node, "tag", "") or "",
                "href": attrib.get("href") or "",
            }
        )
    return hits


def run_single(cfg):
    from scrapling.fetchers import Fetcher

    url = normalize_url(cfg.get("url"))
    selector = (cfg.get("selector") or "").strip() or None
    output = cfg.get("output") or "markdown"
    timeout = float(cfg.get("timeout") or 30)

    kwargs = {
        "timeout": timeout,
        "impersonate": cfg.get("impersonate") or "chrome",
        "stealthy_headers": True,
    }
    proxy = (cfg.get("proxy") or "").strip()
    if proxy:
        kwargs["proxy"] = proxy
    headers = parse_headers(cfg)
    if headers:
        kwargs["headers"] = headers
    cookies = parse_cookies(cfg)
    if cookies:
        kwargs["cookies"] = cookies
    if cfg.get("http3"):
        kwargs["http3"] = True
    if cfg.get("retries"):
        kwargs["retries"] = int(cfg.get("retries"))
    if cfg.get("retryDelay"):
        kwargs["retry_delay"] = int(float(cfg.get("retryDelay")))
    if cfg.get("followRedirects") is False:
        kwargs["follow_redirects"] = False

    emit("stage", stage="fetch")
    emit("log", msg="HTTP 请求 %s" % url)
    started = time.time()
    page = Fetcher.get(url, **kwargs)
    elapsed = int((time.time() - started) * 1000)
    status = int(getattr(page, "status", 0) or 0)
    final_url = str(getattr(page, "url", url) or url)
    emit("page", url=final_url, status=status, ms=elapsed)
    emit("log", msg="HTTP %s，%d ms" % (status, elapsed))

    emit("stage", stage="parse")
    hits = collect_hits(page, selector)
    if hits:
        emit("hits", items=hits, count=len(hits))
        emit("log", msg="选择器命中 %d 个元素" % len(hits))

    if output == "text":
        body = extract_text(page, selector)
    elif output == "html":
        body = extract_html(page, selector)
    else:
        body = page.markdown(css_selector=selector, main_content_only=bool(cfg.get("mainContentOnly", True)))
    emit("markdown", text=clip(body))
    emit("log", msg="正文 %d 字符" % len(body or ""))

    extension = {"text": ".txt", "html": ".html"}.get(output, ".md")
    content_path = write_text_file(cfg, "正文" + extension, body)
    items_path = write_jsonl(cfg, "items.jsonl", hits) if hits else ""
    write_meta(
        cfg,
        {
            "engine": "scrapling",
            "mode": "http",
            "url": url,
            "finalUrl": final_url,
            "status": status,
            "selector": selector,
            "output": output,
            "hits": len(hits),
            "contentFile": content_path,
            "itemsFile": items_path,
            "finishedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )
    if output_dir(cfg):
        emit("saved", dir=output_dir(cfg))

    if cfg.get("images"):
        download_images(page, cfg, final_url)
    emit("done", elapsed=round(time.time() - started, 2))


def run_browser(cfg):
    from scrapling.fetchers import StealthyFetcher

    url = normalize_url(cfg.get("url"))
    selector = (cfg.get("selector") or "").strip() or None
    output = cfg.get("output") or "markdown"
    executable = (cfg.get("executablePath") or "").strip() or None

    kwargs = {
        "headless": bool(cfg.get("headless", True)),
        "timeout": int(float(cfg.get("timeout") or 45) * 1000),
        "network_idle": bool(cfg.get("networkIdle", False)),
        "solve_cloudflare": bool(cfg.get("solveCloudflare", False)),
        "disable_resources": bool(cfg.get("disableResources", False)),
        "block_ads": bool(cfg.get("blockAds", False)),
        "hide_canvas": bool(cfg.get("hideCanvas", False)),
        "block_webrtc": bool(cfg.get("blockWebrtc", False)),
        "pierce_shadow": bool(cfg.get("pierceShadow", False)),
        "load_dom": bool(cfg.get("loadDom", True)),
    }
    if cfg.get("wait"):
        kwargs["wait"] = int(float(cfg.get("wait")))
    wait_selector = (cfg.get("waitSelector") or "").strip()
    if wait_selector:
        kwargs["wait_selector"] = wait_selector
    proxy = (cfg.get("proxy") or "").strip()
    if proxy:
        kwargs["proxy"] = proxy
    if executable:
        kwargs["executable_path"] = executable
    if cfg.get("realChrome"):
        kwargs["real_chrome"] = True
    if cfg.get("locale"):
        kwargs["locale"] = cfg.get("locale")
    if cfg.get("timezoneId"):
        kwargs["timezone_id"] = cfg.get("timezoneId")
    if cfg.get("useragent"):
        kwargs["useragent"] = cfg.get("useragent")
    headers = parse_headers(cfg)
    if headers:
        kwargs["extra_headers"] = headers

    emit("stage", stage="fetch")
    emit("log", msg="启动浏览器（%s）" % ("无头" if kwargs["headless"] else "有头"))
    started = time.time()
    page = StealthyFetcher.fetch(url, **kwargs)
    elapsed = int((time.time() - started) * 1000)
    status = int(getattr(page, "status", 0) or 0)
    final_url = str(getattr(page, "url", url) or url)
    emit("page", url=final_url, status=status, ms=elapsed)
    emit("log", msg="浏览器渲染完成 %s，%d ms" % (status, elapsed))

    emit("stage", stage="parse")
    hits = collect_hits(page, selector)
    if hits:
        emit("hits", items=hits, count=len(hits))
    if output == "text":
        body = extract_text(page, selector)
    elif output == "html":
        body = extract_html(page, selector)
    else:
        body = page.markdown(css_selector=selector, main_content_only=bool(cfg.get("mainContentOnly", True)))
    emit("markdown", text=clip(body))
    emit("log", msg="正文 %d 字符" % len(body or ""))

    extension = {"text": ".txt", "html": ".html"}.get(output, ".md")
    content_path = write_text_file(cfg, "正文" + extension, body)
    items_path = write_jsonl(cfg, "items.jsonl", hits) if hits else ""
    write_meta(
        cfg,
        {
            "engine": "scrapling",
            "mode": "browser",
            "url": url,
            "finalUrl": final_url,
            "status": status,
            "selector": selector,
            "output": output,
            "hits": len(hits),
            "contentFile": content_path,
            "itemsFile": items_path,
            "finishedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )
    if output_dir(cfg):
        emit("saved", dir=output_dir(cfg))

    if cfg.get("images"):
        download_images(page, cfg, final_url)
    emit("done", elapsed=round(time.time() - started, 2))


def run_spider(cfg):
    import anyio
    from urllib.parse import urlparse
    from scrapling.spiders import Spider, Request

    url = normalize_url(cfg.get("url"))
    selector = (cfg.get("selector") or "").strip() or None
    follow = bool(cfg.get("follow", False))
    max_pages = max(1, int(cfg.get("maxPages") or 5))
    domain = urlparse(url).netloc
    collected = []

    class PanelSpider(Spider):
        name = "dsh-panel"
        start_urls = [url]
        allowed_domains = {domain}
        concurrent_requests = max(1, int(cfg.get("concurrency") or 4))
        concurrent_requests_per_domain = max(0, int(cfg.get("concurrencyPerDomain") or 0))
        download_delay = float(cfg.get("downloadDelay") or 0)
        robots_txt_obey = bool(cfg.get("respectRobots", False))
        logging_level = 30  # warnings only; the panel supplies the readable log

        async def parse(self, response):
            status = int(getattr(response, "status", 0) or 0)
            emit("page", url=str(response.url), status=status, ms=0)
            targets = response.css(selector) if selector else [response]
            for index, node in enumerate(targets[:200]):
                text = (node.get_all_text(strip=True) or "")[:400]
                href = ""
                try:
                    href = (getattr(node, "attrib", {}) or {}).get("href", "") or ""
                except Exception:
                    href = ""
                yield {"序号": index + 1, "文本": text, "链接": href, "页面": str(response.url)}

            if not follow:
                return
            counter = getattr(self, "_seen_pages", 0) + 1
            self._seen_pages = counter
            if counter >= max_pages:
                return
            for link in response.css("a::attr(href)").getall()[:15]:
                if link and not link.startswith(("#", "javascript:", "mailto:")):
                    yield Request(link, callback=self.parse)

    spider = PanelSpider()
    started = time.time()

    async def stream_items():
        async for item in spider.stream():
            collected.append(item)
            emit("item", data=item)
            try:
                stats = spider.stats
                emit(
                    "stats",
                    pages=stats.requests_count,
                    items=stats.items_scraped,
                    bytes=stats.response_bytes,
                    elapsed=round(time.time() - started, 2),
                )
            except Exception:
                pass

    anyio.run(stream_items)
    items_path = write_jsonl(cfg, "items.jsonl", collected)
    write_meta(
        cfg,
        {
            "engine": "scrapling",
            "mode": "spider",
            "url": url,
            "selector": selector,
            "maxPages": max_pages,
            "follow": follow,
            "items": len(collected),
            "itemsFile": items_path,
            "finishedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )
    if output_dir(cfg):
        emit("saved", dir=output_dir(cfg))
    emit("done", elapsed=round(time.time() - started, 2))


def collect_image_urls(page, selector, base_url, limit):
    nodes = page.css(selector or "img")
    urls = []
    for node in nodes:
        attrib = getattr(node, "attrib", {}) or {}
        src = (
            attrib.get("src")
            or attrib.get("data-src")
            or attrib.get("data-original")
            or attrib.get("data-lazy-src")
            or ""
        )
        if not src and attrib.get("srcset"):
            first = attrib["srcset"].split(",")[0].strip()
            src = first.split(" ")[0]
        src = (src or "").strip()
        if not src or src.startswith("data:"):
            continue
        full = urljoin(base_url, src)
        if full not in urls:
            urls.append(full)
        if len(urls) >= limit:
            break
    return urls


def image_filename(url, content_type):
    mime = (content_type or "").split(";")[0].strip().lower()
    ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/avif": ".avif",
    }.get(mime)
    if not ext:
        candidate = os.path.splitext(urlparse(url).path)[1].lower()
        ext = candidate if candidate in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif") else ".jpg"
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12] + ext


def download_images(page, cfg, base_url):
    root = output_dir(cfg)
    if not root:
        emit("log", msg="没有可用的输出目录，跳过图片")
        return
    outdir = os.path.join(root, "images")
    limit = max(1, min(200, int(cfg.get("imageLimit") or 20)))
    selector = (cfg.get("imageSelector") or "").strip() or None
    try:
        os.makedirs(outdir, exist_ok=True)
    except Exception as error:  # noqa: BLE001
        emit("log", msg="创建图片目录失败：%s" % error)
        return

    urls = collect_image_urls(page, selector, base_url, limit)
    if not urls:
        emit("log", msg="页面上没有找到可下载的图片")
        return
    emit("log", msg="发现 %d 张图片，开始下载" % len(urls))

    from scrapling.fetchers import Fetcher

    ok = 0
    for index, url in enumerate(urls):
        try:
            response = Fetcher.get(url, timeout=25, impersonate="chrome", stealthy_headers=True)
            body = response.body or b""
            if not body:
                raise ValueError("空响应")
            headers = getattr(response, "headers", {}) or {}
            content_type = headers.get("content-type", "") if hasattr(headers, "get") else ""
            name = image_filename(url, content_type)
            with open(os.path.join(outdir, name), "wb") as handle:
                handle.write(body)
            ok += 1
            emit("image", index=index + 1, url=url, name="images/" + name, bytes=len(body), ok=True)
        except Exception as error:  # noqa: BLE001
            emit("image", index=index + 1, url=url, name="", bytes=0, ok=False, err=str(error)[:200])
    emit("log", msg="图片下载完成：成功 %d / %d" % (ok, len(urls)))


def main() -> int:
    raw = sys.stdin.read()
    cfg = json.loads(raw or "{}")
    mode = cfg.get("mode") or "http"
    emit("stage", stage="launch")
    emit("log", msg="任务启动：%s 模式" % mode)
    try:
        if mode == "browser":
            run_browser(cfg)
        elif mode == "spider":
            run_spider(cfg)
        else:
            run_single(cfg)
    except Exception as error:  # noqa: BLE001 - the panel needs the real message
        emit("log", msg="%s: %s" % (type(error).__name__, error))
        emit("error", msg="%s: %s" % (type(error).__name__, error), detail=traceback.format_exc()[-4000:])
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
