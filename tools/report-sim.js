/**
 * 家长中心「导出学习报告」改造仿真（Node 环境）
 *  改动：复制文本 → Canvas 生成报告图片 + 弹窗预览 + 分享给微信好友 / 保存相册
 *  运行：node tools/report-sim.js
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- wx mock ---------------- */
const storage = {};
const calls = {
  text: [],
  share: [],
  save: [],
  clip: null,
  modal: null,
  toast: null,
};
let canvasToTempFail = false;

function makeCtx() {
  return {
    font: "16px sans-serif",
    textAlign: "center",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    scale() {},
    translate() {},
    measureText(t) {
      const size = parseInt(String(this.font).replace(/[^\d]/g, ""), 10) || 16;
      return { width: String(t).length * size };
    },
    fillText(t) {
      calls.text.push(String(t));
    },
  };
}
const canvas = {
  width: 0,
  height: 0,
  getContext: () => makeCtx(),
};

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
  createSelectorQuery: () => ({
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(cb) {
      cb([{ node: canvas, width: 600, height: 920 }]);
    },
  }),
  canvasToTempFilePath: (o) => {
    setTimeout(() => {
      if (canvasToTempFail) o.fail && o.fail({ errMsg: "canvasToTempFilePath:fail" });
      else o.success && o.success({ tempFilePath: "http://tmp/report.png" });
    }, 0);
  },
  showShareImageMenu: (o) => {
    calls.share.push(o.path);
    o.success && o.success({});
  },
  saveImageToPhotosAlbum: (o) => {
    calls.save.push({ path: o.filePath, fail: o.fail, success: o.success });
    o.success && o.success({});
  },
  setClipboardData: (o) => {
    calls.clip = o.data;
    o.success && o.success({});
  },
  showToast(o) {
    calls.toast = o;
  },
  showModal(o) {
    calls.modal = o;
    o && o.success && o.success({ confirm: false });
  },
  openSetting() {},
  vibrateShort() {},
  navigateTo(o) {
    calls.nav = calls.nav || [];
    calls.nav.push(o && o.url);
  },
  redirectTo() {},
  reLaunch() {},
  pageScrollTo() {},
  createInnerAudioContext: () => ({
    obeyMuteSwitch: false,
    play() {},
    stop() {},
    destroy() {},
    onEnded() {},
    onError() {},
  }),
  cloud: {
    init() {},
    callFunction(o) {
      o.success && o.success({ result: { ok: true } });
    },
  },
};

global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.getCurrentPages = () => [{}];
let pageOpt = null;
global.Page = (o) => {
  pageOpt = o;
};

/* ---------------- A. 页面静态检查 ---------------- */
console.log("\n[A] 页面结构");
const fs = require("fs");
const wxml = fs.readFileSync(path.join(ROOT, "pages", "parent", "parent.wxml"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "pages", "parent", "parent.js"), "utf8");
check("入口副标题改为「生成图片」", wxml.includes("生成图片，一键分享给微信好友"));
check("旧「复制文本」副标题已移除", !wxml.includes("复制文本，可发给老师或家人"));
check("弹窗含「分享给微信好友」按钮", wxml.includes("分享给微信好友"));
check("弹窗含「保存到相册」按钮", wxml.includes("保存到相册"));
check("图片支持长按转发（show-menu-by-longpress）", wxml.includes("show-menu-by-longpress"));
check("弹窗含生成中占位（reportBusy）", wxml.includes("reportBusy"));
check("离屏画布 reportCanvas 存在", wxml.includes('id="reportCanvas"'));
check("exportReport 不再直接 setClipboardData", !/exportReport\(\)\s*\{[^}]*setClipboardData/.test(js));

/* ---------------- B. 生成链路 ---------------- */
console.log("\n[B] 生成图片");
require(path.join(ROOT, "pages", "parent", "parent.js"));
const store = require(path.join(ROOT, "utils", "store.js"));
const page = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};
page.onLoad({});
calls.text = [];

page.exportReport();
check("弹窗立即打开", page.data.reportOpen === true);
check("生成中状态 reportBusy=true", page.data.reportBusy === true);

