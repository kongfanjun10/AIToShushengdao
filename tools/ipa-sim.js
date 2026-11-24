/**
 * 音标「单音」链路仿真（Node 环境）
 * 运行：node tools/ipa-sim.js
 *
 * 校验两件事：
 *  1) 48 个音标都挂了 audio 文件，文件真实存在、是有效 mp3、大小合理
 *  2) 「单音」按钮播的是 sounds/ipa/<slug>.mp3，不再是代表词；
 *     音频缺失/播放失败时才退回代表词 TTS，且明确提示
 */
const path = require("path");
const fs = require("fs");
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

/* ---------------- wx mock ---------------- */
const audioCtxs = [];
function makeAudio() {
  const a = {
    src: "",
    playbackRate: 1,
    obeyMuteSwitch: true,
    played: 0,
    stopped: 0,
    destroyed: 0,
    _ended: null,
    _error: null,
    onEnded(fn) {
      this._ended = fn;
    },
    onError(fn) {
      this._error = fn;
    },
    play() {
      this.played += 1;
    },
    stop() {
      this.stopped += 1;
    },
    destroy() {
      this.destroyed += 1;
    },
  };
  audioCtxs.push(a);
  return a;
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
  createInnerAudioContext: makeAudio,
  getFileSystemManager: () => ({
    accessSync() {
      throw new Error("no file");
    },
  }),
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast() {},
  showModal() {},
  pageScrollTo() {},
};
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.getCurrentPages = () => [{}];

/* ---------------- A. 数据与音频文件 ---------------- */
const ph = require(path.join(ROOT, "utils", "phonetics.js"));
const all = ph.all();
const IPA_DIR = path.join(ROOT, "sounds", "ipa");

console.log("[A] 48 个音标的单音文件");
check("48 条数据", all.length === 48, all.length);
check(
  "每条都有 audio 字段",
  all.every((x) => !!x.audio),
  JSON.stringify(all.filter((x) => !x.audio).map((x) => x.id))
);
const slugs = all.map((x) => x.audio);
check("audio 名不重复", new Set(slugs).size === 48, new Set(slugs).size);

const files = fs.existsSync(IPA_DIR) ? fs.readdirSync(IPA_DIR).filter((f) => /\.mp3$/.test(f)) : [];
check("sounds/ipa 里有 48 个 mp3", files.length === 48, files.length);
check(
  "数据里的 audio 都有对应文件",
  slugs.every((s) => files.indexOf(s + ".mp3") > -1),
  JSON.stringify(slugs.filter((s) => files.indexOf(s + ".mp3") < 0))
);

