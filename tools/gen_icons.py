#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate miniprogram app icon stylesheet (mask-based SVG icons, currentColor aware)."""
import base64
import os

ICONS = {
    "person": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    "more": '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "bell": '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
    "book-open": '<path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.6 8 2 1.5-1.4 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>',
    "arrow-right": '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
    "arrow-left": '<path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/>',
    "chevron-left": '<path d="M15 5l-7 7 7 7"/>',
    "chevron-right": '<path d="M9 5l7 7-7 7"/>',
    "play": '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none"/>',
    "pause": '<path d="M8 5v14M16 5v14"/>',
    "camera": '<path d="M3 8.5h3l1.6-2.5h8.8L18 8.5h3v10H3z"/><circle cx="12" cy="13" r="3.2"/>',
    "spellcheck": '<path d="M2.5 17L7 6l4.5 11"/><path d="M4 13h6"/><path d="M14 15.5l2.5 2.5L22 12"/>',
    "headphones": '<path d="M4 14v-1a8 8 0 0 1 16 0v1"/><rect x="2.5" y="13.5" width="4" height="6" rx="2"/><rect x="17.5" y="13.5" width="4" height="6" rx="2"/>',
    "medal": '<circle cx="12" cy="14.5" r="5"/><path d="M8 4h8l-2.5 5.5h-3z"/><path d="M12 12.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor" stroke="none"/>',
    "star": '<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z" fill="currentColor" stroke="none"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    "sparkle": '<path d="M12 2.5l2.2 5.6 5.6 2.2-5.6 2.2L12 18.1l-2.2-5.6L4.2 10.3l5.6-2.2z" fill="currentColor" stroke="none"/><path d="M19 16l.9 2.3L22 19.2l-2.1.9L19 22l-.9-1.9-2.1-.9 2.1-.9z" fill="currentColor" stroke="none"/>',
    "home": '<path d="M4 11L12 4l8 7"/><path d="M6.5 9.8V20h11V9.8"/><path d="M10 20v-5h4v5"/>',
    "stories": '<path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z"/><path d="M20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>',
    "trophy": '<path d="M8 4h8v3a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5a3 3 0 0 0 3 3.5"/><path d="M16 5.5h2.5a3 3 0 0 1-3 3.5"/><path d="M12 11v5"/><path d="M8.5 20h7l-1-3.5h-5z"/>',
    "mic": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
    "volume": '<path d="M4 9.5h3L12 5v14l-5-4.5H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
    "robot": '<rect x="3.5" y="7" width="17" height="12" rx="4"/><path d="M12 7V4"/><circle cx="8.8" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="15.2" cy="13" r="1.4" fill="currentColor" stroke="none"/><path d="M9.5 16.4h5"/>',
    "crop": '<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
    "fire": '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 10 12c.5-3 2-5.5 2-9z" fill="currentColor" stroke="none"/>',
    "bulb": '<path d="M9 17h6"/><path d="M10 20.5h4"/><path d="M12 3.5a5.8 5.8 0 0 0-3.2 10.6c.7.5 1.2 1.3 1.2 2.1v.8h4v-.8c0-.8.5-1.6 1.2-2.1A5.8 5.8 0 0 0 12 3.5z"/>',
    "check-circle": '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8L16.4 9"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "share": '<circle cx="18" cy="6" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>',
    "download": '<path d="M12 4v10"/><path d="M8 10.5l4 4 4-4"/><path d="M4.5 18.5h15"/>',
    "calendar": '<rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10.5h16"/>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
    "close-circle": '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    "image": '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4.5 3.5 3.5 3-3 4 4"/>',
    "trend": '<path d="M4 16.5l5-5 3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
    "edit": '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    "skip": '<path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
    "smile": '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.2 4.2 0 0 0 7 0"/><circle cx="9.2" cy="9.6" r="1" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.6" r="1" fill="currentColor" stroke="none"/>',
    "child": '<circle cx="12" cy="8" r="4.2"/><path d="M5 20c0-3.9 3.1-6.4 7-6.4s7 2.5 7 6.4"/><path d="M9.2 3.2c1.8-1.6 3.8-1.6 5.6 0"/>',
    "arrow-up": '<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>',
    "chart": '<path d="M4.5 20V9"/><path d="M9.8 20V4.5"/><path d="M15.1 20v-7"/><path d="M20.4 20v-4.5"/>',
    "photo": '<rect x="3.5" y="6" width="14" height="12" rx="2.5"/><path d="M6.5 3.5h11a3 3 0 0 1 3 3v9"/><circle cx="8" cy="10.5" r="1.4"/>',
    "settings": '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    "swap": '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
    "speed": '<circle cx="12" cy="12" r="8.5"/><path d="M12 12l4-3.5"/><path d="M12 3.5v2M20.5 12h-2M3.5 12h2"/>',
    "event": '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8.5 14.5l2.2 2.2 4-4.2"/>',
    "search": '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2L21 21"/>',
    "shield": '<path d="M12 3.2l7 2.6v5.6c0 4.4-3 7.6-7 9.4-4-1.8-7-5-7-9.4V5.8z"/><path d="M9 12.2l2.2 2.2 4-4"/>',
    "calc": '<rect x="4.5" y="3" width="15" height="18" rx="3"/><path d="M8 7.5h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    "flag-check": '<path d="M6 3v18"/><path d="M6 4.5h11l-2.5 4 2.5 4H6z"/>',
    "trash": '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
    "folder": '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.4l2 2.5H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
    "phone": '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M10.5 5.5h3"/><path d="M11 18.5h2"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    "cloud": '<path d="M7 18.5h10a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6-1.4A4 4 0 0 0 7 18.5z"/>',
    "cloud-off": '<path d="M7 18.5h10a3.5 3.5 0 0 0 2.4-6"/><path d="M16.4 9.7A5.5 5.5 0 0 0 6.4 8.9"/><path d="M4 4l16 16"/>',
    "target": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    "book": '<path d="M5 4.5h9.5A3 3 0 0 1 17.5 7.5V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/>',
    "reorder": '<path d="M4 7h16M4 12h10M4 17h13"/>',
    "plus-circle": '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    "list-check": '<path d="M9 6.5h11M9 12h11M9 17.5h7"/><path d="M3.5 6.5l1.6 1.6 2.4-2.6"/><path d="M3.5 12l1.6 1.6 2.4-2.6"/>',
    "sparkles": '<path d="M12 3l1.6 4.2L18 8.8l-4.4 1.6L12 14.6l-1.6-4.2L6 8.8l4.4-1.6z" fill="currentColor" stroke="none"/><path d="M18 14l.8 2 2 .8-2 .8L18 20l-.8-2-2-.8 2-.8z" fill="currentColor" stroke="none"/>',
    "qr": '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"/><path d="M14 14h3v3h-3z"/><path d="M20.5 14v2M20.5 18.5v2h-2M14 20.5h2"/>',
    "chevron-down": '<path d="M5 9l7 7 7-7"/>',
    "timer": '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.6"/><path d="M9.5 3h5"/>',
    "flag": '<path d="M6 3v18"/><path d="M6 4.5h11l-2.5 4 2.5 4H6z"/>',
    "users": '<circle cx="9" cy="8.5" r="3.4"/><path d="M3 20c0-3.4 2.8-5.6 6-5.6s6 2.2 6 5.6"/><path d="M16 6.4a3.2 3.2 0 0 1 0 6.2"/><path d="M17.5 14.6c2 .7 3.5 2.4 3.5 4.9"/>',
    "bookmark": '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>',
    "headset": '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="6.5" rx="2"/><rect x="17.5" y="13" width="4" height="6.5" rx="2"/><path d="M19.5 19.5a4 4 0 0 1-4 3H13"/>',
}

TPL = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
)

HEADER = """/* 图标组件：基于 mask 的矢量图标，颜色随 currentColor
   由 tools/gen_icons.py 生成，勿手改 */
.ico {
  display: inline-block;
  flex-shrink: 0;
  width: 38rpx;
  height: 38rpx;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}
"""


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "miniprogram", "styles")
    os.makedirs(out_dir, exist_ok=True)
    parts = [HEADER]
    for name, body in ICONS.items():
        svg = TPL.format(body=body)
        b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        parts.append('.ico-%s{-webkit-mask-image:url("data:image/svg+xml;base64,%s");mask-image:url("data:image/svg+xml;base64,%s");}\n' % (name, b64, b64))
    # size helpers (rpx)
    sizes = [22, 26, 30, 34, 38, 42, 46, 50, 54, 62, 70, 90]
    for s in sizes:
        parts.append(".ico-%d{width:%drpx;height:%drpx;}\n" % (s, s, s))
    with open(os.path.join(out_dir, "icons.wxss"), "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print("icons:", len(ICONS), "->", os.path.join(out_dir, "icons.wxss"))


if __name__ == "__main__":
    main()
