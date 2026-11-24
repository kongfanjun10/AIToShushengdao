/**
 * 奖状海报上的小程序码（推广用）
 *
 * 链路：云函数 qrcode（wxacode.getUnlimited）→ 云存储 fileID → downloadFile → 拷到本地缓存 → canvas 画图
 * 兜底：云开发没开通 / 云函数没部署 / 小程序还没发布时，静默返回 ""，海报画成「微信搜索」文字块，
 *       保证「保存奖状海报到相册」这个动作永远能成功。
 *
 * 缓存策略：本地文件 + storage 里记 fileID/时间，30 天内复用同一张码，避免频繁调用接口。
 */
const config = require("../config/index");

const cfg = config.poster || {};
const CACHE_KEY = "wb_qr_poster_v1";
const TTL = 30 * 86400e3;

let cloudReady = false;

function available() {
  return typeof wx !== "undefined" && !!wx.cloud;
}

function ensureCloud() {
  if (!available()) return false;
  if (cloudReady) return true;
  try {
    wx.cloud.init({ env: cfg.cloudEnv || undefined, traceUser: true });
    cloudReady = true;
    return true;
  } catch (e) {
    return false;
  }
}

function userRoot() {
  return (wx.env && wx.env.USER_DATA_PATH) || "wxfile://usr";
}

function destPath() {
  return userRoot() + "/qr_poster.png";
}

function exists(p) {
  if (!p) return false;
  try {
    wx.getFileSystemManager().accessSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function readCache() {
  try {
    const c = wx.getStorageSync(CACHE_KEY);
    if (c && c.path && c.at && Date.now() - c.at < TTL && exists(c.path)) return c.path;
  } catch (e) {}
  return "";
}

/** 临时文件会被系统清理，拷一份到 USER_DATA_PATH 再缓存 */
function keepLocal(tempFilePath) {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || !fs.copyFile) {
      resolve(tempFilePath);
      return;
    }
    fs.copyFile({
      srcPath: tempFilePath,
      destPath: destPath(),
      success: () => resolve(destPath()),
      fail: () => resolve(tempFilePath),
    });
  });
}

function fromCloud(force) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: cfg.cloudFunction || "qrcode",
      data: {
        page: cfg.page || "pages/home/home",
        scene: cfg.scene || "poster",
        refresh: !!force,
      },
      success: (res) => {
        const r = (res && res.result) || {};
        if (!r.ok || !r.fileID) {
          resolve("");
          return;
        }
        wx.cloud.downloadFile({
          fileID: r.fileID,
          success: (d) => resolve((d && d.tempFilePath) || ""),
          fail: () => resolve(""),
        });
      },
      fail: () => resolve(""),
    });
  });
}

/**
 * 取小程序码本地路径（永不会 reject）
 * @param {boolean} force 忽略本地缓存重新向云端要一张（改了页面/场景时用）
 * @returns {Promise<string>} 本地图片路径；拿不到返回 ""
 */
function get(force) {
  if (!ensureCloud()) return Promise.resolve("");
  if (!force) {
    const hit = readCache();
    if (hit) return Promise.resolve(hit);
  }
  return fromCloud(force).then((tmp) => {
    if (!tmp) return "";
    return keepLocal(tmp).then((p) => {
      try {
        wx.setStorageSync(CACHE_KEY, { path: p, at: Date.now() });
      } catch (e) {}
      return p;
    });
  });
}

/** 清掉本地缓存（换码/调试用） */
function clear() {
  try {
    wx.removeStorageSync(CACHE_KEY);
  } catch (e) {}
  try {
    if (exists(destPath())) wx.getFileSystemManager().unlinkSync(destPath());
  } catch (e) {}
}

module.exports = {
  available: available,
  get: get,
  clear: clear,
  size: cfg.size || 148,
};
