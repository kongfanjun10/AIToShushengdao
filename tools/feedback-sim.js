/**
 * 留言板页逻辑仿真（Node 环境）
 * 运行：node tools/feedback-sim.js
 * 覆盖：云未开通降级、列表拉取与装饰、缓存兜底、分类切换、输入计数、
 *       提交校验与参数、失败提示、管理口令保存、回复/删除参数与失败提示、时间格式化
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

/* ---------------- wx mock ---------------- */
let storage = {};
let toasts = [];
let loadingShown = 0;
let modalQueue = []; // 每次 showModal 弹出的预设回应
let cloudCalls = []; // 记录云函数调用
let cloudHandler = null; // (data) => result | {fail: errMsg}

global.wx = {
  _s: {},
  getStorageSync(k) {
    return this._s[k] !== undefined ? this._s[k] : "";
  },
  setStorageSync(k, v) {
    this._s[k] = v;
  },
  removeStorageSync(k) {
    delete this._s[k];
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast(o) {
    toasts.push((o && o.title) || "");
  },
  showModal(o) {
    const resp = modalQueue.shift() || { confirm: false };
    setTimeout(() => o.success && o.success(resp), 0);
  },
  showLoading() {
    loadingShown++;
  },
  hideLoading() {},
  navigateTo() {},
  redirectTo() {},
  navigateBack() {},
  nextTick: (cb) => setTimeout(cb, 0),
  cloud: {
    init() {},
    callFunction(opt) {
      const data = opt.data || {};
      cloudCalls.push(data);
      const r = cloudHandler ? cloudHandler(data) : { ok: true };
      setTimeout(() => {
        if (r && r.__fail) opt.fail && opt.fail({ errMsg: r.__fail });
        else opt.success && opt.success({ result: r });
      }, 0);
    },
  },
};

/* ---------------- 载入页面 ---------------- */
const page = (() => {
  require(path.join(ROOT, "pages", "feedback", "feedback.js"));
  const def = captured;
  const p = Object.assign({}, def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = p.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        p.data[k] = obj[k];
      }
    });
  };
  return p;
})();

const fb = require(path.join(ROOT, "utils", "feedback.js"));

