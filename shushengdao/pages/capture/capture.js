const app = getApp();
const config = require("../../config/index");
const ocr = require("../../utils/ocr");
const textUtil = require("../../utils/text");
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const tab = require("../../utils/tab");

const SCAN_TEXTS = ["正在认字…", "正在整理句子…", "快好啦，再等一下…"];

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    step: "pick",
    maxImages: config.ocr.maxImages,
    images: [],
    scanning: false,
    scanText: "正在认字…",
    progress: 4,
    doneCount: 0,
    isMock: false,
    modeLabel: "",
    ocrFailed: 0,
    editingIndex: -1,
    sentences: [],
    stats: { sentences: 0, chars: 0, avg: 0 },
  },

  onLoad() {
    this.setData(Object.assign(nav.sync(), { showBack: tab.showBack() }));
    this._seq = 0;
    this._rawText = "";
    this._mode = "";
  },

  onUnload() {
    this.stopRotate();
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  /** 底部任务栏（页签式切换） */
  goTab(e) {
    tab.goTab(this, e, "capture");
  },

  onSameTab() {
    wx.pageScrollTo({ scrollTop: 0, duration: 220, fail: () => {} });
  },

  noop() {},

  /* ---------------- 选图 ----------------
     老人小孩一步到位：点「添加照片」直接唤起系统面板（拍照/相册），
     不再弹自家的二次菜单 */
  chooseSource() {
    const remain = this.data.maxImages - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${this.data.maxImages} 张哦`, icon: "none" });
      return;
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
        camera: "back",
        success: (res) => {
          const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
          this.appendImages(paths, remain);
        },
        fail: () => {},
      });
      return;
    }
    wx.chooseImage({
      count: remain,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => this.appendImages(res.tempFilePaths || [], remain),
      fail: () => {},
    });
  },

  appendImages(paths, remain) {
    const list = this.data.images.concat(
      paths.slice(0, remain).map((path) => ({ path, status: "waiting" }))
    );
    this.setData({ images: list });
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    const urls = this.data.images.map((i) => i.path);
    wx.previewImage({ current: urls[index], urls });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  moveImage(e) {
    const { index, dir } = e.currentTarget.dataset;
    const to = index + Number(dir);
    if (to < 0 || to >= this.data.images.length) return;
    const images = this.data.images.slice();
    const tmp = images[index];
    images[index] = images[to];
    images[to] = tmp;
    this.setData({ images });
  },

  /* ---------------- 识别 ---------------- */
  startScan() {
    if (this.data.scanning) return;
    if (!this.data.images.length) {
      wx.showToast({ title: "先添加至少一张照片", icon: "none" });
      return;
    }
    const images = this.data.images.map((i) => ({ path: i.path, status: "waiting" }));
    this.setData({
      scanning: true,
      images,
      progress: 4,
      doneCount: 0,
      scanText: SCAN_TEXTS[0],
      ocrFailed: 0,
    });
    this.startRotate();

    const paths = images.map((i) => i.path);
    let failed = 0;

    ocr
      .recognize(paths, (info) => {
        const list = this.data.images.slice();
        if (list[info.index]) list[info.index].status = info.status;
        const done = info.status === "ok" || info.status === "fail" ? this.data.doneCount + 1 : this.data.doneCount;
        if (info.status === "fail") failed += 1;
        this.setData({
          images: list,
          doneCount: done,
          progress: Math.min(96, Math.round((done / paths.length) * 100)),
          ocrFailed: failed,
        });
      })
      .then((res) => {
        this.stopRotate();
        this._rawText = res.rawText || "";
        this._mode = res.mode || "mock";
        const sentences = textUtil.splitSentences(res.rawText);
        this.fillSentences(sentences);
        this.setData({
          step: "review",
          scanning: false,
          progress: 100,
          doneCount: paths.length,
          isMock: res.mode === "mock",
          modeLabel: this.modeLabel(res.mode),
          ocrFailed: res.failed || failed,
        });
        if (!sentences.length) {
          wx.showToast({ title: "没有识别到文字，可以重拍或手动补句", icon: "none", duration: 2200 });
        }
      })
      .catch((err) => {
        this.stopRotate();
        this.setData({ scanning: false });
        wx.showModal({
          title: "识别没成功",
          content: (err && err.errMsg) || "网络似乎不太稳定，稍后再试试",
          showCancel: false,
          confirmText: "知道啦",
          confirmColor: "#0ea5e9",
        });
      });
  },

  modeLabel(mode) {
    if (mode === "market") return "服务市场识别";
    if (mode === "cloud") return "云端识别";
    return "演示数据";
  },

  startRotate() {
    this.stopRotate();
    let i = 0;
    this._rotate = setInterval(() => {
      i = (i + 1) % SCAN_TEXTS.length;
      this.setData({ scanText: SCAN_TEXTS[i] });
    }, 1600);
  },

  stopRotate() {
    if (this._rotate) clearInterval(this._rotate);
    this._rotate = null;
  },

  fillSentences(list) {
    const sentences = list.map((text) => ({
      id: "s" + this._seq++,
      text,
      chars: textUtil.countChars(text),
    }));
    this.setData({ sentences, editingIndex: -1 });
    this.refreshStats(sentences);
  },

  refreshStats(list) {
    const sentences = list || this.data.sentences;
    const chars = sentences.reduce((sum, s) => sum + textUtil.countChars(s.text), 0);
    const n = sentences.filter((s) => String(s.text).trim()).length;
    this.setData({
      stats: {
        sentences: n,
        chars,
        avg: n ? Math.round(chars / n) : 0,
      },
    });
  },

  showModeInfo() {
    const isMock = this.data.isMock;
    wx.showModal({
      title: isMock ? "演示数据模式" : "真实识别模式",
      content: isMock
        ? "当前未检测到可用的 OCR 服务，页面用示例课文走通流程。在小程序后台开通「腾讯云文字识别」服务市场，或部署 cloudfunctions/ocr 云函数后，即自动切换为真实识别。"
        : "已通过真实 OCR 通道识别图片文字，可在下方逐句校对后开始朗读。",
      showCancel: false,
      confirmText: "明白了",
      confirmColor: "#0ea5e9",
    });
  },

  /* ---------------- 校对 ---------------- */
  editSentence(e) {
    this.setData({ editingIndex: e.currentTarget.dataset.index });
  },

  onEditInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ ["sentences[" + index + "].text"]: e.detail.value });
  },

  onEditBlur(e) {
    const index = e.currentTarget.dataset.index;
    const text = String(e.detail.value || "").trim();
    const list = this.data.sentences.slice();
    if (list[index]) {
      list[index].text = text;
      list[index].chars = textUtil.countChars(text);
    }
    this.setData({ sentences: list, editingIndex: -1 });
    this.refreshStats(list);
  },

  removeSentence(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.sentences.slice();
    list.splice(index, 1);
    this.setData({ sentences: list, editingIndex: -1 });
    this.refreshStats(list);
  },

  addSentence() {
    const list = this.data.sentences.concat([{ id: "s" + this._seq++, text: "", chars: 0 }]);
    this.setData({ sentences: list, editingIndex: list.length - 1 });
  },

  backToPick() {
    this.setData({ step: "pick" });
  },

  /* ---------------- 开始听读 ---------------- */
  startReading() {
    const list = this.data.sentences.filter((s) => String(s.text).trim());
    if (!list.length) {
      wx.showToast({ title: "还没有可朗读的句子", icon: "none" });
      return;
    }
    const guessed = textUtil.guessTitle(this._rawText) || "拍照朗读";
    const d = new Date();
    const dateText = `${d.getMonth() + 1}月${d.getDate()}日`;
    const group = store.createGroup({
      title: guessed,
      lessonTitle: `拍照识别 · ${dateText} · ${list.length} 句`,
      sentences: list,
      images: this.data.images.map((i) => i.path),
      ocrMode: this._mode || "mock",
      source: "camera",
    });
    // 先带孩子听一遍，听熟了再由他决定什么时候自己读
    wx.redirectTo({ url: "/pages/listen/listen?groupId=" + group.id });
  },

});
