/**
 * 轻量事件总线：让「孩子资料」改动（昵称/头像等）实时广播到已打开的页面。
 *
 * 场景：家长中心改完昵称/照片后，成长档案、首页等已经打开的页面
 * 不用等 onShow、也不用重新进入，立刻跟着更新。
 *
 * 用法：
 *   const bus = require("../../utils/bus");
 *   onLoad() { this._offUser = bus.on("user", () => this.syncProfile()); }
 *   onUnload() { this._offUser && this._offUser(); }
 */

const listeners = {};

/** 订阅：返回取消订阅函数 */
function on(event, fn) {
  if (typeof fn !== "function") return function () {};
  (listeners[event] = listeners[event] || []).push(fn);
  return function () {
    off(event, fn);
  };
}

function off(event, fn) {
  const arr = listeners[event];
  if (!arr) return;
  const i = arr.indexOf(fn);
  if (i > -1) arr.splice(i, 1);
}

/** 广播：同一个事件不允许嵌套触发（监听器里又改数据时不会递归广播） */
let emitting = {};
function emit(event, payload) {
  if (emitting[event]) return;
  emitting[event] = true;
  try {
    const arr = listeners[event];
    if (!arr) return;
    arr.slice().forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        /* 单个页面刷新失败不影响其它页面 */
      }
    });
  } finally {
    emitting[event] = false;
  }
}

module.exports = { on: on, off: off, emit: emit };
