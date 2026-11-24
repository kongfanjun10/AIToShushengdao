const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const profile = require("../../utils/profile");
const bus = require("../../utils/bus");
const tab = require("../../utils/tab");

const SKILL_META = {
  read: { name: "朗读完成度", icon: "mic", bg: "#e0f2fe", color: "#0369a1", grad: "linear-gradient(90deg,#0369a1,#0ea5e9)" },
  vocab: { name: "生词掌握率", icon: "book-open", bg: "#ecfdf5", color: "#007650", grad: "linear-gradient(90deg,#005b3d,#4edea3)" },
  fluent: { name: "跟读流畅度", icon: "speed", bg: "#fffbeb", color: "#f97316", grad: "linear-gradient(90deg,#fbbf24,#f97316)" },
  habit: { name: "坚持出勤率", icon: "event", bg: "#f0f9ff", color: "#00687a", grad: "linear-gradient(90deg,#00687a,#57dffe)" },
};

/** 能力明细：算法说明 + 分档建议（点「查看明细」展示） */
const SKILL_DETAIL = {
  read: {
    how: "按每个书单的朗读完成句数占比求平均",
    tiers: [
      { min: 85, tip: "很稳，可以试试篇幅更长的课文" },
      { min: 60, tip: "基本能读完，慢一点也别跳过句子" },
      { min: 0, tip: "先把每天 3 句读完，完成度会明显往上走" },
    ],
  },
  vocab: {
    how: "生词本里标记「已掌握」的个数 ÷ 生词总数",
    tiers: [
      { min: 85, tip: "掌握得不错，记得在朗读里用出来" },
      { min: 50, tip: "复习时先过一遍没掌握的，再开始读" },
      { min: 0, tip: "读到卡住的词，长按收进生词本" },
    ],
  },
  fluent: {
    how: "用平均每句朗读秒数推算，接近 8 秒/句最流畅",
    tiers: [
      { min: 85, tip: "节奏很好，可以挑战整段连读" },
      { min: 55, tip: "再放松一点，不要一个字一个字读" },
      { min: 0, tip: "先听两遍音频再开口，会顺很多" },
    ],
  },
  habit: {
    how: "近 7 天有朗读记录的天数 ÷ 7",
    tiers: [
      { min: 85, tip: "几乎天天读，习惯已经养成了" },
      { min: 50, tip: "隔天读一次也有效果，尽量连着来" },
      { min: 0, tip: "从每天 1 句开始，打卡比读多更重要" },
    ],
  },
};

