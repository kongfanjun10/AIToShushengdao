/**
 * 学习记录云备份（换设备找回）
 *
 * key = 手机号 + 4 位恢复口令；云函数 cloudfunctions/backup + 集合 user_backups。
 * 一切失败都不抛到页面（家长中心自行 then/catch 提示），绝不影响正常使用。
 */
const config = require("../config/index");

let cloudReady = false;

function ensureCloud() {
  if (typeof wx === "undefined" || !wx.cloud) return false;
  if (cloudReady) return true;
  try {
    wx.cloud.init({ env: config.backup.cloudEnv, traceUser: true });
    cloudReady = true;
    return true;
  } catch (e) {
    return false;
  }
}

function call(action, data) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      reject({ code: "NO_CLOUD", errMsg: "云开发未开通" });
      return;
    }
    wx.cloud.callFunction({
      name: config.backup.cloudFunction,
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

/** 查询号码是否有云备份：{ ok, has, at, nickname } */
function peek(phone) {
  return call("peek", { phone: phone });
}

/** 覆盖式保存备份：{ ok, at } */
function save(data, phone, pin) {
  return call("save", { phone: phone, pin: pin, data: data });
}

/** 校验口令取回备份：{ ok, data, at, nickname } */
function fetch(phone, pin) {
  return call("get", { phone: phone, pin: pin });
}

/** 备份时间 → "11-17 10:35" / "昨天 20:01" */
function fmtAt(ts) {
  const t = Number(ts);
  if (!t) return "";
  const d = new Date(t);
  const hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  const md = d.getMonth() + 1 + "-" + ("0" + d.getDate()).slice(-2);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天 " + hm;
  const yest = new Date(now.getTime() - 86400e3);
  if (d.toDateString() === yest.toDateString()) return "昨天 " + hm;
  return md + " " + hm;
}

module.exports = { peek: peek, save: save, fetch: fetch, fmtAt: fmtAt };
