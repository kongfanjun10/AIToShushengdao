const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const calc = require("../../utils/calc");
const cheer = require("../../utils/cheer");

const TIME_LIMIT = 60; // 限时挑战秒数

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    levels: calc.LEVELS,
    levelKey: "add10",
    levelName: "10 以内",
    levelDesc: "1~10 的加减法，先练熟",

    q: { a: 0, b: 0, op: "+", answer: 0, expr: "", speak: "" },
    input: "",
    phase: "idle", // idle | right | wrong
    tip: "看题，算一算等于几",
    round: 1,
    history: [],

    stats: { todayRight: 0, todayWrong: 0, percent: 0, streak: 0, best: 0, wrongCount: 0 },

    onlyWrong: false,
    timed: false,
    left: TIME_LIMIT,
    over: false,
    overRight: 0,
    overWrong: 0,
    bestStreak: 0,
  },

  onLoad() {
    this.setData(nav.sync());
    const lv = store.calcLevel();
    const info = calc.levelOf(lv);
    this.setData({
      levelKey: lv,
      levelName: info.name,
      levelDesc: info.desc,
      stats: store.calcStats(),
    });
    this.next(true);
  },

  onShow() {
    if (!this._inited) {
      this._inited = true;
      return;
    }
    this.setData({ stats: store.calcStats() });
  },

  onHide() {
    this.stopClock();
    this.clearTimers();
  },

  onUnload() {
    this.stopClock();
    this.clearTimers();
    require("../../utils/tts").stop();
  },

  clearTimers() {
    clearTimeout(this._nextT);
    clearTimeout(this._hintT);
  },

  /* ---------------- 出题 ---------------- */
  next(silent) {
    this.clearTimers();
    let q = null;

    if (this.data.onlyWrong) {
      const list = store.calcWrongList();
      if (!list.length) {
        this.setData({ onlyWrong: false });
      } else {
        const pick = list[Math.floor(Math.random() * list.length)];
        q = calc.fromExpr(pick.expr);
        if (q) q.level = this.data.levelKey;
      }
    }
    if (!q) q = calc.gen(this.data.levelKey);

    this.setData({
      q: q,
      input: "",
      phase: "idle",
      tip: this.data.timed ? "快！算出来点 ✓" : "看题，算一算等于几",
      round: silent ? 1 : this.data.round + 1,
      stats: store.calcStats(),
    });
  },

  nextQuestion() {
    this.next();
  },

  /* ---------------- 键盘 ---------------- */
  press(e) {
    if (this.data.over) return;
    const k = e.currentTarget.dataset.k;
    if (k === "del") {
      this.setData({ input: this.data.input.slice(0, -1) });
      return;
    }
    if (k === "ok") {
      this.submit();
      return;
    }
    if (this.data.phase === "right") return; // 已经答对，等自动下一题
    const wasWrong = this.data.phase === "wrong";
    const cur = wasWrong ? "" : this.data.input;
    if (cur.length >= 3) return;
    // 答错后重新输入：清空上一次的答案，重新开始
    this.setData({
      input: cur + String(k),
      phase: "idle",
      tip: wasWrong ? "再算一次，慢慢来" : this.data.tip,
    });
  },

  submit() {
    if (this.data.phase === "right") return;
    const input = String(this.data.input || "").trim();
    if (!input) {
      wx.showToast({ title: "先输入答案哦", icon: "none" });
      return;
    }
    const q = this.data.q;
    const ok = calc.check(q, input);
    const stats = store.markCalc(q.expr, ok, { ans: q.answer });
    const history = this.data.history.concat([{ key: Date.now(), ok: ok }]).slice(-10);

    if (ok) {
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e) {}
      this.setData({
        phase: "right",
        tip: "你真棒哟",
        history: history,
        stats: stats,
        overRight: this.data.overRight + 1,
        bestStreak: Math.max(this.data.bestStreak, stats.streak),
      });
      const self = this;
      cheer.praise(() => self.autoNext());
      this._nextT = setTimeout(() => self.autoNext(), this.data.timed ? 700 : 1300);
      return;
    }

    this.setData({
      phase: "wrong",
      tip: "答错咯，要加油哟",
      history: history,
      stats: stats,
      overWrong: this.data.overWrong + 1,
    });
    cheer.comfort();
  },

  autoNext() {
    if (this.data.phase !== "right") return;
    this.clearTimers();
    if (this.data.over) return;
    this.next();
  },

  /** 答错后清空重填 */
  clearInput() {
    this.setData({ input: "", phase: "idle", tip: "再算一次，慢慢算" });
  },

  /* ---------------- 读题 ---------------- */
  speakQuestion() {
    const q = this.data.q;
    if (!q || !q.speak) return;
    require("../../utils/tts").speak(q.speak, { rate: 1, voice: "female" }).catch(() => {
      wx.showToast({ title: "语音暂时播不出来", icon: "none" });
    });
  },

  /** 卡住了：给一个提示 */
  showHint() {
    const q = this.data.q;
    if (!q || this.data.phase === "right") return;
    this.setData({ tip: "答案是 " + q.answer + "，再点一次 ✓ 试试" });
  },

  /* ---------------- 难度 ---------------- */
  pickLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.levelKey) return;
    const info = calc.levelOf(key);
    store.setCalcLevel(key);
    this.setData({ levelKey: key, levelName: info.name, levelDesc: info.desc, onlyWrong: false });
    this.next();
    wx.showToast({ title: "已换成「" + info.name + "」", icon: "none" });
  },

  toggleOnlyWrong() {
    const on = !this.data.onlyWrong;
    if (on && store.calcWrongList().length === 0) {
      wx.showToast({ title: "还没有错题，先做几道吧", icon: "none" });
      return;
    }
    this.setData({ onlyWrong: on });
    this.next();
    wx.showToast({ title: on ? "只出错过的题" : "已恢复随机出题", icon: "none" });
  },

  /* ---------------- 限时挑战 ---------------- */
  toggleTimed() {
    if (this.data.timed) {
      this.stopClock();
      this.setData({ timed: false, over: false, left: TIME_LIMIT });
      this.next();
      return;
    }
    this.setData({
      timed: true,
      over: false,
      left: TIME_LIMIT,
      overRight: 0,
      overWrong: 0,
      bestStreak: 0,
      round: 0,
    });
    this.next();
    this.startClock();
    wx.showToast({ title: "60 秒挑战开始！", icon: "none" });
  },

  startClock() {
    this.stopClock();
    this._clock = setInterval(() => {
      const left = this.data.left - 1;
      if (left <= 0) {
        this.stopClock();
        this.setData({ left: 0, over: true, phase: "idle", tip: "时间到" });
        wx.vibrateLong && wx.vibrateLong({});
        return;
      }
      this.setData({ left: left });
    }, 1000);
  },

  stopClock() {
    clearInterval(this._clock);
    this._clock = null;
  },

  restartTimed() {
    this.setData({ over: false, left: TIME_LIMIT, overRight: 0, overWrong: 0, bestStreak: 0, round: 0 });
    this.next();
    this.startClock();
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },
});