(async () => {
  await sleep(60);

  check("canvas 尺寸 600×920×dpr", canvas.width === 1200 && canvas.height === 1840, canvas.width + "×" + canvas.height);
  check("生成完成 reportBusy=false", page.data.reportBusy === false, page.data.reportBusy);
  check("reportImg 已拿到临时文件", page.data.reportImg === "http://tmp/report.png", page.data.reportImg);
  check("绘制了报告标题", calls.text.some((t) => t.indexOf("学习报告") > -1), calls.text.slice(0, 3).join("|"));
  check(
    "绘制了昵称",
    calls.text.some((t) => t.indexOf("朗读小结") > -1 && t.indexOf(store.getUser().nickname || "小朋友") > -1),
    calls.text.find((t) => t.indexOf("朗读小结") > -1)
  );
  check("绘制了三个统计块", ["累计朗读（句）", "累计时长（分）", "打卡天数"].every((k) => calls.text.includes(k)));
  check("绘制了生词本与掌握率", calls.text.some((t) => t.indexOf("生词本") > -1) && calls.text.some((t) => /%$/.test(t)));
  check("绘制了近 7 天柱状图区", calls.text.includes("近 7 天朗读"));
  check("柱状图横轴是月/日", calls.text.some((t) => /^\d{2}\/\d{2}$/.test(t)), calls.text.filter((t) => /^\d{2}\/\d{2}$/.test(t)).join(","));
  check("绘制了打卡连击", calls.text.some((t) => t.indexOf("连续打卡") > -1));
  check("绘制了底部标语", calls.text.some((t) => t.indexOf("越来越响亮") > -1));

  /* ---------------- C. 分享与保存 ---------------- */
  console.log("\n[C] 分享给微信好友");
  calls.share = [];
  calls.save = [];
  page.shareReportImage();
  check("调起系统分享图片面板", calls.share.length === 1 && calls.share[0] === "http://tmp/report.png", JSON.stringify(calls.share));
  check("分享不误触保存相册", calls.save.length === 0);

  console.log("\n[D] 分享失败/低版本兜底");
  calls.share = [];
  calls.save = [];
  page.shareReportImage();
  await sleep(0);
  // 上一条 share 成功路径不触发 fail；这里直接模拟 fail 回调
  calls.save = [];
  const failCb = (() => {
    let cb = null;
    global.wx.showShareImageMenu = (o) => {
      cb = o.fail;
    };
    page.shareReportImage();
    global.wx.showShareImageMenu = (o) => {
      calls.share.push(o.path);
      o.success && o.success({});
    };
    return cb;
  })();
  failCb && failCb({ errMsg: "showShareImageMenu:fail" });
  check("分享失败退保存相册", calls.save.length === 1 && calls.save[0].path === "http://tmp/report.png");

  global.wx.showShareImageMenu = undefined; // 模拟低版本基础库
  calls.save = [];
  page.shareReportImage();
  check("无 showShareImageMenu API 时直接保存相册", calls.save.length === 1, calls.save.length);

  console.log("\n[E] 保存相册权限拒绝");
  calls.save = [];
  calls.modal = null;
  global.wx.saveImageToPhotosAlbum = (o) => {
    o.fail && o.fail({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
  };
  page.saveReportImage();
  check("权限拒绝弹出引导弹窗", calls.modal && calls.modal.title === "需要相册权限", calls.modal && calls.modal.title);

  console.log("\n[F] 画布异常兜底");
  calls.clip = null;
  canvasToTempFail = true;
  page.exportReport();
  await sleep(60);
  check("导出失败后 reportBusy 复位", page.data.reportBusy === false);
  check("退回复制文字版报告", typeof calls.clip === "string" && calls.clip.indexOf("【书声岛】") > -1, calls.clip && calls.clip.slice(0, 30));
  check("提示文案说明降级", calls.toast && calls.toast.title.indexOf("文字版") > -1, calls.toast && calls.toast.title);
  check("弹窗仍打开（用户可关闭）", page.data.reportOpen === true);
  canvasToTempFail = false;

  console.log("\n[G] 关闭弹窗");
  page.closeReport();
  check("closeReport 关闭弹窗", page.data.reportOpen === false);

  console.log("\n[H] 书单详情弹窗（分句进度）");
  const g1 = store.createGroup({ title: "测试绘本", lessonTitle: "第一课", sentences: ["春天来了", "小花开了", "小鸟唱歌"] });
  store.markRead(g1.id, 0, 5); // 第 1 句已读
  const g1full = store.getGroup(g1.id);
  g1full.sentences[1].heard = true; // 第 2 句听过没读
  page.load();
  page.openGroup({ currentTarget: { dataset: { id: g1.id } } });
  const gs = page.data.gSheet;
  check("弹窗打开且带书名", !!gs && gs.title === "测试绘本", gs && gs.title);
  check("进度统计正确（1/3 · 33%）", gs.read === 1 && gs.total === 3 && gs.percent === 33, JSON.stringify(gs));
  check("分句行数 = 句子数", gs.rows.length === 3);
  check("第 1 句状态已读", gs.rows[0].state === "read" && !gs.rows[0].current);
  check("第 2 句状态听过", gs.rows[1].state === "heard");
  check("第 2 句标记「下次继续」（cursor 指向它）", gs.rows[1].current === true && gs.rows[2].current === false);
  check("继续提示指向第 2 句", gs.cursorText.indexOf("2") > -1, gs.cursorText);
  page.closeGroupSheet();
  check("关闭弹窗", page.data.gSheet === null);
  page.openGroup({ currentTarget: { dataset: { id: g1.id } } });
  page.goGroupReader();
  check("继续朗读跳转 reader 并带 groupId", (calls.nav || []).some((u) => u.indexOf("/pages/reader/reader?groupId=" + g1.id) === 0), JSON.stringify(calls.nav || []));
  check("跳转后弹窗已关闭", page.data.gSheet === null);
  // 读完一本书：全部已读 → 无「下次继续」标记，按钮文案变「再读一遍」
  store.markRead(g1.id, 1, 5);
  store.markRead(g1.id, 2, 5);
  store.updateGroup(g1.id, { done: true });
  page.load();
  page.openGroup({ currentTarget: { dataset: { id: g1.id } } });
  check("读完书：100%", page.data.gSheet.percent === 100);
  check("读完书：无下次继续标记", page.data.gSheet.rows.every((r) => !r.current) && page.data.gSheet.done === true);
  check("按钮文案区分读完状态", wxml.indexOf("再读一遍") > -1 && wxml.indexOf("继续朗读") > -1);

  console.log("\n结果：" + pass + " PASS，" + fail + " FAIL");
  process.exit(fail ? 1 : 0);
})();
