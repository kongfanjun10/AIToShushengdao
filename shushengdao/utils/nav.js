/**
 * 顶部导航避让工具
 *
 * 小程序使用 navigationStyle: custom 后，右上角就是微信原生「胶囊按钮」的地盘。
 * 页面自己放在右上角的按钮 / 标签如果直接贴边，就会和胶囊重叠。
 *
 * 用法：
 *   const nav = require("../../utils/nav");
 *   onLoad() { this.setData(nav.layout()); }
 *
 * wxml：
 *   <view class="hd-inner" style="height:{{navH}}px;padding-right:{{navRight}}px">
 *   <view class="main" style="padding-top:{{statusBar + navH + 2}}px">
 */

function safeWindowInfo() {
  try {
    return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  } catch (e) {
    return null;
  }
}

function safeCapsule() {
  try {
    const r = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (r && r.width > 0 && r.left > 0) return r;
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * @returns {{statusBar:number, navH:number, navRight:number, windowWidth:number}}
 *  navH      导航条高度（px），与胶囊按钮垂直居中对齐
 *  navRight  右侧需要留白的宽度（px），让内容停在胶囊左边
 */
function layout() {
  const win = safeWindowInfo() || {};
  // 注意：横屏时 statusBarHeight 可能真的是 0，不能用 || 兜底（会把 0 变成 20）
  const statusBar = typeof win.statusBarHeight === "number" ? win.statusBarHeight : 20;
  const windowWidth = win.windowWidth || 375;
  const cap = safeCapsule();

  // 兜底：拿不到胶囊信息时用微信常见的默认值（44px 导航条、右侧不留白）
  let navH = 44;
  let navRight = 0;

  if (cap) {
    const offset = Math.max(0, cap.top - statusBar);
    navH = Math.round(cap.height + offset * 2);
    if (navH < 44) navH = 44;
    if (navH > 64) navH = 64;
    // 胶囊左边缘到屏幕右边缘的距离 + 10px 呼吸位
    navRight = Math.max(0, Math.round(windowWidth - cap.left + 10));
  }

  return { statusBar: statusBar, navH: navH, navRight: navRight, windowWidth: windowWidth };
}

/* ---------------- 布局缓存：消除「切换页签顶部跳一下」 ----------------
 *
 * 页面 data 的默认值原本写死 statusBar:20 / navH:44 / navRight:0，
 * 首帧按这套默认值排版，onLoad 里 setData 成真实值（刘海屏 statusBar 44~54px、
 * navRight 约 100px），于是每次切页签，标题栏和正文都会「先在上、再往下挪」，
 * 看起来就是顶部在飘。
 *
 * 现在改成：app 启动时测一次，结果写进 globalData + 本地缓存；
 * 页面 data 初始化直接读缓存（同步，零延迟），首帧就是最终位置；
 * onLoad 里 sync() 返回同一份缓存，setData 前后没有差异 → 不再跳。
 */
const CACHE_KEY = "wb_nav_layout";
const NEED = ["statusBar", "navH", "navRight"];
let memo = null;
let capSeen = false; // 本轮运行里是否真的读到过胶囊按钮（读不到时 onShow 再补测）

function isLayout(v) {
  return !!v && NEED.every((k) => typeof v[k] === "number" && v[k] >= 0) && v.navH >= 44;
}

function globalData() {
  try {
    return (typeof getApp === "function" && getApp() && getApp().globalData) || null;
  } catch (e) {
    return null;
  }
}

function loadCache() {
  if (memo) return memo;
  const g = globalData();
  if (g && isLayout(g.navLayout)) {
    memo = g.navLayout;
    return memo;
  }
  try {
    const s = wx.getStorageSync(CACHE_KEY);
    if (isLayout(s)) {
      memo = s;
      if (g) g.navLayout = s;
      return memo;
    }
  } catch (e) {}
  return null;
}

/** 页面 data 初始化用：只读缓存（绝不调用测量 API），拿不到才用保守默认值 */
function init() {
  const hit = loadCache();
  if (hit) return hit;
  // 首次安装且 app 还没测到：用能覆盖大多数机型的保守值，减少首帧偏差
  return { statusBar: 20, navH: 44, navRight: 96, windowWidth: 375 };
}

/**
 * onLoad 用：有缓存直接返回（首帧不再跳动）；
 * 缓存缺失或屏幕宽度变了（横竖屏切换）才重新测量。
 */
function sync() {
  const hit = loadCache();
  const win = safeWindowInfo() || {};
  if (hit && (!win.windowWidth || Math.abs(win.windowWidth - (hit.windowWidth || win.windowWidth)) <= 2)) {
    return hit;
  }
  return measure();
}

/** 测量一次并写入缓存（app 启动、或缓存缺失时调用） */
function measure() {
  const old = loadCache();
  const v = layout();
  const cap = safeCapsule();
  if (cap) capSeen = true;
  // 胶囊信息没拿到时，保留上次的 navH/navRight，只用新的 statusBar，避免把好数据覆盖成默认值
  if (!cap) {
    v.navH = old ? old.navH : 44;
    v.navRight = old ? old.navRight : 96; // 96 ≈ 375 宽屏幕胶囊左边距，先保住不压胶囊
  }
  memo = v;
  const g = globalData();
  if (g) g.navLayout = v;
  try {
    wx.setStorageSync(CACHE_KEY, v);
  } catch (e) {}
  return v;
}

/** 胶囊信息在启动瞬间可能还拿不到：等第一次 onShow 再补测一次（只更新缓存，不影响已渲染页面） */
function refreshIfDefault() {
  if (capSeen) return loadCache() || measure();
  return measure();
}

module.exports = {
  layout: layout,
  init: init,
  sync: sync,
  measure: measure,
  refreshIfDefault: refreshIfDefault,
};
