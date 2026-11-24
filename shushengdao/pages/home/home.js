const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const charLib = require("../../utils/chars");
const profile = require("../../utils/profile");
const phoneticLib = require("../../utils/phonetics");
const pinyinLib = require("../../utils/pinyinLib");
const calcLib = require("../../utils/calc");
const columnLib = require("../../utils/column");
const wordLib = require("../../utils/words");
const bus = require("../../utils/bus");
const tab = require("../../utils/tab");
const notify = require("../../utils/notify");

const SUBJECTS = [
  { key: "chinese", name: "语文", hint: "听读 · 描写", icon: "ico-book-open", cls: "s-chn" },
  { key: "math", name: "数学", hint: "数字 · 口算", icon: "ico-calc", cls: "s-math" },
  { key: "english", name: "英语", hint: "音标 · 单词", icon: "ico-spellcheck", cls: "s-eng" },
];

const SUBJECT_PLANS = {
  math: {
    name: "数学",
    title: "更多玩法",
    tag: "筹备中",
    desc: "数字测试已经能玩啦，口算闯关和竖式计算正在准备",
    icon: "ico-calc",
    color: "#00687a",
    bg: "linear-gradient(135deg,#e0f2fe,#acedff)",
    foot: "先练读数字，口算题做好就上线",
    items: [
      "口算闯关 · 限时答题，答对自动升级",
      "竖式计算 · 一步一步列式，看得见过程",
      "错题本 · 自动收集算错的题，隔天再来一遍",
      "打卡与勋章 · 和语文共用连续天数",
    ],
  },
  english: {
    name: "英语",
    title: "单词与跟读",
    tag: "筹备中",
    desc: "音标已经能听啦，单词卡和跟读录音正在准备",
    icon: "ico-spellcheck",
    color: "#005b3d",
    bg: "linear-gradient(135deg,#dcfce7,#6ffbbe)",
    foot: "音标随时能听，其余内容做好就上线",
    items: [
      "单词卡 · 图片 + 发音 + 中文释义",
      "跟读录音 · 录下来自己回听，不评分只鼓励",
      "字母描写 · 26 个大小写字母的书写",
      "课文跟读 · 拍课本，逐句听读",
    ],
  },
};

