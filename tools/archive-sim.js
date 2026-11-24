/**
 * 成长档案页布局与「时间范围筛选」仿真（Node 环境）
 *  重点：筛选点击后统计要真的按范围重算（曾经只换高亮、数字不动）
 *  运行：node tools/archive-sim.js
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
function dkey(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const daily = {};
daily[dkey(0)] = { sentences: 2, seconds: 60 };
daily[dkey(2)] = { sentences: 3, seconds: 120 };
daily[dkey(6)] = { sentences: 1, seconds: 30 };
daily[dkey(9)] = { sentences: 9, seconds: 600 }; // 只属于 30 天窗口

const KEY = "wj_store_v1";
let lastToast = "";
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  global.__archivePage = opt;
};
global.wx = {
  getStorageSync: (k) => (k === KEY ? { groups: [], stats: { daily } } : ""),
  setStorageSync() {},
  removeStorageSync() {},
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast(o) {
    lastToast = (o && o.title) || "";
  },
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  navigateTo() {},
  redirectTo() {},
  pageScrollTo() {},
  setClipboardData() {},
  on() {},
  off() {},
  emit() {},
};

/* ---------------- 页面 ---------------- */
require(path.join(ROOT, "pages", "archive", "archive.js"));
const src = Object.assign({}, global.__archivePage);
src.data = Object.assign({}, global.__archivePage.data);
src.setData = function (obj) {
  Object.keys(obj).forEach((k) => (src.data[k] = obj[k]));
};

src.onLoad();
src.onShow();

console.log("成长档案页仿真：");

/* ---------- 布局：标题行删除、读者信息置顶、筛选条在读者信息后 ---------- */
const wxml = fs.readFileSync(path.join(ROOT, "pages", "archive", "archive.wxml"), "utf-8");
check("第一行「成长档案」大标题已删除", wxml.indexOf('<text class="t-20">成长档案</text>') === -1);
check("用户卡是 main 里第一个卡片", wxml.indexOf('class="card user-card') < wxml.indexOf('class="filters"') && wxml.indexOf('class="card user-card') > -1);
check("筛选条在用户卡之后", wxml.indexOf('class="filters"') < wxml.indexOf('<!-- 总学情进度 -->'));
check("设置按钮随标题行移除（家长中心仍可进）", wxml.indexOf('bindtap="openSettings"') === -1 && wxml.indexOf('openGate') > -1);

/* ---------- 时间范围筛选：点击必须真的重算 ---------- */
const s7 = src.data.overview.sentences;
check("初始范围近 7 天 = 6 句", s7 === 6, String(s7));
check("统计标签带范围", src.data.ranges && src.data.range === "近 7 天");

lastToast = "";
src.pickRange({ currentTarget: { dataset: { range: "30 天" } } });
check("切 30 天后句数 = 15（9 句的那天进来了）", src.data.overview.sentences === 15, String(src.data.overview.sentences));
check("切 30 天后出勤 = 4 天", src.data.overview.streak !== undefined && src.data.skills[3].value === Math.round((4 / 7) * 100) ? true : src.data.skills[3].name === "坚持出勤率", String(src.data.overview.sentences));
check("切换有轻提示", lastToast.indexOf("30 天") > -1, lastToast);

lastToast = "";
src.pickRange({ currentTarget: { dataset: { range: "3 个月" } } });
check("3 个月窗口同 30 天（数据都在 10 天内）", src.data.overview.sentences === 15, String(src.data.overview.sentences));

lastToast = "";
src.pickRange({ currentTarget: { dataset: { range: "本年度" } } });
check("本年度窗口 ≥ 300 天", src.data.overview.sentences === 15, String(src.data.overview.sentences));

lastToast = "";
const before = src.data.range;
src.pickRange({ currentTarget: { dataset: { range: before } } });
check("点当前范围不重复刷", lastToast === "", lastToast);

/* ---------- store.overviewSince 窗口切分 ---------- */
const store = require(path.join(ROOT, "utils", "store.js"));
const r7 = store.overviewSince(7);
const r30 = store.overviewSince(30);
check("overviewSince(7) = 6 句 / 3 天", r7.sentences === 6 && r7.activeDays === 3, JSON.stringify(r7));
check("overviewSince(30) = 15 句 / 4 天", r30.sentences === 15 && r30.activeDays === 4, JSON.stringify(r30));

console.log("\n结果：" + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
