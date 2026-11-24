const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const link = require("../../utils/link");
const cheer = require("../../utils/cheer");

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    levels: link.LEVELS,
    levelKey: "l10",
    levelDesc: "",
    levelTip: "小狗",

    // 左右卡片统一高度（rpx，随难度行数变化，保证两列等高整齐）
    cardH: 128,

    left: [],
    right: [],
    total: 0,

    // 选择状态：selSide 'L'|'R'|''，selIdx 下标（点选兜底用）
    selSide: "",
    selIdx: -1,
    // 拖拽中的卡片：actSide 'L'|'R'，actIdx 下标（高亮用，不参与判分逻辑）
    actSide: "",
    actIdx: -1,
    // 手指正在拖的线：{ x, y, len, ang }（px，相对棋盘）
    drag: null,
    // 已连对：lmap[rmap[i]] = true
    matchedL: {},
    matchedR: {},
    matchedCount: 0,
    // 连线：{ key, x, y, len, ang }（px，相对棋盘）
    lines: [],
    // 抖动提示
    shakeL: -1,
    shakeR: -1,

    round: 1,
    doneRounds: 0,
    stats: { todayRight: 0, todayWrong: 0, percent: 0, streak: 0, best: 0, wrongCount: 0 },
  },

  onLoad() {
    this.setData(nav.sync());
    const lv = store.linkLevel();
    this.setData({ levelKey: lv, levelDesc: link.levelOf(lv).desc, stats: store.linkStats() });
    this.newRound(true);
  },

  onReady() {
    this.cacheRects();
  },

  onShow() {
    if (!this._inited) {
      this._inited = true;
      return;
    }
    this.setData({ stats: store.linkStats() });
  },

  onUnload() {
    clearTimeout(this._nextT);
    require("../../utils/tts").stop();
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },

  /* ---------------- 出轮 ---------------- */
  newRound(silent) {
    clearTimeout(this._nextT);
    const r = link.gen(this.data.levelKey);
    // 卡片统一高度：行数 * 行高 + 行间距 + 上下内边距（与 wxss .face-grid 对应）
    const rows = r.level.rows;
    const cardH = rows * 48 + (rows - 1) * 8 + 24;
    this.setData({
      left: r.left,
      right: r.right,
      total: r.total,
      levelTip: r.level.tip,
      cardH: cardH,
      selSide: "",
      selIdx: -1,
      matchedL: {},
      matchedR: {},
      matchedCount: 0,
      lines: [],
      drag: null,
      actSide: "",
      actIdx: -1,
      shakeL: -1,
      shakeR: -1,
      round: silent ? 1 : this.data.round + 1,
      tip: r.level.desc,
    });
    // 新一局的卡片位置变了，重新量一次（等渲染完成）
    setTimeout(() => this.cacheRects(), 60);
  },

  nextRound() {
    this.newRound();
  },

  /* ---------------- 卡片位置缓存（拖拽判分用） ---------------- */

  /** 量一次棋盘和两列卡片的位置，缓存起来。拖拽时手指移动不再查询布局，避免卡顿 */
  cacheRects() {
    const nL = this.data.left.length;
    const nR = this.data.right.length;
    if (!nL || !nR) return;
    const q = wx.createSelectorQuery().in(this);
    q.select("#board").boundingClientRect();
    for (let i = 0; i < nL; i++) q.select("#lc-" + i).boundingClientRect();
    for (let i = 0; i < nR; i++) q.select("#rc-" + i).boundingClientRect();
    q.exec((res) => {
      if (!res || !res[0]) return;
      this._box = res[0];
      this._rectL = res.slice(1, 1 + nL);
      this._rectR = res.slice(1 + nL, 1 + nL + nR);
    });
  },

  /* ---------------- 拖拽连线 ---------------- */

  /** 按住卡片：从这张卡「朝对岸的边缘中点」拉出一条跟随手指的线（左卡从右边缘、右卡从左边缘） */
  onGrab(e) {
    const ds = e.currentTarget.dataset || {};
    const side = ds.side;
    const i = Number(ds.i);
    if (side !== "L" && side !== "R") return;
    if (side === "L" ? this.data.matchedL[i] : this.data.matchedR[i]) return;
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;

    const box = this._box;
    const rect = (side === "L" ? this._rectL : this._rectR) || [];
    const edge = link.edgeOf(rect[i], side);
    const start =
      edge && box
        ? { x: edge.x - box.left, y: edge.y - box.top }
        : { x: t.clientX - (box ? box.left : 0), y: t.clientY - (box ? box.top : 0) };

    this._drag = { side: side, i: i, sx: t.clientX, sy: t.clientY, moved: false, start: start };
    this._lastLen = 0;
    this.setData({
      actSide: side,
      actIdx: i,
      drag: { x: start.x, y: start.y, len: 0, ang: 0 },
    });
  },

  /** 手指移动：线跟着手指走（catchtouchmove，拖动时页面不滚） */
  onDragMove(e) {
    const d = this._drag;
    if (!d) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - d.sx;
    const dy = t.clientY - d.sy;
    if (!d.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    d.moved = true;
    const box = this._box || { left: 0, top: 0 };
    const g = link.lineGeom(d.start.x, d.start.y, t.clientX - box.left, t.clientY - box.top);
    if (Math.abs(g.len - this._lastLen) < 4) return; // 距离没怎么变就不重绘
    this._lastLen = g.len;
    this.setData({ drag: { x: g.x, y: g.y, len: g.len, ang: g.ang } });
  },

  /** 松手：落在对岸某张卡上就判分；只是轻点则退回点选玩法 */
  onDragEnd(e) {
    const d = this._drag;
    this._drag = null;
    this._lastLen = 0;
    if (!d) return;
    this.setData({ drag: null, actSide: "", actIdx: -1 });

    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;
    const otherSide = d.side === "L" ? "R" : "L";
    const otherRect = (otherSide === "L" ? this._rectL : this._rectR) || [];
    const hit = link.hitRect(otherRect, t.clientX, t.clientY, 16);

    if (hit > -1) {
      const already = otherSide === "R" ? this.data.matchedR[hit] : this.data.matchedL[hit];
      if (already) {
        wx.showToast({ title: "这条已经连过啦", icon: "none" });
        return;
      }
      const li = d.side === "L" ? d.i : hit;
      const ri = d.side === "L" ? hit : d.i;
      this.judge(li, ri);
      return;
    }

    // 没拖到任何卡：位移很小算「点了一下」，保留点两下的老玩法
    if (!d.moved) this.pick(d.side, d.i);
  },

  /* ---------------- 点选（拖拽的兜底玩法） ---------------- */
  tapLeft(e) {
    const i = e.currentTarget.dataset.i;
    this.pick("L", i);
  },

  tapRight(e) {
    const i = e.currentTarget.dataset.i;
    this.pick("R", i);
  },

  pick(side, idx) {
    if (this.data.selSide === side && this.data.selIdx === idx) {
      // 再点一次取消选择
      this.setData({ selSide: "", selIdx: -1 });
      return;
    }
    if (side === "L" && this.data.matchedL[idx]) return;
    if (side === "R" && this.data.matchedR[idx]) return;

    if (this.data.selSide === "" || this.data.selSide === side) {
      this.setData({ selSide: side, selIdx: idx });
      return;
    }

    // 两侧都有选择了 → 判分
    const li = side === "L" ? idx : this.data.selIdx;
    const ri = side === "L" ? this.data.selIdx : idx;
    this.judge(li, ri);
  },

  /** 判一对：数对就画线标记，数错就抖动提示（拖拽与点选共用） */
  judge(li, ri) {
    const ln = this.data.left[li] && this.data.left[li].n;
    const rn = this.data.right[ri] && this.data.right[ri].n;
    const self = this;
    if (ln === rn) {
      const stats = store.markLink("n" + ln, true);
      const matchedL = Object.assign({}, this.data.matchedL);
      const matchedR = Object.assign({}, this.data.matchedR);
      matchedL[li] = true;
      matchedR[ri] = true;
      const matchedCount = this.data.matchedCount + 1;
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e) {}
      this.setData({
        selSide: "",
        selIdx: -1,
        matchedL: matchedL,
        matchedR: matchedR,
        matchedCount: matchedCount,
        stats: stats,
      });
      this.drawLine(li, ri);
      cheer.praise();
      if (matchedCount >= this.data.total) {
        // 一轮全部连对
        this.setData({ doneRounds: this.data.doneRounds + 1, tip: "全连对啦！马上来下一轮" });
        this._nextT = setTimeout(() => self.newRound(), 1600);
      }
    } else {
      const stats = store.markLink("", false);
      cheer.comfort();
      this.setData({ shakeL: li, shakeR: ri, selSide: "", selIdx: -1, stats: stats });
      setTimeout(() => self.setData({ shakeL: -1, shakeR: -1 }), 450);
    }
  },

  /** 画一条已连对的线：两端都落在卡片「朝对岸的边缘中点」（左卡右边缘 → 右卡左边缘） */
  drawLine(li, ri) {
    const box = this._box;
    const a = (this._rectL || [])[li];
    const b = (this._rectR || [])[ri];
    if (box && a && b) {
      const ea = link.edgeOf(a, "L");
      const eb = link.edgeOf(b, "R");
      const g = link.lineGeom(ea.x - box.left, ea.y - box.top, eb.x - box.left, eb.y - box.top);
      this.pushLine(li, ri, g);
      return;
    }
    const q = wx.createSelectorQuery().in(this);
    q.select("#lc-" + li).boundingClientRect();
    q.select("#rc-" + ri).boundingClientRect();
    q.select("#board").boundingClientRect();
    q.exec((res) => {
      const a2 = res && res[0];
      const b2 = res && res[1];
      const box2 = res && res[2];
      if (!a2 || !b2 || !box2) return;
      const ea = link.edgeOf(a2, "L");
      const eb = link.edgeOf(b2, "R");
      const g = link.lineGeom(ea.x - box2.left, ea.y - box2.top, eb.x - box2.left, eb.y - box2.top);
      this.pushLine(li, ri, g);
    });
  },

  pushLine(li, ri, g) {
    if (!g || g.len < 1) return;
    const key = "ln" + li + "-" + ri;
    if (this.data.lines.some((l) => l.key === key)) return;
    const lines = this.data.lines.concat([{ key: key, x: g.x, y: g.y, len: g.len, ang: g.ang }]);
    this.setData({ lines: lines });
  },

  /* ---------------- 难度 ---------------- */
  pickLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.levelKey) return;
    const info = link.levelOf(key);
    store.setLinkLevel(key);
    this.setData({ levelKey: key, levelDesc: info.desc });
    this.newRound();
    wx.showToast({ title: "已换成「" + info.name + "」", icon: "none" });
  },

  /** 错题回顾意义不大，这里提供「重新打乱」 */
  reShuffle() {
    this.newRound();
    wx.showToast({ title: "重新打乱啦", icon: "none" });
  },
});
