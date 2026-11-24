/**
 * 使用统计数据层：启动上报 / 手机号同步 / 管理员后台查询
 *
 * 云函数 cloudfunctions/stats 提供 track / bindPhone / overview。
 * 上报是「尽力而为」：云开发未开通或失败时静默跳过，绝不影响孩子使用。
 * 后台查询需要管理口令（与 cloudfunctions/feedback 的 ADMIN_KEY 一致）。
 */
const config = require("../config/index");

const ADMIN_KEY_STORE = "wb_feedback_admin_key"; // 与留言板共用同一个管理口令

let cloudReady = false;

function cloudEnv() {
  return (config.stats && config.stats.cloudEnv) || (config.feedback && config.feedback.cloudEnv) || undefined;
}

function available() {
  return typeof wx !== "undefined" && !!wx.cloud;
}

function ensureCloud() {
  if (!available()) return false;
  if (cloudReady) return true;
  try {
    wx.cloud.init({ env: cloudEnv(), traceUser: true });
    cloudReady = true;
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 调用云函数
 * @returns {Promise<object>} 云函数返回的 result
 */
function call(action, data) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      reject({ code: "NO_CLOUD", errMsg: "云开发未开通" });
      return;
    }
    wx.cloud.callFunction({
      name: (config.stats && config.stats.cloudFunction) || "stats",
      data: Object.assign({ action: action }, data || {}),
      success: (res) => {
        const r = (res && res.result) || {};
        if (r.ok) resolve(r);
        else reject(r);
      },
      fail: (err) => {
        reject({ code: "NET_FAIL", errMsg: (err && err.errMsg) || "网络异常" });
      },
    });
  });
}

/* ---------------- 上报（静默，不抛错） ---------------- */

/** 小程序启动上报：累计次数 +1、当日次数 +1、同步昵称/模式 */
function track(nickname, ageMode) {
  return call("track", { nickname: nickname, ageMode: ageMode }).catch(() => {});
}

/** 绑定手机号后同步（家长中心触发），失败静默 */
function bindPhone(phone, phoneSource, nickname) {
  return call("bindPhone", { phone: phone, phoneSource: phoneSource, nickname: nickname }).catch(() => {});
}

/** 用户主动保存资料（改昵称/切换模式）后同步；启动上报不会覆盖昵称，只有这里会更新 */
function profile(nickname, ageMode) {
  return call("profile", { nickname: nickname, ageMode: ageMode }).catch(() => {});
}

/* ---------------- 后台查询 ---------------- */

function getAdminKey() {
  try {
    return wx.getStorageSync(ADMIN_KEY_STORE) || "";
  } catch (e) {
    return "";
  }
}

function saveAdminKey(key) {
  try {
    wx.setStorageSync(ADMIN_KEY_STORE, String(key || "").trim());
  } catch (e) {}
}

/** 当前微信身份是否为管理员：{ isAdmin, hasAdmin } */
function checkAdmin() {
  return call("checkAdmin", {});
}

/** 首次认领管理员（口令 + 当前微信身份，认领后仅此身份可看后台） */
function claimAdmin(adminKey) {
  return call("claimAdmin", { adminKey: adminKey });
}

/** 拉取后台总览（仅管理员本人；非管理员 reject {code:"NO_PERM"}） */
function fetchOverview() {
  return call("overview", {});
}

/* ---------------- 展示格式化 ---------------- */

/** 最近使用：x 分钟前 / x 小时前 / 昨天 / M月D日 */
function lastText(ts) {
  const t = Number(ts);
  if (!t) return "—";
  const diff = Date.now() - t;
  if (diff < 60e3) return "刚刚";
  if (diff < 3600e3) return Math.floor(diff / 60e3) + " 分钟前";
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + " 小时前";
  const d = new Date(t);
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (day0 - that0 === 86400e3) return "昨天";
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

/** 数字格式化：1286 → 1,286 */
function fmtNum(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 更新时间 HH:MM */
function fmtClock(ts) {
  const d = new Date(Number(ts) || Date.now());
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

module.exports = {
  available: available,
  call: call,
  track: track,
  bindPhone: bindPhone,
  profile: profile,
  getAdminKey: getAdminKey,
  saveAdminKey: saveAdminKey,
  checkAdmin: checkAdmin,
  claimAdmin: claimAdmin,
  fetchOverview: fetchOverview,
  lastText: lastText,
  fmtNum: fmtNum,
  fmtClock: fmtClock,
};
