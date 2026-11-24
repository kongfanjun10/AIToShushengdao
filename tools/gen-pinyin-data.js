/**
 * 生成全量拼音数据文件（shushengdao/utils/pinyinData.js）
 * 数据源：pinyin-pro（含 20k+ 汉字注音，多音字取常用音）
 * 输出为紧凑字符串「字pīn 音yīn …」，与 pinyin.js 的 RAW 同格式，便于合并。
 *
 * 运行：node tools/gen-pinyin-data.js
 */
const fs = require("fs");
const path = require("path");
const { pinyin } = require("pinyin-pro");

const pairs = [];
for (let cp = 0x3400; cp <= 0x9fff; cp++) {
  // CJK 扩展A + 基本区
  const ch = String.fromCharCode(cp);
  let py;
  try {
    py = pinyin(ch, { toneType: "mark", type: "array", nonZh: "consecutive" })[0];
  } catch (e) {
    py = ch;
  }
  if (!py || py === ch || /[\u3400-\u9fff]/.test(py)) continue; // 未收录
  if (!/[\u0100-\u0479āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(py)) continue; // 无声调标记的跳过
  pairs.push(ch + py);
}

const body = pairs.join(" ");
// 按 2KB 一行拼接，避免超长行
const chunks = [];
for (let i = 0; i < body.length; i += 1900) {
  chunks.push('  "' + body.slice(i, i + 1900) + '"+');
}
const out =
  "/**\n" +
  " * 全量拼音字库（自动生成，勿手改）：tools/gen-pinyin-data.js 生成\n" +
  " * 覆盖 CJK 基本区 + 扩展A 全部收录汉字；多音字取 pinyin-pro 常用音\n" +
  " * 格式：紧凑字符串「字zì 音yīn」，与 pinyin.js RAW 同构\n" +
  " */\nmodule.exports =\n" +
  chunks.join("\n").replace(/\+$/, "") +
  ";\n";

const dest = path.join(__dirname, "..", "shushengdao", "utils", "pinyinData.js");
fs.writeFileSync(dest, out, "utf8");
console.log("chars:", pairs.length, "| size:", (out.length / 1024).toFixed(1) + "KB", "->", dest);
