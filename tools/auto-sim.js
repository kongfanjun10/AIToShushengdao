/**
 * 连读模式 + 慢速按钮仿真（汉语拼音页 + 英语音标页）
 * 连读 v2 = 每个读 2 遍（遍间隔 0.5s）→ 停 0.5s 切下一个；本组读完自动切下一组；
 * 点哪个拼音/音标就从哪个开始连读。慢速：代表词 TTS 0.75x / 音标单音 0.85x。
 * 运行：node tools/auto-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

let toasts = [];
/* 手动可控的计时器队列（记录 delay 以核对 0.5s 间隔）
   clearTimeout 把对应计时器标死（tts 内部的超时守卫靠它清除） */
const timers = [];
global.setTimeout = (fn, ms) => {
  const t = { fn, ms, dead: false };
  timers.push(t);
  return t;
};
global.clearTimeout = (t) => {
  if (t && typeof t === "object") t.dead = true;
};
function pendingTimers() {
  return timers.filter((t) => !t.dead);
}
async function flushTimers(budget) {
  let n = 0;
  for (;;) {
    const t = timers.find((x) => !x.dead);
    if (!t || n >= (budget || 800)) break;
    t.dead = true;
    t.fn();
    n++;
    await null; // 让微任务跑一轮：tts 超时守卫此时已被清除，对齐真机语义
  }
  return n;
}
async function drain() {
  await null;
}

/* 音频上下文桩：play 即视为播完（同步触发 onEnded），链路才能自动往下走 */
const audios = [];
function makeAudio() {
  const a = {
    src: "",
    playbackRate: 1,
    _ended: null,
    _err: null,
    obeyMuteSwitch: false,
    onEnded(cb) {
      this._ended = cb;
    },
    onError(cb) {
      this._err = cb;
    },
    stop() {},
    destroy() {},
    play() {
      if (this._ended) this._ended();
    },
  };
  audios.push(a);
  return a;
}

global.wx = {
  _s: {},
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
    toasts.push(o && o.title);
  },
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  redirectTo() {},
  createInnerAudioContext: () => makeAudio(),
};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
});

function makePage(file) {
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = Object.assign({}, captured.data);
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => (page.data[k] = obj[k]));
  };
  return page;
}

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}
function lastRate() {
  return audios.length ? audios[audios.length - 1].playbackRate : -1;
}

