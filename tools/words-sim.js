/**
 * 英语单词与跟读页逻辑仿真（Node 环境）
 * 运行：node tools/words-sim.js
 * 覆盖：词库完整性、英文发音语种、慢速、跟读录音、自评计数、收藏生词本、推进与持久化
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

const spoken = [];
let audioCbs = {};
const recCbs = {};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    spoken.push({ text: opt.content, lang: opt.lang });
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

global.wx = {
  _s: {},
  _toast: "",
  getStorageSync(k) {
    return this._s[k] || "";
  },
  setStorageSync(k, v) {
    this._s[k] = v;
  },
  removeStorageSync(k) {
    delete this._s[k];
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast(o) {
    this._toast = (o && o.title) || "";
  },
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  navigateTo() {},
  getRecorderManager: () => ({
    onStop(cb) {
      recCbs.stop = cb;
    },
    onError(cb) {
      recCbs.err = cb;
    },
    start(opt) {
      recCbs.last = opt;
    },
    stop() {
      setTimeout(() => recCbs.stop && recCbs.stop({ tempFilePath: "mock-follow.mp3" }), 10);
    },
  }),
  createInnerAudioContext: () => ({
    _src: "",
    set src(v) {
      this._src = v;
    },
    get src() {
      return this._src;
    },
    play() {
      setTimeout(() => audioCbs.onEnd && audioCbs.onEnd(), 20);
    },
    stop() {},
    destroy() {},
    onEnded(cb) {
      audioCbs.onEnd = cb;
    },
    onError(cb) {
      audioCbs.err = cb;
    },
    set playbackRate(v) {},
  }),
};

function makePage() {
  const file = path.join(ROOT, "pages", "words", "words.js");
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        page.data[k] = obj[k];
      }
    });
  };
  return page;
}

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

const store = require(path.join(ROOT, "utils", "store.js"));
const lib = require(path.join(ROOT, "utils", "words.js"));

const tapWord = (i) => ({ currentTarget: { dataset: { i } } });
const tapTheme = (key) => ({ currentTarget: { dataset: { key } } });
const tapJudge = (v) => ({ currentTarget: { dataset: { ok: v } } });

async function main() {
  store.resetAll();
  delete wx._s[store.KEY];

  /* ---------- 1. 词库 ---------- */
  const all = lib.all();
  check("总词数 64", all.length === 64, String(all.length));
  check("8 个主题", lib.getGroups().length === 8, String(lib.getGroups().length));
  const ids = {};
  let fieldBad = 0;
  all.forEach((w) => {
    if (!w.en || !w.ipa || !w.cn || !w.sentence || !w.sentenceCn) fieldBad++;
    if (w.ipa[0] !== "/" || w.ipa[w.ipa.length - 1] !== "/") fieldBad++;
    if (ids[w.en]) fieldBad++;
    ids[w.en] = 1;
    if (!lib.get(w.en)) fieldBad++;
  });
  check("每个词字段完整、音标带斜杠、无重词", fieldBad === 0, "bad=" + fieldBad);
  check("主题各有 8 个词", lib.getGroups().every((g) => g.count === 8), JSON.stringify(lib.getGroups().map((g) => g.count)));
  check("按主题取词", lib.list("food").length === 8 && lib.list("food")[0].en === "rice");
  check("未知主题回落到第一个", lib.getTheme("nope").key === "animals");

  /* ---------- 2. 页面初始 ---------- */
  let p = makePage();
  p.onLoad();
  check("默认动物主题", p.data.themeKey === "animals", p.data.themeKey);
  check("当前词是 cat", p.data.word.en === "cat", p.data.word.en);
  check("本组 8 个词", p.data.list.length === 8, String(p.data.list.length));
  check("总数 64", p.data.total === 64, String(p.data.total));
  check("未读进度 0", p.data.doneCount === 0 && p.data.percent === 0);

  /* ---------- 3. 英文发音 ---------- */
  spoken.length = 0;
  p.speakWord();
  check("读单词走英文语种", spoken.length === 1 && spoken[0].lang === "en_US", JSON.stringify(spoken));
  check("读的是当前单词", spoken[0].text === "cat", spoken[0].text);

  spoken.length = 0;
  p.speakSentence();
  check("点例句读整句", spoken[0].text === "This is a cat.", spoken[0].text);

  p.toggleSlow();
  check("慢速开关打开", p.data.slow === true);
  spoken.length = 0;
  await sleep(30);
  p.speakWord();
  check("慢速下仍然是英文", spoken.length >= 1 && spoken[spoken.length - 1].lang === "en_US");
  p.toggleSlow();

  /* ---------- 4. 跟读录音 ---------- */
  p.tapFollow();
  check("开始录音", p.data.phase === "recording" && p.data.seconds === 0);
  check("录音上限 6 秒", recCbs.last && recCbs.last.duration === 6000, JSON.stringify(recCbs.last));
  await sleep(1100);
  check("计时器走秒", p.data.seconds === 1, String(p.data.seconds));
  p.stopFollow();
  await sleep(40);
  check("录音结束进入 done", p.data.phase === "done", p.data.phase);
  check("拿到录音文件", p.data.hasFile === true && p._file === "mock-follow.mp3");
  check("提示改为回听", p.data.followTip.indexOf("听听") > -1, p.data.followTip);

  /* ---------- 5. 自评 ---------- */
  const stats0 = store.wordsStats();
  p.judge(tapJudge(0));
  check("说再读一次不计数", store.wordsStats().done === stats0.done && p.data.phase === "idle");

  p.tapFollow();
  await sleep(30);
  p.stopFollow();
  await sleep(40);
  spoken.length = 0;
  p.judge(tapJudge(1));
  check("读对了 +1", p.data.doneCount === 1, String(p.data.doneCount));
  check("今日已读 +1", p.data.todayRead === 1, String(p.data.todayRead));
  check("跟读次数 +1", p.data.todayFollow === 1, String(p.data.todayFollow));
  check("鼓励语音「你真棒哟」", spoken.some((s) => s.text === "你真棒哟"), JSON.stringify(spoken));
  const idxBefore = p.data.index;
  await sleep(1900);
  check("自动下一个词", p.data.index === idxBefore + 1 && p.data.word.en === "dog", p.data.word.en);

  /* ---------- 6. 切换 ---------- */
  p.moveTo(0);
  check("回到第一个词", p.data.word.en === "cat");
  p.prevWord();
  check("第一个词再往前给提示", p.data.index === 0 && wx._toast.indexOf("第一个词") > -1, wx._toast);
  p.nextWord();
  check("下一个词", p.data.word.en === "dog");
  p.pickWord(tapWord(3));
  check("点格子切词", p.data.word.en === "fish", p.data.word.en);
  check("切词重置录音态", p.data.phase === "idle" && p.data.hasFile === false);

  p.pickTheme(tapTheme("colors"));
  check("切主题", p.data.themeKey === "colors" && p.data.list.length === 8);
  check("主题持久化", store.getUser().wordTheme === "colors", store.getUser().wordTheme);
  check("切主题回到第一个词", p.data.word.en === "red", p.data.word.en);

  /* ---------- 7. 生词本 ---------- */
  p.addToVocab();
  check("收藏进生词本", store.listWords().some((v) => v.word === "red"));
  check("收藏状态回显", p.data.inVocab === true);
  p.addToVocab();
  check("重复收藏只提示不重复加", store.listWords().filter((v) => v.word === "red").length === 1);

  /* ---------- 8. 末尾边界 ---------- */
  p.moveTo(p.data.list.length - 1);
  p.nextWord();
  check("最后一个词再往后给提示", wx._toast.indexOf("读完") > -1, wx._toast);

  /* ---------- 9. 持久化 ---------- */
  p.onUnload();
  const s1 = store.wordsStats();
  p = makePage();
  p.onLoad();
  check("重进保留主题", p.data.themeKey === "colors", p.data.themeKey);
  check("重进保留进度", p.data.doneCount === s1.done, p.data.doneCount + " vs " + s1.done);
  check("今日统计保留", p.data.todayFollow === s1.todayFollow);
  check("存储体积 < 50KB", JSON.stringify(wx._s).length < 50 * 1024, (JSON.stringify(wx._s).length / 1024).toFixed(1) + "KB");

  bad.forEach((b) => console.log("  ✗ " + b));
  ok.forEach((o) => console.log("  ✓ " + o));
  console.log("\n" + (bad.length ? "FAIL " + bad.length : "ALL PASS") + " (" + ok.length + " 项)");
  process.exit(bad.length ? 1 : 0);
}

main();
