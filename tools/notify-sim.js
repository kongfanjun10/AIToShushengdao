/**
 * 消息中心仿真：push/去重/未读/已读、勋章 diff（首次静默）、打卡里程碑、留言回复
 * 用法：node tools/notify-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let failCount = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    failCount++;
    console.log("  ✗ FAIL " + name + (extra !== undefined ? " => " + JSON.stringify(extra) : ""));
  }
}

const storage = {};
global.wx = {
  getStorageSync: (k) => (k in storage ? storage[k] : ""),
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
};

const notify = require(path.join(ROOT, "utils", "notify.js"));

(() => {
  console.log("== 消息中心仿真 ==");

  /* 1. push 与未读 */
  ok("空列表", notify.list().length === 0 && notify.unreadCount() === 0);
  ok("push 新增", notify.push({ icon: "🏅", title: "解锁新勋章", text: "『初次开口』已点亮！" }) === true);
  ok("未读 +1", notify.unreadCount() === 1);
  ok("同内容当天去重", notify.push({ title: "解锁新勋章", text: "『初次开口』已点亮！" }) === false);
  ok("去重后仍 1 条", notify.list().length === 1);
  ok("超长截断", notify.push({ title: "超长标题".repeat(6), text: "x".repeat(100) }) === true && notify.list()[0].title.length <= 16 && notify.list()[0].text.length <= 60);

  /* 2. 已读 */
  notify.markAllRead();
  ok("全部已读", notify.unreadCount() === 0 && notify.list().every((n) => n.read));
  notify.push({ title: "第二条", text: "b" });
  const first = notify.list().find((n) => n.title === "第二条");
  notify.markRead(first.id);
  ok("单条已读", notify.unreadCount() === 0);

  /* 3. 时间文案 */
  const now = Date.now();
  ok("今天 HH:mm", /^今天 \d{1,2}:\d{2}$/.test(notify.timeText(now)), notify.timeText(now));
  ok("昨天", notify.timeText(now - 86400e3 - 3600e3) === "昨天");
  ok("日期", /^\d+月\d+日$/.test(notify.timeText(new Date(2026, 0, 5).getTime())));

  /* 4. 勋章 diff：首次静默建基线 */
  Object.keys(storage).forEach((k) => delete storage[k]);
  ok("首次勋章只建基线", notify.syncBadges([{ key: "first", name: "初次开口", desc: "完成第 1 句朗读" }]) === 0 && notify.list().length === 0);
  /* 5. 二次新增勋章 → 推送 */
  ok("新增勋章推送", notify.syncBadges([{ key: "first", name: "初次开口", desc: "" }, { key: "streak3", name: "坚持三日", desc: "连续打卡 3 天" }]) === 1);
  ok("勋章消息内容", notify.list()[0].title === "解锁新勋章" && notify.list()[0].text.indexOf("坚持三日") > -1, notify.list()[0]);
  ok("重复同步不推", notify.syncBadges([{ key: "first", name: "初次开口", desc: "" }, { key: "streak3", name: "坚持三日", desc: "连续打卡 3 天" }]) === 0);

  /* 6. 打卡里程碑 */
  ok("streak 2 天无里程碑", notify.syncStreak(2) === 0);
  ok("streak 3 天推 1 条", notify.syncStreak(3) === 1 && notify.list()[0].title === "连续打卡 3 天");
  ok("streak 8 天补 7 天里程碑", notify.syncStreak(8) === 1 && notify.list()[0].title === "连续打卡 7 天");
  ok("streak 8 天再来不推", notify.syncStreak(8) === 0);
  ok("streak 0 不推", notify.syncStreak(0) === 0);

  /* 7. 留言回复 */
  ok("留言回复推送", notify.syncFeedbackReplies([{ id: "f1", reply: "好的，下个版本加上！" }]) === 1);
  ok("回复消息内容", notify.list()[0].icon === "💬" && notify.list()[0].text.indexOf("下个版本") > -1, notify.list()[0]);
  ok("同一条不重复推", notify.syncFeedbackReplies([{ id: "f1", reply: "好的，下个版本加上！" }]) === 0);
  ok("第二条回复再推", notify.syncFeedbackReplies([{ id: "f2", reply: "收到，已记录" }]) === 1);

  /* 8. 上限保留 */
  for (let i = 0; i < 60; i++) notify.push({ title: "m" + i, text: "t" + i });
  ok("最多保留 50 条", notify.list().length === 50, notify.list().length);

  console.log("\n结果：" + pass + " PASS，" + failCount + " FAIL");
  process.exit(failCount ? 1 : 0);
})();