let pass = 0;
let failCount = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    failCount++;
    console.log("  FAIL " + name);
  }
}
function reset() {
  toasts = [];
  loadingShown = 0;
  cloudCalls = [];
  modalQueue = [];
  cloudHandler = null;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  console.log("== 留言板仿真 ==");

  /* 1. 云未开通：wx.cloud 不存在 → cloudOk=false，不崩 */
  reset();
  const cloudBak = wx.cloud;
  delete wx.cloud;
  page.onLoad.call(page, {});
  await tick();
  ok("云未开通降级提示", page.data.cloudOk === false && page.data.loading === false && !page.data.loadErr);
  wx.cloud = cloudBak;

  /* 2. 正常拉取：3 条留言 + 装饰字段 + 缓存写入 */
  reset();
  cloudHandler = () => ({
    ok: true,
    pending: 2,
    list: [
      { id: "a", category: "feature", content: "想要乘法", contact: "", createdAt: Date.now(), reply: "安排", repliedAt: Date.now(), mine: false },
      { id: "b", category: "bug", content: "口型图不显示", contact: "", createdAt: Date.now() - 86400e3, reply: "", repliedAt: 0, mine: true },
    ],
  });
  page.onLoad.call(page, {});
  await tick();
  ok("列表拉取（角标按列表算：1 条已回复不再计入）", page.data.loading === false && page.data.total === 2 && page.data.pending === 1, "pending=" + page.data.pending);
  ok("装饰字段", page.data.list[0].catName === "新功能" && page.data.list[0].no === 1 && !!page.data.list[0].timeText);
  ok("我的留言标记", page.data.list[1].mine === true);
  ok("缓存写入", (wx.getStorageSync("wb_feedback_cache").list || []).length === 2);

  reset();
  cloudHandler = () => ({ ok: true, list: [{ id: "a", category: "bug", content: "x", createdAt: Date.now(), reply: "安排", repliedAt: Date.now() }] });
  page.load();
  await tick();
  ok("全部回复后角标归零", page.data.pending === 0, "pending=" + page.data.pending);

  /* 3. 拉取失败 → 缓存兜底 + 错误提示 */
  reset();
  cloudHandler = () => ({ __fail: "网络开小差" });
  page.load();
  await tick();
  ok("失败走缓存兜底", page.data.list.length >= 1 && page.data.loadErr.indexOf("网络") > -1, String(page.data.list.length));

  /* 4. 分类切换 + 输入计数 */
  reset();
  page.pickCat({ currentTarget: { dataset: { key: "bug" } } });
  ok("分类切换", page.data.catKey === "bug");
  page.onInput({ detail: { value: "a好👍" } });
  ok("输入计数按字符", page.data.draftCount === 3);

  /* 5. 提交校验：太短不发请求 */
  page.onInput({ detail: { value: " 好 " } });
  page.submit();
  await tick();
  ok("太短不发请求", cloudCalls.length === 0 && toasts.length === 1);

  /* 6. 正常提交：参数正确、清空草稿、自动刷新 */
  page.onInput({ detail: { value: "希望增加练习导出" } });
  page.onContactInput({ detail: { value: "  wx_123 " } });
  cloudHandler = (d) => (d.action === "add" ? { ok: true, id: "n1" } : { ok: true, pending: 1, list: [] });
  page.submit();
  await tick();
  await tick();
  const addCall = cloudCalls.find((c) => c.action === "add");
  ok("提交参数", !!addCall && addCall.category === "bug" && addCall.content === "希望增加练习导出" && addCall.contact === "wx_123");
  ok("提交后清空并刷新", page.data.draft === "" && page.data.sending === false);

  /* 7. 提交失败提示 */
  reset();
  page.onInput({ detail: { value: "再来一条" } });
  cloudHandler = () => ({ ok: false, errMsg: "内容太短啦" });
  page.submit();
  await tick();
  ok("提交失败提示", toasts.indexOf("内容太短啦") > -1 && page.data.sending === false);

  /* 8. 管理口令：首次弹窗输入（先不落盘，等云端确认通过才存） */
  reset();
  page.data.isAdmin = true;
  page.data.adminUnlocked = false;
  page._adminKey = "";
  wx.removeStorageSync("wb_feedback_admin_key");
  modalQueue.push({ confirm: true, content: " k1 " });
  let gotKey = "";
  page.ensureAdminKey().then((k) => (gotKey = k));
  await tick();
  await tick();
  ok("口令弹窗输入", gotKey === "k1" && page.data.adminUnlocked === true);
  ok("未验证前不落盘", fb.getAdminKey() === "", fb.getAdminKey());

  /* 9. 回复：参数带口令，成功后刷新并落盘 */
  reset();
  cloudHandler = (d) => (d.action === "reply" ? { ok: true } : { ok: true, pending: 0, list: [] });
  page.data.list = page.decorate([{ id: "a", category: "bug", content: "x", createdAt: Date.now(), reply: "", repliedAt: 0 }]);
  modalQueue.push({ confirm: true, content: "收到，已排期！" });
  page.tapReply({ currentTarget: { dataset: { id: "a" } } });
  await tick();
  await tick();
  await tick();
  const replyCall = cloudCalls.find((c) => c.action === "reply");
  ok("回复参数", !!replyCall && replyCall.id === "a" && replyCall.reply === "收到，已排期！" && replyCall.adminKey === "k1");
  ok("回复成功后口令落盘", fb.getAdminKey() === "k1", fb.getAdminKey());
  ok("回复后清掉 busy 状态", page.data.replyingId === "", page.data.replyingId);
  ok("回复全程没有遮罩 loading（不会卡页面）", loadingShown === 0, loadingShown);

  /* 10. 口令失效：清掉旧口令 → 弹窗重输 → 自动重试成功 */
  reset();
  page.data.list = page.decorate([{ id: "a", category: "bug", content: "x", createdAt: Date.now(), reply: "", repliedAt: 0 }]);
  let firstTry = true;
  cloudHandler = (d) => {
    if (d.action !== "reply") return { ok: true, pending: 0, list: [] };
    if (firstTry && d.adminKey === "k1") {
      firstTry = false;
      return { ok: false, code: "BAD_KEY", errMsg: "管理口令不对" };
    }
    return { ok: true };
  };
  modalQueue.push({ confirm: true, content: "再回一条" }); // 回复内容
  modalQueue.push({ confirm: true, content: "Jason-ssd-admin" }); // 新口令
  page.tapReply({ currentTarget: { dataset: { id: "a" } } });
  for (let i = 0; i < 6; i++) await tick();
  const retried = cloudCalls.filter((c) => c.action === "reply");
  ok("口令失效后自动重试", retried.length === 2 && retried[1].adminKey === "Jason-ssd-admin", retried);
  ok("失效口令被清掉并换新", fb.getAdminKey() === "Jason-ssd-admin", fb.getAdminKey());
  ok("重试成功给出成功提示", toasts.indexOf("回复已发布") > -1, toasts);
  ok("失败场景也不留 busy", page.data.replyingId === "", page.data.replyingId);

  /* 10b. 重输还错：明确提示，且不再死循环 */
  reset();
  page.data.list = page.decorate([{ id: "a", category: "bug", content: "x", createdAt: Date.now(), reply: "", repliedAt: 0 }]);
  cloudHandler = () => ({ ok: false, code: "BAD_KEY", errMsg: "管理口令不对" });
  modalQueue.push({ confirm: true, content: "再试一次" });
  modalQueue.push({ confirm: true, content: "还是错的" });
  page.tapReply({ currentTarget: { dataset: { id: "a" } } });
  for (let i = 0; i < 6; i++) await tick();
  ok("重输仍错时提示「管理口令不对」", toasts.indexOf("管理口令不对") > -1, toasts);
  ok("只重试一次不递归", cloudCalls.filter((c) => c.action === "reply").length === 2, cloudCalls.length);
  ok("口令错误后回到未解锁态", page.data.adminUnlocked === false);

  /* 10c. 取消口令输入：不动列表、不发请求 */
  reset();
  fb.clearAdminKey();
  page._adminKey = "";
  page.data.adminUnlocked = false;
  modalQueue.push({ confirm: false });
  page.tapReply({ currentTarget: { dataset: { id: "a" } } });
  await tick();
  await tick();
  ok("取消输入口令不发请求", cloudCalls.filter((c) => c.action === "reply").length === 0, cloudCalls);

  /* 11. 删除：确认后调用 remove */
  reset();
  fb.saveAdminKey("k1");
  page._adminKey = "k1";
  page.data.adminUnlocked = true;
  cloudHandler = (d) => (d.action === "remove" ? { ok: true } : { ok: true, pending: 0, list: [] });
  modalQueue.push({ confirm: true });
  page.tapRemove({ currentTarget: { dataset: { id: "a" } } });
  await tick();
  await tick();
  await tick();
  ok("删除调用", cloudCalls.some((c) => c.action === "remove" && c.id === "a" && c.adminKey === "k1"));
  ok("删除后清掉 busy 状态", page.data.deletingId === "", page.data.deletingId);

  /* 12. 时间格式化：今天 / 昨天 / 日期 */
  const d = new Date();
  const sameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 5).getTime();
  const yest = sameDay - 86400e3;
  const old = new Date(2026, 10, 3, 8, 0).getTime();
  ok("fmtTime 今天", fb.fmtTime(sameDay).indexOf("今天") === 0);
  ok("fmtTime 昨天", fb.fmtTime(yest).indexOf("昨天") === 0);
  ok("fmtTime 日期", fb.fmtTime(old).indexOf("11月3日") === 0);

  /* 13. 管理员回复自己的留言 → 不推「留言有回复」通知（replyMine 过滤） */
  const notify = require(path.join(ROOT, "utils", "notify.js"));
  wx.removeStorageSync("wb_notify_reply_seen");
  const beforeUnread = notify.unreadCount();
  // 别人的留言被回复 → 推
  page.decorate([{ id: "n1", category: "bug", content: "x", createdAt: Date.now(), reply: "收到啦", repliedAt: 1, mine: true, replyMine: false }]);
  ok("别人回我的留言 → 推通知", notify.unreadCount() === beforeUnread + 1, String(notify.unreadCount()));
  // 我自己回复我的留言 → 不推
  const mid = notify.unreadCount();
  page.decorate([{ id: "n2", category: "bug", content: "x", createdAt: Date.now(), reply: "我自己回的", repliedAt: 1, mine: true, replyMine: true }]);
  ok("管理员回复自己的留言 → 不推通知", notify.unreadCount() === mid, String(notify.unreadCount()));
  // 老数据没有 replyMine 字段（replyOpenid 未记录的历史回复）→ 保持原行为照常推
  page.decorate([{ id: "n3", category: "bug", content: "x", createdAt: Date.now(), reply: "旧回复", repliedAt: 1, mine: true }]);
  ok("老数据无 replyMine → 照常推", notify.unreadCount() === mid + 1, String(notify.unreadCount()));

  console.log("\n结果：" + pass + " PASS，" + failCount + " FAIL");
  process.exit(failCount ? 1 : 0);
})();