async function main() {
  const fs = require("fs");
  const pyLib = require(path.join(ROOT, "utils", "pinyinLib.js"));
  const ph = require(path.join(ROOT, "utils", "phonetics.js"));

  /* ================= 汉语拼音页 ================= */
  const pyPage = path.join(ROOT, "pkgLearn", "pages", "pinyin", "pinyin.js");
  const p = makePage(pyPage);
  p.onLoad({});
  p.loadGroup("sm");

  /* --- 慢速按钮是否生效 --- */
  p.speakPinyin();
  await drain();
  check("[拼音][慢速] 常速 playbackRate=1", lastRate() === 1, String(lastRate()));
  p.toggleSlow();
  p.speakPinyin();
  await drain();
  check("[拼音][慢速] 开慢速后 playbackRate=0.75", lastRate() === 0.75, String(lastRate()));
  p.toggleSlow();
  p.speakPinyin();
  await drain();
  check("[拼音][慢速] 关掉恢复 1", lastRate() === 1, String(lastRate()));

  /* --- 读音按钮：每次连发两遍，间隔 0.2s --- */
  p.speakPinyin();
  await drain();
  let sayT = pendingTimers().find((t) => t.ms === 200);
  check("[拼音][读音] 第一遍读完挂起 0.2s 的第二遍", !!sayT && p.data.speaking === true, sayT ? String(sayT.ms) : "no timer");
  sayT.dead = true;
  sayT.fn();
  await drain();
  check("[拼音][读音] 第二遍播完自动收尾", p.data.speaking === false && !pendingTimers().some((t) => t.ms === 200));
  /* 连点不叠加：第二次点击取消第一次还没播的第二遍 */
  p.speakPinyin();
  await drain();
  p.speakPinyin();
  await drain();
  check("[拼音][读音] 连点只挂一个第二遍", pendingTimers().filter((t) => t.ms === 200).length === 1);
  p.stopSpeak();
  check("[拼音][读音] stopSpeak 连挂起的双播一起取消", pendingTimers().filter((t) => t.ms === 200).length === 0);

  /* --- 连读：每个读 2 遍，间隔 0.5s --- */
  p.toggleAuto();
  await drain();
  check("[拼音][连读] 开关打开即读第 1 遍", p.data.autoPlay === true && pendingTimers().length === 1);
  check("[拼音][连读] 遍间隔是 0.2s", pendingTimers()[0].ms === 200, String(pendingTimers()[0].ms));
  let t1 = pendingTimers()[0];
  t1.dead = true;
  t1.fn(); // 第二遍
  await drain();
  check("[拼音][连读] 同一拼音读了第 2 遍", p.data.item.id === "b" && pendingTimers().length === 1, p.data.item.id);
  t1 = pendingTimers()[0];
  t1.dead = true;
  t1.fn(); // 切下一个
  await drain();
  check("[拼音][连读] 两遍读完切到 p", p.data.item.id === "p", p.data.item.id);

  /* --- 本组读完自动切下一组，一路连到全部读完 --- */
  const fired = await flushTimers();
  const pyGroups = pyLib.getGroups();
  const totalItems = pyGroups.reduce((n, g) => n + pyLib.list(g.key).length, 0);
  check("[拼音][连读] 全部 " + totalItems + " 个 ×2 遍跑完", fired === totalItems * 2 - 2 && p.data.item.id === "ying", "fired=" + fired + " end=" + p.data.item.id);
  check("[拼音][连读] 切下一个的间隔是 0.4s", timers.filter((t) => t.ms === 400).length >= totalItems, String(timers.filter((t) => t.ms === 400).length));
  check("[拼音][连读] 全部读完自动停", p.data.autoPlay === false);
  check("[拼音][连读] 跨组提示出现", toasts.indexOf("下一组：单韵母") > -1, toasts.filter((t) => t.indexOf("下一组") > -1).join("|"));
  check("[拼音][连读] 收尾提示", toasts.indexOf("全部拼音连读完啦 🎉") > -1);

  /* --- 点哪个就从哪个开始（跨组点选） --- */
  p.pickItem({ currentTarget: { dataset: { id: "ai", auto: "1" } } });
  await drain();
  check("[拼音][连读] 点 ai 跳到复韵母组并开始连读", p.data.groupKey === "fy" && p.data.item.id === "ai" && p.data.autoPlay === true, p.data.groupKey + "/" + p.data.item.id);
  p.stopAuto();

  /* --- 「全部」总览里点选只跳转展示，不开连读 --- */
  p.loadGroup("sm");
  p.pickItem({ currentTarget: { dataset: { id: "ai" } } });
  await drain();
  check("[拼音][连读] 总览点 ai 只跳转不开连读", p.data.groupKey === "fy" && p.data.item.id === "ai" && p.data.autoPlay === false && pendingTimers().length === 0, p.data.groupKey + "/" + p.data.item.id);

  /* --- 点哪个就从哪个开始（同组点选） --- */
  p.loadGroup("sm");
  p.loadGroup("sm");
  p.pickItem({ currentTarget: { dataset: { id: "d", auto: "1" } } });
  await drain();
  check("[拼音][连读] 同组点 d 立即开始连读", p.data.item.id === "d" && p.data.autoPlay === true && pendingTimers().length === 1, p.data.item.id);

  /* --- 慢速对连读也生效 --- */
  p.toggleSlow();
  p.stopAuto();
  p.toggleAuto();
  await drain();
  check("[拼音][慢速] 连读里 playbackRate=0.75", lastRate() === 0.75, String(lastRate()));
  p.stopAuto();
  p.toggleSlow();

  /* --- 手动停 / 换分类停 / onHide 停 --- */
  p.toggleAuto();
  await drain();
  p.toggleAuto();
  check("[拼音][连读] 再点一次即停", p.data.autoPlay === false && pendingTimers().length === 0);
  p.toggleAuto();
  await drain();
  p.pickGroup({ currentTarget: { dataset: { key: "zt" } } });
  check("[拼音][连读] 换分类自动停", p.data.autoPlay === false);
  p.toggleAuto();
  await drain();
  p.onHide();
  check("[拼音][连读] onHide 停连读", p.data.autoPlay === false && pendingTimers().length === 0);

  const pyWxml = fs.readFileSync(path.join(ROOT, "pkgLearn", "pages", "pinyin", "pinyin.wxml"), "utf8");
  check("[拼音] 连读开关与文案就位", pyWxml.indexOf('bindtap="toggleAuto"') > -1 && pyWxml.indexOf("连读") > -1);
  check("[拼音] 读音按钮放大样式就位", pyWxml.indexOf("tool-say") > -1 && pyWxml.indexOf("ico-46") > -1 && pyWxml.indexOf("ico-34") > -1);

  /* ================= 英语音标页 ================= */
  const phPage = path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.js");
  const q = makePage(phPage);
  q.onLoad({});
  q.loadGroup("v-long");

  /* --- 慢速按钮（单音 0.85x） --- */
  q.speakPhoneme();
  await drain();
  check("[音标][慢速] 常速单音 playbackRate=1", lastRate() === 1, String(lastRate()));
  q.toggleSlow();
  q.speakPhoneme();
  await drain();
  check("[音标][慢速] 开慢速后单音 playbackRate=0.85", lastRate() === 0.85, String(lastRate()));
  q.toggleSlow();

  /* --- 读音按钮：单音连发两遍，间隔 0.2s --- */
  q.speakPhoneme();
  await drain();
  let sayT2 = pendingTimers().find((t) => t.ms === 200);
  check("[音标][读音] 第一遍读完挂起 0.2s 的第二遍", !!sayT2 && q.data.speaking === true, sayT2 ? String(sayT2.ms) : "no timer");
  sayT2.dead = true;
  sayT2.fn();
  await drain();
  check("[音标][读音] 第二遍播完自动收尾", q.data.speaking === false && !pendingTimers().some((t) => t.ms === 200));
  q.stopSpeak();
  /* 兜底通道（无单音）也双播 */
  q.setData({ item: Object.assign({}, q.data.item, { audio: "" }) });
  q.speakPhoneme();
  await drain();
  check("[音标][读音] 兜底读代表词同样挂起第二遍", pendingTimers().filter((t) => t.ms === 200).length === 1);
  q.stopSpeak();

  /* --- 连读两遍 + 跨组 --- */
  q.toggleAuto();
  await drain();
  check("[音标][连读] 开关打开即读第 1 遍", q.data.autoPlay === true && pendingTimers().length === 1);
  let t2 = pendingTimers()[0];
  t2.dead = true;
  t2.fn();
  await drain();
  check("[音标][连读] 同一音标读第 2 遍", q.data.item.ipa === "/iː/" && pendingTimers().length === 1, q.data.item.ipa);
  t2 = pendingTimers()[0];
  t2.dead = true;
  t2.fn();
  await drain();
  check("[音标][连读] 两遍读完切下一个", q.data.item.ipa === "/ɑː/", q.data.item.ipa);

  const fired2 = await flushTimers();
  const phGroups = ph.getGroups();
  const phTotal = phGroups.reduce((n, g) => n + ph.list(g.key).length, 0);
  const lastGroup = phGroups[phGroups.length - 1];
  const lastList = ph.list(lastGroup.key);
  const lastItem = lastList[lastList.length - 1];
  check("[音标][连读] 全部 " + phTotal + " 个 ×2 遍跑完", fired2 === phTotal * 2 - 2 && q.data.item.ipa === lastItem.ipa, "fired=" + fired2 + " end=" + q.data.item.ipa);
  check("[音标][连读] 全部读完自动停", q.data.autoPlay === false);
  check("[音标][连读] 跨组提示出现", toasts.some((t) => t.indexOf("下一组：") > -1));
  check("[音标][连读] 收尾提示", toasts.indexOf("全部音标连读完啦 🎉") > -1);

  /* --- 点哪个就从哪个开始 --- */
  q.pickItem({ currentTarget: { dataset: { id: ph.list(phGroups[0].key)[0].id, auto: "1" } } });
  await drain();
  check("[音标][连读] 点选跳到首组并开始连读", q.data.groupKey === phGroups[0].key && q.data.autoPlay === true && pendingTimers().length === 1, q.data.groupKey);

  /* --- 单音缺失兜底：第二遍也读代表词，链路不断 --- */
  q.loadGroup("c-nasal");
  q.toggleAuto();
  await drain();
  timers.forEach((t) => (t.dead = true));
  const it0 = q.data.item;
  q.setData({ item: Object.assign({}, it0, { audio: "" }) });
  q.autoStep();
  await drain();
  check("[音标][连读] 无单音时兜底读代表词", pendingTimers().length === 1, it0.say);
  let t3 = pendingTimers()[0];
  t3.dead = true;
  t3.fn(); // 第二遍（仍是代表词）
  await drain();
  check("[音标][连读] 兜底第二遍也读完", q.data.item.ipa === "/m/" && pendingTimers().length === 1);
  t3 = pendingTimers()[0];
  t3.dead = true;
  t3.fn(); // 切下一个
  await drain();
  check("[音标][连读] 兜底后切到 /n/", q.data.item.ipa === "/n/", q.data.item.ipa);
  q.stopAuto();

  const phWxml = fs.readFileSync(path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.wxml"), "utf8");
  check("[音标] 连读开关与文案就位", phWxml.indexOf('bindtap="toggleAuto"') > -1 && phWxml.indexOf("连读") > -1);
  check("[音标] 读音按钮放大样式就位", phWxml.indexOf("tool-say") > -1 && phWxml.indexOf("ico-46") > -1 && phWxml.indexOf("ico-34") > -1);

  /* ---------------- 汇总 ---------------- */
  console.log("连读 v2 + 慢速 仿真：");
  ok.forEach((s) => console.log("  ✓ " + s));
  bad.forEach((s) => console.log("  ✗ " + s));
  console.log("\n结果：" + ok.length + " 通过, " + bad.length + " 失败");
  process.exit(bad.length ? 1 : 0);
}

main();