const KIND_LABEL = { vowel: "元音", consonant: "辅音" };
const PY_KIND = { sm: "声母", dy: "单韵母", fy: "复韵母", bf: "鼻韵母", zt: "整体认读" };

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    nickname: "书声岛",
    avatar: "",
    subject: "chinese",
    subjects: SUBJECTS,
    plan: null,
    task: {},
    badge: {},
    write: {},
    pinyin: {},
    phonics: {},
    math: {},
    calc: {},
    column: {},
    words: {},
    ageModeLabel: "小学模式",
    // 消息中心（铃铛）
    notifOpen: false,
    notifCount: 0,
    notifList: [],
    toastVisible: false,
    toastText: "",
    moreMenu: false,
  },

  onLoad() {
    this.setData(nav.sync());
    this.load();
    // 孩子资料改动（家长中心改昵称/照片）即时同步，不用等返回再刷新
    this._offUser = bus.on("user", () => this.syncProfile());
  },

  onShow() {
    this.load();
    this.syncNotify();
    this.checkRest();
  },

  /** 每日时长上限：到点提醒休息（每天最多提醒一次，不强制退出） */
  checkRest() {
    if (!store.restTipNeeded()) return;
    const u = store.dailyUsage();
    store.markRestTip();
    wx.showModal({
      title: "今天的学习时间到啦",
      content: "今天已经朗读了 " + store.fmtDuration(u.usedSec) + "，让眼睛休息一下，明天继续更精彩 🌙",
      showCancel: false,
      confirmText: "好的，休息啦",
    });
  },

  onUnload() {
    if (this._offUser) this._offUser();
  },

  /** 消息源同步：勋章解锁 diff + 连续打卡里程碑（静默，失败不影响使用） */
  syncNotify() {
    try {
      const unlocked = store.getBadges().filter((b) => !b.locked).map((b) => ({ key: b.key, name: b.name, desc: b.desc }));
      notify.syncBadges(unlocked);
      notify.syncStreak(store.overview().streak);
      this.setData({ notifCount: notify.unreadCount() });
    } catch (e) {}
  },

  /** 轻量同步：只更新与孩子资料相关的显示 */
  syncProfile() {
    const user = store.getUser();
    this.setData({
      nickname: user.nickname || "小朋友",
      avatar: profile.avatar(),
      ageModeLabel: user.ageMode === "kid" ? "幼儿园模式" : "小学模式",
    });
  },

  load() {
    const user = store.getUser();
    const group = store.activeGroup();
    const p = group ? store.progressOf(group) : { read: 0, total: 0, percent: 0 };
    const next = store.nextBadge();
    const badge = next || {
      name: "『朗读达人』勋章",
      desc: "全部勋章已点亮，继续多多朗读吧",
      rarity: "传说",
      current: 3,
      target: 3,
      percent: 100,
      icon: "trophy",
    };
    const subject = SUBJECTS.filter((s) => s.key === user.subject)[0] ? user.subject : "chinese";
    this.setData({
      nickname: user.nickname || "小朋友",
      avatar: profile.avatar(),
      subject,
      plan: SUBJECT_PLANS[subject] || null,
      ageModeLabel: user.ageMode === "kid" ? "幼儿园模式" : "小学模式",
      write: this.buildWrite(user),
      pinyin: this.buildPinyin(),
      phonics: this.buildPhonics(),
      math: this.buildMath(),
      calc: this.buildCalc(),
      column: this.buildColumn(),
      link: this.buildLink(),
      mind: this.buildMind(),
      words: this.buildWords(),
      task: {
        groupTitle: group ? group.title : "还没有课文",
        lessonTitle: group ? group.lessonTitle : "先拍一张课文照片，开始今天的朗读",
        readCount: p.read,
        totalCount: p.total,
        percent: p.percent,
        hasGroup: !!group,
      },
      // 断点续读：最近课文列表（未完成的在前；已读完的也展示，可重读）
      resumeList: this.buildResume(),
      badge,
    });
  },

  /** 首页「断点续读」卡数据：最近的课文（最多 4 本，新拍的/最近读的排前） */
  buildResume() {
    return store.listGroups().slice(0, 4).map((g) => {
      const gp = store.progressOf(g);
      const mins = Math.max(1, Math.round((Date.now() - (g.updatedAt || g.createdAt)) / 60000));
      const agoText =
        mins < 60
          ? mins + "分钟前"
          : mins < 60 * 24
            ? Math.round(mins / 60) + "小时前"
            : Math.round(mins / (60 * 24)) + "天前";
      return {
        id: g.id,
        title: g.title,
        lessonTitle: g.lessonTitle,
        readCount: gp.read,
        totalCount: gp.total,
        percent: gp.percent,
        done: !!g.done,
        agoText,
      };
    });
  },

  /** 首页「文字描写」卡片数据：当前学段进度 + 接下来要写的 4 个字 */
  buildWrite(user) {
    const levelKey = user.writeLevel || "kid";
    const lv = charLib.getLevel(levelKey);
    const map = store.writtenMap();
    const stats = store.writingStats(levelKey);
    let preview = lv.chars.filter((c) => !map[c.c]).slice(0, 4);
    if (preview.length < 4) {
      preview = preview.concat(lv.chars.slice(0, 4 - preview.length));
    }
    return {
      levelKey: lv.key,
      levelName: lv.name,
      levelSub: lv.sub,
      done: stats.done,
      total: stats.total,
      percent: stats.percent,
      today: store.todayWritten(),
      preview: preview.map((c) => ({ c: c.c, py: c.py })),
    };
  },

  /** 首页「英语音标」卡片数据：掌握进度 + 接下来要听的 4 个音标 */
  buildPhonics() {
    const map = store.phonemeMap();
    const stats = store.phonemeStats();
    const all = phoneticLib.all();
    let preview = all.filter((p) => !map[p.id]).slice(0, 4);
    if (preview.length < 4) preview = preview.concat(all.slice(0, 4 - preview.length));
    return {
      done: stats.done,
      total: stats.total,
      percent: stats.percent,
      today: stats.today,
      preview: preview.map((p) => ({ id: p.id, ipa: p.ipa, kind: KIND_LABEL[p.kind] || "音标" })),
    };
  },

  /** 首页「汉语拼音」卡片数据：掌握进度 + 接下来要读的 4 个拼音 */
  buildPinyin() {
    const map = store.pinyinMap();
    const stats = store.pinyinStats();
    const all = pinyinLib.all();
    let preview = all.filter((p) => !map[p.id]).slice(0, 4);
    if (preview.length < 4) preview = preview.concat(all.slice(0, 4 - preview.length));
    return {
      done: stats.done,
      total: stats.total,
      percent: stats.percent,
      today: stats.today,
      preview: preview.map((p) => ({ id: p.id, py: p.py, kind: PY_KIND[p.group] || "拼音" })),
    };
  },

  /** 首页「数字测试」卡片数据：当前区间 + 今日战绩 + 3 个待读数字 */
  buildMath() {
    const range = store.mathRange();
    const stats = store.mathStats();
    const span = range.max - range.min + 1;
    const picks = [];
    const avoid = {};
    while (picks.length < 3 && picks.length < span) {
      const n = range.min + Math.floor(Math.random() * span);
      if (avoid[n]) continue;
      avoid[n] = true;
      picks.push(n);
    }
    return {
      rangeLabel: range.min + " ~ " + range.max,
      todayRight: stats.todayRight,
      todayWrong: stats.todayWrong,
      percent: stats.percent,
      streak: stats.streak,
      wrongCount: stats.wrongCount,
      preview: picks,
    };
  },

  /** 口算闯关卡：难度 + 连对 + 正确率 + 错题数 */
  buildCalc() {
    const s = store.calcStats();
    const info = calcLib.levelOf(store.calcLevel());
    return {
      levelName: info.name + " · " + info.sub,
      streak: s.streak,
      percent: s.percent,
      todayRight: s.todayRight,
      wrongCount: s.wrongCount,
    };
  },

  /** 竖式计算卡 */
  buildColumn() {
    const s = store.columnStats();
    const info = columnLib.levelOf(store.columnLevel());
    return {
      levelName: info.name,
      streak: s.streak,
      percent: s.percent,
      todayRight: s.todayRight,
      wrongCount: s.wrongCount,
    };
  },

  /** 图案与数字连线卡 */
  buildLink() {
    const s = store.linkStats();
    const lv = require("../../utils/link").levelOf(store.linkLevel());
    return {
      levelName: lv.name,
      todayRight: s.todayRight,
      percent: s.percent,
    };
  },

  /** 思维游戏卡 */
  buildMind() {
    const s = store.mindStats();
    return {
      todayRight: s.todayRight,
      best: s.best,
    };
  },

  /** 单词跟读卡：主题 + 3 个词预览 + 进度 */
  buildWords() {
    const s = store.wordsStats();
    const themes = wordLib.getGroups();
    const total = wordLib.all().length;
    const user = store.getUser();
    const themeKey = user.wordTheme || "animals";
    const theme = wordLib.getTheme(themeKey);
    const list = wordLib.list(theme.key);
    const preview = list.slice(0, 3).map((w) => ({ en: w.en, cn: w.cn }));
    return {
      themeKey: theme.key,
      themeName: theme.name,
      themeCount: themes.length,
      total: total,
      done: s.done,
      today: s.todayRead,
      follow: s.allFollow,
      percent: total ? Math.round((s.done / total) * 100) : 0,
      preview: preview,
    };
  },

  pickSubject(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.subject) return;
    store.setUser({ subject: key });
    this.setData({ subject: key, plan: SUBJECT_PLANS[key] || null });
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  goWrite() {
    wx.navigateTo({ url: "/pages/write/write?level=" + (this.data.write.levelKey || "kid") });
  },

  goPinyin() {
    wx.navigateTo({ url: "/pkgLearn/pages/pinyin/pinyin" });
  },

  goPhonics() {
    wx.navigateTo({ url: "/pkgLearn/pages/phonetics/phonetics" });
  },

  goMath() {
    wx.navigateTo({ url: "/pages/math/math" });
  },

  goCalc() {
    wx.navigateTo({ url: "/pages/calc/calc" });
  },

  goColumn() {
    wx.navigateTo({ url: "/pages/column/column" });
  },

  goLink() {
    wx.navigateTo({ url: "/pages/link/link" });
  },

  goMind() {
    wx.navigateTo({ url: "/pages/mind/mind" });
  },

  goWords() {
    wx.navigateTo({ url: "/pages/words/words" });
  },

  pickChinese() {
    store.setUser({ subject: "chinese" });
    this.setData({ subject: "chinese", plan: null });
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  goReader(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id;
    const group = (id && store.getGroup(id)) || store.activeGroup();
    if (!group) {
      this.goCapture();
      return;
    }
    // 还没听过就先带孩子听一遍，听熟了再开口
    if (!store.listenProgress(group).heard) {
      wx.navigateTo({ url: "/pages/listen/listen?groupId=" + group.id });
      return;
    }
    wx.navigateTo({ url: "/pages/reader/reader?groupId=" + group.id });
  },

  goCapture() {
    tab.go("capture", "home", this);
  },

  goArchive() {
    tab.go("archive", "home", this);
  },

  goVocab() {
    tab.go("vocab", "home", this);
  },

  goParent() {
    tab.go("parent", "home", this);
  },

  goFeedback() {
    wx.navigateTo({ url: "/pages/feedback/feedback" });
  },

  /* ---------------- 消息中心（右上角铃铛） ---------------- */
  decorateNotif() {
    return notify.list().map((n) => Object.assign({}, n, { timeText: notify.timeText(n.at) }));
  },

  openNotif() {
    this.setData({ notifOpen: true, notifList: this.decorateNotif() });
  },

  closeNotif() {
    this.setData({ notifOpen: false });
  },

  clearNotif() {
    notify.markAllRead();
    this.setData({ notifCount: 0, notifList: this.decorateNotif() });
    wx.showToast({ title: "已全部标记已读", icon: "none" });
  },

  /** 点一条消息：标已读，有跳转目标则前往 */
  onNotifItem(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.notifList.filter((n) => n.id === id)[0];
    notify.markRead(id);
    this.setData({ notifCount: notify.unreadCount() });
    if (item && item.go && item.go.url) {
      this.setData({ notifOpen: false });
      wx.navigateTo({ url: item.go.url, fail: () => {} });
    }
  },

  /** 顶部年龄模式标签：直达家长中心（进门禁后可切换模式） */
  goSettings() {
    wx.navigateTo({ url: "/pages/parent/parent" });
  },

  /** 底部任务栏（页签式）：点其他页签直接切换，不叠页面栈 */
  goTab(e) {
    tab.goTab(this, e, "home");
  },

  /** 同一个页签再点一次 */
  onSameTab(key) {
    if (key === "home") this.goTop();
  },

  /** 头像 / 昵称 → 家长中心的孩子资料（门禁通过后自动高亮资料卡） */
  goProfile() {
    wx.navigateTo({ url: "/pages/parent/parent?focus=profile" });
  },

  /** 底部导航「首页」：回到顶部并刷新数据 */
  goTop() {
    this.load();
    wx.pageScrollTo({ scrollTop: 0, duration: 240, fail: () => {} });
    this.toast({ currentTarget: { dataset: { msg: "已回到顶部，数据已刷新" } } });
  },

  /** 顶部「…」快捷菜单 */
  toggleMore() {
    this.setData({ moreMenu: !this.data.moreMenu });
  },

  closeMore() {
    this.setData({ moreMenu: false });
  },

  noop() {},

  toast(e) {
    const msg = (e && e.currentTarget && e.currentTarget.dataset.msg) || "提示信息";
    this.setData({ toastText: msg, toastVisible: true });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setData({ toastVisible: false }), 1600);
  },
});
