#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Minimal Stitch MCP client (streamable HTTP, stateless).

Usage:
    python stitch_mcp.py tools
    python stitch_mcp.py call <tool_name> '<json_args>'
"""
import json
import os
import sys
import urllib.error
import urllib.request

CONFIG = os.path.expanduser(r"C:/Users/kongfanjun/.workbuddy/mcp.json")
ENDPOINT = "https://stitch.googleapis.com/mcp"


def api_key():
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg["mcpServers"]["stitch"]["headers"]["X-Goog-Api-Key"]


def rpc(payload, session=None):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "X-Goog-Api-Key": api_key(),
    }
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, dict(r.headers), raw
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read().decode("utf-8", "replace")


def parse_sse(raw):
    """Return list of JSON payloads from an SSE or plain-JSON body."""
    out = []
    raw = raw.strip()
    if raw.startswith("{"):
        try:
            return [json.loads(raw)]
        except Exception:
            return []
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            chunk = line[5:].strip()
            if chunk and chunk != "[DONE]":
                try:
                    out.append(json.loads(chunk))
                except Exception:
                    pass
    return out


def init(session=None):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "wb-stitch-client", "version": "1.0"},
        },
    }
    status, headers, raw = rpc(payload, session)
    sid = headers.get("Mcp-Session-Id") or headers.get("mcp-session-id")
    # fire the initialized notification (ignore failures: server is stateless)
    rpc({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid)
    return status, sid, parse_sse(raw)


def call(method, params, rid=2, session=None, notify=False):
    payload = {"jsonrpc": "2.0", "method": method}
    if not notify:
        payload["id"] = rid
    if params is not None:
        payload["params"] = params
    status, headers, raw = rpc(payload, session)
    return status, headers, parse_sse(raw)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    cmd = sys.argv[1]
    status, sid, init_msgs = init()
    if status != 200:
        print("initialize failed:", status)
        for m in init_msgs:
            print(json.dumps(m, ensure_ascii=False)[:500])
        return 1

    if cmd == "tools":
        status, headers, msgs = call("tools/list", {}, session=sid)
        print("status", status)
        for m in msgs:
            tools = (m.get("result") or {}).get("tools") or []
            for t in tools:
                print("-", t.get("name"), "|", (t.get("description") or "").split("\n")[0][:120])
                schema = t.get("inputSchema") or {}
                props = schema.get("properties") or {}
                if props:
                    print("    args:", ", ".join(props.keys()), "| required:", schema.get("required", []))
        return 0

    if cmd == "schema":
        status, headers, msgs = call("tools/list", {}, session=sid)
        want = sys.argv[2]
        for m in msgs:
            for t in (m.get("result") or {}).get("tools") or []:
                if t.get("name") == want:
                    print(json.dumps(t, ensure_ascii=False, indent=2))
        return 0

    if cmd == "call":
        name = sys.argv[2]
        args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        status, headers, msgs = call("tools/call", {"name": name, "arguments": args}, session=sid)
        print("status", status)
        for m in msgs:
            print(json.dumps(m, ensure_ascii=False)[:20000])
        return 0

    print("unknown command")
    return 1


if __name__ == "__main__":
    sys.exit(main())