/** 时间范围 → 统计窗口天数（本年度按 1 月 1 日起算） */
const RANGE_DAYS = { "近 7 天": 7, "30 天": 30, "3 个月": 90 };
function rangeDays(label) {
  if (label === "本年度") {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000) + 1);
  }
  return RANGE_DAYS[label] || 7;
}

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    navSolid: false,
    nickname: "孔老师",
    avatar: "",
    modeLabel: "小学模式",
    ranges: ["近 7 天", "30 天", "3 个月", "本年度"],
    range: "近 7 天",
    overview: { sentences: 0, hours: 0, minutesRest: 0, certCount: 0, percent: 0, streak: 0 },
    today: { sentences: 0 },
    skills: [],
    badges: [],
    badgeUnlocked: 0,
    badgeTotal: 0,
    gateVisible: false,
    gateExpr: "17 + 24",
    gateAnswer: "",
    skillSheet: false,
    skillDetail: [],
    badgeSheet: false,
    badgeGroups: [],
    moreMenu: false,
  },

  onLoad() {
    this.setData(Object.assign(nav.sync(), { showBack: tab.showBack() }));
    this.makeGate();
    // 家长中心改了昵称/照片：页面开着也即时刷新
    this._offUser = bus.on("user", () => this.load());
  },

  onUnload() {
    if (this._offUser) this._offUser();
  },

  /** 底部任务栏（页签式切换） */
  goTab(e) {
    tab.goTab(this, e, "archive");
  },

  onSameTab() {
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  onShow() {
    this.load();
  },

  /** 页面往上滑时顶栏变不透明，内容不会从标题后面透出来 */
  onPageScroll(e) {
    const solid = (e && e.scrollTop) > 8;
    if (solid !== !!this.data.navSolid) this.setData({ navSolid: solid });
  },

  load() {
    const user = store.getUser();
    const all = store.overview(); // 全局：词汇、连续打卡、书单数
    const win = store.overviewSince(rangeDays(this.data.range)); // 当前筛选范围
    const today = store.todayStat();
    const groups = store.listGroups();
    const doneGroups = groups.filter((g) => g.done).length;
    const vocabRate = all.vocab.total ? Math.round((all.vocab.mastered / all.vocab.total) * 100) : 0;
    const readRate = groups.length
      ? Math.round(
          (groups.reduce((s, g) => s + store.progressOf(g).percent, 0) / groups.length)
        )
      : 0;
    const avgSec = win.sentences ? Math.round((win.minutes * 60) / win.sentences) : 0;
    const fluent = avgSec ? Math.max(40, Math.min(100, 100 - Math.abs(avgSec - 8) * 4)) : 0;
    // 出勤率固定看最近 7 天（「坚持」这件事按周衡量才有意义）
    const habit = Math.min(100, Math.round((store.overviewSince(7).activeDays / 7) * 100));
    const percent = Math.min(
      100,
      Math.round((Math.min(all.streak, 7) / 7) * 40 + Math.min(win.sentences, 200) / 200 * 60)
    );
    const badges = store.getBadges().map((b) => ({
      name: b.name,
      sub: b.sub,
      icon: b.icon,
      tag: b.tag,
      tagStyle: b.tagStyle,
      ring: b.ring,
      color: b.color,
      locked: b.locked,
      desc: b.desc,
      progress: b.progress,
    }));
    const unlocked = badges.filter((b) => !b.locked).length;

    this.setData({
      nickname: user.nickname,
      avatar: profile.avatar(),
      readerId: store.readerId(),
      modeLabel: user.ageMode === "kid" ? "幼儿园模式" : "小学模式",
      overview: {
        sentences: win.sentences,
        hours: Math.floor(win.minutes / 60),
        minutesRest: win.minutes % 60,
        certCount: doneGroups,
        percent,
        streak: all.streak,
      },
      today: { sentences: today.sentences },
      skills: [
        Object.assign({ key: "read", value: readRate }, SKILL_META.read),
        Object.assign({ key: "vocab", value: vocabRate }, SKILL_META.vocab),
        Object.assign({ key: "fluent", value: fluent }, SKILL_META.fluent),
        Object.assign({ key: "habit", value: habit }, SKILL_META.habit),
      ],
      badges,
      badgeUnlocked: unlocked,
      badgeTotal: badges.length,
    });
  },

  /** 时间范围筛选：换范围要真的重新统计（原来只换了高亮，数字不变） */
  pickRange(e) {
    const range = e.currentTarget.dataset.range;
    if (!range || range === this.data.range) return;
    this.setData({ range });
    this.load();
    wx.showToast({ title: "统计范围：" + range, icon: "none" });
  },

  /* ---------------- 能力明细 ---------------- */
  openSkillSheet() {
    const detail = this.data.skills.map((s) => {
      const meta = SKILL_DETAIL[s.key] || {};
      const tier = (meta.tiers || []).find((t) => s.value >= t.min) || { tip: "" };
      return {
        key: s.key,
        name: s.name,
        icon: s.icon,
        color: s.color,
        bg: s.bg,
        grad: s.grad,
        value: s.value,
        how: meta.how || "",
        tip: tier.tip,
        level: s.value >= 85 ? "优秀" : s.value >= 60 ? "良好" : s.value >= 30 ? "起步" : "待开始",
      };
    });
    this.setData({ skillSheet: true, skillDetail: detail });
  },

  closeSkillSheet() {
    this.setData({ skillSheet: false });
  },

  /* ---------------- 全部勋章 ---------------- */
  openBadgeSheet() {
    const list = this.data.badges.map((b) => ({
      name: b.name,
      sub: b.sub,
      desc: b.desc,
      icon: b.icon,
      color: b.color,
      ring: b.ring,
      locked: b.locked,
      tag: b.tag,
      current: (b.progress && b.progress.current) || 0,
      target: (b.progress && b.progress.target) || 1,
      percent: b.progress ? Math.round((b.progress.current / b.progress.target) * 100) : 0,
    }));
    const unlocked = list.filter((b) => !b.locked);
    const locked = list.filter((b) => b.locked).sort((a, b) => b.percent - a.percent);
    this.setData({
      badgeSheet: true,
      badgeGroups: [
        { key: "on", title: "已点亮", hint: `${unlocked.length} 枚`, items: unlocked },
        { key: "off", title: "待解锁", hint: `${locked.length} 枚`, items: locked },
      ],
    });
  },

  closeBadgeSheet() {
    this.setData({ badgeSheet: false });
  },

  /* ---------------- 顶部更多 ---------------- */
  toggleMore() {
    this.setData({ moreMenu: !this.data.moreMenu });
  },

  closeMore() {
    this.setData({ moreMenu: false });
  },

  exportReport() {
    this.setData({ moreMenu: false });
    const text = store.buildReportText();
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "学习报告已复制", icon: "success" }),
      fail: () => wx.showToast({ title: "复制失败，稍后再试", icon: "none" }),
    });
  },

  goVocab() {
    tab.go("vocab", "archive", this);
  },

  scrollToBadges() {
    wx.pageScrollTo({ selector: "#badgeWall", duration: 260, fail: () => {} });
  },

  noop() {},

  toast(e) {
    const msg = (e && e.currentTarget && e.currentTarget.dataset.msg) || "提示";
    wx.showToast({ title: msg, icon: "none" });
  },

  openSettings() {
    tab.go("parent", "archive", this);
  },

  goHome() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  goReader() {
    const group = store.activeGroup();
    if (group) wx.navigateTo({ url: "/pages/reader/reader?groupId=" + group.id });
    else wx.navigateTo({ url: "/pages/capture/capture" });
  },

  badgeDetail(e) {
    const item = this.data.badges[e.currentTarget.dataset.index];
    wx.showModal({
      title: item.name,
      content: item.locked ? `解锁条件：${item.desc}（当前 ${item.sub}）` : `已获得，${item.desc}`,
      showCancel: false,
      confirmText: "知道啦",
      confirmColor: "#0ea5e9",
    });
  },

  /* 家长门禁 */
  makeGate() {
    const a = 13 + Math.floor(Math.random() * 17);
    const b = 11 + Math.floor(Math.random() * 19);
    this._answer = String(a + b);
    this.setData({ gateExpr: a + " + " + b, gateAnswer: "" });
  },

  /** 点一下复制小朗读者 ID（发给老师/家长核对用） */
  copyReaderId() {
    wx.setClipboardData({
      data: this.data.readerId || "",
      success: () => wx.showToast({ title: "ID 已复制", icon: "success" }),
      fail: () => wx.showToast({ title: "复制失败", icon: "none" }),
    });
  },

  openGate() {
    this.makeGate();
    this.setData({ gateVisible: true, moreMenu: false });
  },

  closeGate() {
    this.setData({ gateVisible: false });
  },

  onGateInput(e) {
    this.setData({ gateAnswer: e.detail.value });
  },

  submitGate() {
    if (String(this.data.gateAnswer).trim() !== this._answer) {
      wx.showToast({ title: "答案不对，再算一次哦", icon: "none" });
      this.makeGate();
      return;
    }
    this.setData({ gateVisible: false });
    wx.navigateTo({ url: "/pages/parent/parent?pass=1" });
  },
});
