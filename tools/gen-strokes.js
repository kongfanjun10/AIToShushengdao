/**
 * 生成「文字描写」笔顺数据（utils/strokeData.js）
 *
 * 数据源：hanzi-writer-data（MIT）单字 JSON，取 medians（每笔的中心线折线）。
 * 输出：以 0~1000 归一化坐标保存的笔画折线，按字库顺序排列，供横屏「笔画教程」做逐笔演示。
 *
 * 用法：node tools/gen-strokes.js [--limit=20]
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const CDN = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";
const OUT = path.join(ROOT, "shushengdao", "utils", "strokeData.js");
const CACHE = path.join(__dirname, ".stroke-cache");

const LIMIT = (() => {
  const a = process.argv.find((s) => s.indexOf("--limit=") === 0);
  return a ? Number(a.split("=")[1]) : 0;
})();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "user-agent": "Mozilla/5.0 (stroke data builder)" }, timeout: 15000 },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          return fetchJson(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode + " " + url));
        }
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (buf += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** 去掉过密的点，压缩体积（距离小于 minD 的点丢弃，首尾保留） */
function simplify(pts, minD) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= minD) out.push(p);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 把 medians 归一化到 0~1000 的方框内，保持纵横比并居中 */
function normalize(medians) {
  const all = [];
  medians.forEach((m) => m.forEach((p) => all.push(p)));
  if (!all.length) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  all.forEach((p) => {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  });
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  // 四周留 8% 余量，避免笔画贴边
  const pad = 80;
  const scale = Math.min((1000 - pad * 2) / bw, (1000 - pad * 2) / bh);
  const ox = (1000 - bw * scale) / 2 - minX * scale;
  const oy = (1000 - bh * scale) / 2 - minY * scale;
  // hanzi-writer 的坐标是 y 轴向上（SVG），这里翻成画布坐标（y 向下），
  // 翻完第一笔才在上方：如「二」先写上面那一横。
  return medians.map((m) =>
    simplify(
      m.map((p) => [
        Math.round(p[0] * scale + ox),
        1000 - Math.round(p[1] * scale + oy),
      ]),
      12
    )
  );
}

async function main() {
  const charLib = require(path.join(ROOT, "shushengdao", "utils", "chars.js"));
  let chars = [];
  charLib.LEVELS.forEach((l) => l.chars.forEach((c) => chars.push(c.c)));
  chars = Array.from(new Set(chars));
  if (LIMIT) chars = chars.slice(0, LIMIT);

  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });

  const result = {};
  const failed = [];
  let done = 0;

  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < chars.length) {
      const ch = chars[cursor++];
      const cacheFile = path.join(CACHE, ch + ".json");
      let data = null;
      try {
        if (fs.existsSync(cacheFile)) {
          data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } else {
          data = await fetchJson(CDN + encodeURIComponent(ch) + ".json");
          fs.writeFileSync(cacheFile, JSON.stringify(data));
        }
      } catch (e) {
        failed.push(ch + "(" + e.message + ")");
        continue;
      }
      const medians = data && data.medians;
      if (!medians || !medians.length) {
        failed.push(ch + "(no medians)");
        continue;
      }
      const norm = normalize(medians);
      // 压成扁平整数数组，减小体积
      result[ch] = norm.map((m) => {
        const flat = [];
        m.forEach((p) => {
          flat.push(p[0], p[1]);
        });
        return flat;
      });
      done++;
      if (done % 20 === 0) process.stdout.write(".");
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write("\n");

  // 保持字库顺序输出，便于人工核对
  const order = chars.filter((c) => result[c]);
  const lines = order.map((c) => {
    const body = result[c]
      .map((s) => "[" + s.join(",") + "]")
      .join(",");
    return JSON.stringify(c) + ":[" + body + "]";
  });

  const head = `/**
 * 笔顺数据（自动生成，勿手改）
 * 由 tools/gen-strokes.js 从 hanzi-writer-data（MIT）提取 medians 并归一化到 0~1000。
 * 结构：{ 汉字: [ [x1,y1,x2,y2,...], ... ] }  每个数组是一笔的中心线折线，按书写顺序排列。
 * 共 ${order.length} 字。
 */
const STROKES = {
`;
  const tail = `\n};\n\n/** 取某个字的笔画折线（0~1000 坐标），没有则返回 [] */\nfunction getStrokes(ch) {\n  return STROKES[ch] || [];\n}\n\nmodule.exports = { STROKES, getStrokes };\n`;
  fs.writeFileSync(OUT, head + lines.join(",\n") + tail, "utf8");

  const size = fs.statSync(OUT).size;
  console.log(`写入 ${path.relative(ROOT, OUT)}  字数=${order.length}  体积=${(size / 1024).toFixed(1)}KB`);
  if (failed.length) console.log("失败：" + failed.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
