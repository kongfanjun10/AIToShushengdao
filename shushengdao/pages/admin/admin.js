const app = getApp();
const nav = require("../../utils/nav");
const stats = require("../../utils/stats");

/**
 * 数据后台（仅管理员本人）
 *
 * 访问控制：云函数按微信身份（openid）校验。
 *  - 管理员：直接进入看板
 *  - 首次使用（还没有任何人认领）：输入口令认领，当前微信从此成为唯一管理员
 *  - 其他家长：口令/页面都进不来，只显示「仅管理员本人可访问」
 */
Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    // 门禁状态：checking | claim（首次认领） | denied（非管理员） | in（看板）
    phase: "checking",
    keyDraft: "",
    keyError: "",
    checking: false,
    deniedText: "",
    // 概览数据
    overview: null,
    loading: false,
    loadErr: "",
    updatedAtText: "",
  },

  onLoad(options) {
    this.setData(nav.sync());
    this.checkAccess();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  /* ---------------- 身份校验 ---------------- */
  checkAccess() {
    stats
      .checkAdmin()
      .then((r) => {
        if (r.isAdmin) {
          this.setData({ phase: "in" });
          this.refresh();
        } else if (r.hasAdmin) {
          this.setData({ phase: "denied", deniedText: "管理员已设置，仅管理员本人的微信可以查看这份数据。" });
        } else {
          this.setData({ phase: "claim", keyDraft: "", keyError: "" });
        }
      })
      .catch((err) => {
        this.setData({
          phase: "denied",
          deniedText: (err && err.errMsg) || "云服务暂不可用，开通云开发后再试。",
        });
      });
  },

  /* ---------------- 首次认领 ---------------- */
  onKeyInput(e) {
    this.setData({ keyDraft: e.detail.value, keyError: "" });
  },

  submitKey() {
    const key = String(this.data.keyDraft || "").trim();
    if (!key) {
      this.setData({ keyError: "请输入管理口令" });
      return;
    }
    if (this.data.checking) return;
    this.setData({ checking: true, keyError: "" });
    stats
      .claimAdmin(key)
      .then(() => {
        stats.saveAdminKey(key); // 与「留言管理」共用同一口令，存下来免重复输入
        this.setData({ checking: false, phase: "in" });
        this.refresh();
      })
      .catch((err) => {
        const code = err && err.code;
        this.setData({
          checking: false,
          keyError:
            code === "BAD_KEY"
              ? "管理口令不对"
              : code === "NO_PERM"
              ? "管理员已被其他微信认领"
              : (err && err.errMsg) || "认领失败，请重试",
        });
      });
  },

  /* ---------------- 数据 ---------------- */
  applyOverview(r) {
    const days = (r.days || []).map((d, i, arr) => ({
      label: d.label,
      count: d.count,
      isToday: i === arr.length - 1,
      h: Math.max(d.count > 0 ? 10 : 3, Math.round((d.count / Math.max.apply(null, arr.map((x) => x.count).concat([1]))) * 100)),
    }));
    const diff = (r.todayLaunches || 0) - (r.yesterdayLaunches || 0);
    const users = (r.users || []).map((u) =>
      Object.assign({}, u, {
        avaChar: (u.nickname || "小").slice(0, 1),
        // 头像底色：今天来过=品牌蓝，久未使用=深灰蓝（都比原来的浅灰渐变对比强，白字才看得清）
        avaBg: u.todayActive
          ? "linear-gradient(135deg,#0369a1,#0ea5e9)"
          : "linear-gradient(135deg,#64748b,#94a3b8)",
        lastText: stats.lastText(u.lastAt),
        launchesText: stats.fmtNum(u.launches),
        modeText: u.ageMode === "kid" ? "幼儿园" : "小学",
      })
    );
    this.setData({
      overview: {
        totalLaunches: stats.fmtNum(r.totalLaunches),
        todayLaunches: stats.fmtNum(r.todayLaunches),
        totalUsers: r.totalUsers || 0,
        todayUsers: r.todayUsers || 0,
        todayNewUsers: r.todayNewUsers || 0,
        diff: diff,
        diffText: (diff >= 0 ? "▲ 较昨日 +" : "▼ 较昨日 ") + Math.abs(diff),
        days: days,
        users: users,
        maxLaunch: users.length ? users[0].launches : 0,
      },
      updatedAtText: "更新于 " + stats.fmtClock(r.generatedAt),
      loading: false,
      loadErr: "",
    });
  },

  refresh() {
    if (this.data.phase !== "in") return;
    this.setData({ loading: true, loadErr: "" });
    stats
      .fetchOverview()
      .then((r) => this.applyOverview(r))
      .catch((err) => {
        const code = err && err.code;
        if (code === "NO_PERM") {
          // 身份被云端移除时回到无权限态
          this.setData({ phase: "denied", deniedText: "仅管理员本人可以查看" });
          return;
        }
        this.setData({ loading: false, loadErr: (err && err.errMsg) || "加载失败，点这里重试" });
      });
  },
});
