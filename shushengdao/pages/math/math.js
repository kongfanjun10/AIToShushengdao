const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const asr = require("../../utils/asr");
const ns = require("../../utils/numberSpeech");
const cheer = require("../../utils/cheer");

const PRESETS = [
  { label: "0 ~ 10", min: 0, max: 10 },
  { label: "1 ~ 20", min: 1, max: 20 },
  { label: "1 ~ 50", min: 1, max: 50 },
  { label: "1 ~ 100", min: 1, max: 100 },
  { label: "100 ~ 999", min: 100, max: 999 },
  { label: "1 ~ 1000", min: 1, max: 1000 },
];

/** 按位数给数字卡选字号，四位数也不会顶破卡片 */
function sizeOf(n) {
  const len = String(n).length;
  if (len >= 4) return 116;
  if (len === 3) return 160;
  return 208;
}

Page({
  data: {
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    range: { min: 1, max: 10 },
    span: 10,
    presets: PRESETS,

    current: 1,
    numSize: 208,
    numAnim: false,
    round: 1,
    hintOn: false,
    hintText: "一",

    phase: "idle", // idle | listening | right | wrong | retry | manual
    phaseTip: "请把这个数字读出来",
    micLabel: "点一下，开始读",
    seconds: 0,
    heard: "",
    partial: "",
    hasFile: false,
    asrOk: true,

    onlyWrong: false,
    history: [],
    waves: [26, 46, 66, 40, 58, 34, 50],

    stats: {
      todayRight: 0,
      todayWrong: 0,
      todayTotal: 0,
      percent: 0,
      streak: 0,
      best: 0,
      wrongCount: 0,
    },

    settingsOpen: false,
    draftMin: "1",
    draftMax: "10",
    draftErr: "",
  },

  onLoad() {
    this.setData(nav.sync());
    const range = store.mathRange();
    const asrOk = asr.available();
    this.setData({
      range: range,
      span: range.max - range.min + 1,
      draftMin: String(range.min),
      draftMax: String(range.max),
      asrOk: asrOk,
      stats: store.mathStats(),
    });
    if (!asrOk) {
      const d = asr.diagnose();
      this.setData({ asrTip: d.tip });
    }
    this.next(true);
    // 上次范围太小时给一句引导，不打扰
    if (range.max <= 10) {
      this._firstTip = true;
    }
  },

  onShow() {
    if (!this._inited) {
      this._inited = true;
      return;
    }
    this.setData({ stats: store.mathStats() });
  },

  onHide() {
    this.cleanupAudio();
  },

  onUnload() {
    this.cleanupAudio();
    clearTimeout(this._nextT);
    clearTimeout(this._autoT);
    clearInterval(this._timer);
    clearTimeout(this._recTimer);
  },

  cleanupAudio() {
    asr.cancel();
    tts.stop();
    if (this.data.phase === "listening") {
      this.setData({ phase: "idle", phaseTip: "请把这个数字读出来", micLabel: "点一下，开始读", seconds: 0 });
    }
    clearInterval(this._timer);
  },

  /* ---------------- 出题 ---------------- */
  randNum() {
    const min = this.data.range.min;
    const max = this.data.range.max;
    const span = max - min + 1;
    let n = min + Math.floor(Math.random() * span);
    // 避免连续两次同一个数字（区间里数很少时允许重复）
    if (span > 3 && n === this.data.current) n = min + ((n - min + 1) % span);
    return n;
  },

  next(silent) {
    clearTimeout(this._nextT);
    clearTimeout(this._autoT);
    this._autoStop = false;
    asr.cancel();
    this.stopTimer();

    let n = this.data.current;
    if (this.data.onlyWrong) {
      const list = store.mathWrongList();
      if (!list.length) {
        this.setData({ onlyWrong: false });
        n = this.randNum();
      } else {
        n = list[Math.floor(Math.random() * list.length)].n;
      }
    } else {
      n = this.randNum();
    }

    this.setData({
      current: n,
      numSize: sizeOf(n),
      hintText: ns.intToCn(n),
      hintOn: false,
      phase: "idle",
      phaseTip: "请把这个数字读出来",
      micLabel: "点一下，开始读",
      seconds: 0,
      heard: "",
      partial: "",
      hasFile: false,
      numAnim: false,
      round: silent ? 1 : this.data.round + 1,
      stats: store.mathStats(),
    });

    // 换数字时重播一次入场动效（30ms 后加类，保证动画能重新触发）
    setTimeout(() => {
      if (this.data.current === n) this.setData({ numAnim: true });
    }, 30);
  },

  nextItem() {
    if (this.data.onlyWrong && store.mathWrongList().length === 0) {
      wx.showToast({ title: "错题都练完啦，真厉害", icon: "none" });
    }
    this.next();
  },

  toggleHint() {
    this.setData({ hintOn: true });
  },

  /* ---------------- 录音 + 识别 ---------------- */
  tapMic() {
    if (this.data.phase === "listening") {
      this.finishListen();
      return;
    }
    if (!this.data.asrOk) {
      this.startManualRecord();
      return;
    }
    this.startListen();
  },

  startListen() {
    const self = this;
    this.setData({
      phase: "listening",
      phaseTip: "我在听，读完点一下",
      micLabel: "正在听…",
      seconds: 0,
      heard: "",
      partial: "",
      hasFile: false,
    });
    this.startTimer();
    try {
      wx.vibrateShort({ type: "light" });
    } catch (e) {}

    const started = asr.start({
      duration: 7000,
      onPartial: function (text) {
        const t = String(text || "").trim();
        if (!t) return;
        self.setData({ partial: t });
        // 已经听出目标数字：稍等一下收尾，孩子不用一直等到超时
        if (!self._autoStop && ns.check(t, self.data.current).ok) {
          self._autoStop = true;
          self._autoT = setTimeout(() => self.finishListen(), 600);
        }
      },
      onFinal: function (res) {
        self.judge(res && res.text, res && res.file);
      },
      onError: function (err) {
        self.handleAsrError(err);
      },
    });
    if (!started) this.startManualRecord();
  },

  finishListen() {
    if (this.data.phase !== "listening") return;
    clearTimeout(this._autoT);
    this._autoStop = false;
    this.stopTimer();
    this.setData({ phaseTip: "我听听你读得对不对", micLabel: "正在识别…" });
    asr.stop();
  },

  startTimer() {
    this.stopTimer();
    this._sec = 0;
    this._timer = setInterval(() => {
      this._sec += 1;
      this.setData({ seconds: this._sec });
      if (this._sec >= 8) this.finishListen();
    }, 1000);
  },

  stopTimer() {
    clearInterval(this._timer);
    this._timer = null;
  },

  /** 判分：读对 → 你真棒哟；读错 → 答错咯，要加油哟 */
  judge(text, file) {
    this.stopTimer();
    const heard = String(text || "").trim();
    this._lastFile = file || this._lastFile || "";

    if (!heard) {
      this.setData({
        phase: "retry",
        phaseTip: "再读一次吧",
        micLabel: "点一下，再读",
        heard: "",
        hasFile: !!file,
      });
      return;
    }

    const r = ns.check(heard, this.data.current);
    const stats = store.markAnswer(this.data.current, r.ok);
    const history = this.data.history.concat([{ key: Date.now(), ok: r.ok }]).slice(-8);

    if (r.ok) {
      try {
        wx.vibrateShort({ type: "light" });
      } catch (e) {}
      this.setData({
        phase: "right",
        phaseTip: "读对啦，真棒",
        micLabel: "点一下，读下一个",
        heard: heard,
        hasFile: !!this._lastFile,
        history: history,
        stats: stats,
      });
      const self = this;
      cheer.praise(function () {
        self.scheduleNext();
      });
      this._nextT = setTimeout(() => this.scheduleNext(), 2600);
      return;
    }

    this.setData({
      phase: "wrong",
      phaseTip: "再看看这个数字，读一次试试",
      micLabel: "点一下，再读",
      heard: heard,
      hasFile: !!this._lastFile,
      history: history,
      stats: stats,
    });
    cheer.comfort();
  },

  scheduleNext() {
    if (this.data.phase !== "right") return;
    clearTimeout(this._nextT);
    this.next();
  },

  retrySame() {
    this.setData({
      phase: "idle",
      phaseTip: "请把这个数字读出来",
      micLabel: "点一下，开始读",
      heard: "",
    });
    this.startListen();
  },

  handleAsrError(err) {
    this.stopTimer();
    const msg = (err && err.errMsg) || "";
    if (/auth|deny|权限|authorize/i.test(msg)) {
      this.setData({
        phase: "retry",
        phaseTip: "需要麦克风权限才能听你读",
        micLabel: "点一下，再试试",
      });
      wx.showModal({
        title: "需要麦克风权限",
        content: "在小程序设置里打开「麦克风」，就能录音读数字啦。",
        confirmText: "去设置",
        cancelText: "稍后",
        confirmColor: "#0ea5e9",
        success: (res) => {
          if (res.confirm) {
            try {
              wx.openSetting({});
            } catch (e) {}
          }
        },
      });
      return;
    }
    // 识别通道坏了：直接退化为录音 + 家长确认，别让孩子卡住
    this.setData({ asrOk: false, phase: "manual", phaseTip: "这次没听清，请家长帮忙判断", micLabel: "再读一次" });
    wx.showToast({ title: "语音识别不可用，已切换为家长确认", icon: "none", duration: 2200 });
  },

  /** 降级：仅录音，由家长点「读对了 / 没读对」 */
  startManualRecord() {
    this.setData({
      phase: "listening",
      phaseTip: "读完点一下停止",
      micLabel: "正在录音…",
      seconds: 0,
      hasFile: false,
    });
    this.startTimer();
    try {
      wx.vibrateShort({ type: "light" });
    } catch (e) {}
    try {
      const rec = wx.getRecorderManager();
      this._rec = rec;
      rec.onStop((res) => {
        if (res && res.tempFilePath) this._lastFile = res.tempFilePath;
      });
      rec.onError(() => {});
      rec.start({ duration: 8000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: "mp3" });
      clearTimeout(this._recTimer);
      this._recTimer = setTimeout(() => this.finishManual(), 8000);
    } catch (e) {
      this.setData({ phase: "manual", phaseTip: "录音启动失败，请家长帮忙判断" });
    }
  },

  finishManual() {
    clearTimeout(this._recTimer);
    this.stopTimer();
    try {
      if (this._rec) this._rec.stop();
    } catch (e) {}
    this.setData({
      phase: "manual",
      phaseTip: "请家长听一下，读对了吗",
      micLabel: "再读一次",
      hasFile: true,
    });
  },

  manualJudge(e) {
    const ok = Number(e.currentTarget.dataset.ok) === 1;
    const stats = store.markAnswer(this.data.current, ok);
    const history = this.data.history.concat([{ key: Date.now(), ok: ok }]).slice(-8);
    if (ok) {
      this.setData({ phase: "right", phaseTip: "读对啦，真棒", heard: "", history: history, stats: stats });
      const self = this;
      cheer.praise(function () {
        self.scheduleNext();
      });
      this._nextT = setTimeout(() => this.scheduleNext(), 2600);
    } else {
      this.setData({
        phase: "wrong",
        phaseTip: "再看看这个数字，读一次试试",
        micLabel: "再读一次",
        heard: "",
        history: history,
        stats: stats,
      });
      cheer.comfort();
    }
  },

  /** 回听刚才的录音 */
  playMine() {
    if (!this._lastFile) {
      wx.showToast({ title: "这次没有录到声音", icon: "none" });
      return;
    }
    try {
      const ctx = wx.createInnerAudioContext();
      ctx.src = this._lastFile;
      ctx.onEnded(() => ctx.destroy());
      ctx.onError(() => ctx.destroy());
      ctx.play();
    } catch (e) {}
  },

  /* ---------------- 区间设置 ---------------- */
  openSettings() {
    this.setData({
      settingsOpen: true,
      draftMin: String(this.data.range.min),
      draftMax: String(this.data.range.max),
      draftErr: "",
    });
  },

  closeSettings() {
    this.setData({ settingsOpen: false });
  },

  noop() {},

  onDraft(e) {
    const k = e.currentTarget.dataset.k;
    const v = (e.detail && e.detail.value) || "";
    this.setData(k === "min" ? { draftMin: v, draftErr: "" } : { draftMax: v, draftErr: "" });
  },

  pickPreset(e) {
    const i = Number(e.currentTarget.dataset.i);
    const p = PRESETS[i];
    if (!p) return;
    this.setData({ draftMin: String(p.min), draftMax: String(p.max), draftErr: "" });
  },

  saveRange() {
    const res = store.setMathRange(this.data.draftMin, this.data.draftMax);
    if (!res.ok) {
      try {
        wx.vibrateShort({ type: "heavy" });
      } catch (e) {}
      this.setData({ draftErr: res.err });
      return;
    }
    this.setData({
      settingsOpen: false,
      range: res.range,
      span: res.range.max - res.range.min + 1,
      onlyWrong: false,
    });
    this.next();
    wx.showToast({ title: "范围已更新", icon: "none" });
  },

  toggleOnlyWrong() {
    const on = !this.data.onlyWrong;
    if (on && store.mathWrongList().length === 0) {
      wx.showToast({ title: "暂时没有错题", icon: "none" });
      return;
    }
    this.setData({ onlyWrong: on });
    this.next();
    wx.showToast({ title: on ? "只出错过的数字" : "已恢复随机出题", icon: "none" });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },
});
