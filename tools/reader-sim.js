/**
 * 朗读页「下一句 / 完成朗读」仿真（Node 环境）
 *  修的问题：逐句朗读时点「下一句」会直接跳到完成激励页（nextSentence 在最后一句 goReward；
 *            endRecord 整篇读完还会 900ms 后自动 redirect）
 *  期望：翻页永远不跳页；只有显式「完成朗读」+ 确认后才进奖励页
 *  运行：node tools/reader-sim.js
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

/* ---------------- wx mock ---------------- */
const storage = {};
const calls = { toast: [], modal: [], redirect: [], vibrate: 0 };
let confirmModal = false;

const recorder = {
  onStop() {},
  onError() {},
  start() {},
  stop() {},
};

global.wx = {
  getStorageSync: (k) => storage[k] || "",
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast(o) {
    calls.toast.push(o && o.title);
  },
  showModal(o) {
    calls.modal.push(o);
    if (o && o.success) o.success({ confirm: confirmModal, cancel: !confirmModal });
  },
  redirectTo(o) {
    calls.redirect.push(o && o.url);
  },
  navigateTo(o) {
    calls.redirect.push(o && o.url);
  },
  navigateBack() {},
  reLaunch() {},
  pageScrollTo() {},
  vibrateShort() {
    calls.vibrate += 1;
  },
  getRecorderManager: () => recorder,
  createInnerAudioContext: () => ({
    src: "",
    obeyMuteSwitch: false,
    play() {},
    stop() {},
    destroy() {},
    onEnded() {},
    onError() {},
    onTimeUpdate() {},
  }),
  cloud: {
    init() {},
    callFunction(o) {
      o.success && o.success({ result: { ok: true } });
    },
  },
  createSelectorQuery: () => ({
    select() {
      return this;
    },
    fields() {
      return this;
    },
    boundingClientRect() {
      return this;
    },
    exec(cb) {
      cb([{ width: 300, height: 200, top: 0, left: 0 }]);
    },
  }),
};

global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.getCurrentPages = () => [{}];
let pageOpt = null;
global.Page = (o) => {
  pageOpt = o;
};

