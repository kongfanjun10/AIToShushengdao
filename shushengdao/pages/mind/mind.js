const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const mind = require("../../utils/mind");
const mazeDraw = require("../../utils/mazeDraw");
const cheer = require("../../utils/cheer");

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    game: "maze", // maze | blocks | odd

    /* 迷宫（练习册风格：canvas 绘制，utils/mazeDraw.js 输出指令） */
    mazeLevels: mind.MAZE_LEVELS,
    mazeKey: "mz7",
    maze: [], // 二维数组
    cvW: 0, // 画布 css 尺寸（px，含进出箭头留白）
    cvH: 0,
    palName: "", // 本局主题名（绿篱花园 / 雪花木桥 / 草地公园）
    player: { r: 1, c: 1 },
    goal: { r: 5, c: 5 },
    steps: 0,
    mazeDone: false,
    dragOn: false, // 手指按在盘面上（描边高亮，提示「正在拖」）
    decor: [], // 死胡同装饰 [{r,c,e}]

    /* 找不同 */
    oddOpts: [],
    oddCat: "",
    oddPick: -1,
    oddShake: -1,
    oddDone: false,
    oddTip: "找出和其他三个不同类的",

    /* 方块 */
    tiles: [],
    bview: [], // 渲染用 { i, n, style }（绝对定位，便于拖动 + 滑动动画）
    drag: null, // { n, style, anim }
    moves: 0,
    blocksDone: false,
    bestMoves: 0,

    stats: { todayRight: 0, todayWrong: 0, percent: 0, streak: 0, best: 0, wrongCount: 0 },
  },

  onLoad() {
    this.setData(nav.sync());
    const s = store.mindStats();
    this.setData({ stats: s });
    this.newMaze(true);
    this.newBlocks();
    this.newOdd();
  },

  onShow() {
    if (!this._inited) {
      this._inited = true;
      return;
    }
    this.setData({ stats: store.mindStats() });
  },

  onUnload() {
    clearTimeout(this._nextT);
    clearTimeout(this._slideT);
    require("../../utils/tts").stop();
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },

  /* ---------------- 顶部页签 ---------------- */
  pickGame(e) {
    const g = e.currentTarget.dataset.g;
    if (g === this.data.game) return;
    this.setData({ game: g });
  },

  /* ================= 迷宫（练习册风格：粗圆头墙条 + 果点 + 红进蓝出箭头 + 死胡同装饰） ================= */

  // 入口固定在上方（0,1），出口在下方（n-2）——和练习册一样「从红箭头进，从蓝箭头出」
  ENTRANCE: { r: 0, c: 1 },

  newMaze(silent) {
    clearTimeout(this._nextT);
    const lv = mind.mazeLevelOf(this.data.mazeKey);
    const g = mind.genMaze(lv.size);
    const n = g.length;
    const goal = { r: n - 2, c: n - 2 };
    // 主题轮换：每换一局换一个配色（热身局保持首主题）
    this._palIdx = silent ? this._palIdx || 0 : (this._palIdx || 0) + 1;
    const pal = mazeDraw.palOf(this._palIdx);
    // 死胡同放小装饰（排除起点/终点，隔一个放一个，最多 8 处）
    const decor = mazeDraw.decorate(
      mazeDraw.deadEnds(g, [{ r: 1, c: 1 }, goal]).filter((p) => (p.r * 31 + p.c * 17) % 2 === 0).slice(0, 8)
    );
    const cvW = Math.round(this.cellPx(n) * (n + 1.6));
    this.setData({
      maze: g,
      goal: goal,
      player: { r: 1, c: 1 },
      steps: 0,
      mazeDone: false,
      decor: decor,
      palName: pal.name,
      cvW: cvW,
      cvH: cvW,
    });
    // 等画布渲染完成再画
    setTimeout(() => this.renderMazeCanvas(), 80);
  },

  /** 一格的 px 尺寸：600rpx 盘面宽换算 */
  cellPx(size) {
    let width = 375;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      width = (info && info.windowWidth) || 375;
    } catch (e) {}
    return ((600 / size) * width) / 750;
  },

  /** 生成绘制指令并画到 canvas；无 canvas 的环境（单测/预览）只保留指令供 SVG 转换 */
  renderMazeCanvas() {
    const g = this.data.maze;
    if (!g || !g.length) return;
    const n = g.length;
    const ops = mazeDraw.paintOps(g, {
      cell: this.cellPx(n),
      pal: mazeDraw.palOf(this._palIdx || 0),
      entrance: this.ENTRANCE,
      exit: { r: n - 1, c: n - 2 },
      player: this.data.mazeDone ? null : this.data.player,
      goal: this.data.goal,
      decor: this.data.decor,
    });
    this._mazeOps = ops;
    const self = this;
    const q = wx.createSelectorQuery().in(this);
    q.select("#mazeCanvas").fields({ node: true, size: true });
    q.exec((res) => {
      const r = res && res[0];
      if (!r || !r.node || !r.node.getContext) return;
      const canvas = r.node;
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
      const w = r.width || self.data.cvW;
      const h = r.height || self.data.cvH;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      mazeDraw.exec(ctx, ops);
    });
  },

  /** 拖动走位：走一格 */
  doMove(dr, dc) {
    if (this.data.game !== "maze" || this.data.mazeDone) return;
    const p = this.data.player;
    const nr = p.r + dr;
    const nc = p.c + dc;
    const g = this.data.maze;
    if (nr < 0 || nr >= g.length || nc < 0 || nc >= g[nr].length) return;
    // 撞墙：原地不动（不做震动/抖动特效）
    if (g[nr][nc] === 1) return;
    const player = { r: nr, c: nc };
    const steps = this.data.steps + 1;
    const done = nr === this.data.goal.r && nc === this.data.goal.c;
    this.setData({ player: player, steps: steps, mazeDone: done });
    this.renderMazeCanvas();
    const self = this;
    if (done) {
      const stats = store.markMind("maze", true, { level: this.data.mazeKey });
      this.setData({ stats: stats, tip: "走到出口啦！走了 " + steps + " 步" });
      cheer.praise();
      this._nextT = setTimeout(() => self.newMaze(), 1700);
    }
  },

  /* ---------------- 手指拖动走位（唯一玩法） ---------------- */
  onBoardTouchStart(e) {
    if (this.data.mazeDone) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    // 参照点跟着手指走：一次按住能连续走多格，像真的沿着通道拖
    this._ts = { x: t.clientX, y: t.clientY };
    this._cellPx = this.cellPx(this.data.maze.length || 13);
    this.setData({ dragOn: true });
  },

  onBoardTouchMove(e) {
    const t = e.touches && e.touches[0];
    const a = this._ts;
    if (!t || !a || this.data.mazeDone) return;
    const hit = mind.dragStep(a.x, a.y, t.clientX, t.clientY, this._cellPx);
    if (!hit) return;
    this._ts = { x: hit.x, y: hit.y };
    if (hit.dir === "u") this.doMove(-1, 0);
    else if (hit.dir === "d") this.doMove(1, 0);
    else if (hit.dir === "l") this.doMove(0, -1);
    else this.doMove(0, 1);
  },

  onBoardTouchEnd() {
    this._ts = null;
    if (this.data.dragOn) this.setData({ dragOn: false });
  },

  pickMazeLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.mazeKey) return;
    this.setData({ mazeKey: key });
    this.newMaze();
    wx.showToast({ title: "换成" + mind.mazeLevelOf(key).name + "啦", icon: "none" });
  },

  /* ================= 方块（数字滑块） ================= */

  // 格子尺寸与间距（rpx）：176 + 10 = 186 一格
  TILE_RPX: 176,
  PITCH_RPX: 186,

  /** 由 tiles 生成绝对定位的渲染数据：{ i, n, style } */
  buildView(tiles) {
    const pitch = this.PITCH_RPX;
    return tiles.map((n, i) => {
      const r = Math.floor(i / 3);
      const c = i % 3;
      return { i: i, n: n, style: "left:" + c * pitch + "rpx;top:" + r * pitch + "rpx;" };
    });
  },

  /** 一格在屏幕上的像素宽度（rpx → px），拖动距离换算用 */
  pitchPx() {
    let width = 375;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      width = (info && info.windowWidth) || 375;
    } catch (e) {}
    return (this.PITCH_RPX * width) / 750;
  },

  newBlocks() {
    clearTimeout(this._nextT);
    const r = mind.shuffleBlocks();
    const s = store.mindStats();
    const best = (s.byLevel && s.byLevel.blocks && s.byLevel.blocks.moves) || 0;
    this.setData({
      tiles: r.tiles,
      bview: this.buildView(r.tiles),
      drag: null,
      moves: 0,
      blocksDone: false,
      bestMoves: best,
    });
  },

  /* ---------------- 按住拖动 ---------------- */
  onTileStart(e) {
    if (this.data.blocksDone) return;
    const ds = e.currentTarget.dataset || {};
    const i = Number(ds.i);
    const n = Number(ds.n);
    if (!n) return; // 空格不拖
    const t = e.touches && e.touches[0];
    if (!t) return;
    this._drag = { i: i, n: n, sx: t.clientX, sy: t.clientY, moved: false };
    this.setData({ drag: { n: n, style: "transform:translate3d(0px,0px,0) scale(1.06);" } });
  },

  /** 拖动中：方块跟着手指走，锁定主方向（像在轨道里滑），最多一格 */
  onTileMove(e) {
    const d = this._drag;
    if (!d) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    let dx = t.clientX - d.sx;
    let dy = t.clientY - d.sy;
    if (!d.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    d.moved = true;
    const cap = this.pitchPx() * 1.05;
    if (Math.abs(dx) > Math.abs(dy)) {
      dy = 0;
      dx = Math.max(-cap, Math.min(cap, dx));
    } else {
      dx = 0;
      dy = Math.max(-cap, Math.min(cap, dy));
    }
    this.setData({
      drag: {
        n: d.n,
        style: "transform:translate3d(" + Math.round(dx) + "px," + Math.round(dy) + "px,0) scale(1.06);",
      },
    });
  },

  /** 松手：拖的方向正好对着空位就滑过去，否则弹回原位 */
  onTileEnd(e) {
    const d = this._drag;
    this._drag = null;
    if (!d) return;

    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    let dx = 0;
    let dy = 0;
    if (t) {
      dx = t.clientX - d.sx;
      dy = t.clientY - d.sy;
    }

    const blank = this.data.tiles.indexOf(0);
    const dir = d.moved ? mind.snapDir(dx, dy) : mind.dirToBlank(d.i, blank);
    const target = dir ? mind.stepIndex(d.i, dir) : -1;

    // 只有「拖/点的方向正好是空位」才允许滑，和真实滑块一样
    if (!dir || target !== blank) {
      this.setData({ drag: null }); // 回弹
      return;
    }

    // 先让方块顺着方向滑到空位（150ms），再落数据：视觉上连续，不会跳
    const off = mind.dirOffset(dir);
    const px = this.pitchPx();
    this.setData({
      drag: {
        n: d.n,
        anim: true,
        style:
          "transform:translate3d(" +
          Math.round(off.dc * px) +
          "px," +
          Math.round(off.dr * px) +
          "px,0) scale(1.02);",
      },
    });
    const self = this;
    clearTimeout(this._slideT);
    this._slideT = setTimeout(() => {
      const mv = mind.moveBlock(self.data.tiles, self.data.tiles.indexOf(0), d.i);
      if (!mv.moved) {
        self.setData({ drag: null });
        return;
      }
      self.finishMove(mv);
    }, 150);
  },

  /** 轻点（兼容老玩法 / 无障碍）：与空格相邻就直接滑一格 */
  tapTile(e) {
    if (this.data.blocksDone) return;
    const i = Number((e.currentTarget.dataset || {}).i);
    const cur = this.data.tiles;
    const mv = mind.moveBlock(cur, cur.indexOf(0), i);
    if (!mv.moved) return;
    this.finishMove(mv);
  },

  /** 落子：步数 +1、判断是否复原、记录成绩 */
  finishMove(mv) {
    const moves = this.data.moves + 1;
    const solved = mind.blocksSolved(mv.tiles);
    this.setData({
      tiles: mv.tiles,
      bview: this.buildView(mv.tiles),
      drag: null,
      moves: moves,
      blocksDone: solved,
    });
    const self = this;
    if (solved) {
      const stats = store.markMind("blocks", true, { level: "blocks", moves: moves });
      const best = (stats.byLevel && stats.byLevel.blocks && stats.byLevel.blocks.moves) || 0;
      const isRecord = !best || moves <= best;
      this.setData({
        stats: stats,
        bestMoves: best,
        tip2: isRecord ? "新纪录！只用了 " + moves + " 步" : "拼好啦！用了 " + moves + " 步",
      });
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e2) {}
      cheer.praise();
      this._nextT = setTimeout(() => self.newBlocks(), 1900);
    }
  },

  /* ================= 找不同（类别归类） ================= */
  newOdd() {
    clearTimeout(this._nextT);
    const r = mind.genOdd(4);
    this.setData({
      oddOpts: r.opts,
      oddCat: r.cat,
      oddPick: -1,
      oddShake: -1,
      oddDone: false,
      oddTip: "找出和其他三个不同类的",
    });
  },

  tapOdd(e) {
    if (this.data.oddDone) return;
    const i = Number((e.currentTarget.dataset || {}).i);
    const opt = this.data.oddOpts[i];
    if (!opt) return;
    const self = this;
    if (opt.odd) {
      // 答对：点亮那格 + 鼓励 + 播报类别，自动换下一题
      const stats = store.markMind("odd", true, { level: "odd" });
      this.setData({
        oddDone: true,
        oddPick: i,
        stats: stats,
        oddTip: "答对啦！其他三个都是" + this.data.oddCat + "，" + opt.e + " 不是",
      });
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e2) {}
      cheer.praise();
      this._nextT = setTimeout(() => self.newOdd(), 1800);
    } else {
      // 答错：抖一下 + 安抚，不换题让孩子再想
      const stats = store.markMind("odd", false, { level: "odd" });
      this.setData({ oddShake: i, stats: stats });
      cheer.comfort();
      setTimeout(() => self.setData({ oddShake: -1 }), 450);
    }
  },
});
