const app = getApp();
const nav = require("../../utils/nav");
const fb = require("../../utils/feedback");
const notify = require("../../utils/notify");

const CATS = [
  { key: "feature", name: "新功能", icon: "💡" },
  { key: "improve", name: "优化建议", icon: "🛠️" },
  { key: "bug", name: "问题反馈", icon: "🐌" },
];
const CAT_NAME = { feature: "新功能", improve: "优化建议", bug: "问题反馈" };
const CAT_COLOR = {
  feature: { bg: "#ecfdf5", color: "#007650" },
  improve: { bg: "#e0f2fe", color: "#0369a1" },
  bug: { bg: "#fff7ed", color: "#c2410c" },
};

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    isAdmin: false,
    adminUnlocked: false,
    pending: 0,
    // 表单
    cats: CATS,
    catKey: "feature",
    draft: "",
    draftCount: 0,
    maxLen: 500,
    contact: "",
    sending: false,
    // 列表
    list: [],
    total: 0,
    loading: true,
    loadErr: "",
    cloudOk: true,
    // 管理员操作中的行（用页面状态代替 showLoading 遮罩，避免遮罩卡住页面）
    replyingId: "",
    deletingId: "",
  },

  onLoad(options) {
    this.setData(nav.sync());
    const isAdmin = !!(options && options.admin === "1");
    this.setData({ isAdmin: isAdmin, adminUnlocked: isAdmin && !!fb.getAdminKey() });
    this.load();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  /* ---------------- 数据 ---------------- */
  load() {
    if (!fb.available()) {
      this.setData({ cloudOk: false, loading: false, loadErr: "" });
      return;
    }
    this.setData({ loading: true, loadErr: "" });
    fb.fetchList()
      .then((r) => {
        const list = r.list || [];
        this.setData({
          loading: false,
          cloudOk: true,
          list: this.decorate(list),
          total: list.length,
          // 角标按列表算：回复过的立即归零，不等云端另一个统计口径
          pending: list.filter((d) => !String(d.reply || "").trim()).length,
        });
      })
      .catch((err) => {
        const c = fb.cachedList();
        this.setData({
          loading: false,
          cloudOk: true,
          loadErr: (err && err.errMsg) || "留言加载失败",
          list: c ? this.decorate(c.list) : [],
          total: c ? c.list.length : 0,
          pending: c ? c.pending || 0 : 0,
        });
      });
  },

  decorate(list) {
    const arr = list.map((d, i) => {
      const c = CAT_COLOR[d.category] || CAT_COLOR.improve;
      return Object.assign({}, d, {
        no: i + 1,
        catName: CAT_NAME[d.category] || "优化建议",
        catBg: c.bg,
        catColor: c.color,
        timeText: fb.fmtTime(d.createdAt),
        replyTimeText: d.repliedAt ? fb.fmtTime(d.repliedAt) : "",
      });
    });
    // 「我的留言」有回复时给铃铛消息中心推一条（每条只推一次）；
    // 管理员回复自己的留言（replyMine）不算「被回复」，不推
    const mineReplied = arr
      .filter((d) => d.mine && d.reply && !d.replyMine)
      .map((d) => ({ id: d.id, reply: d.reply }));
    if (mineReplied.length) notify.syncFeedbackReplies(mineReplied);
    return arr;
  },

  retry() {
    this.load();
  },

  /* ---------------- 写留言 ---------------- */
  pickCat(e) {
    this.setData({ catKey: e.currentTarget.dataset.key });
  },

  onInput(e) {
    const v = String((e.detail && e.detail.value) || "");
    this.setData({ draft: v, draftCount: Array.from(v).length });
  },

  onContactInput(e) {
    this.setData({ contact: String((e.detail && e.detail.value) || "") });
  },

  submit() {
    if (this.data.sending) return;
    const content = this.data.draft.trim();
    if (content.length < 2) {
      wx.showToast({ title: "多写几个字吧，哪怕一句话", icon: "none" });
      return;
    }
    this.setData({ sending: true });
    fb.call("add", { category: this.data.catKey, content: content, contact: this.data.contact.trim() })
      .then(() => {
        this.setData({ sending: false, draft: "", draftCount: 0, contact: "" });
        wx.showToast({ title: "已收到，感谢你的建议！", icon: "success" });
        this.load();
      })
      .catch((err) => {
        this.setData({ sending: false });
        wx.showToast({ title: (err && err.errMsg) || "发送失败，稍后再试", icon: "none" });
      });
  },

  /* ---------------- 管理员：回复 / 删除 ---------------- */

  /** 安全兜底：万一上一轮操作被异常中断，回到页面时清掉 busy 状态，页面不会「卡住」 */
  onShow() {
    if (this.data.replyingId || this.data.deletingId) {
      this.setData({ replyingId: "", deletingId: "" });
    }
  },

  /**
   * 弹窗输入口令（只返回，不落盘）
   * @returns {Promise<string>} 空字符串 = 用户取消
   */
  askKey(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title: title || "输入管理口令",
        content: content || "",
        editable: true,
        placeholderText: "云函数 feedback 里的 ADMIN_KEY",
        confirmText: "确定",
        cancelText: "取消",
        success: (res) => resolve(res && res.confirm ? String(res.content || "").trim() : ""),
        fail: () => resolve(""),
      });
    });
  },

  /** 取可用口令：内存里有就直接用，其次看本地，都没有才问 */
  ensureAdminKey() {
    const saved = this._adminKey || fb.getAdminKey();
    if (saved) {
      this._adminKey = saved;
      this.setData({ adminUnlocked: true });
      return Promise.resolve(saved);
    }
    return this.askKey().then((key) => {
      if (!key) return "";
      this._adminKey = key;
      this.setData({ adminUnlocked: true });
      return key;
    });
  },

  /**
   * 带口令调用管理员接口。
   * 口令通过后才写入本地（输错不会被记住）；云端返回 BAD_KEY 时自动清掉旧口令、
   * 请用户重新输入一次并把刚才的操作重试，不会让页面停在半路。
   */
  adminCall(action, data, retried) {
    const key = this._adminKey || fb.getAdminKey();
    if (!key) return Promise.reject({ code: "NO_KEY", errMsg: "还没有输入管理口令" });
    return fb
      .call(action, Object.assign({}, data || {}, { adminKey: key }))
      .then((r) => {
        fb.saveAdminKey(key);
        this._adminKey = key;
        this.setData({ adminUnlocked: true });
        return r;
      })
      .catch((err) => {
        if (err && err.code === "BAD_KEY") {
          // 口令失效：先彻底清掉，避免下次还拿错口令去撞
          fb.clearAdminKey();
          this._adminKey = "";
          this.setData({ adminUnlocked: false });
          if (!retried) {
            return this.askKey(
              "管理口令已失效",
              "云端口令可能改过了，重新输入一次就好，刚才的操作会接着完成。"
            ).then((k) => {
              if (!k) return Promise.reject({ code: "BAD_KEY", errMsg: "管理口令不对" });
              this._adminKey = k;
              this.setData({ adminUnlocked: true });
              return this.adminCall(action, data, true);
            });
          }
        }
        return Promise.reject(err);
      });
  },

  toastErr(err, fallback) {
    const code = err && err.code;
    const map = {
      BAD_KEY: "管理口令不对",
      NO_KEY: "请先输入管理口令",
      NO_CLOUD: "云开发未开通",
      NET_FAIL: "网络异常，稍后再试",
    };
    wx.showToast({ title: map[code] || (err && err.errMsg) || fallback, icon: "none" });
  },

  /** 弹窗填写回复内容 @returns {Promise<string>} */
  askReply(item) {
    return new Promise((resolve) => {
      wx.showModal({
        title: item.reply ? "修改这条回复" : "回复这条留言",
        content: item.reply || "",
        editable: true,
        placeholderText: "回复会公开显示在留言板",
        confirmText: "发布回复",
        success: (res) => {
          if (!res || !res.confirm) {
            resolve("");
            return;
          }
          const reply = String(res.content || "").trim();
          if (!reply) {
            wx.showToast({ title: "回复内容不能为空", icon: "none" });
            resolve("");
            return;
          }
          resolve(reply);
        },
        fail: () => resolve(""),
      });
    });
  },

  tapReply(e) {
    if (this.data.replyingId) return;
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.filter((d) => d.id === id)[0];
    if (!item) return;
    this.ensureAdminKey()
      .then((key) => (key ? this.askReply(item) : ""))
      .then((reply) => {
        if (!reply) return null;
        this.setData({ replyingId: id });
        return this.adminCall("reply", { id: id, reply: reply })
          .then(() => {
            this.setData({ replyingId: "" });
            wx.showToast({ title: "回复已发布", icon: "success" });
            this.load();
          })
          .catch((err) => {
            this.setData({ replyingId: "" });
            this.toastErr(err, "回复失败");
          });
      })
      .catch(() => {});
  },

  tapRemove(e) {
    if (this.data.deletingId) return;
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "删除留言",
      content: "删除后无法恢复，确定继续吗？",
      confirmText: "删除",
      confirmColor: "#f97316",
      success: (res) => {
        if (!res.confirm) return;
        this.ensureAdminKey()
          .then((key) => {
            if (!key) return null;
            this.setData({ deletingId: id });
            return this.adminCall("remove", { id: id })
              .then(() => {
                this.setData({ deletingId: "" });
                wx.showToast({ title: "已删除", icon: "success" });
                this.load();
              })
              .catch((err) => {
                this.setData({ deletingId: "" });
                this.toastErr(err, "删除失败");
              });
          })
          .catch(() => {});
      },
    });
  },

  noop() {},
});
