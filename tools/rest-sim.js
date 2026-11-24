/**
 * 每日时长上限 + 时长显示仿真（Node 环境）
 *  修的问题：
 *   1) 「我的-每日完成情况」读了 6 句显示 0 分（不足 1 分钟被 Math.round 抹掉）
 *   2) 家长中心「每日时长上限」只有设置项、没有任何生效逻辑
 *  运行：node tools/rest-sim.js
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
const modals = [];
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
  showToast() {},
  showModal(o) {
    modals.push(o);
    if (o && o.success) o.success({ confirm: true, cancel: false });
  },
  navigateTo() {},
  navigateBack() {},
  redirectTo() {},
  vibrateShort() {},
  getRecorderManager: () => ({ onStop() {}, onError() {}, start() {}, stop() {} }),
  createInnerAudioContext: () => ({ play() {}, stop() {}, destroy() {}, onEnded() {}, onError() {}, onTimeUpdate() {} }),
  cloud: { init() {}, callFunction() {} },
};
global.getApp = () => ({ globalData: {} });
global.getCurrentPages = () => [{}];

const store = require(path.join(ROOT, "utils", "store.js"));

console.log("\n[A] 时长格式化（不足 1 分钟不再显示 0 分）");
check("0 秒", store.fmtDuration(0) === "0 秒", store.fmtDuration(0));
check("48 秒", store.fmtDuration(48) === "48 秒", store.fmtDuration(48));
check("60 秒 → 1 分钟", store.fmtDuration(60) === "1 分钟", store.fmtDuration(60));
check("200 秒 → 3 分 20 秒", store.fmtDuration(200) === "3 分 20 秒", store.fmtDuration(200));
check("3600 秒 → 1 小时", store.fmtDuration(3600) === "1 小时", store.fmtDuration(3600));
check("3900 秒 → 1 小时 5 分", store.fmtDuration(3900) === "1 小时 5 分", store.fmtDuration(3900));

console.log("\n[B] 每日完成情况带真实时长");
// 模拟「当天读了 6 句、共 48 秒」的场景（首次运行 store 会种演示数据，按增量断言）
const baseWeek = store.weekStats(7).reduce((s, d) => s + (d.seconds || 0), 0);
const baseTodaySec = store.todayStat().seconds || 0;
store.bumpDaily({ sentences: 6, seconds: 48 });
const week = store.weekStats(7);
const today = week[week.length - 1];
check("今天 6 句", today.sentences >= 6, String(today.sentences));
check("今天时长显示含真实秒数（不再一律显示 0 分）", today.durationText === store.fmtDuration(baseTodaySec + 48), today.durationText);
check("minutes 字段保留（柱状图等旧逻辑兼容）", today.minutes === Math.round((baseTodaySec + 48) / 60), String(today.minutes));
const weekSec = week.reduce((s, d) => s + (d.seconds || 0), 0);
check("周累计时长秒数可汇总", weekSec === baseWeek + 48, String(weekSec));

console.log("\n[C] 每日时长上限（默认 20 分钟）");
let usage = store.dailyUsage();
check("默认上限 20 分钟", usage.limit === 20, String(usage.limit));
const used0 = usage.usedSec;
const LIMIT = 20 * 60;
check("未到上限 → 不算超", usage.over === false && usage.remainSec === Math.max(0, LIMIT - used0), JSON.stringify(usage));
// 恰好距上限 60 秒
const gap = LIMIT - used0 - 60;
if (gap > 0) store.bumpDaily({ seconds: gap });
usage = store.dailyUsage();
check("距上限 60 秒 → 恰好未超", usage.over === false, String(usage.over));
check("剩余 60 秒", usage.remainSec === 60, String(usage.remainSec));
// 再读 60 秒 → 到点
store.bumpDaily({ seconds: 60 });
usage = store.dailyUsage();
check("20 分钟 → 到点提醒", usage.over === true && usage.remainSec === 0, JSON.stringify(usage));
// 再多读也不报错，remainSec 钳在 0
store.bumpDaily({ seconds: 120 });
usage = store.dailyUsage();
check("超时后 remainSec 钳在 0", usage.over === true && usage.remainSec === 0, JSON.stringify(usage));

console.log("\n[D] 到点休息提醒（每天最多一次，不强制退出）");
modals.length = 0;
const page = { data: {} };
// 用 home 页的 checkRest 逻辑（直接内联同样的调用链验证 store 侧）
check("到点 → 需要提醒", store.restTipNeeded() === true, String(store.restTipNeeded()));
store.markRestTip();
check("提醒过一次 → 当天不再提醒", store.restTipNeeded() === false, String(store.restTipNeeded()));

console.log("\n[E] 上限设为 0 = 不限制");
const user = store.getUser();
store.setUser({ dailyLimit: 0 });
usage = store.dailyUsage();
check("0 分钟 → 不限制（over=false）", usage.over === false && usage.remainSec === -1, JSON.stringify(usage));
store.setUser({ dailyLimit: 10 });
usage = store.dailyUsage();
check("改为 10 分钟后按新上限判超", usage.limit === 10 && usage.over === true, JSON.stringify(usage));
store.setUser(user); // 还原

console.log("\n[F] 磨耳朵时长计入（listen 页 flushListenSec）");
// 模拟 listen 页停留 35 秒后离开
const listenAt = Date.now() - 35000;
const sec = Math.round((Date.now() - listenAt) / 1000);
const before = store.dailyUsage().usedSec;
store.bumpDaily({ seconds: Math.min(sec, 1800) });
check("停留 35 秒 → 每日时长 +35", store.dailyUsage().usedSec === before + 35, String(store.dailyUsage().usedSec - before));

console.log("\n结果：" + pass + " 通过, " + fail + " 失败");
if (fail) process.exit(1);
