const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const textUtil = require("../../utils/text");
const config = require("../../config/index");

/* 语音波形（纯装饰，朗读时起伏） */
const BARS = [
  { h: 18, d: 0 },
  { h: 34, d: 0.12 },
  { h: 56, d: 0.26 },
  { h: 40, d: 0.08 },
  { h: 72, d: 0.32 },
  { h: 48, d: 0.18 },
  { h: 62, d: 0.05 },
  { h: 30, d: 0.24 },
  { h: 52, d: 0.36 },
  { h: 24, d: 0.14 },
];

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    groupId: "",
    lessonTitle: "",
    index: 0,
    sentence: "",
    chars: [],
    charLines: [], // 智能分行后的字列（每行一组，标点跟随短语尾）
    hl: -1, // 播放高亮：当前朗读到的全局字列序号
    pinyinOn: true,
    playing: false,
    auto: true,
    loop: false,
    rateLabel: "正常 1.0x",
    heardCount: 0,
    sentenceTotal: 1,
    percent: 0,
    allHeard: false,
    list: [],
    ttsOk: true,
    unHeard: 0,
    wave: BARS,
    voiceName: "女声",
    voiceOk: false,
    voiceSheet: false,
    voices: [],
  },

  onLoad(options) {
    this.setData(nav.sync());
    this._mounted = true;
    this._groupId = (options && options.groupId) || "";
    this._wantIndex = options && options.index !== undefined ? Number(options.index) : null;
    this._from = (options && options.from) || "";
    this._listenAt = Date.now();
    this.loadGroup(this._groupId);
  },

  /** 磨耳朵停留时长计入每日上限（家长设了 10/20/30 分钟，到点会提醒休息） */
  flushListenSec() {
    const start = this._listenAt;
    this._listenAt = Date.now();
    if (!start) return;
    const sec = Math.round((Date.now() - start) / 1000);
    if (sec > 0) store.bumpDaily({ seconds: Math.min(sec, 1800) });
  },

  loadGroup(id) {
    const group = (id && store.getGroup(id)) || store.activeGroup();
    if (!group || !group.sentences.length) {
      wx.showToast({ title: "还没有课文，先去拍一张吧", icon: "none" });
      setTimeout(() => wx.redirectTo({ url: "/pages/capture/capture" }), 1200);
      return;
    }
    this._group = group;
    const user = store.getUser();
    const rate = Number(user.speechRate) || 1;
    // 优先定位到「还没听过」的第一句，其次用传入的 index / 上次进度
    const firstUnheard = group.sentences.findIndex((s) => !s.heard);
    let index = firstUnheard > -1 ? firstUnheard : Number(group.cursor) || 0;
    if (this._wantIndex !== null && this._wantIndex > -1 && this._wantIndex < group.sentences.length) {
      index = this._wantIndex;
    }
    this.setData({
      groupId: group.id,
      lessonTitle: group.lessonTitle || group.title,
      pinyinOn: !!user.pinyinOn,
      rateLabel: this.rateText(rate),
      ttsOk: tts.isAvailable(),
    });
    this.loadVoice();
    this.renderSentence(index);
    // 进来就先读给孩子听（静默失败，不打断）
    this._gapTimer = setTimeout(() => {
      if (this._mounted) this.playAt(index, { silent: true });
    }, 520);
  },

  rateText(rate) {
    if (rate < 1) return "慢速 " + rate + "x";
    if (rate > 1) return "快速 " + rate + "x";
    return "正常 1.0x";
  },

  renderSentence(index) {
    const group = this._group;
    if (!group) return;
    const item = group.sentences[index];
    if (!item) return;
    const chars = textUtil.annotateGroups(item.text);
    const charLines = textUtil.layoutLines(chars, 10);
    const p = store.listenProgress(group);
    const list = group.sentences.map((s, i) => ({
      text: s.text,
      heard: !!s.heard,
      on: i === index,
    }));
    this.setData({
      index,
      sentence: item.text,
      chars,
      charLines,
      hl: -1,
      heardCount: p.heard,
      sentenceTotal: p.total,
      percent: p.percent,
      allHeard: p.done,
      unHeard: Math.max(0, p.total - p.heard),
      list,
    });
    this._index = index;
  },

  refreshProgress() {
    if (!this._group) return;
    const p = store.listenProgress(this._group);
    const list = this._group.sentences.map((s, i) => ({
      text: s.text,
      heard: !!s.heard,
      on: i === this._index,
    }));
    this.setData({
      heardCount: p.heard,
      percent: p.percent,
      allHeard: p.done,
      unHeard: Math.max(0, p.total - p.heard),
      list,
    });
  },

  /* ---------------- 播放 ---------------- */
  playAt(index, options) {
    const opt = options || {};
    const group = this._group;
    if (!group || !group.sentences[index]) return;
    clearTimeout(this._gapTimer);
    tts.stop();

    store.markHeard(this.data.groupId, index);
    this.renderSentence(index);
    this.setData({ playing: true });

    const rate = Number(store.getUser().speechRate) || 1;
    this.startHighlight(rate);
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      if (!this._mounted) return;
      this.stopHighlight();
      this.setData({ playing: false, auto: false });
      this.handleTtsError(err, opt.silent);
    };

    tts
      .speak(group.sentences[index].text, {
        rate,
        voice: store.getUser().ttsVoice,
        onEnd: () => {
          if (this._mounted) this.onSentenceEnd(index);
        },
        onError: fail,
      })
      .then(() => {
        if (!this.data.ttsOk) this.setData({ ttsOk: true });
      })
      .catch(fail);
  },

  /**
   * 播放高亮轮询：TTS 无逐字时间戳，按「每秒约 3.1 字 × 语速」估算节奏，
   * 逐字推进高亮（只推进可朗读的字列，标点列不停留）。
   */
  startHighlight(rate) {
    this.stopHighlight();
    const speakable = this.data.chars.filter((g) => !g.punct).map((g) => g.gi);
    if (!speakable.length) return;
    const step = Math.max(150, Math.round(1000 / (3.1 * (rate || 1))));
    let i = 0;
    this.setData({ hl: speakable[0] });
    this._hlTimer = setInterval(() => {
      i += 1;
      if (i >= speakable.length) {
        this.stopHighlight();
        return;
      }
      this.setData({ hl: speakable[i] });
    }, step);
  },

  stopHighlight() {
    if (this._hlTimer) {
      clearInterval(this._hlTimer);
      this._hlTimer = null;
    }
    if (this.data.hl !== -1) this.setData({ hl: -1 });
  },

  onSentenceEnd(index) {
    if (!this._mounted) return;
    this.stopHighlight();
    if (this.data.loop) {
      this._gapTimer = setTimeout(() => this.playAt(index), 700);
      return;
    }
    if (this.data.auto) {
      if (index < this.data.sentenceTotal - 1) {
        this._gapTimer = setTimeout(() => this.playAt(index + 1), 850);
        return;
      }
      this.setData({ playing: false });
      if (!this._doneTip) {
        this._doneTip = true;
        wx.showToast({ title: "全部听完啦，试着读给岛上听 🌱", icon: "none", duration: 2000 });
      }
      return;
    }
    this.setData({ playing: false });
  },

  togglePlay() {
    if (this.data.playing) {
      clearTimeout(this._gapTimer);
      tts.stop();
      this.stopHighlight();
      this.setData({ playing: false });
      return;
    }
    this.playAt(this._index);
  },

  onItemTap(e) {
    this.playAt(Number(e.currentTarget.dataset.index));
  },

  prevSentence() {
    if (this._index <= 0) {
      wx.showToast({ title: "已经是第一句啦", icon: "none" });
      return;
    }
    this.playAt(this._index - 1);
  },

  nextSentence() {
    if (this._index >= this.data.sentenceTotal - 1) {
      wx.showToast({ title: "最后一句啦，可以开始读了", icon: "none" });
      return;
    }
    this.playAt(this._index + 1);
  },

  toggleAuto() {
    const auto = !this.data.auto;
    this.setData({ auto });
    if (auto && !this.data.playing) this.playAt(this._index);
  },

  toggleLoop() {
    this.setData({ loop: !this.data.loop });
  },

  changeRate() {
    const rates = [0.8, 1, 1.2];
    const cur = Number(store.getUser().speechRate) || 1;
    const next = rates[(rates.indexOf(cur) + 1) % rates.length];
    store.setUser({ speechRate: next });
    const label = this.rateText(next);
    this.setData({ rateLabel: label });
    wx.showToast({ title: "语速 " + label, icon: "none" });
    if (this.data.playing) this.playAt(this._index);
  },

  togglePinyin() {
    const pinyinOn = !this.data.pinyinOn;
    this.setData({ pinyinOn });
    store.setUser({ pinyinOn });
  },

  /* ---------------- 音色 ---------------- */
  loadVoice() {
    const user = store.getUser();
    const cur = user.ttsVoice === "male" ? "male" : "female";
    // 音色切换依赖云函数通道（插件通道音色固定）
    const voiceOk = !!(tts.diagnose() && tts.diagnose().cloudAvailable);
    const voices = (config.tts.voices || []).map((v) => ({
      id: v.id,
      name: v.name,
      desc: v.desc,
      on: v.id === cur,
    }));
    this.setData({ voiceOk, voices, voiceName: cur === "male" ? "男声" : "女声" });
  },

  onVoiceTap() {
    if (!this.data.voiceOk) {
      wx.showToast({
        title: "切换音色需要云函数语音通道（见 README「语音范读」）",
        icon: "none",
        duration: 2200,
      });
      return;
    }
    this.setData({ voiceSheet: true });
  },

  closeVoice() {
    this.setData({ voiceSheet: false });
  },

  noop() {},

  pickVoice(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    store.setUser({ ttsVoice: id });
    this.loadVoice();
    // 用当前这句试听，边听边选
    this.playAt(this._index);
  },

  retryTts() {
    const ok = tts.isAvailable();
    this.setData({ ttsOk: ok });
    if (!ok) {
      wx.showToast({ title: "语音还是没打开，可先自己读", icon: "none" });
      return;
    }
    this.playAt(this._index);
  },

  handleTtsError(err, silent) {
    const code = err && err.code;
    if (code === "PLUGIN_MISSING" || code === "PLUGIN_OFF" || code === "NO_CHANNEL" || code === "CLOUD_UNAVAILABLE") {
      this.setData({ ttsOk: false });
      return;
    }
    if (!silent) {
      wx.showToast({ title: (err && err.errMsg) || "语音播放失败", icon: "none" });
    }
  },

  /* ---------------- 去朗读 ---------------- */
  goRead() {
    clearTimeout(this._gapTimer);
    tts.stop();
    this.stopHighlight();
    this.setData({ playing: false });
    const id = this.data.groupId;
    const index = this._index || 0;
    if (!id) {
      wx.redirectTo({ url: "/pages/capture/capture" });
      return;
    }
    store.setCursor(id, index);
    // 从朗读页跳回来的，直接退回那一页，避免页面栈里叠两个朗读页
    if (this._from === "reader") {
      const pages = getCurrentPages();
      const prev = pages[pages.length - 2];
      if (prev && prev.route === "pages/reader/reader" && typeof prev.renderSentence === "function") {
        prev.renderSentence(index);
        wx.navigateBack();
        return;
      }
    }
    wx.navigateTo({ url: "/pages/reader/reader?groupId=" + id + "&index=" + index });
  },

  goBack() {
    clearTimeout(this._gapTimer);
    tts.stop();
    this.stopHighlight();
    this.flushListenSec();
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/home/home" }),
    });
  },

  onHide() {
    clearTimeout(this._gapTimer);
    tts.stop();
    this.stopHighlight();
    this.setData({ playing: false });
    this.flushListenSec();
  },

  onUnload() {
    this._mounted = false;
    clearTimeout(this._gapTimer);
    tts.stop();
    this.stopHighlight();
    this.flushListenSec();
    tts.destroy();
  },
});
