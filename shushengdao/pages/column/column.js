const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const col = require("../../utils/column");
const cheer = require("../../utils/cheer");
const tts = require("../../utils/tts");

const POS = ["个位", "十位", "百位", "千位"];

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    levels: col.LEVELS,
    levelKey: "add2",
    levelName: "两位数加",
    levelDesc: "个位对个位，十位对十位，从个位算起",

    q: { a: 0, b: 0, op: "+", answer: 0, cols: 2, steps: [], answerDigits: [] },
    labels: [],
    rowA: [],
    rowB: [],
    cellView: [],
    active: 0,
    stepTip: "",
    phase: "idle", // idle | right | wrong
    tip: "从个位开始，一位一位填",
    round: 1,
    showCarry: true,

    stats: { todayRight: 0, todayWrong: 0, percent: 0, streak: 0, best: 0, wrongCount: 0 },
    onlyWrong: false,
  },

  onLoad() {
    this.setData(nav.sync());
    const lv = store.columnLevel();
    const info = col.levelOf(lv);
    this.setData({
      levelKey: lv,
      levelName: info.name,
      levelDesc: "个位对个位，十位对十位，从个位算起",
      stats: store.columnStats(),
    });
    this.next(true);
  },

  onShow() {
    if (!this._inited) {
      this._inited = true;
      return;
    }
    this.setData({ stats: store.columnStats() });
  },

  onHide() {
    clearTimeout(this._nextT);
    tts.stop();
  },

  onUnload() {
    clearTimeout(this._nextT);
    tts.stop();
  },

  /* ---------------- 出题 ---------------- */
  next(silent) {
    clearTimeout(this._nextT);
    let q = null;
    if (this.data.onlyWrong) {
      const list = store.columnWrongList();
      if (!list.length) {
        this.setData({ onlyWrong: false });
      } else {
        const pick = list[Math.floor(Math.random() * list.length)];
        q = col.fromExpr(pick.expr);
        if (q) q.level = this.data.levelKey;
      }
    }
    if (!q) q = col.gen(this.data.levelKey);

    this._cells = new Array(q.cols).fill("");
    this._bad = {};
    this.setData({
      q: q,
      active: 0,
      phase: "idle",
      tip: "从个位开始，一位一位填",
      round: silent ? 1 : this.data.round + 1,
      stats: store.columnStats(),
    });
    this.renderCells();
  },

  nextQuestion() {
    this.next();
  },

  /** 把 cells 摊平成 WXML 要用的行（左→右：高位在前） */
  renderCells() {
    const q = this.data.q;
    const cols = q.cols;
    const cells = this._cells || [];
    const active = this.data.active;

    const cellView = [];
    for (let c = cols - 1; c >= 0; c--) {
      const st = q.steps[c] || {};
      cellView.push({
        i: c,
        v: cells[c] || "",
        active: c === active && this.data.phase !== "right",
        bad: !!this._bad[c],
        carry: this.data.showCarry && st.in ? 1 : 0,
        borrow: this.data.showCarry && st.in && q.op === "-" ? 1 : 0,
      });
    }

    const labels = [];
    for (let c = cols - 1; c >= 0; c--) labels.push(POS[c] || "");

    const da = col.digits(q.a, cols);
    const db = col.digits(q.b, cols);
    const rowA = [];
    const rowB = [];
    for (let c = cols - 1; c >= 0; c--) {
      rowA.push(da[c] === 0 && c === cols - 1 && String(q.a).length < cols ? "" : String(da[c]));
      rowB.push(String(db[c]));
    }

    const patch = { cellView: cellView, labels: labels, rowA: rowA, rowB: rowB };
    // 判分后保留结算文案，别被逐位提示覆盖
    if (this.data.phase === "idle") patch.stepTip = this.buildStepTip();
    this.setData(patch);
  },

  /** 当前这一位的计算提示（进位 / 借位说清楚） */
  buildStepTip() {
    const q = this.data.q;
    const i = this.data.active;
    if (i >= q.cols) return "";
    const st = q.steps[i] || {};
    const pos = POS[i] || "";
    const da = col.digits(q.a, q.cols)[i];
    const db = col.digits(q.b, q.cols)[i];
    if (q.op === "-") {
      if (st.in) {
        return pos + "：" + da + " 借 1 后是 " + (da + 10) + "，" + (da + 10) + " − " + db + " = " + st.digit;
      }
      if (st.out) {
        return pos + "：" + da + " 不够减 " + db + "，向高一位借 1";
      }
      return pos + "：" + da + " − " + db + " = " + st.digit;
    }
    if (st.in) {
      return pos + "：" + da + " + " + db + " + 1 = " + (da + db + 1) + "，写 " + st.digit + (st.out ? " 进 1" : "");
    }
    return pos + "：" + da + " + " + db + " = " + (da + db) + (st.out ? "，写 " + st.digit + " 进 1" : "");
  },

  /* ---------------- 输入 ---------------- */
  pickCol(e) {
    if (this.data.phase === "right") return;
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ active: i });
    this.renderCells();
  },

  press(e) {
    const k = e.currentTarget.dataset.k;
    if (k === "del") {
      this.del();
      return;
    }
    if (k === "ok") {
      this.submit();
      return;
    }
    if (this.data.phase === "right") return;
    const i = this.data.active;
    if (i >= this.data.q.cols) return;
    if (!this._cells) this._cells = [];
    // 重新填这一位时，把它右边（低位）的进位标记刷新一下
    this._cells[i] = String(k);
    delete this._bad[i];
    let next = i + 1;
    while (next < this.data.q.cols && this._cells[next]) next++;
    this.setData({
      active: Math.min(next, this.data.q.cols - 1),
      phase: "idle",
      tip: "一位一位来，别着急",
    });
    this.renderCells();
    if (this.isFull()) this.submit();
  },

  del() {
    if (this.data.phase === "right") return;
    const i = this.data.active;
    if (this._cells && this._cells[i]) {
      this._cells[i] = "";
      delete this._bad[i];
    } else if (i > 0) {
      this._cells[i - 1] = "";
      delete this._bad[i - 1];
      this.setData({ active: i - 1 });
    }
    this.setData({ phase: "idle" });
    this.renderCells();
  },

  isFull() {
    const cells = this._cells || [];
    for (let i = 0; i < this.data.q.cols; i++) {
      if (!cells[i]) return false;
    }
    return true;
  },

  submit() {
    if (this.data.phase === "right") return;
    if (!this.isFull()) {
      // 跳到第一个没填的位
      const cells = this._cells || [];
      let first = 0;
      while (first < this.data.q.cols && cells[first]) first++;
      this.setData({ active: Math.min(first, this.data.q.cols - 1), tip: "还有空位没填哦" });
      this.renderCells();
      return;
    }

    const q = this.data.q;
    const ok = col.isComplete(q, this._cells);
    const stats = store.markColumn(q.expr, ok, { ans: q.answer });
    if (ok) {
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e) {}
      this.setData({
        phase: "right",
        tip: "你真棒哟",
        stats: stats,
        stepTip: "全对！答案是 " + q.answer,
      });
      this.renderCells();
      const self = this;
      cheer.praise(() => self.autoNext());
      this._nextT = setTimeout(() => self.autoNext(), 1500);
      return;
    }

    // 标出错的位，方便孩子自己找
    this._bad = {};
    for (let i = 0; i < q.cols; i++) {
      if (String(this._cells[i]) !== String(q.answerDigits[i])) this._bad[i] = 1;
    }
    this.setData({
      phase: "wrong",
      tip: "答错咯，要加油哟",
      stats: stats,
      stepTip: "红色这一位再算算，别的都对啦",
    });
    this.renderCells();
    cheer.comfort();
  },

  autoNext() {
    if (this.data.phase !== "right") return;
    clearTimeout(this._nextT);
    this.next();
  },

  /** 答错后清空重来 */
  retry() {
    this._bad = {};
    this._cells = new Array(this.data.q.cols).fill("");
    this.setData({ phase: "idle", active: 0, tip: "重新算一遍，从个位开始" });
    this.renderCells();
  },

  /** 答案看不懂时，直接把进位/借位讲出来 */
  toggleCarry() {
    this.setData({ showCarry: !this.data.showCarry });
    this.renderCells();
    wx.showToast({ title: this.data.showCarry ? "显示进位/借位" : "隐藏进位标记", icon: "none" });
  },

  readQuestion() {
    const q = this.data.q;
    const w = q.op === "+" ? "加" : "减";
    tts.speak(q.a + " " + w + " " + q.b + " 等于几", { rate: 1, voice: "female" }).catch(() => {
      wx.showToast({ title: "语音暂时播不出来", icon: "none" });
    });
  },

  /* ---------------- 难度 / 错题 ---------------- */
  pickLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.levelKey) return;
    const info = col.levelOf(key);
    store.setColumnLevel(key);
    this.setData({ levelKey: key, levelName: info.name, onlyWrong: false });
    this.next();
    wx.showToast({ title: "已换成「" + info.name + "」", icon: "none" });
  },

  toggleOnlyWrong() {
    const on = !this.data.onlyWrong;
    if (on && store.columnWrongList().length === 0) {
      wx.showToast({ title: "还没有错题，先做几道吧", icon: "none" });
      return;
    }
    this.setData({ onlyWrong: on });
    this.next();
    wx.showToast({ title: on ? "只出错过的题" : "已恢复随机出题", icon: "none" });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },
});
