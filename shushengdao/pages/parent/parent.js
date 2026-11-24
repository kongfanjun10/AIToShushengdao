const app = getApp();
const config = require("../../config/index");
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const profile = require("../../utils/profile");
const fb = require("../../utils/feedback");
const stats = require("../../utils/stats");
const backupUtil = require("../../utils/backup");
const tab = require("../../utils/tab");

/** 138****8000 */
function maskPhone(num) {
  const s = String(num || "");
  if (s.length < 7) return s;
  return s.slice(0, 3) + "****" + s.slice(-4);
}

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    verified: false,
    gateExpr: "",
    gateAnswer: "",
    gateError: "",
    user: {},
    week: [],
    report: { sentences: 0, minutes: 0, streak: 0 },
    groups: [],
    gSheet: null, // 书单详情弹窗：{ id,title,lessonTitle,percent,read,total,cursorText,done,rows }
    rangeLabel: "",
    rateLabel: "正常 1.0x",
    voiceName: "女声",
    voiceOk: false,
    phoneMasked: "",
    phoneBound: false,
    phoneSource: "",
    phoneBusy: false,
    phonePin: "",
    backupText: "尚未备份",
    backupBusy: false,
    profileGuide: false,
    // 孩子资料（头像 + 昵称）
    avatar: "",
    focusProfile: false,
    nickEditing: false,
    nickDraft: "",
    nickCount: 0,
    nickError: "",
    nickMax: 8,
    // 留言板：待回复数
    pendingFeedback: 0,
    isAdmin: false,
    // 安全重置（三档清理 + 快照恢复）
    clearOpen: false,
    clearStep: 1,
    clearMode: "learn", // learn | profile | all
    clearDel: [],
    clearKeep: [],
    holdPct: 0, // 长按进度 0~100
    holdText: "按住 3 秒",
    restoreAvailable: false,
    restoreDay: "",
    // 学习报告图片：生成 → 弹窗预览 → 分享给微信好友 / 保存相册
    reportOpen: false,
    reportImg: "",
    reportBusy: false,
  },

  onLoad(options) {
    this.setData(Object.assign(nav.sync(), { showBack: tab.showBack() }));
    this.makeGate();
    const passed = options && options.pass === "1";
    const focusProfile = !!(options && options.focus === "profile");
    if (passed) {
      this.setData({ verified: true, focusProfile });
      this.load();
      if (focusProfile) {
        setTimeout(() => this.setData({ focusProfile: false }), 2400);
      }
    }
  },

  onShow() {
    // 改完头像/昵称返回本页时同步一次
    if (this.data.verified && this.data.user && this.data.user.nickname) this.load();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  /** 底部任务栏（页签式切换） */
  goTab(e) {
    tab.goTab(this, e, "parent");
  },

  onSameTab() {
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  /* ---------------- 门禁 ---------------- */
  makeGate() {
    const a = 13 + Math.floor(Math.random() * 17);
    const b = 11 + Math.floor(Math.random() * 19);
    this._answer = String(a + b);
    this.setData({ gateExpr: a + " + " + b, gateAnswer: "", gateError: "" });
  },

  onGateInput(e) {
    this.setData({ gateAnswer: e.detail.value, gateError: "" });
  },

  submitGate() {
    const val = String(this.data.gateAnswer || "").trim();
    if (!val) {
      this.setData({ gateError: "请输入答案" });
      return;
    }
    if (val !== this._answer) {
      this.setData({ gateError: "答案不对，再算一次哦" });
      this.makeGate();
      return;
    }
    this.setData({ verified: true });
    this.load();
  },

  /* ---------------- 数据 ---------------- */
  load() {
    const user = store.getUser();
    const overview = store.overview();
    const rawWeek = store.weekStats(7);
    const max = Math.max.apply(
      null,
      rawWeek.map((d) => d.sentences).concat([4])
    );
    const week = rawWeek.map((d, i) => ({
      date: d.date,
      label: d.label,
      md: d.md,
      today: i === rawWeek.length - 1,
      sentences: d.sentences,
      minutes: d.minutes,
      durationText: d.durationText,
      active: d.active,
      h: Math.max(d.active ? 10 : 4, Math.round((d.sentences / max) * 100)),
    }));
    // 每日完成情况列表：最新日期排最前（柱状图仍按时间从左到右，继续用 week）
    const weekList = week.slice().reverse();
    const sentences = week.reduce((s, d) => s + d.sentences, 0);
    const seconds = week.reduce((s, d) => s + (d.seconds || 0), 0);
    const groups = store.listGroups().map((g) => {
      const p = store.progressOf(g);
      return {
        id: g.id,
        title: g.title,
        lessonTitle: g.lessonTitle,
        percent: p.percent,
        read: p.read,
        total: p.total,
      };
    });
    const rate = Number(user.speechRate) || 1;
    const voiceOk = !!(tts.diagnose() && tts.diagnose().cloudAvailable);
    this.setData({
      user,
      avatar: profile.avatar(),
      week,
      weekList,
      groups,
      report: { sentences, durationText: store.fmtDuration(seconds), streak: overview.streak },
      rangeLabel: week.length ? week[0].date.slice(5) + " 至 " + week[week.length - 1].date.slice(5) : "",
      rateLabel: rate < 1 ? "慢速 " + rate + "x" : rate > 1 ? "快速 " + rate + "x" : "正常 1.0x",
      voiceOk,
      voiceName: user.ttsVoice === "male" ? "男声" : "女声",
      phoneMasked: maskPhone(user.phone),
      phoneBound: !!user.phone,
      phoneSource: user.phoneSource || "",
      // 云备份信息：恢复口令（首次绑定时生成、家长可记下）+ 最近一次备份时间
      phonePin: user.phonePin || "",
      backupText: (() => {
        try {
          return backupUtil.fmtAt(wx.getStorageSync("wb_backup_at")) || "尚未备份";
        } catch (e) {
          return "尚未备份";
        }
      })(),
      // 首次引导：昵称或手机号没设置过时提示一次（展示过 wb_profile_seen 即记住；完成后/点暂不 wb_profile_done 永久关闭）
      profileGuide:
        (!user.nickname || !user.phone) &&
        !wx.getStorageSync("wb_profile_done") &&
        !wx.getStorageSync("wb_profile_seen"),
      // 夜览模式在家长中心即时切换，无需重进页面
      night: !!user.nightMode,
      restoreAvailable: !!store.getSnapshot(),
      restoreDay: store.snapshotAgeText(),
    });
    // 引导条这次真实展示过了 → 记住，下次进入不再提示（用户要求「后续进入不再提示」）
    if (this.data.profileGuide) {
      try {
        wx.setStorageSync("wb_profile_seen", 1);
      } catch (e) {}
    }
    this.loadAdminState();
  },

  /** 管理员身份：决定「留言管理 / 数据后台」两个入口给不给看（云端按 openid 校验，仅认领人可见） */
  loadAdminState() {
    if (!stats.available()) return;
    stats
      .checkAdmin()
      .then((r) => {
        this.setData({ isAdmin: !!r.isAdmin });
        if (r.isAdmin) this.loadFeedbackPending();
      })
      .catch(() => {});
  },

  /** 留言板待回复数（云开发未开通时静默跳过） */
  loadFeedbackPending() {
    if (!fb.available()) return;
    fb.call("list")
      .then((r) => {
        // 待回复数直接按列表算：列表里每条都有 reply 字段，跟页面看到的完全一致
        const pend = (r.list || []).filter((d) => !String(d.reply || "").trim()).length;
        this.setData({ pendingFeedback: r.pending != null ? r.pending : pend });
      })
      .catch(() => {});
  },

  /** 进入留言板管理员模式：查看并回复用户留言 */
  openFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback?admin=1" });
  },

  /** 进入数据后台（需管理口令；入口仅对已认领的管理员显示） */
  openAdmin() {
    wx.navigateTo({ url: "/pages/admin/admin" });
  },

  /**
   * 隐藏入口：长按页面底部版本号触发。
   * 数据后台只给小程序创建人用，不在页面上明示，避免对普通用户暴露：
   *  - 还没人认领：进入认领页（创建人输入口令后，其微信成为唯一管理员）
   *  - 已是管理员：直接进看板
   *  - 已有管理员但不是本人：静默不响应，不暴露入口存在
   */
  onSecretAdmin() {
    if (!stats.available()) return;
    stats
      .checkAdmin()
      .then((r) => {
        if (r && (r.isAdmin || !r.hasAdmin)) {
          wx.navigateTo({ url: "/pages/admin/admin" });
        }
      })
      .catch(() => {});
  },

  /* ---------------- 孩子资料：头像 / 昵称 ---------------- */
  onAvatarTap() {
    const items = ["拍一张", "从相册选择"];
    if (this.data.avatar) items.push("恢复默认头像");
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const i = res.tapIndex;
        if (i === 0) this.pickAvatar("camera");
        else if (i === 1) this.pickAvatar("album");
        else if (i === 2) this.resetAvatar();
      },
      fail: () => {},
    });
  },

  pickAvatar(from) {
    profile.pickAvatar(from, (path) => {
      if (!path) return; // 用户取消或读取失败，保持原样
      this.setData({ avatar: path });
      wx.showToast({ title: from === "camera" ? "已用这张照片" : "头像已更新", icon: "success" });
    });
  },

  resetAvatar() {
    profile.clearAvatar();
    this.setData({ avatar: "" });
    wx.showToast({ title: "已恢复默认头像", icon: "none" });
  },

  openNick() {
    const v = (this.data.user && this.data.user.nickname) || "";
    this.setData({
      nickEditing: true,
      nickDraft: v,
      nickCount: Array.from(v).length,
      nickError: "",
    });
  },

  closeNick() {
    this.setData({ nickEditing: false, nickError: "" });
  },

  noop() {},

  onNickInput(e) {
    const v = String((e.detail && e.detail.value) || "");
    this.setData({ nickDraft: v, nickCount: Array.from(v.trim()).length, nickError: "" });
  },

  saveNick() {
    const r = profile.saveNickname(this.data.nickDraft);
    if (!r.ok) {
      this.setData({ nickError: r.msg });
      return;
    }
    this.setData({ nickEditing: false, nickError: "" });
    this.load();
    // 主动保存的昵称才同步云端（数据后台显示名）；启动上报不会覆盖
    const u = store.getUser();
    stats.profile(r.value, u.ageMode || "primary");
    this.markGuideDone();
    wx.showToast({ title: "昵称已改成「" + r.value + "」", icon: "none" });
  },

  /* ---------------- 设置 ---------------- */
  /** 夜览模式：打开后主要页面盖暗色护眼遮罩；本页即时生效，其他页重新进入后生效 */
  setNight(e) {
    const on = !!e.detail.value;
    store.setUser({ nightMode: on });
    this.setData({ night: on });
    wx.showToast({ title: on ? "夜览已开启 🌙" : "夜览已关闭", icon: "none" });
  },

  setAgeMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.user.ageMode) return;
    store.setUser({ ageMode: mode });
    this.load();
    // 模式切换也走显式同步（顺带把当前昵称带上，保持云端一致）
    const u = store.getUser();
    stats.profile(u.nickname || "", mode);
    wx.showToast({
      title: mode === "kid" ? "已切换幼儿园模式（不评分）" : "已切换小学模式",
      icon: "none",
    });
  },

  togglePinyin(e) {
    store.setUser({ pinyinOn: !!e.detail.value });
    this.load();
  },

  setRate(e) {
    const rate = Number(e.currentTarget.dataset.rate);
    store.setUser({ speechRate: rate });
    this.load();
    wx.showToast({ title: "范读语速已更新", icon: "none" });
  },

  setVoice(e) {
    const voice = e.currentTarget.dataset.voice;
    if (voice !== "male" && voice !== "female") return;
    if (!this.data.voiceOk) {
      wx.showToast({ title: "需要云函数语音通道才能换音色", icon: "none" });
      return;
    }
    store.setUser({ ttsVoice: voice });
    this.load();
    wx.showToast({ title: "默认音色已更新", icon: "none" });
  },

  setLimit(e) {
    const limit = Number(e.currentTarget.dataset.limit);
    store.setUser({ dailyLimit: limit });
    this.load();
    wx.showToast({ title: "每日上限 " + limit + " 分钟", icon: "none" });
  },

  /** 书单卡片 → 书内分句进度详情（半屏弹窗） */
  openGroup(e) {
    const id = e.currentTarget.dataset.id;
    const g = store.getGroup(id);
    if (!g) return;
    const p = store.progressOf(g);
    const n = g.sentences.length;
    const cur = Math.max(0, Math.min(g.cursor || 0, n - 1));
    const rows = g.sentences.map((s, i) => ({
      i: i + 1,
      text: s.text,
      state: s.read ? "read" : s.heard ? "heard" : "todo",
      // 当前没读完的那句：标「下次继续」（读完了就全不标）
      current: !g.done && !s.read && i === cur,
    }));
    this.setData({
      gSheet: {
        id: g.id,
        title: g.title,
        lessonTitle: g.lessonTitle,
        percent: p.percent,
        read: p.read,
        total: p.total,
        cursorText: "下次从第 " + (cur + 1) + " 句继续",
        done: !!g.done,
        rows: rows,
      },
    });
  },

  closeGroupSheet() {
    this.setData({ gSheet: null });
  },

  /** 详情里的「继续朗读」：进朗读页，自动定位到进度句 */
  goGroupReader() {
    const id = this.data.gSheet && this.data.gSheet.id;
    if (!id) return;
    this.setData({ gSheet: null });
    wx.navigateTo({ url: "/pages/reader/reader?groupId=" + id });
  },

  /* ---------------- 账号与数据 ---------------- */
  ensureCloud() {
    if (!wx.cloud) return false;
    if (this._cloudReady) return true;
    try {
      wx.cloud.init({ env: config.account.cloudEnv || undefined, traceUser: true });
      this._cloudReady = true;
      return true;
    } catch (e) {
      return false;
    }
  },

  /** 微信「获取手机号」按钮回调：拿到 code 就换真号，拿不到就降级为手填 */
  onGetPhone(e) {
    const detail = (e && e.detail) || {};
    if (detail.code || detail.encryptedData) {
      if (detail.code) {
        this.exchangePhone(detail.code);
      } else {
        // 旧版接口拿到的是加密数据，需要服务端解密；这里统一引导走其他号码
        this.fallbackInput("当前基础库返回的是加密数据");
      }
      return;
    }
    const msg = String(detail.errMsg || "");
    if (msg.indexOf("deny") > -1 || msg.indexOf("cancel") > -1) {
      wx.showToast({ title: "已取消授权", icon: "none" });
      return;
    }
    this.fallbackInput(msg ? "微信未返回手机号" : "微信手机号不可用");
  },

  exchangePhone(code) {
    if (!this.ensureCloud()) {
      this.fallbackInput("云开发未配置");
      return;
    }
    this.setData({ phoneBusy: true });
    wx.showLoading({ title: "正在获取", mask: true });
    wx.cloud
      .callFunction({ name: config.account.phoneFunction, data: { code } })
      .then((res) => {
        wx.hideLoading();
        this.setData({ phoneBusy: false });
        const r = (res && res.result) || {};
        if (r.ok && r.phone) {
          this.enterPhone(r.phone, "wechat");
          return;
        }
        this.fallbackInput(r.errMsg || "云函数未返回手机号");
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ phoneBusy: false });
        this.fallbackInput((err && err.errMsg) || "云函数调用失败");
      });
  },

  /** 拿不到微信手机号时的降级：说明原因 + 引导填写其他号码 */
  fallbackInput(reason) {
    const why =
      reason && reason !== "微信手机号不可用"
        ? reason + "。"
        : "个人主体小程序暂不支持读取微信手机号。";
    wx.showModal({
      title: "改用其他号码",
      content: why + "可以直接填写要绑定的手机号。学习记录会随号码备份到云端，换设备输入号码和恢复口令即可找回。",
      confirmText: "去填写",
      cancelText: "取消",
      confirmColor: "#0ea5e9",
      success: (res) => {
        if (res.confirm) this.inputPhone();
      },
    });
  },

  /** 手动填写手机号（其他号码） */
  inputPhone() {
    wx.showModal({
      title: this.data.phoneBound ? "更换手机号" : "绑定手机号",
      editable: true,
      placeholderText: "请输入 11 位手机号",
      confirmText: "保存",
      confirmColor: "#0ea5e9",
      success: (res) => {
        if (!res.confirm) return;
        const v = String(res.content || "").replace(/[\s-]/g, "");
        if (!/^1[3-9]\d{9}$/.test(v)) {
          wx.showToast({ title: "手机号格式不对，请检查", icon: "none" });
          return;
        }
        this.enterPhone(v, "manual");
      },
    });
  },

  /**
   * 手机号绑定总入口：先查该号码有没有云备份——
   *  - 有 → 询问是否用备份恢复本机（输 4 位恢复口令），跳过则只绑定
   *  - 没有 → 直接绑定，绑定后立即创建首份云备份
   */
  enterPhone(phone, source) {
    const backup = require("../../utils/backup");
    backup
      .peek(phone)
      .then((r) => {
        if (r.has) this.offerRestore(phone, source, r);
        else this.savePhone(phone, source);
      })
      .catch(() => this.savePhone(phone, source)); // 云端不可用 → 只走本地绑定
  },

  /** 发现云备份：输恢复口令后整体恢复（本机当前数据先自动快照，7 天内可在家长中心恢复） */
  offerRestore(phone, source, info) {
    const backup = require("../../utils/backup");
    const when = backup.fmtAt(info.at) || "未知时间";
    const who = info.nickname ? "「" + info.nickname + "」的" : "";
    wx.showModal({
      title: "发现云备份",
      content:
        "该号码有" + who + "学习记录备份（" + when + "）。输入 4 位恢复口令即可覆盖本机记录（当前数据会先自动快照）；点「跳过」则只绑定号码、不恢复。",
      editable: true,
      placeholderText: "请输入 4 位恢复口令",
      confirmText: "恢复",
      cancelText: "跳过",
      confirmColor: "#0ea5e9",
      success: (res) => {
        if (res.confirm) {
          const pin = String(res.content || "").trim();
          if (!/^\d{4}$/.test(pin)) {
            wx.showToast({ title: "口令须为 4 位数字", icon: "none" });
            return;
          }
          wx.showLoading({ title: "正在恢复", mask: true });
          backup
            .fetch(phone, pin)
            .then((r) => {
              wx.hideLoading();
              store.saveSnapshot(store.exportData()); // 恢复前先快照本机数据
              if (!store.importData(r.data)) {
                wx.showToast({ title: "备份数据格式异常", icon: "none" });
                return;
              }
              store.setUser({ phone: phone, phoneSource: source, phoneAt: Date.now() });
              const u = store.getUser();
              stats.bindPhone(phone, source, u.nickname || "小朋友");
              this.markGuideDone();
              this.load();
              wx.showToast({ title: "学习记录已恢复 ✓", icon: "success" });
            })
            .catch((err) => {
              wx.hideLoading();
              wx.showToast({ title: (err && err.errMsg) || "恢复失败，请重试", icon: "none" });
            });
          return;
        }
        // 跳过恢复：只绑定
        this.savePhone(phone, source);
      },
    });
  },

  /** 绑定成功：本地落库 + 后台识别同步 + 立即创建首份云备份 */
  savePhone(phone, source) {
    store.setUser({ phone, phoneSource: source, phoneAt: Date.now() });
    // 同步到云端统计（数据后台展示用；失败静默，不影响本地绑定）
    const user = store.getUser();
    stats.bindPhone(phone, source, user.nickname || "小朋友");
    this.markGuideDone();
    this.saveBackupNow(true);
    this.load();
    wx.showToast({ title: source === "wechat" ? "已绑定微信手机号" : "手机号已保存", icon: "success" });
  },

  /** 立即备份到云端（绑定成功后自动调一次；首次绑定时生成恢复口令） */
  saveBackupNow(silent) {
    const user = store.getUser();
    if (!user.phone) return;
    const backup = require("../../utils/backup");
    const pin = store.ensurePhonePin();
    this.setData({ backupBusy: true });
    backup
      .save(store.exportData(), user.phone, pin)
      .then(() => {
        try {
          wx.setStorageSync("wb_backup_at", Date.now());
        } catch (e) {}
        this.setData({ backupBusy: false, backupText: "今天" });
        if (!silent) wx.showToast({ title: "已备份到云端 ✓", icon: "success" });
      })
      .catch((err) => {
        this.setData({ backupBusy: false });
        if (!silent) {
          wx.showToast({ title: (err && err.errMsg) || "备份失败，稍后再试", icon: "none" });
        }
      });
  },

  /** 首次引导：点「暂不」或完成设置后不再提示 */
  skipGuide() {
    this.markGuideDone();
  },

  markGuideDone() {
    try {
      wx.setStorageSync("wb_profile_done", 1);
    } catch (e) {}
    if (this.data.profileGuide) this.setData({ profileGuide: false });
  },

  unbindPhone() {
    wx.showModal({
      title: "解绑手机号",
      content:
        "解绑只清除本机的绑定状态和后台的号码显示，学习数据与云端备份都不受影响（凭号码 + 恢复口令随时可以恢复）。确定继续吗？",
      confirmText: "解绑",
      confirmColor: "#f97316",
      success: (res) => {
        if (!res.confirm) return;
        store.setUser({ phone: "", phoneSource: "", phoneAt: 0 });
        stats.bindPhone("", "", ""); // 云端统计同步清除号码
        this.load();
        wx.showToast({ title: "已解绑", icon: "none" });
      },
    });
  },

  setGoal(e) {
    const goal = Number(e.currentTarget.dataset.goal);
    store.setUser({ dailyGoal: goal });
    this.load();
    wx.showToast({ title: "每日目标 " + goal + " 组", icon: "none" });
  },

  /* ---------------- 学习报告：生成图片 → 弹窗预览 → 分享/保存 ---------------- */

  /** 打开报告弹窗并生成图片（原「复制文本」已废弃，图片更直观、可直接转发） */
  exportReport() {
    this.setData({ reportOpen: true, reportImg: "", reportBusy: true });
    this.renderReportImage();
  },

  closeReport() {
    this.setData({ reportOpen: false });
  },

  /** 画报告图并导出临时文件；失败退回复制文字版（保底可用） */
  renderReportImage() {
    wx.createSelectorQuery()
      .select("#reportCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) {
          this.setData({ reportBusy: false });
          this.fallbackReportText();
          return;
        }
        try {
          const canvas = info.node;
          const ctx = canvas.getContext("2d");
          const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
          const W = 600;
          const H = 920;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          ctx.scale(dpr, dpr);
          this.drawReport(ctx, W, H);
          wx.canvasToTempFilePath({
            canvas,
            success: (r) => this.setData({ reportImg: r.tempFilePath, reportBusy: false }),
            fail: () => {
              this.setData({ reportBusy: false });
              this.fallbackReportText();
            },
          });
        } catch (e) {
          this.setData({ reportBusy: false });
          this.fallbackReportText();
        }
      });
  },

  /** 分享给微信好友（系统分享图片面板，可选聊天/收藏）；API 不可用时退保存相册 */
  shareReportImage() {
    const p = this.data.reportImg;
    if (!p) return;
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path: p,
        fail: () => this.saveReportImage(),
      });
    } else {
      this.saveReportImage();
    }
  },

  /** 保存到相册（也作为低版本基础库的分享兜底） */
  saveReportImage() {
    const p = this.data.reportImg;
    if (!p) return;
    wx.saveImageToPhotosAlbum({
      filePath: p,
      success: () => wx.showToast({ title: "已存相册，可在微信里发送", icon: "success" }),
      fail: (e) => {
        const msg = (e && e.errMsg) || "";
        if (msg.indexOf("auth") > -1 || msg.indexOf("deny") > -1) {
          wx.showModal({
            title: "需要相册权限",
            content: "在设置里允许「保存到相册」后即可把报告图发给老师或家人。",
            confirmText: "去设置",
            confirmColor: "#0ea5e9",
            success: (m) => {
              if (m.confirm) wx.openSetting({});
            },
          });
        }
      },
    });
  },

  /** 兜底：画布不可用（极少数低端机/组件异常）时退回复制文字版报告 */
  fallbackReportText() {
    wx.setClipboardData({
      data: store.buildReportText(),
      success: () => wx.showToast({ title: "图片生成失败，已复制文字版", icon: "none" }),
      fail: () => wx.showToast({ title: "生成失败，请重试", icon: "none" }),
    });
  },

  /** 报告图版式：600×920，白卡 + 三个统计块 + 近 7 天柱状图 */
  drawReport(ctx, W, H) {
    const cx = W / 2;
    const o = store.overview();
    const user = store.getUser();
    const week = store.weekStats(7);
    const max = Math.max(1, ...week.map((d) => d.sentences));

    // 背景
    ctx.fillStyle = "#eaf4ff";
    ctx.fillRect(0, 0, W, H);

    // 顶部色带
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(0, 0, W, 8);

    // 标题
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 40px sans-serif";
    ctx.fillText("书声岛 · 学习报告", cx, 96);
    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.fillText((user.nickname || "小朋友") + " 的朗读小结 · " + this.reportDateText(), cx, 140);

    // 三个统计块
    const cards = [
      { v: o.sentences, k: "累计朗读（句）" },
      { v: o.minutes, k: "累计时长（分）" },
      { v: o.activeDays, k: "打卡天数" },
    ];
    const cw = 160;
    const gap = 20;
    const startX = (W - (cw * 3 + gap * 2)) / 2;
    cards.forEach((c, i) => {
      const x = startX + i * (cw + gap);
      this.rr(ctx, x, 180, cw, 130, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#0369a1";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText(String(c.v), x + cw / 2, 246);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "18px sans-serif";
      ctx.fillText(c.k, x + cw / 2, 284);
    });

    // 生词本一行
    this.rr(ctx, 40, 340, W - 80, 100, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "22px sans-serif";
    ctx.fillText("生词本", 66, 384);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    ctx.fillText("共 " + o.vocab.total + " 个 · 已掌握 " + o.vocab.mastered + " 个", 66, 416);
    // 掌握率进度条
    const pct = o.vocab.total ? Math.round((o.vocab.mastered / o.vocab.total) * 100) : 0;
    this.rr(ctx, W - 216, 372, 110, 16, 8);
    ctx.fillStyle = "#eef2f7";
    ctx.fill();
    if (pct > 0) {
      this.rr(ctx, W - 216, 372, Math.max(12, Math.round(110 * pct / 100)), 16, 8);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#16a34a";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(pct + "%", W - 54, 386);

    // 近 7 天柱状图
    this.rr(ctx, 40, 470, W - 80, 300, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("近 7 天朗读", 66, 514);
    const baseY = 700;
    const barW = 40;
    const span = (W - 160) / 7;
    week.forEach((d, i) => {
      const x = 80 + i * span;
      const h = d.sentences ? Math.max(8, Math.round((d.sentences / max) * 120)) : 4;
      this.rr(ctx, x + (span - barW) / 2, baseY - h, barW, h, 6);
      ctx.fillStyle = d.today ? "#0ea5e9" : "#7dd3fc";
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = d.today ? "#0284c7" : "#94a3b8";
      ctx.font = (d.today ? "bold " : "") + "16px sans-serif";
      ctx.fillText(d.md, x + span / 2, baseY + 26);
      if (d.sentences) {
        ctx.fillStyle = "#64748b";
        ctx.font = "14px sans-serif";
        ctx.fillText(String(d.sentences), x + span / 2, baseY - h - 10);
      }
    });
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px sans-serif";
    ctx.fillText("连续打卡 " + o.streak + " 天 · 最佳 " + o.bestStreak + " 天", 66, 758);

    // 底部标语
    ctx.textAlign = "center";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    ctx.fillText("坚持每天读一点，声音会越来越响亮 ✨", cx, 830);
    ctx.font = "14px sans-serif";
    ctx.fillText("来自「书声岛」小程序 · " + this.reportDateText(), cx, 866);
  },

  reportDateText() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate());
  },

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /* ---------------- 安全重置：三档范围 → 清单确认 → 长按执行 ---------------- */

  openClear() {
    this.setData({ clearOpen: true, clearStep: 1, clearMode: "learn", holdPct: 0, holdText: "按住 3 秒" });
  },

  closeClear() {
    this.stopHold();
    this.setData({ clearOpen: false });
  },

  pickClearMode(e) {
    this.setData({ clearMode: e.currentTarget.dataset.mode });
  },

  goClearStep2() {
    const pv = store.cleanupPreview(this.data.clearMode);
    this.setData({
      clearStep: 2,
      clearDel: pv.del,
      clearKeep: pv.keep,
      holdPct: 0,
      holdText: "按住 3 秒",
    });
  },

  backClearStep1() {
    this.stopHold();
    this.setData({ clearStep: 1, holdPct: 0, holdText: "按住 3 秒" });
  },

  clearModeName() {
    return this.data.clearMode === "all" ? "恢复出厂" : this.data.clearMode === "profile" ? "学习记录+孩子资料" : "只清学习记录";
  },

  clearHoldStart() {
    if (this._holding) return;
    this._holding = true;
    const startedAt = Date.now();
    const total = 3000;
    this.setData({ holdPct: 0, holdText: "3" });
    this._holdTimer = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - startedAt) / total) * 100));
      const left = Math.max(1, Math.ceil((total - (Date.now() - startedAt)) / 1000));
      this.setData({ holdPct: pct, holdText: String(pct >= 100 ? 1 : left) });
      if (pct >= 30 && pct < 100 && pct % 33 < 7) {
        try {
          wx.vibrateShort({ type: "light", fail: () => {} });
        } catch (e) {}
      }
      if (pct >= 100) {
        this.stopHold();
        this.applyClear();
      }
    }, 60);
  },

  clearHoldEnd() {
    if (!this._holding) return;
    const cancelled = this.data.holdPct < 100;
    this.stopHold();
    if (cancelled) {
      this.setData({ holdPct: 0, holdText: "按住 3 秒" });
      wx.showToast({ title: "已取消，松手即不执行", icon: "none" });
    }
  },

  stopHold() {
    if (this._holdTimer) {
      clearInterval(this._holdTimer);
      this._holdTimer = null;
    }
    this._holding = false;
  },

  applyClear() {
    const mode = this.data.clearMode;
    try {
      wx.vibrateShort({ type: "heavy", fail: () => {} });
    } catch (e) {}
    store.cleanupApply(mode);
    this.closeClear();
    this.load();
    wx.showToast({
      title: mode === "all" ? "已恢复出厂 · 7 天内可恢复" : "已清理 · 7 天内可恢复",
      icon: "none",
      duration: 2600,
    });
  },

  /** 恢复上次清理前的备份 */
  undoRestore() {
    wx.showModal({
      title: "恢复数据",
      content: "把「" + (this.data.restoreDay || "上次备份") + "」的备份恢复回来，覆盖现在的数据。确定吗？",
      confirmText: "恢复",
      confirmColor: "#0369a1",
      success: (res) => {
        if (!res.confirm) return;
        if (store.restoreSnapshot()) {
          this.load();
          wx.showToast({ title: "已恢复", icon: "success" });
        } else {
          wx.showToast({ title: "备份已过期", icon: "none" });
        }
      },
    });
  },

  onUnload() {
    this.stopHold();
  },
});
