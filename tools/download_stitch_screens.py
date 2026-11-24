#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Download all screens (screenshot + HTML) of a Stitch project via the MCP REST file API."""
import base64
import json
import os
import re
import sys
import urllib.request

PROJECT_ID = sys.argv[1] if len(sys.argv) > 1 else "1753652720916679803"
OUT_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "design",
    sys.argv[2] if len(sys.argv) > 2 else "stitch",
)
CONFIG = os.path.expanduser(r"C:/Users/kongfanjun/.workbuddy/mcp.json")


def key():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)["mcpServers"]["stitch"]["headers"]["X-Goog-Api-Key"]


def rpc(method, params, rid=2):
    body = json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}).encode()
    hdrs = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "X-Goog-Api-Key": key(),
    }
    req = urllib.request.Request("https://stitch.googleapis.com/mcp", data=body, headers=hdrs, method="POST")
    raw = urllib.request.urlopen(req, timeout=120).read().decode("utf-8", "replace")
    if raw.strip().startswith("{"):
        return json.loads(raw)
    for line in raw.splitlines():
        if line.startswith("data:"):
            chunk = line[5:].strip()
            if chunk:
                try:
                    return json.loads(chunk)
                except Exception:
                    pass
    raise RuntimeError("unparseable response")


def tool_text(resp):
    parts = (resp.get("result") or {}).get("content") or []
    return "\n".join(p.get("text", "") for p in parts if p.get("type") == "text")


def fetch(url):
    req = urllib.request.Request(url, headers={"X-Goog-Api-Key": key()})
    data = urllib.request.urlopen(req, timeout=120).read()
    obj = json.loads(data.decode("utf-8"))
    return obj.get("dataString", "")


def safe(name, fallback):
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", name or "").strip().strip(".")
    return name[:60] or fallback


def main():
    rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "dl", "version": "1"}}, 1)
    resp = rpc("tools/call", {"name": "list_screens", "arguments": {"projectId": PROJECT_ID}})
    payload = json.loads(tool_text(resp))
    screens = payload.get("screens", [])
    os.makedirs(OUT_ROOT, exist_ok=True)

    for idx, s in enumerate(screens, 1):
        sid = s["name"].rsplit("/", 1)[-1]
        title = s.get("title") or sid
        folder = os.path.join(OUT_ROOT, "%02d_%s" % (idx, safe(title, sid)))
        os.makedirs(folder, exist_ok=True)

        meta = {"index": idx, "id": sid, "title": title, "width": s.get("width"), "height": s.get("height"),
                "deviceType": s.get("deviceType")}

        shot = s.get("screenshot") or {}
        if shot.get("downloadUrl"):
            try:
                raw = fetch(shot["downloadUrl"])
                ext = ".jpg" if "jpeg" in (shot.get("mimeType") or "") else ".png"
                bin_data = base64.b64decode(raw) if not raw.startswith("<") else raw.encode()
                with open(os.path.join(folder, "screenshot" + ext), "wb") as f:
                    f.write(bin_data)
                meta["screenshot"] = "screenshot" + ext
                meta["screenshotBytes"] = len(bin_data)
            except Exception as e:
                meta["screenshotError"] = repr(e)

        html = s.get("htmlCode") or {}
        if html.get("downloadUrl"):
            try:
                code = fetch(html["downloadUrl"])
                if code.startswith("{"):
                    code = json.loads(code).get("dataString", code)
                with open(os.path.join(folder, "index.html"), "w", encoding="utf-8") as f:
                    f.write(code)
                meta["html"] = "index.html"
                meta["htmlBytes"] = len(code.encode("utf-8"))
            except Exception as e:
                meta["htmlError"] = repr(e)

        with open(os.path.join(folder, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        print("%02d  %-22s %s  shot=%s html=%s" % (
            idx, title[:22], sid,
            meta.get("screenshotBytes", meta.get("screenshotError", "-")),
            meta.get("htmlBytes", meta.get("htmlError", "-"))))

    print("\nsaved to:", OUT_ROOT)


if __name__ == "__main__":
    sys.exit(main())
