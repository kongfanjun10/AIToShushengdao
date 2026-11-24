/**
 * 一次性脚本：给主要页面注入夜览遮罩
 *  - js：data 首行插入 night 标志（模块加载时读 store，页面打开即生效）
 *  - wxml：末尾追加 <include> 夜览遮罩（fixed 定位，放文件末尾任何位置都行）
 * 全部成功才落盘（先写 tmp 再 rename），任一失败退出不动文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "shushengdao");
const PAGES = [
  "pages/home",
  "pages/reader",
  "pages/listen",
  "pages/reward",
  "pages/vocab",
  "pages/words",
  "pages/archive",
  "pages/capture",
  "pages/parent",
  "pkgLearn/pages/pinyin",
  "pkgLearn/pages/phonetics",
];

const results = [];

for (const p of PAGES) {
  const jsPath = path.join(ROOT, p, path.basename(p) + ".js");
  const wxmlPath = jsPath.replace(/\.js$/, ".wxml");
  const src = fs.readFileSync(jsPath, "utf8");
  const wxml = fs.readFileSync(wxmlPath, "utf8");

  if (src.indexOf("night: !!store.getUser().nightMode") > -1) {
    results.push(p + ": skip(js already)");
    continue;
  }
  const marker = "  data: {";
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error(p + ": data block not found");
  const jsOut =
    src.slice(0, idx + marker.length) +
    "\n    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）" +
    "\n    night: !!store.getUser().nightMode," +
    src.slice(idx + marker.length);

  const includeTag =
    p.indexOf("pkgLearn/") === 0
      ? '<include src="../../../pages/common/veil.wxml" />'
      : '<include src="../../pages/common/veil.wxml" />';
  const wxmlOut = wxml.replace(/\s*$/, "\n" + includeTag + "\n");

  fs.writeFileSync(jsPath + ".tmp", jsOut);
  fs.writeFileSync(wxmlPath + ".tmp", wxmlOut);
  results.push(p + ": patched");
}

// 全部成功 → 原子替换
for (const p of PAGES) {
  const jsPath = path.join(ROOT, p, path.basename(p) + ".js");
  const wxmlPath = jsPath.replace(/\.js$/, ".wxml");
  if (fs.existsSync(jsPath + ".tmp")) {
    fs.renameSync(jsPath + ".tmp", jsPath);
    fs.renameSync(wxmlPath + ".tmp", wxmlPath);
  }
}
console.log(results.join("\n"));
console.log("ALL DONE");
