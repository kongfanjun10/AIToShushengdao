const app = getApp();
const store = require("../../utils/store");
const charLib = require("../../utils/chars");
const tts = require("../../utils/tts");
const nav = require("../../utils/nav");
const strokeLib = require("../../utils/strokeData");
const strokePlay = require("../../utils/strokePlay");

/** 学伴宠物皮肤清单（点击宠物依次切换） */
const PETS = [
  { key: "chick", name: "小鸡咕咕" },
  { key: "fox", name: "小狐狸阿橘" },
  { key: "frog", name: "小青蛙呱呱" },
];

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    /* 横屏：左侧笔顺教程 + 右侧真实描写 */
    landscape: false,
    ls: {
      head: 36,
      pad: 8,
      gap: 10,
      bodyH: 320,
      cardPad: 8,
      ink: 260,
      tut: 240,
      leftW: 380,
      rightW: 320,
      toolW: 42,
      navRight: 0,
    },
    tut: { total: 0, index: 0, playing: false, ready: false },
    tutDots: [],
    tutCompact: false,
    levels: [],
    levelKey: "kid",
    levelName: "",
    levelSub: "",
    levelNote: "",
    index: 0,
    total: 0,
    char: {},
    chars: [],
    doneCount: 0,
    percent: 0,
    todayCount: 0,
    ghostOn: true,
    canUndo: false,
    reviewing: false,
    penWidth: 24,
    justDone: false,
    speaking: false,
    speakingWord: "",
    /* 学伴宠物 */
    petSkin: "chick",
    petState: "idle",
    swap: "",
  },

  onLoad(options) {
    this.setData(nav.sync());
    this._paths = [];
    this._baseCount = 0;
    this._ph = { idx: 0, t: 0, hold: 0 };
    const user0 = store.getUser();
    this.setData({ petSkin: PETS.some((p) => p.key === user0.pet) ? user0.pet : "chick" });
    // 先定方向（竖屏 / 横屏），后面的样式都依赖它
    this.computeOrientation();
    const user = store.getUser();
    const levelKey = (options && options.level) || user.writeLevel || "kid";
    let lv = charLib.getLevel(levelKey);
    const wantChar = (options && options.char) || user.writeChar || "";
    let idx = lv.chars.findIndex((c) => c.c === wantChar);
    // 深链只带了字没带学段：到别的学段里找
    if (wantChar && idx < 0) {
      for (let i = 0; i < charLib.LEVELS.length; i++) {
        const j = charLib.LEVELS[i].chars.findIndex((c) => c.c === wantChar);
        if (j >= 0) {
          lv = charLib.getLevel(charLib.LEVELS[i].key);
          idx = j;
          break;
        }
      }
    }
    idx = Math.max(0, idx);
    this.setData({
      levels: charLib.LEVELS.map((l) => ({ key: l.key, name: l.name, total: l.total })),
      levelKey: lv.key,
      levelName: lv.name,
      levelSub: lv.sub,
      levelNote: lv.note,
      todayCount: store.todayWritten(),
    });
    this.loadLevel(lv.key, idx, false);
    // 首次进入也要回看这个字上次保存的笔迹（画布未就绪会先挂起，onReady 后补画）
    this.loadTrace(this.data.char && this.data.char.c);
    // 旋转屏幕时小程序会回调 onResize；再挂一个兜底监听，机型差异下都能收到
    if (wx.onWindowResize) {
      this._onWinResize = (res) => this.handleResize(res && res.size);
      wx.onWindowResize(this._onWinResize);
    }
  },

  onReady() {
    this.initCanvas();
    this.initTutorial();
  },

  onShow() {
    this.setData({ todayCount: store.todayWritten() });
    // 从其他页面返回时画布尺寸可能变化，重新取一次节点
    if (!this._ctx) this.initCanvas();
    if (this.data.landscape && !this._tutCtx) this.initTutorial();
  },

  onHide() {
    this.stopSpeak();
    this.pauseTut();
  },

  onUnload() {
    this.stopSpeak();
    this.pauseTut();
    if (this._swapTimer) {
      clearTimeout(this._swapTimer);
      this._swapTimer = null;
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    if (wx.offWindowResize && this._onWinResize) {
      wx.offWindowResize(this._onWinResize);
      this._onWinResize = null;
    }
  },

  /* ---------------- 方向与横屏尺寸 ---------------- */
  /** 计算竖屏 / 横屏以及横屏各块尺寸（全部用 px，横屏下 rpx 会随宽度膨胀，不能直接用） */
  computeOrientation() {
    let info = {};
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      info = {};
    }
    const W = info.windowWidth || 375;
    const H = info.windowHeight || 667;
    this._winW = W;
    this._winH = H;
    const nl = nav.sync();
    const landscape = W > H;

    if (landscape) {
      const pad = 8;
      const gap = 10;
      const cardPad = 8;
      const head = Math.min(46, Math.max(34, nl.navH));
      const bodyH = Math.max(180, H - head - pad * 2);
      const ctaH = 40;
      // 右侧：田字格 + 竖排工具条 + 底部按钮
      const inkMaxH = bodyH - cardPad * 2 - ctaH - 6;
      const ink = Math.max(130, Math.min(inkMaxH, Math.round(W * 0.42)));
      const toolW = 42;
      const rightW = ink + cardPad * 2 + toolW;
      const leftW = Math.max(200, W - rightW - gap - pad * 2);
      // 左侧：标题 + 笔顺格 + 控制条
      const tut = Math.max(110, Math.min(leftW - cardPad * 2, bodyH - cardPad * 2 - 22 - 6 - 32));
      this.setData({
        landscape: true,
        statusBar: 0,
        navH: head,
        navRight: 0,
        ls: {
          head,
          pad,
          gap,
          bodyH,
          cardPad,
          ink,
          tut,
          leftW,
          rightW,
          toolW,
          ctaH,
          navRight: nl.navRight,
          h: H,
        },
      });
      return true;
    }

    this.setData({
      landscape: false,
      statusBar: nl.statusBar,
      navH: nl.navH,
      navRight: nl.navRight,
    });
    return false;
  },

  handleResize(size) {
    if (!size || !size.windowWidth || !size.windowHeight) return;
    // 尺寸没变（有些机型会重复回调）就不用重建画布
    if (size.windowWidth === this._winW && size.windowHeight === this._winH) return;
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      this._resizeTimer = null;
      this.applyOrientation();
    }, 80);
  },

  /** Page 生命周期：屏幕尺寸变化（含旋转） */
  onResize(res) {
    this.handleResize(res && res.size);
  },

  /** 重排：先按归一化坐标存下当前笔迹，重建两块画布，再按新尺寸还原 */
  applyOrientation() {
    const norm = this.snapshotInk();
    this._pendingNorm = norm;
    this.pauseTut();
    this._ctx = null;
    this._canvas = null;
    this._tutCtx = null;
    this._tutCanvas = null;
    this.computeOrientation();
    this.setData({ "tut.ready": false });
    const after = () => {
      this.initCanvas();
      if (this.data.landscape) this.initTutorial();
    };
    if (wx.nextTick) wx.nextTick(after);
    else setTimeout(after, 60);
  },

  /** 把当前笔迹转成 0~1 归一化坐标，便于换尺寸后还原 */
  snapshotInk() {
    if (!this._paths || !this._paths.length || !this._w) return null;
    const w = this._w;
    const h = this._h;
    return this._paths.map((p) => ({
      w: p.w / w,
      pts: p.pts.map((q) => ({ x: q.x / w, y: q.y / h })),
    }));
  },

  restoreInk(norm) {
    if (!norm || !norm.length || !this._ctx) return;
    const w = this._w;
    const h = this._h;
    this._paths = norm.map((p) => ({
      w: Math.max(6, Math.min(80, p.w * w)),
      pts: p.pts.map((q) => ({ x: q.x * w, y: q.y * h })),
    }));
    this._pendingNorm = null;
    this.redraw();
    this.setData({ canUndo: this._paths.length > (this._baseCount || 0) });
  },

  /* ---------------- 读音 ---------------- */
  stopSpeak() {
    tts.stop();
    if (this.data.speaking || this.data.speakingWord) {
      this.setData({ speaking: false, speakingWord: "" });
    }
  },

  /** 读当前字 */
  speakChar() {
    const ch = this.data.char && this.data.char.c;
    if (!ch) return;
    this.play(ch, "");
  },

  /** 读组词（点哪个词读哪个） */
  speakWord(e) {
    const word = e.currentTarget.dataset.word;
    if (!word) return;
    this.play(word, word);
  },

  play(text, word) {
    const user = store.getUser();
    tts.stop();
    this.setData({ speaking: true, speakingWord: word || "" });
    tts
      .speak(text, {
        rate: user.speechRate,
        voice: user.ttsVoice,
        onEnd: () => this.setData({ speaking: false, speakingWord: "" }),
        onError: () => this.setData({ speaking: false, speakingWord: "" }),
      })
      .catch((err) => {
        this.setData({ speaking: false, speakingWord: "" });
        this.handleTtsError(err);
      });
  },

  handleTtsError(err) {
    const code = err && err.code;
    if (code === "PLUGIN_MISSING" || code === "NO_CHANNEL" || code === "PLUGIN_OFF") {
      wx.showModal({
        title: "语音暂不可用",
        content:
          "可以在小程序后台添加「微信同声传译」插件，或开通云开发后部署 cloudfunctions/tts（详见 README 语音范读一节）。设置好就能听读音啦。",
        showCancel: false,
        confirmText: "知道了",
        confirmColor: "#0ea5e9",
      });
      return;
    }
    wx.showToast({ title: (err && err.errMsg) || "语音播放失败", icon: "none" });
  },

  /* ---------------- 学段与字 ---------------- */
  loadLevel(levelKey, index, resetInk) {
    const lv = charLib.getLevel(levelKey);
    tts.stop();
    const map = store.writtenMap();
    const chars = lv.chars.map((c) => ({
      id: c.id,
      c: c.c,
      py: c.py,
      done: !!map[c.c],
      saved: store.hasTrace(c.c),
    }));
    const stats = store.writingStats(lv.key);
    const idx = Math.max(0, Math.min(index || 0, lv.chars.length - 1));
    const raw = lv.chars[idx];
    this.setData({
      levelKey: lv.key,
      levelName: lv.name,
      levelSub: lv.sub,
      levelNote: lv.note,
      chars,
      index: idx,
      total: lv.chars.length,
      char: {
        c: raw.c,
        py: raw.py,
        words: String(raw.words || "").split("·").filter((w) => w),
      },
      doneCount: stats.done,
      percent: stats.percent,
      justDone: !!map[raw.c],
      speaking: false,
      speakingWord: "",
    });
    store.setUser({ writeLevel: lv.key, writeChar: raw.c });
    if (resetInk !== false) this.loadTrace(raw.c);
    this.loadStrokes(raw.c);
  },

  pickLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.levelKey) return;
    this.loadLevel(key, 0, true);
  },

  pickChar(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.loadLevel(this.data.levelKey, index, true);
  },

  prevChar() {
    if (this.data.index <= 0) {
      wx.showToast({ title: "已经是第一个字啦", icon: "none" });
      return;
    }
    this.loadLevel(this.data.levelKey, this.data.index - 1, true);
  },

  nextChar() {
    if (this.data.index >= this.data.total - 1) {
      wx.showToast({ title: "这一册写完啦，去下一学段看看", icon: "none" });
      return;
    }
    this.loadLevel(this.data.levelKey, this.data.index + 1, true);
  },

  /* ---------------- 画布 ---------------- */
  initCanvas(done) {
    const q = wx.createSelectorQuery().in(this);
    q.select("#ink")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) return;
        const canvas = info.node;
        const ctx = canvas.getContext("2d");
        let dpr = 2;
        try {
          dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        } catch (e) {
          dpr = 2;
        }
        canvas.width = Math.round(info.width * dpr);
        canvas.height = Math.round(info.height * dpr);
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        this._canvas = canvas;
        this._ctx = ctx;
        this._w = info.width;
        this._h = info.height;
        this.redraw();
        // 画布就绪前如果已经要回看笔迹，这里补画一次
        if (this._pendingTrace) {
          const t = this._pendingTrace;
          this._pendingTrace = null;
          this.applyTrace(t);
        }
        // 旋转前留下的待还原笔迹（当时画布没查到节点）
        if (this._pendingNorm) {
          const norm = this._pendingNorm;
          this._pendingNorm = null;
          this.restoreInk(norm);
        }
        if (typeof done === "function") done();
      });
  },

  /* ---------------- 笔顺演示（横屏左栏） ---------------- */
  /** 换字时载入笔顺数据，横屏下自动演示一遍 */
  loadStrokes(ch) {
    this.pauseTut();
    const list = strokeLib.getStrokes(ch) || [];
    const total = list.length;
    this._strokes = list;
    this._ph = { idx: 0, t: 0, hold: 0 };
    const dots = [];
    for (let i = 0; i < Math.min(total, 20); i++) dots.push(i);
    this.setData({
      "tut.total": total,
      "tut.index": 0,
      "tut.playing": false,
      "tut.ready": !!this._tutCtx,
      tutDots: dots,
      tutCompact: total > 12,
    });
    if (!total) {
      this._autoPlay = false;
      if (this._tutCtx && this._tutSize) {
        this._tutCtx.clearRect(0, 0, this._tutSize, this._tutSize);
      }
      return;
    }
    if (this._tutCtx) {
      this._autoPlay = false;
      this.drawTutFrame(0, 0);
      this.playTut();
    } else {
      // 竖屏没有教程画布，等转到横屏（或画布就绪）再演示
      this._autoPlay = true;
    }
  },

  initTutorial() {
    if (!this.data.landscape) {
      this._tutCtx = null;
      return;
    }
    const q = wx.createSelectorQuery().in(this);
    q.select("#tut")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) return;
        const canvas = info.node;
        const ctx = canvas.getContext("2d");
        let dpr = 2;
        try {
          dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        } catch (e) {
          dpr = 2;
        }
        canvas.width = Math.round(info.width * dpr);
        canvas.height = Math.round(info.height * dpr);
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        this._tutCanvas = canvas;
        this._tutCtx = ctx;
        this._tutSize = info.width;
        this.setData({ "tut.ready": true });
        const ph = this._ph || { idx: 0, t: 0, hold: 0 };
        if (this._autoPlay && this.data.tut.total) {
          this._autoPlay = false;
          this._ph = { idx: 0, t: 0, hold: 0 };
          this.drawTutFrame(0, 0);
          this.playTut();
        } else {
          this.drawTutFrame(ph.idx, ph.t);
        }
      });
  },

  drawTutFrame(idx, t) {
    if (!this._tutCtx || !this._tutSize) return;
    strokePlay.draw(this._tutCtx, this._tutSize, this._strokes, idx, t);
  },

  requestFrame(cb) {
    if (this._tutCanvas && this._tutCanvas.requestAnimationFrame) {
      return this._tutCanvas.requestAnimationFrame(cb);
    }
    return setTimeout(cb, 16);
  },

  playTut() {
    if (!this.data.tut.total) {
      wx.showToast({ title: "这个字暂时没有笔顺演示", icon: "none" });
      return;
    }
    if (!this._tutCtx) return;
    const ph = this._ph || { idx: 0, t: 0, hold: 0 };
    if (ph.idx >= this.data.tut.total - 1 && ph.t >= 0.999) {
      ph.idx = 0;
      ph.t = 0;
      this.setData({ "tut.index": 0 });
    }
    this._ph = ph;
    this._tutDur = 520;
    this._tutPlaying = true;
    this._tutLast = Date.now();
    this.setData({ "tut.playing": true });
    this.scheduleTut();
  },

  scheduleTut() {
    if (!this._tutPlaying) return;
    this._tutRAF = this.requestFrame(() => this.tutLoop());
  },

  /** 逐帧推进：一笔写完停 190ms 再起下一笔 */
  tutLoop() {
    if (!this._tutPlaying || !this._tutCtx) return;
    const now = Date.now();
    const dt = Math.min(64, Math.max(0, now - (this._tutLast || now)));
    this._tutLast = now;
    const ph = this._ph;
    const total = this.data.tut.total;

    if (ph.hold > 0) {
      ph.hold -= dt;
      if (ph.hold <= 0) {
        if (ph.idx < total - 1) {
          ph.idx += 1;
          ph.t = 0;
          ph.hold = 0;
          this.setData({ "tut.index": ph.idx });
        } else {
          this._tutPlaying = false;
          this.drawTutFrame(ph.idx, 1);
          this.setData({ "tut.playing": false });
          return;
        }
      }
    } else {
      ph.t = Math.min(1, ph.t + dt / this._tutDur);
      if (ph.t >= 1) ph.hold = 190;
    }

    this.drawTutFrame(ph.idx, ph.t);
    this.scheduleTut();
  },

  pauseTut() {
    this._tutPlaying = false;
    this._tutRAF = null;
    if (this.data.tut && this.data.tut.playing) this.setData({ "tut.playing": false });
  },

  toggleTut() {
    if (this.data.tut.playing) this.pauseTut();
    else this.playTut();
  },

  tutReplay() {
    this.pauseTut();
    if (!this.data.tut.total) return;
    this._ph = { idx: 0, t: 0, hold: 0 };
    this.setData({ "tut.index": 0 });
    this.drawTutFrame(0, 0);
    this.playTut();
  },

  /** 手动上一笔 / 下一笔：data-d = -1 / 1 */
  tutStep(e) {
    const d = Number(e.currentTarget.dataset.d) || 0;
    const total = this.data.tut.total;
    if (!total) return;
    this.pauseTut();
    const ph = this._ph || { idx: 0, t: 0, hold: 0 };
    let idx = ph.idx + d;
    if (idx < 0) idx = 0;
    if (idx > total - 1) idx = total - 1;
    ph.idx = idx;
    ph.t = 1;
    ph.hold = 0;
    this._ph = ph;
    this.setData({ "tut.index": idx });
    this.drawTutFrame(idx, 1);
  },

  /** 竖屏下的「横屏看笔顺」提示 */
  showRotateTip() {
    const total = this.data.tut.total;
    wx.showModal({
      title: "横过来写，看得更清楚",
      content: total
        ? `把手机横过来：左边是这个字的 ${total} 笔笔顺演示，右边是田字格，跟着一笔一笔描。`
        : "把手机横过来：左边看笔顺，右边在田字格里跟着写。",
      confirmText: "知道啦",
      showCancel: false,
      confirmColor: "#0ea5e9",
    });
  },

  showPortraitTip() {
    wx.showToast({ title: "把手机竖回来就回到单栏", icon: "none" });
  },

  /* ---------------- 笔迹：保存与回看 ---------------- */
  /** 把存储里的归一化坐标还原成当前画布尺寸下的笔画 */
  decodeTrace(tr) {
    const w = this._w || 300;
    const h = this._h || 300;
    const out = [];
    ((tr && tr.paths) || []).forEach((p) => {
      const flat = p.p || [];
      const pts = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        pts.push({ x: (flat[i] / 1000) * w, y: (flat[i + 1] / 1000) * h });
      }
      if (!pts.length) return;
      const lw = p.w ? (p.w / 1000) * w : 24;
      out.push({ w: Math.max(6, Math.min(60, lw)), pts: pts });
    });
    return out;
  },

  /** 把一份笔迹画到画布上，并标记为「回看」状态 */
  applyTrace(tr) {
    const paths = this.decodeTrace(tr);
    if (!paths.length) return;
    this._paths = paths;
    this._baseCount = paths.length;
    this.setData({ reviewing: true, canUndo: false });
    this.redraw();
  },

  /** 切字时调用：有旧笔迹就回看，没有就空着 */
  loadTrace(ch) {
    this.clearInk();
    if (!ch) return;
    const tr = store.getTrace(ch);
    if (!tr) return;
    if (!this._ctx) {
      this._pendingTrace = tr;
      return;
    }
    this.applyTrace(tr);
  },

  /** 重新描写：只清屏幕，不动已保存的笔迹（没点「我写好啦」就不会覆盖） */
  restartInk() {
    this.clearInk();
    wx.showToast({ title: "重新描一遍吧", icon: "none" });
  },

  /** 取触点坐标（canvas 事件自带相对坐标） */
  pointOf(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || {};
    return { x: t.x || 0, y: t.y || 0 };
  },

  onInkStart(e) {
    if (!this._ctx) return;
    this._cur = { w: this.data.penWidth || 24, pts: [this.pointOf(e)] };
    this.drawDot(this._cur.pts[0]);
  },

  onInkMove(e) {
    if (!this._ctx || !this._cur) return;
    const pts = this._cur.pts;
    const p = this.pointOf(e);
    const last = pts[pts.length - 1];
    if (Math.abs(p.x - last.x) < 0.6 && Math.abs(p.y - last.y) < 0.6) return;
    pts.push(p);
    this.strokeSegment(pts);
  },

  onInkEnd() {
    if (!this._cur) return;
    if (this._cur.pts.length) {
      this._paths.push(this._cur);
      // 回看时只允许撤销新描的笔画
      this.setData({ canUndo: this._paths.length > (this._baseCount || 0) });
    }
    this._cur = null;
  },

  drawDot(p) {
    const ctx = this._ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (this.data.penWidth || 24) / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
  },

  /** 用二次贝塞尔把折线画顺滑 */
  strokeSegment(pts) {
    const ctx = this._ctx;
    const n = pts.length;
    const w = this.data.penWidth || 24;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = w;
    ctx.beginPath();
    if (n === 2) {
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      const a = pts[n - 3];
      const b = pts[n - 2];
      const c = pts[n - 1];
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
    }
    ctx.stroke();
  },

  redraw() {
    const ctx = this._ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this._w, this._h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this._paths.forEach((path) => {
      const pts = path.pts;
      if (!pts.length) return;
      ctx.strokeStyle = "#1e293b";
      ctx.fillStyle = "#1e293b";
      ctx.lineWidth = path.w;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, path.w / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    });
  },

  undo() {
    const base = this._baseCount || 0;
    if (this._paths.length <= base) {
      wx.showToast({ title: "再往前是上次保存的笔迹，可以点清空重写", icon: "none" });
      return;
    }
    this._paths.pop();
    this.redraw();
    this.setData({ canUndo: this._paths.length > base });
  },

  clearInk() {
    this._paths = [];
    this._cur = null;
    this._baseCount = 0;
    this._pendingTrace = null;
    if (this._ctx) this._ctx.clearRect(0, 0, this._w, this._h);
    this.setData({ canUndo: false, reviewing: false });
  },

  toggleGhost() {
    this.setData({ ghostOn: !this.data.ghostOn });
  },

  setPen(e) {
    const w = Number(e.currentTarget.dataset.w);
    this.setData({ penWidth: w });
  },

  /** 横屏工具条窄，用一个按钮循环切笔粗 */
  cyclePen() {
    const cur = this.data.penWidth || 24;
    const next = cur >= 32 ? 16 : cur + 8;
    this.setData({ penWidth: next });
    wx.showToast({ title: "笔粗 " + Math.round(next * 0.6), icon: "none", duration: 700 });
  },

  /* ---------------- 学伴宠物 ---------------- */
  /** 点宠物换皮肤 */
  cyclePet() {
    const i = PETS.findIndex((p) => p.key === this.data.petSkin);
    const next = PETS[(i + 1) % PETS.length];
    this.setData({ petSkin: next.key });
    store.setUser({ pet: next.key });
    wx.showToast({ title: "学伴换成" + next.name, icon: "none" });
  },

  /* ---------------- 完成一个字 ---------------- */
  markDone() {
    const ch = this.data.char && this.data.char.c;
    if (!ch) return;
    if (!this._paths.length) {
      wx.showToast({ title: "先用手指描一描这个字哦", icon: "none" });
      return;
    }
    // 先把手写笔迹存下来，下次回看这个字才有痕迹
    store.saveTrace(ch, { w: this._w, h: this._h, paths: this._paths });
    store.markWritten(ch);
    this._baseCount = this._paths.length;
    wx.vibrateShort && wx.vibrateShort({ type: "light", fail: () => {} });
    // 宠物庆祝 + 刷新进度
    this.setData({ todayCount: store.todayWritten(), justDone: true, reviewing: false, petState: "cheer" });
    this.loadLevel(this.data.levelKey, this.data.index, false);
    this.setData({ canUndo: false });
    // 保留当前笔迹做一下「已完成」反馈，再切到下一个字
    setTimeout(() => {
      if (this.data.index < this.data.total - 1) {
        // 宠物跳走，旧字滑出
        this.setData({ swap: "out", petState: "fly" });
        this._swapTimer = setTimeout(() => {
          this._swapTimer = null;
          this.loadLevel(this.data.levelKey, this.data.index + 1, true);
          // 新字从右边滑入，宠物回到原位继续上下打量
          this.setData({ swap: "in", petState: "idle" });
          this._swapTimer = setTimeout(() => {
            this._swapTimer = null;
            this.setData({ swap: "" });
          }, 480);
        }, 340);
      } else {
        this.setData({ petState: "idle" });
        wx.showToast({ title: "这一册的字都写完啦 🎉", icon: "none" });
      }
    }, 620);
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/home/home" }),
    });
  },
});
