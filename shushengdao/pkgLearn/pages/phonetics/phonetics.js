const app = getApp();
const store = require("../../../utils/store");
const nav = require("../../../utils/nav");
const tts = require("../../../utils/tts");
const ipaAudio = require("../../../utils/ipaAudio");
const ph = require("../../../utils/phonetics");
const mouthChart = require("../../../utils/mouthChart");
const songs = require("../../../utils/songs");
const songPlay = require("../../../utils/songPlay");

/** 分类条：第一个是「全部」，点进去是纯展示总览；其余是正常跟读分组 */
function chipGroups() {
  return [{ key: "all", name: "全部 48", sub: "纯展示总览" }].concat(ph.getGroups());
}

const PAGE_DEF = {
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    groups: [],
    mode: "item",
    navSolid: false,
    groupKey: "v-long",
    groupName: "",
    groupSub: "",
    list: [],
    index: 0,
    groupTotal: 0,
    total: 48,
    item: {},
    song: songs.english,
    songLine: -1,
    songSyl: -1,
    songMode: 'sing',
    songPlaying: false,
    songScroll: 0, // 歌词滚动位置（唱到哪一句就滚到中间）
    songPos: 0, // 进度条百分比
    songClock: '0:00',
    songTotal: songs.english.totalText,
    doneCount: 0,
    percent: 0,
    todayCount: 0,
    sections: [],
    speaking: false,
    speakingWord: "",
    slow: false,
    autoPlay: false, // 连读：播完当前自动切下一个，不用手动点
    justLearned: false,
    mouthHint: "",
    mouthFail: false,
    mouthSim: null,
    ttsTip: "",
  },

  onLoad(options) {
    this.setData(nav.sync());
    const user = store.getUser();
    const groupKey = (options && options.group) || "all"; /* 默认进「全部」总览（含 ABC 歌播放器） */
    const wantId = (options && options.id) || "";
    this.setData({ groups: chipGroups(), total: ph.all().length });
    this.loadGroup(groupKey, wantId);
  },

  onReady() {
    this.initMouth();
  },

  onShow() {
    this.refreshStats();
  },

  /** 页面往上滑时顶栏变不透明，内容不会从标题后面透出来 */
  onPageScroll(e) {
    const solid = (e && e.scrollTop) > 8;
    if (solid !== !!this.data.navSolid) this.setData({ navSolid: solid });
  },

  onHide() {
    this.stopAuto();
    songPlay.stop(this);
  },

  onUnload() {
    this.stopAuto();
    songPlay.stop(this);
  },

  /* ---------------- 读音 ---------------- */
  stopSpeak() {
    clearTimeout(this._sayTimer); // 双播的第二次别再冒出来
    this._sayTimer = null;
    tts.stop();
    ipaAudio.stop();
    if (this.data.speaking || this.data.speakingWord) {
      this.setData({ speaking: false, speakingWord: "" });
    }
  },

  /** 读当前音标：播这个音本身的单音（sounds/ipa/）；每次连发两遍，间隔 0.2s */
  speakPhoneme() {
    this.playPhoneme(this.data.item || {}, true);
  },

  /** 单音双播：first=true 是第一遍，读完隔 0.2s 再来一遍 */
  playPhoneme(it, first) {
    if (!it.audio) {
      this.speakPhonemeFallback(it, first);
      return;
    }
    clearTimeout(this._sayTimer); // 连点/切换时取消上一次还没播的第二遍
    this._sayTimer = null;
    tts.stop();
    ipaAudio.stop();
    this.setData({ speaking: true, speakingWord: "", ttsTip: "" });
    ipaAudio.play(it.audio, {
      rate: this.data.slow ? 0.85 : 1,
      onEnd: () => {
        if (first && !this.data.autoPlay) {
          this._sayTimer = setTimeout(() => this.playPhoneme(it, false), 200);
          return;
        }
        this.setData({ speaking: false, speakingWord: "" });
      },
      onError: () => this.speakPhonemeFallback(it, first),
    });
  },

  /** 兜底：单音音频缺失时用代表词发音（并说明读的是代表词，不含糊） */
  speakPhonemeFallback(it, first) {
    if (!it || !it.say) {
      this.setData({ speaking: false });
      return;
    }
    // play() 会把 ttsTip 清空，所以提示语放在它后面写
    this.play(it.say, "", first); // 双播交给 TTS 通道
    if (first) {
      this.setData({ ttsTip: "这个音标的单音音频没找到，先用代表词 " + it.say + " 代替" });
    }
  },

  /** 读例词 */
  speakWord(e) {
    const word = e.currentTarget.dataset.word;
    if (!word) return;
    this.play(word, word);
  },

  /** text：要读的内容；word：例词高亮标记；repeat：true 时读两遍（间隔 0.2s） */
  play(text, word, repeat) {
    const user = store.getUser();
    const base = Number(user.speechRate) || 1;
    tts.stop();
    this.setData({ speaking: true, speakingWord: word || "", ttsTip: "" });
    tts
      .speak(text, {
        rate: this.data.slow ? Math.max(0.5, base * 0.75) : base,
        voice: user.ttsVoice,
        onEnd: () => {
          if (repeat && !this.data.autoPlay) {
            // 第一遍读完，隔 0.2s 再读一遍（连读中不双播，避免打断自动链路）
            this._sayTimer = setTimeout(() => this.play(text, word, false), 200);
            return;
          }
          this.setData({ speaking: false, speakingWord: "" });
        },
        onError: (e) => {
          this.setData({ speaking: false, speakingWord: "" });
          this.handleTtsError(e);
        },
      })
      .catch((err) => {
        this.setData({ speaking: false, speakingWord: "" });
        this.handleTtsError(err);
      });
  },

  /** 语音不可用时不留白：卡片里挂一条可点的提示，点开能看到具体原因 */
  handleTtsError(err) {
    const code = (err && err.code) || "";
    const missing = code === "PLUGIN_MISSING" || code === "NO_CHANNEL" || code === "PLUGIN_OFF";
    this.setData({
      ttsTip: missing ? "这个版本的语音还没开通" : (err && err.errMsg) || "这句没读出来",
    });
    if (missing) {
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
    wx.showToast({ title: this.data.ttsTip, icon: "none" });
  },

  /** 点提示条看诊断结果（渠道 / 插件 / 云函数） */
  showTtsDiag() {
    const d = tts.diagnose();
    const lines = [
      "通道：" + d.provider,
      "插件：" + (d.pluginAvailable ? "可用" : "不可用"),
      "云函数：" + (d.cloudAvailable ? "可用" : "未配置"),
    ];
    if (!d.available && d.tip) lines.push("", d.tip);
    wx.showModal({
      title: "语音自检",
      content: lines.join("\n"),
      showCancel: false,
      confirmText: "好",
      confirmColor: "#0ea5e9",
    });
  },

  toggleSlow() {
    this.setData({ slow: !this.data.slow });
    wx.showToast({ title: this.data.slow ? "慢速播放已开" : "恢复常速", icon: "none" });
  },

  /* ---------------- 连读：每个读 2 遍，读完一组自动进下一组，不用手动切 ---------------- */
  toggleAuto() {
    if (this.data.autoPlay) {
      this.stopAuto();
      wx.showToast({ title: "连读已停", icon: "none" });
      return;
    }
    if (this.data.mode !== "item" || !this.data.list.length) return;
    this.setData({ autoPlay: true });
    wx.showToast({ title: "连读开始，每个读 2 遍", icon: "none" });
    this.autoStep();
  },

  stopAuto() {
    clearTimeout(this._autoTimer);
    this._autoTimer = null;
    if (this.data.autoPlay) this.setData({ autoPlay: false });
    this.stopSpeak();
  },

  /** 连读一步：每个音标读 2 遍（遍间隔 0.2s），播完隔 0.4s 自动切下一个 */
  autoStep() {
    if (!this.data.autoPlay) return;
    clearTimeout(this._sayTimer); // 连读接管播报，挂起的双播作废
    this._sayTimer = null;
    this._autoRepeat = false;
    this._autoUsedFallback = false;
    this.autoPlayOnce();
  },

  /** 播一遍：单音音频优先；本项已退到代表词兜底，则第二遍也读代表词 */
  autoPlayOnce() {
    if (!this.data.autoPlay) return;
    const it = this.data.item || {};
    if (it.audio && !this._autoUsedFallback) {
      tts.stop();
      ipaAudio.stop();
      this.setData({ speaking: true, speakingWord: "", ttsTip: "" });
      ipaAudio.play(it.audio, {
        rate: this.data.slow ? 0.85 : 1,
        onEnd: () => this.autoChainNext(),
        onError: () => this.autoSpeakWord(it),
      });
    } else {
      this.autoSpeakWord(it);
    }
  },

  /** 兜底：单音缺失/播放失败时读代表词 */
  autoSpeakWord(it) {
    if (!it || !it.say) {
      if (this.data.autoPlay) this._autoTimer = setTimeout(() => this.autoNext(), 500);
      return;
    }
    this._autoUsedFallback = true;
    const user = store.getUser();
    const base = Number(user.speechRate) || 1;
    tts.stop();
    this.setData({ speaking: true, speakingWord: "", ttsTip: "" });
    tts
      .speak(it.say, {
        rate: this.data.slow ? Math.max(0.5, base * 0.75) : base,
        voice: user.ttsVoice,
        onEnd: () => this.autoChainNext(),
        onError: () => {
          this.setData({ speaking: false, speakingWord: "" });
          this.stopAuto();
        },
      })
      .catch(() => this.stopAuto());
  },

  /** 播完一遍后：第一遍 → 停 0.2s 再读一遍；第二遍 → 停 0.4s 切下一个 */
  autoChainNext() {
    this.setData({ speaking: false, speakingWord: "" });
    if (!this.data.autoPlay) return;
    if (!this._autoRepeat) {
      this._autoRepeat = true;
      this._autoTimer = setTimeout(() => this.autoPlayOnce(), 200);
    } else {
      this._autoTimer = setTimeout(() => this.autoNext(), 400);
    }
  },

  autoNext() {
    if (!this.data.autoPlay) return;
    if (this.data.index >= this.data.list.length - 1) {
      // 本组读完 → 自动切下一组继续连
      const groups = ph.getGroups();
      const cur = groups.findIndex((g) => g.key === this.data.groupKey);
      const next = groups[cur + 1];
      if (next) {
        this.loadGroup(next.key, "", true);
        wx.showToast({ title: "下一组：" + next.name, icon: "none" });
        return;
      }
      this.stopAuto();
      wx.showToast({ title: "全部音标连读完啦 🎉", icon: "none" });
      return;
    }
    this.moveTo(this.data.index + 1);
  },

  /* ---------------- 英文歌（「全部」总览页里的儿歌） ---------------- */
  toggleSong() {
    songPlay.toggle(this);
  },

  tapSongLine(e) {
    songPlay.speakOne(this, Number(e.currentTarget.dataset.idx));
  },

  stopSong() {
    songPlay.stop(this);
  },

  pickSongMode(e) {
    songPlay.pickMode(this, e.currentTarget.dataset.mode);
  },

  /* ---------------- 分类与切换 ---------------- */
  loadGroup(groupKey, wantId, keepAuto) {
    clearTimeout(this._autoTimer); // 旧切换计时一律作废，续连由 autoStep 重新发起
    this._autoTimer = null;
    if (!keepAuto) this.stopAuto(); // 换分类就停连读（跨组自动续连时除外）
    songPlay.stop(this); // 换页就停歌
    // 「全部」= 纯展示总览：一屏看全 48 个，不显示跟读卡片
    if (groupKey === "all") {
      tts.stop();
      ipaAudio.stop();
      const all = ph.all();
      this.setData({
        mode: "all",
        groupKey: "all",
        groupName: "全部",
        groupSub: "48 个音标一览",
        list: all,
        index: 0,
        groupTotal: all.length,
        item: {},
        speaking: false,
        speakingWord: "",
        justLearned: false,
        mouthHint: "",
      });
      this.buildSections();
      this.refreshStats();
      return;
    }
    const groups = ph.getGroups();
    const g = groups.filter((x) => x.key === groupKey)[0] || groups[0];
    const list = ph.list(g.key);
    let idx = 0;
    if (wantId) {
      const hit = list.findIndex((p) => p.id === wantId);
      if (hit > -1) idx = hit;
    }
    tts.stop();
    ipaAudio.stop();
    this.setData({
      mode: "item",
      groupKey: g.key,
      groupName: g.name,
      groupSub: g.sub,
      list: list,
      index: idx,
      groupTotal: list.length,
      item: list[idx] || {},
      speaking: false,
      speakingWord: "",
      justLearned: false,
      mouthHint: (mouthChart.params(list[idx] && list[idx].id) || {}).hint || "",
    });
    store.setUser({ phonicsGroup: g.key });
    this.buildSections();
    this.refreshStats();
    this.drawMouth();
    // 跨组自动续连 / 点选跳转续连：新组首项接着播
    if (keepAuto && this.data.autoPlay) this.autoStep();
  },

  pickGroup(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.groupKey) return;
    this.loadGroup(key, "");
  },

  pickItem(e) {
    const id = e.currentTarget.dataset.id;
    // 只有跟读卡片页下方的音标格（data-auto="1"）点了才开始连读；
    // 「全部」总览里点只做跳转展示，不打断正在做的事
    const startAuto = !!e.currentTarget.dataset.auto;
    const target = ph.get(id);
    if (!target) return;
    if (startAuto && !this.data.autoPlay) this.setData({ autoPlay: true });
    if (target.group !== this.data.groupKey) {
      this.loadGroup(target.group, id, startAuto);
      return;
    }
    const idx = this.data.list.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.moveTo(idx);
  },

  prevItem() {
    if (this.data.index <= 0) {
      wx.showToast({ title: "这一类的第一个音标啦", icon: "none" });
      return;
    }
    this.moveTo(this.data.index - 1);
  },

  nextItem() {
    if (this.data.index >= this.data.list.length - 1) {
      wx.showToast({ title: "这一类的音标都看完啦，换一类试试", icon: "none" });
      return;
    }
    this.moveTo(this.data.index + 1);
  },

  moveTo(idx) {
    clearTimeout(this._autoTimer); // 连读中的旧计时作废，以最新切换为准
    clearTimeout(this._sayTimer); // 双播的第二次作废
    this._sayTimer = null;
    tts.stop();
    ipaAudio.stop();
    const it = this.data.list[idx] || {};
    this.setData({
      index: idx,
      item: it,
      speaking: false,
      speakingWord: "",
      justLearned: false,
      mouthHint: (mouthChart.params(it.id) || {}).hint || "",
    });
    this.drawMouth();
    // 连读开着：手动切换/自动切换都从这里接着播
    if (this.data.autoPlay) this.autoStep();
  },

  /* ---------------- 口型舌位图（旧版 canvas，真机兼容性最好） ---------------- */
  initMouth(retried) {
    const q = wx.createSelectorQuery().in(this);
    q.select("#mouth")
      .boundingClientRect((rect) => {
        const w = (rect && rect.width) || 150;
        const h = (rect && rect.height) || 120;
        try {
          if (typeof wx.createCanvasContext !== "function") throw new Error("no createCanvasContext");
          const c = wx.createCanvasContext("mouth", this);
          this._mouthCtx = mouthChart.legacyCtx(c);
          this._mouthW = w;
          this._mouthH = h;
          this._mouthInited = true;
          this.drawMouth();
        } catch (e) {
          this._mouthInited = true;
          this.setData({ mouthFail: true, mouthSim: this.buildMouthSim(this.data.item && this.data.item.id) });
        }
      })
      .exec();
  },

  /** 重画当前音标的口舌图（切音标后调用）；画布不可用时改用 CSS 口型图 */
  drawMouth(id) {
    const cur = id || (this.data.item && this.data.item.id);
    if (!cur) return;
    if (!this._mouthInited) return; // onReady 之前先不画，等画布就绪
    if (this._mouthCtx && mouthChart.draw(this._mouthCtx, this._mouthW, this._mouthH, cur)) {
      if (this._mouthCtx.__flush) this._mouthCtx.__flush(); // 旧版 canvas 要 draw 一次才真正上屏
      if (this.data.mouthFail) this.setData({ mouthFail: false });
      return;
    }
    this.setData({ mouthFail: true, mouthSim: this.buildMouthSim(cur) });
  },

  /** 画布不可用时的降级图：用 jaw / tongue / lips 参数摆一个正面口型 */
  buildMouthSim(id) {
    const p = mouthChart.params(id) || {};
    const jaw = p.jaw == null ? 0.4 : p.jaw;
    const t = p.tongue || { x: 0.5, y: 0.5 };
    const lips = p.lips || "neutral";
    return {
      open: Math.round(30 + jaw * 56), // 嘴张开高度 px（画布 96px 高）
      wide: lips === "close" ? 46 : lips === "round" ? 54 : lips === "spread" ? 86 : 70,
      round: lips === "round" ? 50 : lips === "spread" ? 16 : lips === "close" ? 8 : 34,
      tongueTop: Math.round(18 + t.y * 30),
      tongueLeft: Math.round(10 + t.x * 18),
      voiced: !!p.voiced,
    };
  },

  /* ---------------- 学会一个 ---------------- */
  markLearned() {
    const it = this.data.item || {};
    if (!it.id) return;
    store.markPhoneme(it.id);
    wx.vibrateShort && wx.vibrateShort({ type: "light", fail: () => {} });
    this.setData({ justLearned: true });
    this.buildSections();
    this.refreshStats();
    setTimeout(() => {
      if (this.data.index < this.data.list.length - 1) {
        this.moveTo(this.data.index + 1);
      } else {
        wx.showToast({ title: "这一组音标都读完啦 🎉", icon: "none" });
      }
    }, 620);
  },

  /* ---------------- 数据 ---------------- */
  buildSections() {
    const map = store.phonemeMap();
    const sections = ph.sections().map((g) => ({
      key: g.key,
      name: g.name,
      sub: g.sub,
      count: g.count,
      items: g.items.map((p) => ({ id: p.id, ipa: p.ipa, say: p.say, done: !!map[p.id] })),
    }));
    this.setData({ sections });
  },

  refreshStats() {
    const s = store.phonemeStats();
    this.setData({ doneCount: s.done, percent: s.percent, todayCount: s.today });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: "/pages/home/home" }),
    });
  },
};

