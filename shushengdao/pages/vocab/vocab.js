const app = getApp();
const config = require("../../config/index");
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tts = require("../../utils/tts");
const pinyin = require("../../utils/pinyin");
const ocr = require("../../utils/ocr");
const tab = require("../../utils/tab");

function buildPinyin(word) {
  return Array.from(String(word || ""))
    .map((c) => pinyin.getPinyin(c))
    .filter((p) => p)
    .join(" ");
}

/* ---------------- 拍照收词：从识别文本里挑词 ---------------- */
// 虚词/助词：作为词的起止字基本不成词，先过滤掉一大半噪声
const STOP = "的了着过是在有和与就都也很不没把被让给对从向往为以于而且但如果因所这那哪谁什么我你他她它们还又才吗呢吧啊呀之其".split("");
const CLAUSE_SPLIT = /[，。！？；：、,.!?;:…\s（）()《》「」“”"'\-—·]+/;
// 词边界线索：后接虚词 → 前面像词尾；前接虚词 → 后面像词头
const POST_FN = "的了着过们很都也还又才吗呢吧啊呀";
const PRE_FN = "是把给了一着很都也在有和与就的这那";

/**
 * 从识别行里抽候选词：按标点断句 → 2/3 字滑窗 → 去虚词 → 边界打分排序。
 * 得分 = 出现次数*10 - (字数-2)*4 + 边界加分（句首/句尾/虚词邻接各 +4~5）。
 * 展示前 16 个；默认只勾选高分词（一般是真词），家长可随意增减。
 */
function extractCandidates(lines, limit) {
  const stat = {};
  (lines || []).forEach((line) => {
    String(line || "")
      .split(CLAUSE_SPLIT)
      .forEach((clause) => {
        const chars = Array.from(clause.replace(/[^\u4e00-\u9fa5]/g, ""));
        if (chars.length < 2) return;
        [2, 3].forEach((n) => {
          for (let i = 0; i + n <= chars.length; i++) {
            const seg = chars.slice(i, i + n).join("");
            if (STOP.indexOf(seg[0]) > -1 || STOP.indexOf(seg[n - 1]) > -1) continue;
            // 位置线索（该词出现位置可能多处，取最高分）
            let bonus = 0;
            if (chars.length > n + 1) {
              if (i === 0) bonus += 5; // 句首
              if (i + n === chars.length) bonus += 5; // 句尾
            }
            if (i + n < chars.length && POST_FN.indexOf(chars[i + n]) > -1) bonus += 4;
            if (i > 0 && PRE_FN.indexOf(chars[i - 1]) > -1) bonus += 4;
            if (!stat[seg]) stat[seg] = { word: seg, n, count: 0, best: 0, sentence: clause };
            stat[seg].count += 1;
            if (bonus > stat[seg].best) stat[seg].best = bonus;
          }
        });
      });
  });
  const score = (it) => it.count * 10 - (it.n - 2) * 4 + it.best;
  const sorted = Object.keys(stat)
    .map((k) => stat[k])
    .sort((a, b) => score(b) - score(a) || a.n - b.n);

  // 去掉与更优候选互相嵌套的长词（如已有「秋天」就不需要「秋天的」）
  const kept = [];
  sorted.forEach((it) => {
    const nested = kept.some((prev) => prev.word.indexOf(it.word) > -1);
    if (!nested) kept.push(it);
  });
  return kept.slice(0, limit || 16).map((it) => ({
    word: it.word,
    sentence: it.sentence,
    count: it.count,
    best: it.best,
    score: Math.round(score(it)),
    on: false,
  }));
}

/** 默认勾选：真词概率高的（有边界线索，或重复出现 3 次以上） */
function autoPick(words, max) {
  let picked = 0;
  words.forEach((w) => {
    if (picked < (max || 5) && (w.best >= 4 || w.count >= 3) && w.word.length === 2) {
      w.on = true;
      picked += 1;
    }
  });
  return picked;
}

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    searchOpen: false,
    keyword: "",
    filter: "all",
    filters: [
      { key: "all", label: "全部", count: 0 },
      { key: "new", label: "待复习", count: 0 },
      { key: "mastered", label: "已掌握", count: 0 },
    ],
    words: [],
    stats: { total: 0, mastered: 0, pending: 0, percent: 0 },
    // 播放中的生词 id / 复习卡是否在播：驱动喇叭按钮的波纹与声波动画
    playingId: "",
    reviewPlaying: false,
    reviewMode: false,
    reviewList: [],
    reviewIndex: 0,
    reviewPercent: 0,
    current: {},
    reviewDone: false,
    reviewKnownCount: 0,
    reviewUnknownCount: 0,
    // 拍照收词
    scanOpen: false,
    scanning: false,
    scanErr: "",
    scanWords: [],
    scanPicked: 0,
    scanAllOn: false,
    scanInput: "",
    scanText: "",
    scanLines: 0,
    scanModeLabel: "",
    isMock: false,
    textOpen: false,
  },

  onLoad() {
    this.setData(Object.assign(nav.sync(), { showBack: tab.showBack() }));
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  onHide() {
    // 切后台就别让按钮一直"跳动"了
    tts.stop();
    this.setData({ playingId: "", reviewPlaying: false });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  /** 底部任务栏（页签式切换） */
  goTab(e) {
    tab.goTab(this, e, "vocab");
  },

  onSameTab() {
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  refresh() {
    // 旧数据拼音补全：词典扩充前收录的词可能缺音/少音，首次进入静默补齐一次
    if (!this._pyMigrated) {
      this._pyMigrated = true;
      store.listWords({}).forEach((w) => {
        const hanzi = Array.from(String(w.word || "")).filter((c) => /[\u4e00-\u9fa5]/.test(c))
          .length;
        const py = String(w.pinyin || "").trim();
        const syllables = py ? py.split(/\s+/).length : 0;
        if (hanzi && syllables < hanzi) {
          const full = buildPinyin(w.word);
          if (full && full.split(/\s+/).length >= hanzi) store.updateWord(w.id, { pinyin: full });
        }
      });
    }
    const stats = store.vocabStats();
    const filter = this.data.filter;
    const list = store.listWords({ filter, keyword: this.data.keyword });
    const words = list.map((w) => ({
      id: w.id,
      word: w.word,
      pinyin: w.pinyin || buildPinyin(w.word),
      initial: Array.from(w.word)[0] || "词",
      sentence: w.sentence || "",
      mastered: !!w.mastered,
      reviews: w.reviews || 0,
    }));
    const counts = {
      all: stats.total,
      new: stats.pending,
      mastered: stats.mastered,
    };
    this.setData({
      words,
      stats: Object.assign({}, stats, {
        percent: stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0,
      }),
      filters: this.data.filters.map((f) => Object.assign({}, f, { count: counts[f.key] || 0 })),
    });
  },

  toggleSearch() {
    this.setData({ searchOpen: !this.data.searchOpen, keyword: "" });
    this.refresh();
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.refresh();
  },

  clearSearch() {
    this.setData({ keyword: "" });
    this.refresh();
  },

  pickFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.refresh();
  },

  /* ---------------- 单个生词操作 ---------------- */
  /** 播放单个生词：播放中该词的喇叭按钮有波纹+声波跳动 */
  speakWord(e) {
    const item = this.data.words[e.currentTarget.dataset.index];
    if (!item) return;
    const user = store.getUser();
    tts.stop();
    this.setData({ playingId: item.id, reviewPlaying: false });
    tts
      .speak(item.word, {
        rate: user.speechRate,
        onEnd: () => this.setData({ playingId: "" }),
        onError: () => this.setData({ playingId: "" }),
      })
      .catch((err) => {
        this.setData({ playingId: "" });
        this.fallbackSpeak(err);
      });
  },

  fallbackSpeak(err) {
    if (err && err.code === "PLUGIN_MISSING") {
      wx.showModal({
        title: "语音插件未启用",
        content: "请在微信公众平台「设置 → 第三方设置 → 插件管理」添加「同声传译」插件，并把 app.json 中的 plugins 配置打开。",
        showCancel: false,
        confirmText: "知道了",
        confirmColor: "#0ea5e9",
      });
      return;
    }
    wx.showToast({ title: (err && err.errMsg) || "语音播放失败", icon: "none" });
  },

  toggleMastered(e) {
    const item = this.data.words[e.currentTarget.dataset.index];
    if (!item) return;
    store.setMastered(item.id);
    wx.showToast({ title: item.mastered ? "已标记待复习" : "太棒了，已掌握", icon: "none" });
    this.refresh();
  },

  removeWord(e) {
    const item = this.data.words[e.currentTarget.dataset.index];
    if (!item) return;
    wx.showModal({
      title: "移出生词本",
      content: `确定要删除「${item.word}」吗？`,
      confirmText: "删除",
      confirmColor: "#f97316",
      success: (res) => {
        if (!res.confirm) return;
        store.removeWord(item.id);
        this.refresh();
      },
    });
  },

  addWord() {
    wx.showModal({
      title: "添加生词",
      editable: true,
      placeholderText: "输入要收录的词，如：钥匙",
      confirmText: "收录",
      confirmColor: "#0ea5e9",
      success: (res) => {
        if (!res.confirm) return;
        const word = String(res.content || "").trim();
        if (!word) {
          wx.showToast({ title: "还没输入内容哦", icon: "none" });
          return;
        }
        if (word.length > 8) {
          wx.showToast({ title: "一次最多 8 个字", icon: "none" });
          return;
        }
        store.addWord({ word, pinyin: buildPinyin(word), sentence: "" });
        wx.showToast({ title: "已收入生词本", icon: "success" });
        this.refresh();
      },
    });
  },

  /* ---------------- 拍照收词 ---------------- */
  noop() {},

  openScan() {
    wx.showActionSheet({
      itemList: ["拍照收词", "从相册选一张"],
      success: (res) => this.choosePhoto(res.tapIndex === 0 ? "camera" : "album"),
      fail: () => {},
    });
  },

  choosePhoto(source) {
    const onFile = (path) => {
      if (path) this.runScan(path);
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: [source],
        sizeType: ["compressed"],
        success: (res) => {
          const f = (res.tempFiles || [])[0];
          onFile(f && f.tempFilePath);
        },
        fail: () => {},
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sourceType: [source],
      sizeType: ["compressed"],
      success: (res) => onFile((res.tempFilePaths || [])[0]),
      fail: () => {},
    });
  },

  runScan(path) {
    this.setData({
      scanOpen: true,
      scanning: true,
      scanErr: "",
      scanWords: [],
      scanPicked: 0,
      scanAllOn: false,
      scanInput: "",
      scanText: "",
      scanLines: 0,
      textOpen: false,
    });
    ocr
      .recognize([path], () => {})
      .then((res) => {
        const words = extractCandidates(res.lines, 16);
        const picked = autoPick(words, 5);
        this.setData({
          scanning: false,
          scanWords: words,
          scanPicked: picked,
          scanAllOn: words.length > 0 && picked === words.length,
          scanText: res.rawText,
          scanLines: (res.lines || []).length,
          isMock: res.mode === "mock",
          scanModeLabel: res.mode === "mock" ? "演示识别" : "已识别",
        });
      })
      .catch((err) => {
        this.setData({
          scanning: false,
          scanErr: (err && err.errMsg) || "识别失败，换一张更清晰的图片试试",
        });
      });
  },

  retryScan() {
    this.openScan();
  },

  closeScan() {
    this.setData({ scanOpen: false, scanning: false });
  },

  toggleWord(e) {
    const index = Number(e.currentTarget.dataset.index);
    const words = this.data.scanWords.map((w, i) => (i === index ? Object.assign({}, w, { on: !w.on }) : w));
    const picked = words.filter((w) => w.on).length;
    this.setData({ scanWords: words, scanPicked: picked, scanAllOn: picked === words.length });
  },

  toggleAllWords() {
    const on = !this.data.scanAllOn;
    const words = this.data.scanWords.map((w) => Object.assign({}, w, { on }));
    this.setData({ scanWords: words, scanPicked: on ? words.length : 0, scanAllOn: on });
  },

  onScanInput(e) {
    this.setData({ scanInput: e.detail.value });
  },

  /** 手动补一个词进候选（回车或点「加入」） */
  addScanWord(e) {
    const fromEvent = e && e.detail && typeof e.detail.value === "string" ? e.detail.value : "";
    const raw = String(fromEvent || this.data.scanInput || "").trim();
    if (!raw) return;
    if (raw.length > 8) {
      wx.showToast({ title: "一次最多 8 个字", icon: "none" });
      return;
    }
    if (this.data.scanWords.some((w) => w.word === raw)) {
      wx.showToast({ title: "已经在候选里啦", icon: "none" });
      this.setData({ scanInput: "" });
      return;
    }
    const words = [{ word: raw, sentence: "", count: 0, on: true }].concat(this.data.scanWords);
    this.setData({
      scanWords: words,
      scanInput: "",
      scanPicked: words.filter((w) => w.on).length,
      scanAllOn: words.every((w) => w.on),
      scanErr: "",
    });
  },

  toggleText() {
    this.setData({ textOpen: !this.data.textOpen });
  },

  confirmScan() {
    const picked = this.data.scanWords.filter((w) => w.on);
    if (!picked.length) {
      wx.showToast({ title: "先选几个词吧", icon: "none" });
      return;
    }
    const exist = {};
    store.listWords({}).forEach((w) => (exist[w.word] = 1));
    picked.forEach((w) => {
      store.addWord({ word: w.word, pinyin: buildPinyin(w.word), sentence: w.sentence });
    });
    const added = picked.filter((w) => !exist[w.word]).length;
    this.setData({ scanOpen: false, filter: "all", keyword: "" });
    this.refresh();
    wx.showToast({
      title: added ? `已收进词库 ${added} 个词` : "这些词都已经在词库里了",
      icon: "none",
    });
  },

  /** 识别失败时直接转手动添加 */
  manualFromScan() {
    this.setData({ scanOpen: false });
    this.addWord();
  },

  /* ---------------- 复习模式 ---------------- */
  startReview() {
    const list = store.listWords({ filter: "new" });
    if (!list.length) {
      wx.showToast({ title: "所有生词都掌握啦 🎉", icon: "none" });
      return;
    }
    this._review = list.map((w) => ({
      id: w.id,
      word: w.word,
      pinyin: w.pinyin || buildPinyin(w.word),
      sentence: w.sentence || "",
    }));
    this.setData({
      reviewMode: true,
      reviewList: this._review,
      reviewIndex: 0,
      reviewPercent: 0,
      current: this._review[0],
      reviewDone: false,
      reviewKnownCount: 0,
      reviewUnknownCount: 0,
    });
  },

  closeReview() {
    this.setData({ reviewMode: false, reviewPlaying: false });
    tts.stop();
    this.refresh();
  },

  /** 复习卡「听一听」：播放中按钮有波纹+声波跳动，让孩子一眼看出在读 */
  speakCurrent() {
    if (!this.data.current || !this.data.current.word) return;
    const user = store.getUser();
    tts.stop();
    this.setData({ reviewPlaying: true, playingId: "" });
    tts
      .speak(this.data.current.word, {
        rate: user.speechRate,
        onEnd: () => this.setData({ reviewPlaying: false }),
        onError: () => this.setData({ reviewPlaying: false }),
      })
      .catch((err) => {
        this.setData({ reviewPlaying: false });
        this.fallbackSpeak(err);
      });
  },

  nextReview(known) {
    const item = this.data.reviewList[this.data.reviewIndex];
    if (item) store.reviewWord(item.id, known);
    const index = this.data.reviewIndex + 1;
    const knownCount = this.data.reviewKnownCount + (known ? 1 : 0);
    const unknownCount = this.data.reviewUnknownCount + (known ? 0 : 1);
    if (index >= this.data.reviewList.length) {
      this.setData({
        reviewDone: true,
        reviewKnownCount: knownCount,
        reviewUnknownCount: unknownCount,
        reviewPercent: 100,
      });
      return;
    }
    this.setData({
      reviewIndex: index,
      current: this.data.reviewList[index],
      reviewPercent: Math.round((index / this.data.reviewList.length) * 100),
      reviewKnownCount: knownCount,
      reviewUnknownCount: unknownCount,
    });
  },

  markKnown() {
    this.nextReview(true);
  },

  markUnknown() {
    this.nextReview(false);
  },

  /** 刚复习完的这批词再过一遍（不改动掌握状态） */
  restartReview() {
    if (!this._review || !this._review.length) {
      this.startReview();
      return;
    }
    this.setData({
      reviewIndex: 0,
      current: this._review[0],
      reviewDone: false,
      reviewPercent: 0,
      reviewKnownCount: 0,
      reviewUnknownCount: 0,
    });
  },
});
