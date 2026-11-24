/**
 * utils/notify.js — 消息中心数据层（本地存储）
 * 用途：首页右上角铃铛的消息中心。三类消息源：
 *  1) 勋章解锁（home onShow 时 diff，首次只记录不推送）
 *  2) 连续打卡里程碑（3/7/14/30/60/100 天）
 *  3) 留言被回复（feedback.js 拉到带回复的「我的留言」时）
 * 结构：[{ id, icon, title, text, at, read, go }]
 *  go: { url, label }  点消息跳转目标（可选）
 */
const KEY = "wb_notify_v1";
const SEEN_BADGE_KEY = "wb_notify_badge_seen";
const SEEN_STREAK_KEY = "wb_notify_streak_seen";
const SEEN_REPLY_KEY = "wb_notify_reply_seen";
const MAX_KEEP = 50;
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function read() {
  try {
    const arr = wx.getStorageSync(KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function write(arr) {
  try {
    wx.setStorageSync(KEY, arr.slice(0, MAX_KEEP));
  } catch (e) {}
}

function uid() {
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 同标题+正文当天只保留一条（防重复打扰） */
function isDup(arr, title, text) {
  const today = new Date().toDateString();
  return arr.some((n) => {
    if (n.title !== title || n.text !== text) return false;
    try {
      return new Date(n.at).toDateString() === today;
    } catch (e) {
      return false;
    }
  });
}

/** 推送一条消息；返回是否真的新增 */
function push(payload) {
  const icon = payload.icon || "🔔";
  const title = String(payload.title || "").slice(0, 16);
  const text = String(payload.text || "").slice(0, 60);
  if (!title) return false;
  const arr = read();
  if (isDup(arr, title, text)) return false;
  arr.unshift({
    id: uid(),
    icon: icon,
    title: title,
    text: text,
    at: Date.now(),
    read: false,
    go: payload.go || null,
  });
  write(arr);
  return true;
}

function list() {
  return read();
}

function unreadCount() {
  return read().filter((n) => !n.read).length;
}

function markAllRead() {
  const arr = read().map((n) => Object.assign({}, n, { read: true }));
  write(arr);
}

function markRead(id) {
  const arr = read().map((n) => (n.id === id ? Object.assign({}, n, { read: true }) : n));
  write(arr);
}

/** 相对时间：今天 HH:mm / 昨天 / M月D日 */
function timeText(at) {
  const d = new Date(at);
  const now = new Date();
  const hm = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return "今天 " + hm;
  if (new Date(now.getTime() - 86400e3).toDateString() === d.toDateString()) return "昨天";
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

/* ---------------- 消息源：勋章解锁 ---------------- */
function seenBadges() {
  try {
    const arr = wx.getStorageSync(SEEN_BADGE_KEY);
    return Array.isArray(arr) ? arr : null; // null = 首次
  } catch (e) {
    return null;
  }
}

/**
 * 检查勋章解锁并推送。unlocked: [{key,name,desc}]
 * 首次调用只记录基线不推送（避免老用户一次收到一堆历史勋章）。
 * 返回新增消息数。
 */
function syncBadges(unlocked) {
  const keys = (unlocked || []).map((b) => b.key);
  const seen = seenBadges();
  try {
    wx.setStorageSync(SEEN_BADGE_KEY, keys);
  } catch (e) {}
  if (seen === null) return 0; // 首次：只建基线
  let added = 0;
  (unlocked || []).forEach((b) => {
    if (seen.indexOf(b.key) === -1) {
      if (push({ icon: "🏅", title: "解锁新勋章", text: "『" + b.name + "』已点亮！" + (b.desc || ""), go: { url: "/pages/archive/archive", label: "看勋章墙" } })) added++;
    }
  });
  return added;
}

/* ---------------- 消息源：打卡里程碑 ---------------- */
function seenStreak() {
  try {
    const arr = wx.getStorageSync(SEEN_STREAK_KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/** streak: 当前连续天数；达到里程碑时推送（每个里程碑只推一次） */
function syncStreak(streak) {
  if (!streak || streak <= 0) return 0;
  const seen = seenStreak();
  let added = 0;
  STREAK_MILESTONES.forEach((m) => {
    if (streak >= m && seen.indexOf(m) === -1) {
      if (push({ icon: "🔥", title: "连续打卡 " + m + " 天", text: "坚持了 " + m + " 天朗读，越来越棒啦，继续保持！", go: { url: "/pages/archive/archive", label: "看打卡记录" } })) added++;
      seen.push(m);
    }
  });
  if (added) {
    try {
      wx.setStorageSync(SEEN_STREAK_KEY, seen);
    } catch (e2) {}
  }
  return added;
}

/* ---------------- 消息源：留言被回复 ---------------- */
function seenReplies() {
  try {
    const arr = wx.getStorageSync(SEEN_REPLY_KEY);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

/**
 * feedback 列表拉取后调用。mineReplied: [{id, reply}]
 * 只推「我的留言」且有回复的；每条只推一次。
 */
function syncFeedbackReplies(mineReplied) {
  const seen = seenReplies();
  let added = 0;
  (mineReplied || []).forEach((item) => {
    if (seen.indexOf(item.id) === -1) {
      const excerpt = String(item.reply || "").slice(0, 24);
      if (push({ icon: "💬", title: "留言有回复啦", text: "岛主回复：" + excerpt + (String(item.reply || "").length > 24 ? "…" : ""), go: { url: "/pages/feedback/feedback", label: "去查看" } })) added++;
      seen.push(item.id);
    }
  });
  if (added) {
    try {
      wx.setStorageSync(SEEN_REPLY_KEY, seen);
    } catch (e2) {}
  }
  return added;
}

module.exports = {
  push: push,
  list: list,
  unreadCount: unreadCount,
  markAllRead: markAllRead,
  markRead: markRead,
  timeText: timeText,
  syncBadges: syncBadges,
  syncStreak: syncStreak,
  syncFeedbackReplies: syncFeedbackReplies,
};
