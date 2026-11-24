/**
 * 留言板数据层：云函数调用封装 + 本地缓存兜底
 *
 * 云函数 cloudfunctions/feedback 提供 add / list / reply / remove。
 * 云开发未开通或调用失败时，页面给出明确提示，主流程不崩；
 * 最近一次成功拉取的留言会缓存到本地，断网时也能看到旧留言。
 */
const config = require("../config/index");

const CACHE_KEY = "wb_feedback_cache";
const ADMIN_KEY_STORE = "wb_feedback_admin_key";

let cloudReady = false;

function cloudEnv() {
  return (config.feedback && config.feedback.cloudEnv) || undefined;
}

/** 云开发是否可用（wx.cloud 存在即认为可尝试） */
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
      name: (config.feedback && config.feedback.cloudFunction) || "feedback",
      data: Object.assign({ action: action }, data || {}),
      success: (res) => {
        const r = (res && res.result) || {};
        if (r.ok) resolve(r);
        else reject(r);
      },
      fail: (err) => {
        reject({
          code: "NET_FAIL",
          errMsg: (err && err.errMsg) || "网络异常，稍后再试",
        });
      },
    });
  });
}

/** 拉取留言列表；成功时写入本地缓存 */
function fetchList() {
  return call("list").then((r) => {
    try {
      wx.setStorageSync(CACHE_KEY, { at: Date.now(), list: r.list || [], pending: r.pending || 0 });
    } catch (e) {}
    return r;
  });
}

/** 断网兜底：读最近一次成功拉取的缓存 */
function cachedList() {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && c.list && c.list.length) return c;
  } catch (e) {}
  return null;
}

/* ---------------- 管理口令（家长回复留言用） ---------------- */

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

/** 口令被云端判定无效时清掉，避免「一直用错口令、每次都失败」的死循环 */
function clearAdminKey() {
  try {
    wx.removeStorageSync(ADMIN_KEY_STORE);
  } catch (e) {}
}

/** 时间格式化：今天 / 昨天 / M月D日 */
function fmtTime(ts) {
  const t = Number(ts);
  if (!t) return "";
  const d = new Date(t);
  const now = new Date();
  const hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((day - that) / 86400000);
  if (diffDays === 0) return "今天 " + hm;
  if (diffDays === 1) return "昨天 " + hm;
  return d.getMonth() + 1 + "月" + d.getDate() + "日 " + hm;
}

module.exports = {
  available: available,
  ensureCloud: ensureCloud,
  call: call,
  fetchList: fetchList,
  cachedList: cachedList,
  getAdminKey: getAdminKey,
  saveAdminKey: saveAdminKey,
  clearAdminKey: clearAdminKey,
  fmtTime: fmtTime,
};