/* ---------------- 真机防护 ----------------
 * 任何方法抛错都不让页面「点不动还不报错」：
 * 统一 try/catch，错误以浮层显示在页面上（可复制），方便第一时间定位真机问题。 */
function showPageError(page, err, where) {
  const msg = (err && (err.message || err.errMsg)) || String(err || "未知错误");
  console.error("[音标页] " + where + " 出错：" + msg, err);
  try {
    wx.setStorageSync("wb_lastError", { page: "phonetics", where: where, msg: String(msg).slice(0, 200), at: Date.now() });
  } catch (e) {}
  page.setData({ pageError: msg.slice(0, 80), pageErrorFull: String(msg).slice(0, 300) });
}

const SAFE_PAGE = { data: PAGE_DEF.data };
Object.keys(PAGE_DEF).forEach((k) => {
  if (k === "data") return;
  const fn = PAGE_DEF[k];
  if (typeof fn !== "function") {
    SAFE_PAGE[k] = fn;
    return;
  }
  SAFE_PAGE[k] = function () {
    const args = arguments;
    try {
      return fn.apply(this, args);
    } catch (err) {
      showPageError(this, err, k);
    }
  };
});
SAFE_PAGE.showError = function (e) {
  const detail =
    (this.data.pageErrorFull || this.data.pageError || "未捕获到错误详情") +
    "\n\n请截图发给家长群/开发者，方便修复。";
  wx.setClipboardData({
    data: detail,
    success: () => wx.showToast({ title: "错误详情已复制", icon: "none" }),
    fail: () => {
      wx.showModal({ title: "页面出错了", content: detail, showCancel: false });
    },
  });
};
SAFE_PAGE.dismissError = function () {
  this.setData({ pageError: "", pageErrorFull: "" });
};
Page(SAFE_PAGE);
