/**
 * 顶部导航布局缓存仿真（切页签时标题栏「跳一下」的修复验证）
 *
 * 问题：页面 data 里写死 statusBar:20 / navH:44 / navRight:0，首帧按默认值排版，
 *      onLoad 再 setData 成真实值 → 每次切页签，标题栏与正文都会先在上、再往下挪。
 * 修复：app 启动测一次 → 存 globalData + 本地缓存；页面 data 用 ...nav.init() 同步读取，
 *      首帧即最终位置；onLoad 的 nav.sync() 返回同一份数据 → setData 前后无差异。
 *
 * 运行：node tools/nav-sim.js
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

/* ---------------- 设备与 wx mock ---------------- */
const DEVICE = {
  statusBarHeight: 44,
  windowWidth: 375,
  windowHeight: 812,
  pixelRatio: 2,
};
const CAPSULE = { width: 87, height: 32, top: 48, bottom: 80, left: 281, right: 368 };

let capOk = true;
let win = Object.assign({}, DEVICE);
const storage = {};

function noop() {}
const baseWx = {
  getStorageSync: (k) => (k in storage ? storage[k] : ""),
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  getWindowInfo: () => Object.assign({}, win),
  getSystemInfoSync: () => Object.assign({}, win),
  getMenuButtonBoundingClientRect: () =>
    capOk
      ? Object.assign({}, CAPSULE)
      : { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 },
  env: { USER_DATA_PATH: "wxfile://usr" },
  cloud: { init: noop, callFunction: noop },
  nextTick: (cb) => setTimeout(cb, 0),
};
global.wx = new Proxy(baseWx, {
  get(t, k) {
    if (k in t) return t[k];
    return noop;
  },
});

const appMock = { globalData: { statusBarHeight: DEVICE.statusBarHeight, userInfo: { nickname: "孔老师" } } };
global.getApp = () => appMock;
global.getCurrentPages = () => [{}];
global.requirePlugin = () => ({ getRecordRecognitionManager: () => ({ onStop: noop, start: noop }) });
let captured = null;
global.Page = (opt) => {
  captured = opt;
};

const NAV = path.join(ROOT, "utils", "nav.js");
function freshNav() {
  delete require.cache[require.resolve(NAV)];
  return require(NAV);
}
function loadPage(rel) {
  const file = path.join(ROOT, rel);
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  return captured;
}

console.log("\n[A] 冷启动（首次安装，无缓存）");
let nav = freshNav();
const cold = nav.init();
check("无缓存时给出保守默认值，不调用测量 API", cold.statusBar === 20 && cold.navH === 44, JSON.stringify(cold));
check("保守默认值已预留右侧胶囊位置（不会压住胶囊）", cold.navRight >= 90, cold.navRight);

console.log("\n[B] app 启动测量一次");
const measured = nav.measure();
check("statusBar 取自系统（44）", measured.statusBar === 44, measured.statusBar);
check("navH 按胶囊垂直居中算（夹在 44~64）", measured.navH === 44, measured.navH);
check("navRight = 屏宽 - 胶囊 left + 10", measured.navRight === 104, measured.navRight);
check("测量结果写入本地缓存", !!storage.wb_nav_layout && storage.wb_nav_layout.navH === 44, JSON.stringify(storage.wb_nav_layout));
check("测量结果写入 globalData", !!appMock.globalData.navLayout, JSON.stringify(appMock.globalData.navLayout));

console.log("\n[C] 页面首帧即最终位置（不再跳）");
const initAfter = nav.init();
check("init() 与 measure() 完全一致", JSON.stringify(initAfter) === JSON.stringify(measured), JSON.stringify(initAfter));
const syncAfter = nav.sync();
check("onLoad 的 sync() 与首帧数据一致（setData 无差异 → 不跳动）", JSON.stringify(syncAfter) === JSON.stringify(initAfter), JSON.stringify(syncAfter));

console.log("\n[D] 18 个页面 data 初始值都用缓存（不再写死 20/44/0）");
const pages = [
  "pages/home/home.js",
  "pages/vocab/vocab.js",
  "pages/capture/capture.js",
  "pages/archive/archive.js",
  "pages/parent/parent.js",
  "pages/listen/listen.js",
  "pages/write/write.js",
  "pkgLearn/pages/phonetics/phonetics.js",
  "pages/math/math.js",
  "pages/calc/calc.js",
  "pages/column/column.js",
  "pages/link/link.js",
  "pages/mind/mind.js",
  "pages/words/words.js",
  "pages/reader/reader.js",
  "pages/reward/reward.js",
  "pages/feedback/feedback.js",
  "pages/admin/admin.js",
];
let bad = [];
for (const rel of pages) {
  let opt = null;
  try {
    opt = loadPage(rel);
  } catch (e) {
    bad.push(rel + " 加载失败：" + e.message);
    continue;
  }
  const d = (opt && opt.data) || {};
  if (!(d.statusBar === measured.statusBar && d.navH === measured.navH && d.navRight === measured.navRight)) {
    bad.push(rel + " → " + d.statusBar + "/" + d.navH + "/" + d.navRight);
  }
}
check(pages.length + " 个页面首帧 data 与服务端测量值一致", bad.length === 0, bad.join("；"));

console.log("\n[E] 源码里不再调用 nav.layout()（统一走缓存）");
const srcBad = [];
for (const rel of pages) {
  const s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (s.indexOf("nav.layout()") > -1) srcBad.push(rel + " 仍在 onLoad 里调 layout()");
  if (s.indexOf("...nav.init()") < 0) srcBad.push(rel + " 缺少 ...nav.init()");
}
check("无残留", srcBad.length === 0, srcBad.join("；"));

console.log("\n[F] 异常场景");
// F1 胶囊读不到（部分安卓启动瞬间）：不能把 navRight 覆盖成 0
capOk = false;
const keep = nav.measure();
check("胶囊读不到时保留上次 navRight（不压胶囊）", keep.navRight === 104 && keep.navH === 44, JSON.stringify(keep));
// F2 冷启动 + 只有本地缓存（globalData 空）
appMock.globalData.navLayout = null;
nav = freshNav();
const fromStorage = nav.init();
check("globalData 为空时从本地缓存恢复", fromStorage.navRight === 104 && fromStorage.statusBar === 44, JSON.stringify(fromStorage));
// F3 横竖屏切换：宽度变了要重新测量
capOk = true;
win = { statusBarHeight: 0, windowWidth: 812, windowHeight: 375, pixelRatio: 2 };
const land = nav.sync();
check("屏宽变化（横屏）时重新测量", land.windowWidth === 812 && land.statusBar === 0, JSON.stringify(land));
win = Object.assign({}, DEVICE);
nav = freshNav();
check("竖屏恢复后 sync() 重新按竖屏算", nav.sync().navRight === 104, JSON.stringify(nav.sync()));

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