let headerOk = true;
let sizeTotal = 0;
const sizes = [];
all.forEach((it) => {
  const p = path.join(IPA_DIR, it.audio + ".mp3");
  if (!fs.existsSync(p)) return;
  const b = fs.readFileSync(p);
  sizeTotal += b.length;
  sizes.push(b.length);
  // MPEG frame sync：0xFF 0xEx/0xFx（lame 输出 0xFF 0xFB/0xF3）
  if (!(b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) headerOk = false;
});
check("每个 mp3 帧头合法", headerOk);
check("单条 500B~4KB（短音、包体友好）", sizes.every((n) => n >= 500 && n <= 4096), Math.min.apply(null, sizes) + "~" + Math.max.apply(null, sizes));
check("全部合计 < 80KB", sizeTotal < 80 * 1024, (sizeTotal / 1024).toFixed(1) + "KB");

/* ---------------- B. 页面行为 ---------------- */
const tts = require(path.join(ROOT, "utils", "tts.js"));
const calls = { speak: [], ttsStop: 0 };
tts.speak = (text, opts) => {
  calls.speak.push(text);
  if (opts && opts.onEnd) setTimeout(opts.onEnd, 0);
  return Promise.resolve();
};
tts.stop = () => {
  calls.ttsStop += 1;
};
tts.diagnose = () => ({ provider: "mock", pluginAvailable: false, cloudAvailable: false, available: false, tip: "" });

let pageOpt = null;
global.Page = (o) => {
  pageOpt = o;
};
require(path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.js"));
const page = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};

const item = ph.get("/iː/");
page.data.item = item;
page.data.slow = false;

console.log("\n[B] 点「单音」按钮");
page.speakPhoneme();
const a1 = audioCtxs[audioCtxs.length - 1];
check("播的是单音文件 /sounds/ipa/i-long.mp3", a1 && a1.src === "/sounds/ipa/i-long.mp3", a1 && a1.src);
check("没有走 TTS（不再读代表词 see）", calls.speak.length === 0, JSON.stringify(calls.speak));
check("开始播放", a1.played === 1, a1.played);
check("speaking 置为 true", page.data.speaking === true);
check("常速播放 playbackRate=1", a1.playbackRate === 1, a1.playbackRate);

// 双播：第一遍播完不立刻复位，等 0.2s 再读第二遍
let sayFn = null;
const _st = global.setTimeout;
global.setTimeout = (fn, ms) => {
  if (ms === 200) {
    sayFn = fn;
    return {};
  }
  return _st(fn, ms);
};
a1._ended && a1._ended();
global.setTimeout = _st;
check("第一遍播完销毁播放器", a1.destroyed === 1, a1.destroyed);
check("第一遍播完保持 speaking，挂起 0.2s 的第二遍", page.data.speaking === true && !!sayFn, page.data.speaking + "/" + !!sayFn);
const nb = audioCtxs.length;
sayFn(); // 到点，读第二遍
const a1b = audioCtxs[audioCtxs.length - 1];
check("第二遍真的播了出来（同一段单音）", audioCtxs.length > nb && a1b.played === 1 && a1b.src === "/sounds/ipa/i-long.mp3", a1b && a1b.src);
a1b._ended && a1b._ended();
check("第二遍播完 speaking 复位", page.data.speaking === false);
check("播完销毁播放器（不留后台音频）", a1b.destroyed === 1, a1b.destroyed);

// 慢速
page.data.slow = true;
page.speakPhoneme();
const a2 = audioCtxs[audioCtxs.length - 1];
check("慢速时 playbackRate=0.85", a2.playbackRate === 0.85, a2.playbackRate);
page.data.slow = false;

// 切音标会停掉正在播的单音
page.moveTo(1);
check("切音标时停止并销毁上一个音频", a2.stopped >= 1 && a2.destroyed >= 1, a2.stopped + "/" + a2.destroyed);

console.log("\n[C] 音频缺失/失败时的兜底");
// 两条路径都失败 → 退回代表词 TTS，并写明是代表词
calls.speak.length = 0;
const before = audioCtxs.length;
page.speakPhoneme();
const a3 = audioCtxs[audioCtxs.length - 1];
a3._error && a3._error({ errMsg: "file not found" }); // 第一次失败 → 换路径重试
check("第一次失败会换相对路径重试", a3.played === 2 && a3.src === "sounds/ipa/i-long.mp3", a3.src + " played " + a3.played);
a3._error && a3._error({ errMsg: "file not found" }); // 第二次失败 → 兜底
check("两次都失败才退回 TTS", calls.speak.length === 1 && calls.speak[0] === item.say, JSON.stringify(calls.speak));
check("兜底时说明用代表词代替", /代表词/.test(page.data.ttsTip), page.data.ttsTip);

// 数据里没有 audio（老数据/录音缺失）→ 直接代表词
calls.speak.length = 0;
page.data.item = Object.assign({}, item, { audio: "" });
page.speakPhoneme();
check("没有 audio 字段直接读代表词", calls.speak.length === 1 && calls.speak[0] === "see", JSON.stringify(calls.speak));

// 停声音
page.data.item = item;
page.speakPhoneme();
const a4 = audioCtxs[audioCtxs.length - 1];
page.stopSpeak();
check("stopSpeak 同时停掉单音与 TTS", a4.destroyed === 1 && calls.ttsStop > 0, a4.destroyed + "/" + calls.ttsStop);

/* ---------------- D. 文案 ---------------- */
console.log("\n[D] 界面文案");
const wxml = fs.readFileSync(path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.wxml"), "utf8");
check("按钮标「单音」而不是含糊的「读音」", wxml.indexOf("'单音'") > -1);
check("代表词改名（示例词 → 代表词）", wxml.indexOf("代表词 {{item.say}}") > -1);
check("有「先听单音再听例词」的引导", wxml.indexOf("先听上面的「单音」") > -1);

const js = fs.readFileSync(path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.js"), "utf8");
check("页面不再用 play(it.say) 冒充音标读音", js.indexOf("this.play(it.say") > -1 && js.indexOf("speakPhoneme()") > -1 && js.indexOf("ipaAudio.play(it.audio") > -1);

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
