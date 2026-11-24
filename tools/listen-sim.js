/**
 * 听一听核心语句 + 拼音全量词典 + 智能分行 仿真
 * 运行：node tools/listen-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    console.log("  ✗ " + name + (detail !== undefined ? " —— " + detail : ""));
  }
}

const storage = {};
global.wx = {
  getStorageSync: (k) => storage[k] || "",
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  env: { USER_DATA_PATH: "wxfile://usr" },
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast() {},
  showLoading() {},
  hideLoading() {},
  navigateBack() {},
  redirectTo() {},
  navigateTo() {},
  vibrateShort() {},
  createInnerAudioContext: () => ({ play() {}, stop() {}, destroy() {} }),
  getRecorderManager: () => ({ onStart() {}, onStop() {}, onError() {}, start() {}, stop() {} }),
};
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.getCurrentPages = () => [{}];
let pageOpt = null;
global.Page = (o) => {
  pageOpt = o;
};

const pinyin = require(path.join(ROOT, "utils", "pinyin.js"));
const textUtil = require(path.join(ROOT, "utils", "text.js"));

console.log("\n[A] 拼音全量词典（拍照朗读/收词不再缺拼音）");
check("词典规模 ≥ 2 万字", Object.keys(pinyin.DICT).length >= 20000, Object.keys(pinyin.DICT).length);
const sample = "糖岛曦慧攀惰儒雅倩坤钥匙蝴蝶彩虹 explorer谁";
const missing = Array.from(sample).filter((c) => /[\u4e00-\u9fa5]/.test(c) && !pinyin.has(c));
check("高频难字全部命中", missing.length === 0, missing.join(""));
check("多音字手调音未被覆盖（了=le）", pinyin.getPinyin("了") === "le", pinyin.getPinyin("了"));
check("多音字手调音未被覆盖（地=dì）", pinyin.getPinyin("地") === "dì", pinyin.getPinyin("地"));

// 生词本 buildPinyin 同款逻辑：整词注音不再缺音/少音
const words = ["钥匙", "蝴蝶", "彩虹", "玻璃", "秋千"];
const bad = words.filter((w) => {
  const syllables = Array.from(w)
    .map((c) => pinyin.getPinyin(c))
    .filter((p) => p).length;
  return syllables !== Array.from(w).length;
});
check("收词整词注音无缺音/少音", bad.length === 0, bad.join("/"));

console.log("\n[B] 核心语句智能分行");
const s1 = "秋天来了，树叶黄了。一片片叶子从树上落下来！";
const groups = textUtil.annotateGroups(s1);
const lines = textUtil.layoutLines(groups, 10);
check("行长都不超过 10 列", lines.every((l) => l.length <= 10), lines.map((l) => l.length).join(","));
check("gi 全局序号连续", lines.flat().every((g, i) => g.gi === i));
const flatText = lines.flat().map((g) => g.c + g.tail).join("");
check("分行不丢字", flatText === s1, flatText);
// 标点应跟随短语尾（行尾），不孤立成行首
const lineStarts = lines.map((l) => l[0].c);
check("行首无标点", lineStarts.every((c) => !pinyin.isPunct(c)), lineStarts.join(""));
// 无标点超长短语硬切
const longGroups = textUtil.annotateGroups("一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯");
const longLines = textUtil.layoutLines(longGroups, 10);
check("超长短语硬切不溢出", longLines.every((l) => l.length <= 10), longLines.map((l) => l.length).join(","));
check("短句单行", textUtil.layoutLines(textUtil.annotateGroups("你好。"), 10).length === 1);

console.log("\n[C] 听一听页面接入（分行 + 高亮轮询）");
require(path.join(ROOT, "pages", "listen", "listen.js"));
const page = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};
page.onLoad({});
const sent = page._group.sentences;
check("页面渲染出分行数据", Array.isArray(page.data.charLines) && page.data.charLines.length > 0);
check(
  "听一听首句分行不超 10 列",
  page.data.charLines.every((l) => l.length <= 10),
  page.data.charLines.map((l) => l.length).join(",")
);

// 播放高亮：mock tts，观察 hl 推进
let speakText = "";
let speakEnd = null;
const tts = require(path.join(ROOT, "utils", "tts.js"));
tts.speak = (t, opt) => {
  speakText = t;
  speakEnd = opt.onEnd;
  return Promise.resolve();
};
tts.stop = () => {};
page.playAt(0);
const firstHl = page.data.hl;
check("播放开始即高亮首字列", firstHl === 0, firstHl);
setTimeout(() => {
  check("播放中高亮轮询推进（hl>0）", page.data.hl > 0, page.data.hl);
  speakEnd && speakEnd();
  check("播放结束高亮复位（hl=-1）", page.data.hl === -1, page.data.hl);
  const timerLeft = !!page._hlTimer;
  check("结束后轮询定时器已清理", !timerLeft);

  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
}, 400);
