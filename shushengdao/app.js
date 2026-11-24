App({
  globalData: {
    statusBarHeight: 20,
    // 顶部导航布局缓存（statusBar / navH / navRight），由 utils/nav.js 写入，
    // 页面 data 初始化直接读它 → 切页签时标题栏首帧就在最终位置，不会「先跳一下」
    navLayout: null,
    userInfo: { nickname: "书声岛", ageMode: "primary" },
  },

  onLaunch() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
    }
    // 启动时测一次顶部布局并缓存（含胶囊按钮避让），后续所有页面复用
    try {
      require("./utils/nav").measure();
    } catch (e) {}
    // 用户数据由 utils/store.js 管理（本地存储，见 README）
    this.checkTts();
    this.trackLaunch();
  },

  onShow() {
    // 部分机型启动瞬间拿不到胶囊按钮信息（navRight=0），等能拿到了补测一次；
    // 只更新缓存，已经渲染的页面不 setData，所以不会引起跳动
    try {
      require("./utils/nav").refreshIfDefault();
    } catch (e) {}
  },

  /** 退后台时静默备份学习记录（绑定了手机号才有云备份；5 分钟节流，失败不影响使用） */
  onHide() {
    try {
      const store = require("./utils/store");
      const user = store.getUser() || {};
      if (!user.phone) return;
      const cfg = require("./config/index");
      const last = Number(wx.getStorageSync("wb_backup_at")) || 0;
      if (Date.now() - last < (cfg.backup.autoMinGap || 5) * 60e3) return;
      const backup = require("./utils/backup");
      const pin = store.ensurePhonePin();
      backup.save(store.exportData(), user.phone, pin).then(() => {
        try {
          wx.setStorageSync("wb_backup_at", Date.now());
        } catch (e2) {}
      }).catch(() => {});
    } catch (e) {}
  },

  /** 启动上报：管理员后台的「累计/今日使用次数」数据源（静默，失败不影响使用） */
  trackLaunch() {
    try {
      const store = require("./utils/store");
      const user = store.getUser() || {};
      const stats = require("./utils/stats");
      stats.track(user.nickname || "小朋友", user.ageMode || "primary");
    } catch (e) {}
  },

  /** 全局错误兜底：真机上脚本崩溃时留档，音标页等会显示「页面脚本出错」浮层 */
  onError(msg) {
    try {
      console.error("[书声岛] 全局错误：" + msg);
      wx.setStorageSync("wb_lastError", { page: "app", where: "onError", msg: String(msg).slice(0, 200), at: Date.now() });
    } catch (e) {}
  },

  onUnhandledRejection(res) {
    try {
      const reason = res && res.reason;
      const msg = (reason && (reason.message || reason.errMsg)) || String(reason || "未处理的 Promise 拒绝");
      console.error("[书声岛] 未处理 rejection：" + msg);
      wx.setStorageSync("wb_lastError", { page: "app", where: "promise", msg: String(msg).slice(0, 200), at: Date.now() });
    } catch (e) {}
  },

  /** 启动自检：范读语音通道是否可用（插件 / 云函数），结果打印到 console 便于排查 */
  checkTts() {
    try {
      const tts = require("./utils/tts");
      const d = tts.diagnose();
      if (d.available) {
        const via = d.pluginAvailable ? "同声传译插件" : "云函数 TTS";
        console.log("[书声岛] 范读语音已就绪（" + via + "）");
        return;
      }
      console.warn(
        "[书声岛] 范读语音未启用：" +
          ((d.error && d.error.errMsg) || "未知原因") +
          "\n处理方式：" +
          d.tip
      );
    } catch (e) {
      console.warn("[书声岛] TTS 自检异常：" + (e && e.message));
    }
  },
});
