const app = getApp();
const config = require("../../config/index");
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const textUtil = require("../../utils/text");
const pinyinUtil = require("../../utils/pinyin");
const profile = require("../../utils/profile");

const BARS = [
  { h: 19, c: "rgba(3,105,161,0.3)", a: "pulse 1.6s ease-in-out infinite" },
  { h: 31, c: "rgba(3,105,161,0.4)", a: "pulse 1.9s ease-in-out infinite" },
  { h: 54, c: "#0369a1", a: "bounceY 1.1s ease-in-out infinite" },
  { h: 69, c: "#22d3ee", a: "pulse 1.4s ease-in-out infinite" },
  { h: 46, c: "#0369a1", a: "bounceY 1.5s ease-in-out infinite" },
  { h: 77, c: "#0369a1", a: "pulse 1.2s ease-in-out infinite", w: 12 },
  { h: 61, c: "#4edea3", a: "bounceY 1.35s ease-in-out infinite" },
  { h: 38, c: "#0369a1", a: "pulse 1.7s ease-in-out infinite" },
  { h: 69, c: "#22d3ee", a: "bounceY 1.25s ease-in-out infinite" },
  { h: 54, c: "#0369a1", a: "pulse 1.55s ease-in-out infinite" },
  { h: 23, c: "rgba(3,105,161,0.5)", a: "pulse 1.8s ease-in-out infinite" },
  { h: 15, c: "rgba(3,105,161,0.3)", a: "bounceY 1.45s ease-in-out infinite" },
];

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    groupId: "",
    avatar: "",
    lessonTitle: "课文朗读",
    pageIndex: 1,
    pageTotal: 1,
    sentenceIndex: 1,
    sentenceTotal: 1,
    isLast: false, // 当前是最后一句：按钮变「完成朗读」，点「下一句」不再跳奖励页
    allRead: false, // 整篇都读过了
    sentence: "",
    chars: [],
    charLines: [], // 智能分行后的字列（每行一组）
    pinyinOn: true,
    paperLines: [92, 78, 88, 64],
    pageImg: "", // 课文原件（拍照识别的第一张图）
    bands: [], // 分句追踪：当前页每句一条带（top/h 为百分比）
    bandTop: 0, // 当前句追踪框位置（百分比）
    trackOn: false, // 追踪中：范读/按住朗读时高亮当前句所在行
    trackBig: false, // 展开课文原件大图（默认收在吸顶追踪条里）
    stageAnchor: "", // 舞台滚动锚点：换句/按住朗读时把句子卡滚回可见区
    sizeClass: "", // 长句降字号："long" / "xlong"
    recordTime: "00:00",
    recording: false,
    speaking: false,
    readCount: 0,
    percent: 0,
    ageMode: "primary",
    isKid: false,
    rateLabel: "正常",
    tipText: "点一下句子里的字，可以听发音或收进生词本",
    wave: BARS,
  },

  onLoad(options) {
    this.setData(nav.sync());
    this._sec = 0;
    this._lastFile = "";
    this._groupId = (options && options.groupId) || "";
    this._wantIndex = options && options.index !== undefined ? Number(options.index) : null;
    this.loadGroup(this._groupId);
  },

  loadGroup(id) {
    const group = (id && store.getGroup(id)) || store.activeGroup();
    if (!group || !group.sentences.length) {
      wx.showToast({ title: "还没有课文，先去拍一张吧", icon: "none" });
      setTimeout(() => wx.redirectTo({ url: "/pages/capture/capture" }), 1200);
      return;
    }
    const user = store.getUser();
    let index = Math.min(Math.max(group.cursor || 0, 0), group.sentences.length - 1);
    if (this._wantIndex !== null && this._wantIndex > -1 && this._wantIndex < group.sentences.length) {
      index = this._wantIndex;
    }
    this._group = group;
    const rate = Number(user.speechRate) || 1;
    this.setData({
      groupId: group.id,
      avatar: profile.avatar(),
      lessonTitle: group.lessonTitle || group.title,
      pinyinOn: !!user.pinyinOn,
      ageMode: user.ageMode,
      isKid: user.ageMode === "kid",
      rateLabel: rate < 1 ? "慢速 " + rate + "x" : rate > 1 ? "快速 " + rate + "x" : "正常 1.0x",
    });
    this.renderSentence(index);
  },

  onShow() {
    // 从「再听一遍」返回时同步一次进度
    if (!this._group || !this.data.groupId) return;
    const g = store.getGroup(this.data.groupId);
    if (!g) return;
    this._group = g;
    const p = store.progressOf(g);
    this.setData({ readCount: p.read, percent: p.percent });
    // 每日时长上限：到点提醒休息（每天最多一次，不强制退出）
    if (store.restTipNeeded()) {
      const u = store.dailyUsage();
      store.markRestTip();
      wx.showModal({
        title: "今天的学习时间到啦",
        content: "已经学了 " + store.fmtDuration(u.usedSec) + "，休息一下眼睛，明天继续更精彩 🌙",
        showCancel: false,
        confirmText: "好的，休息啦",
      });
    }
  },

  renderSentence(index) {
    const group = this._group;
    if (!group) return;
    const item = group.sentences[index];
    if (!item) return;
    const chars = textUtil.annotateGroups(item.text);
    // 长句自适应：字多就降字号 + 加宽每行列数，保证一句一屏读完（不把页面撑成两屏）
    const n = chars.filter((c) => !c.punct).length;
    const sizeClass = n > 24 ? "xlong" : n > 14 ? "long" : "";
    const cols = n > 24 ? 12 : n > 14 ? 11 : 10;
    const charLines = textUtil.layoutLines(chars, cols);
    const p = store.progressOf(group);
    // 分句追踪：预览按 4 句一页分布，当前句所在行高亮
    const perPage = 4;
    const bandTop = (index % perPage) * 25;
    const bands = [0, 1, 2, 3].map((i) => ({ top: i * 25, h: 25 }));
    this.setData({
      sentenceIndex: index + 1,
      sentenceTotal: group.sentences.length,
      isLast: index >= group.sentences.length - 1,
      allRead: !!group.done,
      sentence: item.text,
      chars,
      charLines,
      sizeClass,
      pageImg: (group.images && group.images[0]) || "",
      bands,
      bandTop,
      readCount: p.read,
      percent: p.percent,
      pageTotal: Math.max(1, Math.ceil(group.sentences.length / 4)),
      pageIndex: Math.floor(index / 4) + 1,
    });
    this._index = index;
  },

  /** 课文原图加载失败（临时路径已过期）→ 回落到纸张纹理 */
  onPaperImgErr() {
    if (this.data.pageImg) this.setData({ pageImg: "" });
  },

  /** 把句子卡滚回可见区（换句 / 按住朗读时）——追踪条与麦克风本来就是常驻的 */
  scrollToCard() {
    const anchor = "sentence-card";
    if (this.data.stageAnchor === anchor) {
      // 同名锚点不会重复触发滚动：先清空再设回
      this.setData({ stageAnchor: "" });
      const go = () => this.setData({ stageAnchor: anchor });
      if (wx.nextTick) wx.nextTick(go);
      else setTimeout(go, 30);
      return;
    }
    this.setData({ stageAnchor: anchor });
  },

  /* 展开 / 收起课文原件大图 */
  openTrack() {
    this.setData({ trackBig: true });
  },

  closeTrack() {
    this.setData({ trackBig: false });
  },

  noop() {},

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/home/home" }),
    });
  },

  /** 回到磨耳朵：孩子想再听一遍再读 */
  goListen() {
    tts.stop();
    this.setData({ speaking: false });
    wx.navigateTo({
      url: "/pages/listen/listen?groupId=" + this.data.groupId + "&index=" + (this._index || 0) + "&from=reader",
    });
  },

  togglePinyin() {
    const on = !this.data.pinyinOn;
    this.setData({ pinyinOn: on });
    store.setUser({ pinyinOn: on });
  },

  /* ---------------- TTS 范读 ---------------- */
  playDemo() {
    if (this.data.speaking) {
      tts.stop();
      this.setData({ speaking: false, trackOn: false });
      return;
    }
    const user = store.getUser();
    this.setData({ speaking: true, trackOn: true });
    tts
      .speak(this.data.sentence, {
        rate: user.speechRate,
        voice: user.ttsVoice,
        onEnd: () => this.setData({ speaking: false, trackOn: false }),
        onError: () => this.setData({ speaking: false, trackOn: false }),
      })
      .catch((err) => {
        this.setData({ speaking: false, trackOn: false });
        this.handleTtsError(err);
      });
  },

  /* ---------------- 重读本句 ---------------- */
  reRead() {
    const id = this.data.groupId;
    const index = this._index || 0;
    if (!id) return;
    store.resetRead(id, index);
    this._group = store.getGroup(id) || this._group;
    this.renderSentence(index);
    wx.showToast({ title: "本句已重置，再读一遍吧", icon: "none" });
    if (!this.data.speaking) this.playDemo();
  },

  handleTtsError(err) {
    const code = err && err.code;
    if (code === "PLUGIN_MISSING" || code === "PLUGIN_OFF") {
      this.setData({ speaking: false });
      // 只在首次点击时弹完整引导，后续轻提示，避免打断朗读节奏
      if (this._ttsTipShown) {
        wx.showToast({ title: "范读语音未开启", icon: "none" });
        return;
      }
      this._ttsTipShown = true;
      wx.showModal({
        title: "范读语音未开启",
        content: config.tts.missingTip,
        showCancel: false,
        confirmText: "知道了",
        confirmColor: "#0ea5e9",
      });
      return;
    }
    this.setData({ speaking: false });
    wx.showToast({ title: (err && err.errMsg) || "语音播放失败", icon: "none" });
  },

  changeRate() {
    const rates = [0.8, 1, 1.2];
    const cur = Number(store.getUser().speechRate) || 1;
    const next = rates[(rates.indexOf(cur) + 1) % rates.length];
    store.setUser({ speechRate: next });
    const label = next < 1 ? "慢速 " + next + "x" : next > 1 ? "快速 " + next + "x" : "正常 1.0x";
    this.setData({ rateLabel: label });
    wx.showToast({ title: "语速 " + label, icon: "none" });
  },

  /* ---------------- 逐字交互（发音 / 生词） ---------------- */
  onCharTap(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.chars[index];
    if (!item || item.punct || !item.c.trim()) return;
    const ch = item.c;
    const py = pinyinUtil.getPinyin(ch);
    wx.showActionSheet({
      itemList: ["朗读这个字：" + ch, "收进生词本：" + ch],
      success: (res) => {
        if (res.tapIndex === 0) {
          tts.speak(ch, { rate: 0.9 }).catch((err) => this.handleTtsError(err));
          return;
        }
        const added = store.addWord({
          word: ch,
          pinyin: py,
          sentence: this.data.sentence,
          groupId: this.data.groupId,
        });
        wx.showToast({
          title: added ? "已收进生词本" : "词库里已经有了",
          icon: "none",
        });
      },
      fail: () => {},
    });
  },

  /* ---------------- 录音 ---------------- */
  startRecord() {
    if (this.data.recording) return;
    this._sec = 0;
    // 触摸瞬间就点亮分句追踪（同步 setData，先于录音通道启动，按住立刻能看到浮动）
    this.setData({ recording: true, trackOn: true, recordTime: "00:00" });
    // 按住瞬间把句子卡滚回可见区：上方追踪条 + 中间句子 + 下方麦克风同屏
    this.scrollToCard();
    try {
      wx.vibrateShort({ type: "light" });
    } catch (e) {}

    this._timer = setInterval(() => {
      this._sec += 1;
      const s = String(this._sec % 60).padStart(2, "0");
      const m = String(Math.floor(this._sec / 60)).padStart(2, "0");
      this.setData({ recordTime: m + ":" + s });
      if (this._sec >= 30) this.endRecord();
    }, 1000);

    this.startRecorder();
  },

  startRecorder() {
    try {
      const rec = wx.getRecorderManager();
      this._rec = rec;
      rec.onStop((res) => {
        if (res && res.tempFilePath) this._lastFile = res.tempFilePath;
      });
      rec.onError(() => {});
      rec.start({
        duration: 30000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: "mp3",
      });
    } catch (e) {
      this._rec = null;
    }
  },

  endRecord() {
    if (!this.data.recording) return;
    clearInterval(this._timer);
    const dur = this._sec || 2;
    this.setData({ recording: false, trackOn: false });
    try {
      if (this._rec) this._rec.stop();
    } catch (e) {}

    const group = store.markRead(this.data.groupId, this._index, dur);
    const praise = this.data.isKid
      ? "读完啦，真勇敢！🌟"
      : "录音已保存 " + dur + " 秒，收获 3 颗鼓励星 🌟";
    wx.showToast({ title: praise, icon: "none", duration: 1500 });

    if (group) {
      const p = store.progressOf(group);
      this.setData({ readCount: p.read, percent: p.percent, allRead: !!group.done });
      if (group.done) {
        // 整篇读完：不再自动跳奖励页（会把正在翻页的孩子直接带走），只提示，由「完成朗读」按钮决定
        wx.showToast({ title: "整篇读完啦！点「完成朗读」领奖励 🎉", icon: "none", duration: 2000 });
        return;
      }
    }
    if (this._index < this.data.sentenceTotal - 1) {
      setTimeout(() => this.goTo(this._index + 1), 800);
    }
  },

  playRecord() {
    if (!this._lastFile) {
      wx.showToast({ title: "还没有录音，按住麦克风读一句吧", icon: "none" });
      return;
    }
    const ctx = wx.createInnerAudioContext();
    ctx.src = this._lastFile;
    ctx.play();
    ctx.onEnded(() => ctx.destroy());
  },

  /* ---------------- 句子切换 ---------------- */
  goTo(index) {
    store.setCursor(this.data.groupId, index);
    this.renderSentence(index);
    this.scrollToCard();
  },

  /* 右下按钮：还有下一句就翻页；到了最后一句（或整篇已读完）才是「完成朗读」 */
  onNextOrFinish() {
    if (this.data.isLast || this.data.allRead) {
      this.finish();
      return;
    }
    this.nextSentence();
  },

  nextSentence() {
    if (this._index >= this.data.sentenceTotal - 1) {
      wx.showToast({ title: "已经是最后一句啦", icon: "none" });
      return;
    }
    this.goTo(this._index + 1);
  },

  prevSentence() {
    if (this._index <= 0) {
      wx.showToast({ title: "已经是第一句啦", icon: "none" });
      return;
    }
    this.goTo(this._index - 1);
  },

  skipSentence() {
    this.nextSentence();
  },

  /* 完成朗读：先问一句，确认后才进奖励页 */
  finish() {
    const list = (this._group && this._group.sentences) || [];
    const unread = list.filter((x) => !x.read).length;
    wx.showModal({
      title: "完成朗读",
      content: unread ? "还有 " + unread + " 句没读，现在去看成果吗？" : "整篇都读完啦，去看看成果吧！",
      confirmText: "看成果",
      cancelText: "继续读",
      success: (r) => {
        if (r.confirm) this.goReward();
      },
    });
  },

  goReward() {
    wx.redirectTo({ url: "/pages/reward/reward?groupId=" + this.data.groupId });
  },

  toast(e) {
    const msg = (e && e.currentTarget && e.currentTarget.dataset.msg) || "提示";
    wx.showToast({ title: msg, icon: "none", duration: 1500 });
  },

  onUnload() {
    clearInterval(this._timer);
    tts.stop();
    tts.destroy();
    try {
      if (this._rec) this._rec.stop();
    } catch (e) {}
  },
});
