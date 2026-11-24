const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const lib = require("../../utils/words");
const cheer = require("../../utils/cheer");

const MAX_SEC = 6;

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),

    themes: [],
    themeKey: "animals",
    themeName: "动物",
    list: [],
    index: 0,
    word: {},

    speaking: false,
    slow: false,
    phase: "idle", // idle | recording | done
    seconds: 0,
    hasFile: false,
    followTip: "点一下跟读，读完自动停",

    doneCount: 0,
    total: 64,
    percent: 0,
    todayRead: 0,
    todayFollow: 0,
    inVocab: false,
  },

  onLoad(options) {
    this.setData(nav.sync());
    const user = store.getUser();
    const themeKey = (options && options.theme) || user.wordTheme || "animals";
    this._rec = null;
    this.initRecorder();
    this.setData({
      themes: lib.getGroups(),
      total: lib.all().length,
    });
    this.loadTheme(themeKey, (options && options.word) || "");
  },

  onShow() {
    this.refreshStats();
  },

  onHide() {
    this.stopFollow(true);
    tts.stop();
  },

  onUnload() {
    this.stopFollow(true);
    clearTimeout(this._nextT);
    clearInterval(this._timer);
    tts.stop();
    if (this._audio) {
      try {
        this._audio.destroy();
      } catch (e) {}
      this._audio = null;
    }
  },

  /* ---------------- 单词 ---------------- */
  loadTheme(themeKey, wantWord) {
    const themes = lib.getGroups();
    const t = themes.filter((x) => x.key === themeKey)[0] || themes[0];
    const list = lib.list(t.key);
    let idx = 0;
    if (wantWord) {
      const hit = list.findIndex((w) => w.en === wantWord);
      if (hit > -1) idx = hit;
    }
    tts.stop();
    this.setData({
      themeKey: t.key,
      themeName: t.name,
      list: list,
      index: idx,
      word: list[idx] || {},
      phase: "idle",
      hasFile: false,
      seconds: 0,
      speaking: false,
      followTip: "点一下跟读，读完自动停",
    });
    store.setUser({ wordTheme: t.key });
    this.refreshStats();
    this.refreshVocab();
  },

  pickTheme(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.themeKey) return;
    this.loadTheme(key, "");
  },

  pickWord(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (i === this.data.index) return;
    tts.stop();
    this.stopFollow(true);
    this.setData({
      index: i,
      word: this.data.list[i] || {},
      phase: "idle",
      hasFile: false,
      seconds: 0,
      speaking: false,
      followTip: "点一下跟读，读完自动停",
    });
    this.refreshVocab();
  },

  prevWord() {
    if (this.data.index <= 0) {
      wx.showToast({ title: "这一组的第一个词啦", icon: "none" });
      return;
    }
    this.moveTo(this.data.index - 1);
  },

  nextWord() {
    if (this.data.index >= this.data.list.length - 1) {
      wx.showToast({ title: "这一组都读完啦，换一组试试", icon: "none" });
      return;
    }
    this.moveTo(this.data.index + 1);
  },

  moveTo(i) {
    tts.stop();
    this.stopFollow(true);
    this.setData({
      index: i,
      word: this.data.list[i] || {},
      phase: "idle",
      hasFile: false,
      seconds: 0,
      speaking: false,
      followTip: "点一下跟读，读完自动停",
    });
    this.refreshVocab();
  },

  /* ---------------- 发音 ---------------- */
  speakWord() {
    const w = this.data.word;
    if (!w || !w.en) return;
    this.play(w.en);
  },

  speakSentence() {
    const w = this.data.word;
    if (!w || !w.sentence) return;
    this.play(w.sentence);
  },

  play(text) {
    const user = store.getUser();
    const base = Number(user.speechRate) || 1;
    tts.stop();
    this.setData({ speaking: true });
    tts
      .speak(text, {
        rate: this.data.slow ? Math.max(0.5, base * 0.7) : base,
        voice: user.ttsVoice,
        onEnd: () => this.setData({ speaking: false }),
        onError: () => this.setData({ speaking: false }),
      })
      .catch((err) => {
        this.setData({ speaking: false });
        const missing = err && (err.code === "PLUGIN_MISSING" || err.code === "NO_CHANNEL");
        wx.showToast({ title: missing ? "语音通道未开通" : (err && err.errMsg) || "播放失败", icon: "none" });
      });
  },

  toggleSlow() {
    this.setData({ slow: !this.data.slow });
    wx.showToast({ title: this.data.slow ? "慢速播放已开" : "恢复常速", icon: "none" });
  },

  /* ---------------- 跟读录音 ---------------- */
  initRecorder() {
    try {
      const rec = wx.getRecorderManager();
      this._rec = rec;
      rec.onStop((res) => {
        clearInterval(this._timer);
        if (this._silentStop) {
          this._silentStop = false;
          return;
        }
        const file = (res && res.tempFilePath) || "";
        this._file = file;
        this.setData({
          phase: "done",
          hasFile: !!file,
          seconds: 0,
          followTip: file ? "听听看，像不像？" : "这次没录到声音，再来一次",
        });
      });
      rec.onError(() => {
        clearInterval(this._timer);
        this.setData({ phase: "idle", followTip: "录音没打开，检查一下麦克风权限", seconds: 0 });
      });
    } catch (e) {
      this._rec = null;
    }
  },

  tapFollow() {
    if (this.data.phase === "recording") {
      this.stopFollow();
      return;
    }
    if (this.data.phase === "done" && this.data.hasFile) {
      this.playMine();
      return;
    }
    this.startFollow();
  },

  startFollow() {
    if (!this._rec) {
      wx.showToast({ title: "这台设备不支持录音", icon: "none" });
      return;
    }
    tts.stop();
    try {
      wx.vibrateShort({ type: "light" });
    } catch (e) {}
    this.setData({ phase: "recording", seconds: 0, hasFile: false, followTip: "我在听，读完点一下" });
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const s = this.data.seconds + 1;
      this.setData({ seconds: s });
      if (s >= MAX_SEC) this.stopFollow();
    }, 1000);
    try {
      this._rec.start({ duration: MAX_SEC * 1000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: "mp3" });
    } catch (e) {
      clearInterval(this._timer);
      this.setData({ phase: "idle", followTip: "录音启动失败，再点一次试试" });
    }
  },

  stopFollow(silent) {
    clearInterval(this._timer);
    if (!this._rec) return;
    this._silentStop = !!silent;
    try {
      this._rec.stop();
    } catch (e) {}
    if (silent) this.setData({ phase: "idle", seconds: 0, hasFile: false });
  },

  playMine() {
    if (!this._file) {
      wx.showToast({ title: "还没有录音", icon: "none" });
      return;
    }
    try {
      if (!this._audio) this._audio = wx.createInnerAudioContext();
      const ctx = this._audio;
      ctx.stop();
      ctx.src = this._file;
      ctx.play();
    } catch (e) {}
  },

  /** 孩子自己判断读得像不像；说读得好就记一次跟读 */
  judge(e) {
    const ok = Number(e.currentTarget.dataset.ok) === 1;
    const w = this.data.word;
    if (!w || !w.en) return;
    if (!ok) {
      this.setData({ phase: "idle", hasFile: false, followTip: "没关系，听一遍再读一次" });
      wx.showToast({ title: "再听一遍，跟着读", icon: "none" });
      return;
    }
    const stats = store.markWordRead(w.en, true);
    this.setData({
      doneCount: stats.done,
      todayRead: stats.todayRead,
      todayFollow: stats.todayFollow,
      followTip: "读好啦，下一个词",
    });
    cheer.praise();
    // 只留一条推进路径，避免「语音播完」和「定时器」各跳一次词
    clearTimeout(this._nextT);
    this._nextT = setTimeout(() => {
      if (this.data.word !== w) return;
      if (this.data.index < this.data.list.length - 1) this.moveTo(this.data.index + 1);
      else wx.showToast({ title: "这一组读完啦 🎉", icon: "none" });
    }, 1800);
  },

  /* ---------------- 生词本 ---------------- */
  addToVocab() {
    const w = this.data.word;
    if (!w || !w.en) return;
    if (this.data.inVocab) {
      wx.showToast({ title: "已经在生词本里啦", icon: "none" });
      return;
    }
    store.addWord({ word: w.en, pinyin: w.ipa, sentence: w.sentence });
    this.setData({ inVocab: true });
    wx.showToast({ title: "已加入生词本", icon: "none" });
  },

  refreshVocab() {
    const w = this.data.word;
    if (!w || !w.en) return;
    const hit = store.listWords().some((v) => v.word === w.en);
    this.setData({ inVocab: hit });
  },

  refreshStats() {
    const s = store.wordsStats();
    const map = store.wordMap();
    const list = this.data.list.map((w) => Object.assign({}, w, { done: !!map[w.en] }));
    this.setData({
      doneCount: s.done,
      todayRead: s.todayRead,
      todayFollow: s.todayFollow,
      percent: this.data.total ? Math.round((s.done / this.data.total) * 100) : 0,
      list: list,
    });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.navigateTo({ url: "/pages/home/home" }) });
  },
});