/* ---------------- A. 源码静态检查 ---------------- */
console.log("\n[A] 源码检查");
const fs = require("fs");
const js = fs.readFileSync(path.join(ROOT, "pages", "reader", "reader.js"), "utf8");
const wxml = fs.readFileSync(path.join(ROOT, "pages", "reader", "reader.wxml"), "utf8");
check("nextSentence 不再直接 goReward", !/nextSentence\(\)\s*\{[\s\S]{0,200}goReward/.test(js));
check("endRecord 不再自动 goReward", !/if \(group\.done\) \{[\s\S]{0,120}goReward/.test(js));
check("wxml 按钮绑定 onNextOrFinish", wxml.indexOf('bindtap="onNextOrFinish"') > -1);
check("wxml 文案按 isLast/allRead 切换「完成朗读」", wxml.indexOf("完成朗读") > -1 && wxml.indexOf("'下一句'") > -1);

/* ---------------- B. 页面行为 ---------------- */
console.log("\n[B] 翻页与完成");
require(path.join(ROOT, "pages", "reader", "reader.js"));
const store = require(path.join(ROOT, "utils", "store.js"));
const group = store.createGroup({
  title: "测试课文",
  lessonTitle: "测试课文",
  sentences: ["第一句话。", "第二句话。", "第三句话。"],
});

const page = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};
page.onLoad({ groupId: group.id });

check("进入第 1 句", page.data.sentenceIndex === 1 && page._index === 0, page.data.sentenceIndex);
check("共 3 句", page.data.sentenceTotal === 3, page.data.sentenceTotal);
check("第 1 句不是最后一句", page.data.isLast === false);

calls.redirect = [];
page.onNextOrFinish();
check("第 1 句点按钮 → 翻到第 2 句", page.data.sentenceIndex === 2 && page._index === 1, page.data.sentenceIndex);
check("翻页不跳奖励页", calls.redirect.length === 0, calls.redirect.join(","));

page.onNextOrFinish();
check("第 2 句点按钮 → 翻到第 3 句", page.data.sentenceIndex === 3 && page._index === 2, page.data.sentenceIndex);
check("到第 3 句 isLast=true", page.data.isLast === true);
check("翻页仍不跳奖励页", calls.redirect.length === 0, calls.redirect.join(","));

/* 最后一句：按钮变完成朗读，先弹确认 */
calls.modal = [];
confirmModal = false;
page.onNextOrFinish();
check("最后一句点按钮 → 弹确认框", calls.modal.length === 1, String(calls.modal.length));
check("确认框取消不跳转", calls.redirect.length === 0, calls.redirect.join(","));
check("确认框标题是「完成朗读」", calls.modal[0] && calls.modal[0].title === "完成朗读", calls.modal[0] && calls.modal[0].title);
check("提示还有几句没读", calls.modal[0] && calls.modal[0].content.indexOf("3 句没读") > -1, calls.modal[0] && calls.modal[0].content);

confirmModal = true;
page.onNextOrFinish();
check("确认后进奖励页", calls.redirect.length === 1 && calls.redirect[0].indexOf("/pages/reward/reward") > -1, calls.redirect.join(","));
check("奖励页带 groupId", calls.redirect[0].indexOf(group.id) > -1, calls.redirect[0]);

/* nextSentence 直接调用（跳过按钮）：最后一句只提示，不跳页 */
calls.redirect = [];
calls.toast = [];
page.nextSentence();
check("最后一句直接 nextSentence 不跳页", calls.redirect.length === 0, calls.redirect.join(","));
check("最后一句提示「已经是最后一句啦」", calls.toast.some((t) => String(t).indexOf("最后一句") > -1), calls.toast.join("|"));

/* ---------------- C. 整篇读完不再自动跳 ---------------- */
console.log("\n[C] 录完整篇");
const page2 = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page2.setData = function (patch) {
  Object.assign(this.data, patch);
};
page2.onLoad({ groupId: group.id });
// 前两句已读，只差最后一句
store.markRead(group.id, 0, 3);
store.markRead(group.id, 1, 3);
page2.goTo(2);
calls.redirect = [];
calls.toast = [];
page2.data.recording = true;
page2._sec = 3;
page2.endRecord();
check("读完最后一句 → allRead=true", page2.data.allRead === true);
check("读完最后一句 → 不自动跳奖励页", calls.redirect.length === 0, calls.redirect.join(","));
check("读完最后一句 → 提示去点「完成朗读」", calls.toast.some((t) => String(t).indexOf("完成朗读") > -1), calls.toast.join("|"));

/* 已读完整篇再进入：按钮直接是完成朗读 */
const page3 = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page3.setData = function (patch) {
  Object.assign(this.data, patch);
};
page3.onLoad({ groupId: group.id });
check("已读完的课文进入即 allRead", page3.data.allRead === true);

/* ---------------- D. 单句课文（极端情况） ---------------- */
console.log("\n[D] 只有一句的课文");
const one = store.createGroup({ title: "一句话", sentences: ["只有这一句话。"] });
const page4 = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page4.setData = function (patch) {
  Object.assign(this.data, patch);
};
page4.onLoad({ groupId: one.id });
check("单句课文 isLast=true", page4.data.isLast === true);
calls.redirect = [];
calls.modal = [];
confirmModal = false;
page4.onNextOrFinish();
check("单句课文点按钮只弹确认、不直接跳", calls.modal.length === 1 && calls.redirect.length === 0, calls.redirect.join(","));

/* ---------------- E. 长文同屏布局（追踪条/舞台/控制台三区固定） ---------------- */
console.log("\n[E] 长文同屏布局");
const wxss = fs.readFileSync(path.join(ROOT, "pages", "reader", "reader.wxss"), "utf8");
check("wxml 采用三区固定骨架（shell/track-bar/stage/dock）",
  ["shell", "track-bar", "stage", "dock"].every((c) => wxml.indexOf(c) > -1));
check("中间只有朗读舞台一个滚动区（scroll-view 仅 1 个）", (wxml.match(/<scroll-view/g) || []).length === 1, String((wxml.match(/<scroll-view/g) || []).length));
check("追踪条与麦克风不在滚动区内（位于 scroll-view 之外）",
  wxml.indexOf("track-bar") < wxml.indexOf("<scroll-view") && wxml.lastIndexOf("dock") > wxml.lastIndexOf("</scroll-view>"));
check("控制台带安全区 padding", /\.dock[\s\S]*?env\(safe-area-inset-bottom\)/.test(wxss));

const page5 = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page5.setData = function (patch) {
  Object.assign(this.data, patch);
};
const longText = "春天来了，小燕子从南方飞回来了，它们在屋檐下叽叽喳喳地叫着，好像在说春天的故事。";
const longGroup = store.createGroup({ title: "长句课文", sentences: [longText] });
page5.onLoad({ groupId: longGroup.id });
check("超长句自动降字号 xlong", page5.data.sizeClass === "xlong", page5.data.sizeClass);
check("超长句列数放宽（≤12 列）", page5.data.charLines.every((l) => l.length <= 12), JSON.stringify(page5.data.charLines.map((l) => l.length)));

const page6 = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page6.setData = function (patch) {
  Object.assign(this.data, patch);
};
page6.onLoad({ groupId: group.id });
check("短句不降字号", page6.data.sizeClass === "", page6.data.sizeClass);

/* 按住朗读：追踪条点亮 + 句子卡滚回可见区 */
page6.startRecord();
check("按住朗读 → 追踪条点亮", page6.data.trackOn === true && page6.data.recording === true);
check("按住朗读 → 句子卡滚回可见区", page6.data.stageAnchor === "sentence-card", page6.data.stageAnchor);
page6.endRecord();
check("松手 → 追踪条熄灭", page6.data.trackOn === false && page6.data.recording === false);

/* 换句同样把句子卡带回可见区（异步两段式锚点） */
setTimeout(() => {
  page6.goTo(0);
  setTimeout(() => {
    check("换句后句子卡仍锚定可见", page6.data.stageAnchor === "sentence-card", page6.data.stageAnchor);
    check("展开/收起课文原件大图", (page6.openTrack(), page6.data.trackBig === true) && (page6.closeTrack(), page6.data.trackBig === false));
    console.log("\n结果：" + pass + " 通过, " + fail + " 失败");
    if (fail) process.exit(1);
  }, 60);
}, 60);
