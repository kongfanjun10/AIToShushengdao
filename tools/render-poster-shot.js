/**
 * 海报真渲染截图（headless Chrome）
 * 把 reward.js 的 drawPoster 及其依赖方法抽出来，在浏览器 canvas 里真实渲染一张 PNG，
 * 用于肉眼确认版式/配色（poster-sim.js 只做逻辑断言）。
 *
 * 运行：node tools/render-poster-shot.js [输出png路径]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "shushengdao");
const OUT = process.argv[2] || path.join(__dirname, "shot_cert_poster.png");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const src = fs.readFileSync(path.join(ROOT, "pages", "reward", "reward.js"), "utf8");

// 抽取需要的方法（方法简写 → 补 function 前缀）
const names = [
  "drawPoster",
  "spaced",
  "drawCorners",
  "ribbon",
  "medal",
  "drawQrBlock",
  "rr",
  "star",
  "wrapText",
];
const methods = names
  .map((n) => {
    const m = src.match(new RegExp("(\\n  " + n + "\\([^)]*\\) \\{[\\s\\S]*?\\n  \\},)"));
    if (!m) throw new Error("method not found: " + n);
    return m[1].replace("\n  " + n + "(", "\n  page." + n + " = function(").replace(/\},$/, "};");
  })
  .join("\n");

const W = 600;
const H = 960;
const html = `<!DOCTYPE html>
<html><head><meta charset="utf8"><style>body{margin:0}</style></head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const qrcode = { size: 148 };
const data = {
  nickname: "糖糖",
  dateText: "2026年11月16日",
  lessonName: "拼音第一课",
  summary: { read: 12, total: 14, percent: 86, duration: "03:24", vocab: 3 },
  certNo: "NO.20261116-112",
  badgeName: "朗读者勋章",
};
const ctx = document.getElementById("c").getContext("2d");
const page = { data: data };
${methods}
// 无码路径：img 传 null，走「微信搜索」文案块
try {
  page.drawPoster(ctx, ${W}, ${H}, null);
  document.title = "OK";
} catch (e) {
  document.title = "ERR:" + e.message;
  document.body.textContent = e.stack;
}
</script></body></html>`;

const htmlPath = path.join(__dirname, "render-poster.tmp.html");
fs.writeFileSync(htmlPath, html);

execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--allow-file-access-from-files",
    `--screenshot=${OUT}`,
    "--window-size=620,980",
    "--default-background-color=FFFFFFFF",
    "file:///" + htmlPath.replace(/\\/g, "/"),
  ],
  { timeout: 30000 }
);
console.log("saved:", OUT, "| title should be OK");
