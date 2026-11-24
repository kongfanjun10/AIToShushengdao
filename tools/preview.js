/**
 * 小程序页面预览渲染器：把 WXML/WXSS 转成 HTML 用于浏览器截图核对。
 * 用法：node tools/preview.js
 * 输出：design/preview/*.html
 *
 * 可选环境变量：
 *   LISTEN_SHEET=1        听读页展开音色面板
 *   ARCHIVE_SHEET=skill|badge|more   成长档案展开对应弹层
 *   HOME_SUBJECT=chinese|math|english  首页按指定学科渲染
 *   WRITE_DONE=1          文字描写页预置若干已写的字
 *   PARENT_PASS=1         家长中心跳过门禁
 *   PROFILE_DONE=1        预置自定义昵称与头像（核对头像显示）
 *   NICK_SHEET=1          家长中心展开「改昵称」半屏
 *   VOCAB_SCAN=1          生词本展开「拍照收词」结果弹层
 *   LANDSCAPE=1           按横屏（812×375）渲染，用于核对横屏布局
 *   WRITE_CHAR=请         文字描写页指定要写的字
 *   MATH_STATE=idle|listening|right|wrong|retry|manual|settings   数字测试页状态
 *   CALC_STATE=idle|right|wrong|timed|over   口算闯关页状态
 *   COL_STATE=idle|right|wrong|carry|sub      竖式计算页状态
 *   WORDS_STATE=idle|recording|done|slow      单词跟读页状态
 *   LINK_STATE=idle|done                      连线页状态
 *   MIND_GAME=maze|blocks|mazewin             思维游戏页状态
 *   FEEDBACK_ADMIN=1                          留言板管理员模式（含回复/删除按钮）
 *   FEEDBACK_EMPTY=1                          留言板空状态（不注入模拟留言）
 *   ADMIN_STATE=claim|denied                  数据后台首次认领 / 无权限态（默认数据看板态）
 */
const fs = require("fs");
const path = require("path");

const ROOT = (() => {
  const candidates = [
    path.join(__dirname, "..", "shushengdao"),
    path.join(__dirname, "..", "wenjuanbandu"),
    path.join(__dirname, "..", "miniprogram"),
  ];
  const hit = candidates.find((p) => fs.existsSync(path.join(p, "app.json")));
  if (!hit) {
    console.error("找不到小程序工程（未找到 app.json）");
    process.exit(1);
  }
  return hit;
})();
const OUT = path.join(__dirname, "..", "design", "preview");

const SUB = new Set(["pinyin", "phonetics"]); // 已迁入 pkgLearn 分包的页面
const mazeDraw = require(path.join(ROOT, "utils", "mazeDraw.js"));

const PAGES = [
  { key: "home", title: "首页" },
  { key: "capture", title: "拍照与识别" },
  { key: "listen", title: "听读·磨耳朵" },
  { key: "write", title: "文字描写" },
  { key: "pinyin", title: "汉语拼音" },
  { key: "phonetics", title: "英语音标" },
  { key: "math", title: "数字测试" },
  { key: "calc", title: "口算闯关" },
  { key: "column", title: "竖式计算" },
  { key: "words", title: "单词与跟读" },
  { key: "link", title: "图案与数字连线" },
  { key: "mind", title: "思维游戏" },
  { key: "reader", title: "逐句朗读器" },
  { key: "reward", title: "完成激励" },
  { key: "vocab", title: "生词本" },
  { key: "archive", title: "成长档案与勋章" },
  { key: "parent", title: "家长中心" },
  { key: "feedback", title: "欢迎留言" },
  { key: "admin", title: "数据后台" },
];

/* 数据后台模拟总览（预览渲染是同步的，异步云函数回调进不了截图，onLoad 后直接注入） */
function sampleOverview() {
  const now = Date.now();
  const days = [];
  const counts = [14, 21, 9, 28, 17, 32, 23];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400e3);
    days.push({ day: "", label: d.getMonth() + 1 + "." + d.getDate(), count: counts[6 - i] });
  }
  return {
    ok: true,
    generatedAt: now,
    totalLaunches: 1286,
    todayLaunches: 23,
    yesterdayLaunches: 32,
    totalUsers: 12,
    todayUsers: 3,
    todayNewUsers: 1,
    days: days,
    users: [
      { nickname: "孔老师", ageMode: "primary", phone: "138****8000", phoneBound: true, phoneSource: "wechat", launches: 214, lastAt: now - 10 * 60e3, firstDay: "2026-10-01", todayActive: true },
      { nickname: "朵朵", ageMode: "primary", phone: "139****2331", phoneBound: true, phoneSource: "manual", launches: 168, lastAt: now - 3600e3, firstDay: "2026-10-03", todayActive: true },
      { nickname: "果果", ageMode: "kid", phone: "", phoneBound: false, phoneSource: "", launches: 97, lastAt: now - 86400e3, firstDay: "2026-10-12", todayActive: false },
      { nickname: "妞妞", ageMode: "primary", phone: "", phoneBound: false, phoneSource: "", launches: 45, lastAt: now - 3 * 86400e3, firstDay: "2026-10-20", todayActive: false },
    ],
  };
}

const TAG_MAP = { view: "div", text: "span", image: "img", "scroll-view": "div", canvas: "div", block: null };

/* 留言板模拟留言（预览渲染是同步的，云函数异步回调进不了截图，故 onLoad 后直接注入） */
function sampleFeedback() {
  const now = Date.now();
  return [
    {
      id: "f1",
      category: "feature",
      content: "希望数学页卡能加一个两位数乘法练习，孩子马上要学到了，期待！",
      contact: "微信 mm_2026",
      createdAt: now - 3600e3,
      reply: "好主意！已排进下个版本，更新后会在留言板告诉大家～",
      repliedAt: now - 1800e3,
      mine: false,
    },
    {
      id: "f2",
      category: "bug",
      content: "音标页的口型图在手机上偶尔不显示，退出去重进就好了。",
      contact: "",
      createdAt: now - 86400e3,
      reply: "",
      repliedAt: 0,
      mine: true,
    },
    {
      id: "f3",
      category: "improve",
      content: "跟读结束后如果能直接回听自己刚才的录音就更好了。",
      contact: "",
      createdAt: now - 2 * 86400e3,
      reply: "已记录，会评估加入回听功能，谢谢建议！",
      repliedAt: now - 2 * 86400e3 + 7200e3,
      mine: false,
    },
  ];
}

/* 预览用：模拟 iPhone 上微信原生胶囊按钮的位置（375 宽屏幕的典型值） */
const LANDSCAPE = process.env.LANDSCAPE === "1";
const WIN = LANDSCAPE ? { w: 812, h: 375 } : { w: 375, h: 812 };
const CAPSULE = LANDSCAPE
  ? { width: 87, height: 32, top: 6, right: WIN.w - 7, bottom: 38, left: WIN.w - 7 - 87 }
  : { width: 87, height: 32, top: 48, right: 368, bottom: 80, left: 281 };
const STATUS_BAR = LANDSCAPE ? 0 : 44;


/* ---------------- 数据 ---------------- */
function loadData(pageKey) {
  let captured = null;
  global.getApp = () => ({
    globalData: {
      statusBarHeight: STATUS_BAR,
      userInfo: { nickname: "孔老师", ageMode: "primary" },
      task: {
        groupTitle: "小学语文三年级上册",
        lessonTitle: "第3课《古诗三首》· 望天门山",
        readCount: 6,
        totalCount: 10,
        percent: 60,
        minutesAgo: 20,
      },
      badge: { name: "『坚持三日』勋章", desc: "连续打卡 3 天即可解锁此荣誉", rarity: "普通", current: 2, target: 3 },
    },
  });
  global.Page = (opt) => {
    captured = opt;
  };
  global.getCurrentPages = () => []; // 页签页在预览里视为栈底：不显示返回按钮
  const storage = {};
  global.wx = {
    getStorageSync: (k) => (k in storage ? storage[k] : ""),
    setStorageSync: (k, v) => {
      storage[k] = v;
    },
    removeStorageSync: (k) => {
      delete storage[k];
    },
    env: { USER_DATA_PATH: "wxfile://usr" },
    getFileSystemManager: () => ({
      readFile: () => {},
      writeFile: () => {},
      accessSync: () => {},
      unlink: (o) => o && o.success && o.success({}),
      copyFile: (o) => o && o.success && o.success({}),
    }),
    // 预览里选图直接给一张卡通头像，截图能看到「已上传」的样子
    chooseMedia: (o) => o && o.success && o.success({ tempFiles: [{ tempFilePath: "avatar.svg" }] }),
    chooseImage: (o) => o && o.success && o.success({ tempFilePaths: ["avatar.svg"] }),
    showActionSheet: (o) => o && o.success && o.success({ tapIndex: 1 }),
    getWindowInfo: () => ({ statusBarHeight: STATUS_BAR, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
    getSystemInfoSync: () => ({ statusBarHeight: STATUS_BAR, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
    getMenuButtonBoundingClientRect: () => Object.assign({}, CAPSULE),
    nextTick: (cb) => setTimeout(cb, 0),
    showToast() {},
    navigateTo() {},
    navigateBack() {},
    redirectTo() {},
    reLaunch() {},

    showModal() {},
    showLoading() {},
    hideLoading() {},
    pageScrollTo() {},
    vibrateShort() {},
    setClipboardData() {},
    createSelectorQuery: () => {
      const q = {
        in: () => q,
        select: () => q,
        selectAll: () => q,
        fields: () => q,
        boundingClientRect: () => q,
        exec: (cb) => cb && cb([]),
      };
      return q;
    },
    getRecorderManager: () => ({
      start() {},
      stop() {},
      onStop() {},
      onError() {},
    }),
    openSetting() {},
    createInnerAudioContext: () => ({
      play() {},
      stop() {},
      destroy() {},
      onEnded() {},
      onError() {},
      set src(v) {},
      set playbackRate(v) {},
    }),
    cloud: {
      init() {},
      callFunction: (opt) => {
        // 留言板：注入一份模拟留言，便于截图核对列表 / 回复气泡 / 待回复角标
        const data = (opt && opt.data) || {};
        if (pageKey === "feedback" && data.action === "list" && process.env.FEEDBACK_EMPTY !== "1") {
          const now = Date.now();
          return (
            opt.success &&
            opt.success({
              result: {
                ok: true,
                pending: 2,
                list: [
                  {
                    id: "f1",
                    category: "feature",
                    content: "希望数学页卡能加一个两位数乘法练习，孩子马上要学到了，期待！",
                    contact: "微信 mm_2026",
                    createdAt: now - 3600e3,
                    reply: "好主意！已排进下个版本，更新后会在留言板告诉大家～",
                    repliedAt: now - 1800e3,
                    mine: false,
                  },
                  {
                    id: "f2",
                    category: "bug",
                    content: "音标页的口型图在手机上偶尔不显示，退出去重进就好了。",
                    contact: "",
                    createdAt: now - 86400e3,
                    reply: "",
                    repliedAt: 0,
                    mine: true,
                  },
                  {
                    id: "f3",
                    category: "improve",
                    content: "跟读结束后如果能直接回听自己刚才的录音就更好了。",
                    contact: "",
                    createdAt: now - 2 * 86400e3,
                    reply: "已记录，会评估加入回听功能，谢谢建议！",
                    repliedAt: now - 2 * 86400e3 + 7200e3,
                    mine: false,
                  },
                ],
              },
            })
          );
        }
        if (opt && opt.success) opt.success({ result: { ok: false } });
      },
    },
  };
  // 预览环境模拟同声传译插件可用，避免误显示「语音未开启」
  global.requirePlugin = () => ({
    textToSpeech: (opt) => {
      if (opt && opt.success) opt.success({ filename: "preview-mock.mp3" });
    },
    getRecordRecognitionManager: () => ({
      onStart() {},
      onRecognize() {},
      onStop() {},
      onError() {},
      start() {},
      stop() {},
    }),
  });

  // 预置状态：首页指定学科、文字描写预置已写的字
  if (pageKey === "feedback" && process.env.FEEDBACK_ADMIN === "1") {
    // 预置管理口令，截图能看到「回复 / 删除」按钮
    wx.setStorageSync("wb_feedback_admin_key", "preview");
  }
  if (pageKey === "home" && process.env.HOME_SUBJECT) {
    const store = require(path.join(ROOT, "utils", "store.js"));
    store.setUser({ subject: process.env.HOME_SUBJECT });
  }
  if (pageKey === "write" && process.env.WRITE_DONE === "1") {
    const store = require(path.join(ROOT, "utils", "store.js"));
    const charLib = require(path.join(ROOT, "utils", "chars.js"));
    const lv = charLib.getLevel("g1b");
    store.setUser({ writeLevel: "g1b" });
    lv.chars.slice(0, 5).forEach((c) => {
      store.markWritten(c.c);
      // 造一份「上次描过」的笔迹，用于核对回看态
      store.saveTrace(c.c, {
        w: 300,
        h: 300,
        paths: [
          { w: 26, pts: [{ x: 78, y: 96 }, { x: 150, y: 92 }, { x: 222, y: 100 }] },
          { w: 26, pts: [{ x: 150, y: 88 }, { x: 148, y: 214 }] },
        ],
      });
    });
  }

  // pinyin / phonetics 已迁入 pkgLearn 分包
  const subRoot = pageKey === "pinyin" || pageKey === "phonetics" ? "pkgLearn" : "";
  const file = path.join(ROOT, subRoot, "pages", pageKey, pageKey + ".js");
  delete require.cache[require.resolve(file)];
  require(file);

  const page = Object.assign({}, captured);
  page.data = Object.assign({}, captured.data);
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      // 支持 a.b / a[0] 简化写法
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        page.data[k] = obj[k];
      }
    });
  };
  const pageOptions =
    pageKey === "parent" && process.env.PARENT_PASS === "1"
      ? { pass: "1" }
      : pageKey === "feedback" && process.env.FEEDBACK_ADMIN === "1"
      ? { admin: "1" }
      : pageKey === "write" && process.env.WRITE_CHAR
      ? { char: process.env.WRITE_CHAR }
      : {};
  // 英语音标：预置若干已学，便于核对打勾与进度
  // 孩子资料：预置一张卡通头像 + 自定义昵称，核对「已上传头像」的显示
  if (process.env.PROFILE_DONE === "1") {
    const store = require(path.join(ROOT, "utils", "store.js"));
    store.setUser({ nickname: "朵朵", avatar: "avatar.svg" });
  }
  if (pageKey === "phonetics" && process.env.PHONICS_DONE === "1") {
    const store = require(path.join(ROOT, "utils", "store.js"));
    const ph = require(path.join(ROOT, "utils", "phonetics.js"));
    ph.all()
      .slice(0, 6)
      .forEach((p) => store.markPhoneme(p.id));
  }
  if (pageKey === "pinyin" && process.env.PINYIN_DONE === "1") {
    const store = require(path.join(ROOT, "utils", "store.js"));
    const py = require(path.join(ROOT, "utils", "pinyinLib.js"));
    py.all()
      .slice(0, 8)
      .forEach((p) => store.markPinyin(p.id));
  }
  if (typeof page.onLoad === "function") page.onLoad.call(page, pageOptions);
  if (typeof page.onShow === "function") page.onShow.call(page);
  // 拼音/音标：「全部」纯展示总览（PY_ALL=1 / IPA_ALL=1）
  if (pageKey === "pinyin" && process.env.PY_ALL === "1" && typeof page.pickGroup === "function") {
    page.pickGroup({ currentTarget: { dataset: { key: "all" } } });
  }
  if (pageKey === "phonetics" && process.env.IPA_ALL === "1" && typeof page.pickGroup === "function") {
    page.pickGroup({ currentTarget: { dataset: { key: "all" } } });
  }
  // 儿歌：摆出「正唱到第 N 句」的样子，核对高亮与波形（不真放音）
  if ((pageKey === "pinyin" || pageKey === "phonetics") && process.env.SONG_LINE) {
    const li = Number(process.env.SONG_LINE);
    const song = page.data.song;
    const start = song && song.lines[li] ? song.lines[li].start : 0;
    page.setData({
      songLine: li,
      songPlaying: true,
      songSyl: process.env.SONG_SYL ? Number(process.env.SONG_SYL) : start,
      songMode: process.env.SONG_MODE === "read" ? "read" : "sing",
    });
  }
  // 文字描写：预览环境没有真实 canvas，直接摆出「回看上次笔迹」状态便于核对样式
  if (pageKey === "write" && process.env.WRITE_DONE === "1") page.setData({ reviewing: true });
  // 朗读页：摆到「最后一句」或「整篇读完」，核对右下按钮变「完成朗读」
  if (pageKey === "reader" && typeof page.goTo === "function") {
    const total = page.data.sentenceTotal || 0;
    if (process.env.READER_DONE === "1") {
      const store = require(path.join(ROOT, "utils", "store.js"));
      for (let i = 0; i < total; i++) store.markRead(page.data.groupId, i, 3);
      page.goTo(0);
    } else if (process.env.READER_LAST === "1" && total > 1) {
      page.goTo(total - 1);
    }
    if (process.env.READER_TRACK === "1") page.setData({ trackBig: true });
  }
  // 家长中心：展开「改昵称」半屏
  if (pageKey === "parent" && process.env.NICK_SHEET === "1" && typeof page.openNick === "function") {
    page.openNick();
  }
  // 家长中心：安全重置半屏（CLEAR_STATE=step1 选程度 / step2 清单确认）
  if (pageKey === "parent" && process.env.CLEAR_STATE === "step1" && typeof page.openClear === "function") {
    page.openClear();
  }
  if (pageKey === "parent" && process.env.CLEAR_STATE === "step2" && typeof page.openClear === "function") {
    page.openClear();
    page.setData({ clearMode: "learn" });
    page.goClearStep2();
    page.setData({ holdPct: 42, holdText: "2" }); // 摆出长按进行中的样子
  }
  // 家长中心：书单详情半屏（GROUP_SHEET=1，取书单第一本摆出「读到一半」的样子）
  if (pageKey === "parent" && process.env.GROUP_SHEET === "1" && typeof page.openGroup === "function") {
    const gid = (page.data.groups && page.data.groups[0] && page.data.groups[0].id) || "";
    if (gid) {
      page.openGroup({ currentTarget: { dataset: { id: gid } } });
      const gs = page.data.gSheet;
      if (gs) {
        // mock 的 setData 是浅合并，路径 key 不生效 → 整体重建 rows
        const rows = gs.rows.map((r, i) => ({
          i: r.i,
          text: r.text,
          state: i < 3 ? "read" : i === 3 ? "heard" : "todo",
          current: i === 3,
        }));
        page.setData({
          gSheet: Object.assign({}, gs, { read: 3, total: rows.length, percent: Math.round((3 / rows.length) * 100), rows: rows }),
        });
      }
    }
  }
  // 首页消息中心：铺示例消息并展开弹层（NOTIF_STATE=open）
  if (pageKey === "home" && process.env.NOTIF_STATE === "open" && typeof page.openNotif === "function") {
    const notify = require(path.join(ROOT, "utils", "notify.js"));
    notify.push({ icon: "🏅", title: "解锁新勋章", text: "『坚持三日』已点亮！连续打卡 3 天", go: { url: "/pages/archive/archive", label: "看勋章墙" } });
    notify.push({ icon: "🔥", title: "连续打卡 3 天", text: "坚持了 3 天朗读，越来越棒啦，继续保持！", go: { url: "/pages/archive/archive", label: "看打卡记录" } });
    notify.push({ icon: "💬", title: "留言有回复啦", text: "岛主回复：好的，下个版本加上！…", go: { url: "/pages/feedback/feedback", label: "去查看" } });
    page.openNotif();
    page.setData({ notifList: page.decorateNotif().map((n, i) => Object.assign({}, n, { read: i > 1 })) });
  }
  // 横屏描写页：把笔顺演示停在中段，截图能同时看到「已写 / 正在写 / 未写」三种状态
  if (pageKey === "write" && LANDSCAPE) {
    const total = (page.data.tut && page.data.tut.total) || 0;
    page.setData({ "tut.index": Math.max(0, Math.floor(total * 0.5)), "tut.playing": false });
  }
  // 生词本：直接铺一份「拍照收词」结果，便于截图核对弹层
  if (pageKey === "vocab" && process.env.VOCAB_SCAN === "1") {
    page.setData({
      scanOpen: true,
      scanning: false,
      scanErr: "",
      scanLines: 3,
      scanModeLabel: "已识别",
      scanText: "秋天的雨，是一把钥匙。\n它带着清凉和温柔，轻轻地把秋天的大门打开了。\n你看，它把黄色给了银杏树。",
      scanWords: [
        { word: "秋天", sentence: "秋天的雨，是一把钥匙", count: 3, on: true },
        { word: "钥匙", sentence: "秋天的雨，是一把钥匙", count: 1, on: true },
        { word: "清凉", sentence: "它带着清凉和温柔", count: 1, on: true },
        { word: "温柔", sentence: "它带着清凉和温柔", count: 1, on: true },
        { word: "银杏", sentence: "它把黄色给了银杏树", count: 1, on: false },
        { word: "大门", sentence: "把秋天的大门打开了", count: 1, on: false },
        { word: "黄色", sentence: "它把黄色给了银杏树", count: 1, on: false },
      ],
      scanPicked: 4,
      scanAllOn: false,
    });
  }
  // 留言板：直接铺一份模拟留言（预览渲染是同步的，云函数异步回调进不了截图）
  if (pageKey === "feedback" && process.env.FEEDBACK_EMPTY !== "1" && typeof page.decorate === "function") {
    const list = page.decorate(sampleFeedback());
    page.setData({ loading: false, cloudOk: true, loadErr: "", pending: 2, total: list.length, list });
  }
  // 数据后台：默认摆成数据看板态；ADMIN_STATE=claim/denied 时摆对应门禁态
  if (pageKey === "admin" && typeof page.applyOverview === "function") {
    const st = process.env.ADMIN_STATE;
    if (st === "claim" || st === "denied") {
      page.setData({
        phase: st,
        deniedText: st === "denied" ? "管理员已设置，仅管理员本人的微信可以查看这份数据。" : "",
      });
    } else {
      page.setData({ phase: "in", keyDraft: "", keyError: "" });
      page.applyOverview(sampleOverview());
    }
  }
  // 数字测试页：按 MATH_STATE 摆出各状态，截图核对
  if (pageKey === "math" && process.env.MATH_STATE) {
    const st = process.env.MATH_STATE;
    const base = { current: 23, numSize: 160, hintText: "二十三", numAnim: true };
    if (st === "settings" && typeof page.openSettings === "function") {
      page.setData(base);
      page.openSettings();
    } else if (st === "listening") {
      page.setData(
        Object.assign({}, base, {
          phase: "listening",
          phaseTip: "我在听，读完点一下",
          micLabel: "正在听…",
          seconds: 3,
          partial: "二十三",
        })
      );
    } else if (st === "right") {
      page.setData(
        Object.assign({}, base, {
          phase: "right",
          phaseTip: "读对啦，真棒",
          micLabel: "点一下，读下一个",
          heard: "二十三",
          hasFile: true,
          history: [{ key: 1, ok: true }, { key: 2, ok: true }, { key: 3, ok: false }, { key: 4, ok: true }],
          stats: { todayRight: 12, todayWrong: 3, todayTotal: 15, percent: 80, streak: 4, best: 6, wrongCount: 3 },
        })
      );
    } else if (st === "wrong") {
      page.setData(
        Object.assign({}, base, {
          phase: "wrong",
          phaseTip: "再看看这个数字，读一次试试",
          micLabel: "点一下，再读",
          heard: "三十二",
          hasFile: true,
          history: [{ key: 1, ok: true }, { key: 2, ok: false }],
          stats: { todayRight: 9, todayWrong: 4, todayTotal: 13, percent: 69, streak: 0, best: 6, wrongCount: 4 },
        })
      );
    } else if (st === "retry") {
      page.setData(
        Object.assign({}, base, {
          phase: "retry",
          phaseTip: "再读一次吧",
          micLabel: "点一下，再读",
          stats: { todayRight: 5, todayWrong: 1, todayTotal: 6, percent: 83, streak: 2, best: 4, wrongCount: 1 },
        })
      );
    } else if (st === "manual") {
      page.setData(
        Object.assign({}, base, {
          asrOk: false,
          phase: "manual",
          phaseTip: "请家长听一下，读对了吗",
          micLabel: "再读一次",
          hasFile: true,
          stats: { todayRight: 3, todayWrong: 1, todayTotal: 4, percent: 75, streak: 1, best: 3, wrongCount: 1 },
        })
      );
    } else {
      page.setData(
        Object.assign({}, base, {
          stats: { todayRight: 6, todayWrong: 2, todayTotal: 8, percent: 75, streak: 3, best: 5, wrongCount: 2 },
          history: [{ key: 1, ok: true }, { key: 2, ok: false }],
        })
      );
    }
  }

  // 听读页按「播放中」状态渲染，便于核对波形动画
  // 口算闯关：按状态摆好，方便截图核对
  if (pageKey === "calc" && process.env.CALC_STATE) {
    const st = process.env.CALC_STATE;
    page.setData({
      q: { a: 36, b: 28, op: "+", answer: 64, expr: "36+28", speak: "36 加 28 等于几", level: "add10" },
      stats: { todayRight: 12, todayWrong: 3, percent: 80, streak: 4, best: 6, wrongCount: 2 },
      history: [{ key: 1, ok: true }, { key: 2, ok: true }, { key: 3, ok: false }, { key: 4, ok: true }],
    });
    if (st === "right") {
      page.setData({ input: "64", phase: "right", tip: "你真棒哟" });
    } else if (st === "wrong") {
      page.setData({ input: "54", phase: "wrong", tip: "答错咯，要加油哟" });
    } else if (st === "timed") {
      page.setData({ timed: true, left: 37, input: "6" });
    } else if (st === "over") {
      page.setData({ timed: true, over: true, left: 0, overRight: 11, overWrong: 3, bestStreak: 6 });
    } else {
      page.setData({ input: "6" });
    }
  }

  // 竖式计算
  if (pageKey === "column" && process.env.COL_STATE) {
    const st = process.env.COL_STATE;
    const colLib = require(path.join(ROOT, "utils", "column.js"));
    const a = st === "sub" ? 52 : 36;
    const b = st === "sub" ? 27 : 28;
    const op = st === "sub" ? "-" : "+";
    const answer = op === "+" ? a + b : a - b;
    const cols = 2;
    page.setData({
      q: {
        a, b, op, answer, cols,
        expr: a + op + b,
        steps: colLib.steps(a, b, op, cols),
        answerDigits: colLib.digits(answer, cols),
      },
      active: 1,
      phase: "idle",
      stats: { todayRight: 8, todayWrong: 2, percent: 80, streak: 3, best: 5, wrongCount: 1 },
    });
    page._cells = st === "wrong" ? ["5", "4"] : st === "idle" ? ["", ""] : [answer % 10 + "", Math.floor(answer / 10) + ""];
    if (st === "wrong") page._bad = { 0: 1 };
    page.setData({ active: 1 });
    if (st === "right") page.setData({ phase: "right", tip: "你真棒哟" });
    if (st === "wrong") page.setData({ phase: "wrong", tip: "答错咯，要加油哟" });
    page.renderCells();
  }

  // 单词跟读
  if (pageKey === "words" && process.env.WORDS_STATE) {
    const st = process.env.WORDS_STATE;
    const wl = require(path.join(ROOT, "utils", "words.js"));
    if (st === "food") page.loadTheme("food", "");
    if (st === "recording") {
      page.setData({ phase: "recording", seconds: 2, followTip: "我在听，读完点一下" });
    } else if (st === "done") {
      page.setData({ phase: "done", hasFile: true, followTip: "听听看，像不像？" });
    } else if (st === "slow") {
      page.setData({ slow: true });
    }
  }

  function p_sizeOf(pg) {
    return pg.data.maze ? pg.data.maze.length : 7;
  }

  // 连线页：摆出「连对一个 + 正在拖线 / 选中」状态便于截图核对
  if (pageKey === "link" && process.env.LINK_STATE) {
    if (process.env.LINK_STATE === "drag") {
      page.setData({
        actSide: "L",
        actIdx: 0,
        // 拖拽线从左卡右边缘出发（160 = 卡右边缘相对棋盘）
        drag: { x: 160, y: 60, len: 118, ang: 10 },
      });
    } else if (process.env.LINK_STATE === "done") {
      page.setData({
        matchedL: { 0: true },
        matchedR: { 1: true },
        matchedCount: 1,
        // 已连线：两端落在卡片边缘（左卡右边缘 → 右卡左边缘）
        lines: [{ key: "ln0-1", x: 160, y: 60, len: 70, ang: 0 }],
        actSide: "L",
        actIdx: 1,
      });
    } else {
      page.setData({ actSide: "L", actIdx: 0 });
    }
  }

  // 思维游戏页
  if (pageKey === "mind" && process.env.MIND_GAME) {
    const st = process.env.MIND_GAME;
    if (st === "blocks" || st === "blocksdrag") {
      const tiles = [4, 1, 3, 2, 6, 5, 8, 0, 7];
      page.setData({
        game: "blocks",
        tiles: tiles,
        bview: page.buildView(tiles),
        moves: 12,
        bestMoves: 34,
        drag: st === "blocksdrag" ? { n: 8, style: "transform:translate3d(93px,0px,0) scale(1.06);" } : null,
      });
    } else if (st === "mazewin") {
      const size = p_sizeOf(page);
      page.setData({
        player: { r: size - 2, c: size - 2 },
        mazeDone: true,
        steps: 18,
      });
      page.renderMazeCanvas();
    } else if (st === "odd" || st === "oddwin") {
      page.setData({
        game: "odd",
        oddOpts: [
          { e: "🍎", odd: false },
          { e: "🍌", odd: false },
          { e: "🐶", odd: true },
          { e: "🍇", odd: false },
        ],
        oddCat: "水果",
        oddDone: st === "oddwin",
        oddPick: st === "oddwin" ? 2 : -1,
        oddTip: st === "oddwin" ? "答对啦！其他三个都是水果，🐶 不是" : "找出和其他三个不同类的",
      });
    }
  }

  // 迷宫练习册风格 canvas：预览没有 canvas，把绘制指令存进 data 供 renderElement 转 SVG
  if (pageKey === "mind" && typeof page.renderMazeCanvas === "function") {
    page.renderMazeCanvas();
    page.data.__mazeOps = page._mazeOps || [];
  }

  if (pageKey === "listen" && typeof page.togglePlay === "function") page.togglePlay.call(page);
  // LISTEN_SHEET=1 时展开音色选择半屏面板（云通道在预览环境不可用，强制按可用渲染）
  if (pageKey === "listen" && process.env.LISTEN_SHEET === "1" && typeof page.loadVoice === "function") {
    page.loadVoice.call(page);
    page.setData({ voiceSheet: true, voiceOk: true });
  }
  // ARCHIVE_SHEET=skill|badge|more 时展开成长档案对应弹层，便于截图核对
  if (pageKey === "archive" && process.env.ARCHIVE_SHEET) {
    const which = process.env.ARCHIVE_SHEET;
    if (which === "skill" && typeof page.openSkillSheet === "function") page.openSkillSheet.call(page);
    if (which === "badge" && typeof page.openBadgeSheet === "function") page.openBadgeSheet.call(page);
    if (which === "more" && typeof page.toggleMore === "function") page.toggleMore.call(page);
  }
  return page.data;
}

/* ---------------- 模板引擎 ---------------- */
function evalExpr(expr, ctx) {
  try {
    const fn = new Function("$d", "with($d){return (" + expr + ");}");
    return fn(ctx);
  } catch (e) {
    return "";
  }
}

function interpolate(str, ctx) {
  return String(str).replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => {
    const v = evalExpr(expr.trim(), ctx);
    return v === undefined || v === null || v === false ? "" : String(v);
  });
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2] === undefined ? "" : m[2];
  return attrs;
}

function tokenize(wxml) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z-]+)\s*>|<([a-zA-Z-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(wxml))) {
    if (m.index > last) {
      const text = wxml.slice(last, m.index);
      if (text.trim()) tokens.push({ type: "text", content: text });
    }
    last = re.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) tokens.push({ type: "close", name: m[1] });
    else tokens.push({ type: "open", name: m[2], attrs: parseAttrs(m[3] || ""), self: m[4] === "/" });
  }
  return tokens;
}

function buildTree(tokens) {
  const root = { children: [] };
  const stack = [root];
  tokens.forEach((t) => {
    const parent = stack[stack.length - 1];
    if (t.type === "text") parent.children.push({ type: "text", content: t.content });
    else if (t.type === "open") {
      const node = { type: "el", name: t.name, attrs: t.attrs, children: [] };
      parent.children.push(node);
      if (!t.self) stack.push(node);
    } else if (t.type === "close") {
      if (stack.length > 1) stack.pop();
    }
  });
  return root.children;
}

/* WXML <template> 支持：收集定义，is= 引用处展开渲染 */
let TEMPLATES = {};
function collectTemplates(nodes) {
  nodes.forEach((n) => {
    if (n.type !== "el") return;
    if (n.name === "template" && n.attrs.name) TEMPLATES[n.attrs.name] = n;
    collectTemplates(n.children);
  });
}

/* WXML <import src>：把外部模板文件里的 <template> 一并收进来（微信同语义） */
function collectImportedTemplates(nodes, baseDir, depth) {
  const d = depth || 0;
  if (d > 3) return;
  nodes.forEach((n) => {
    if (n.type !== "el" || n.name !== "import" || !n.attrs.src) return;
    const file = path.resolve(baseDir, n.attrs.src);
    try {
      const sub = buildTree(tokenize(fs.readFileSync(file, "utf-8")));
      collectTemplates(sub);
      collectImportedTemplates(sub, path.dirname(file), d + 1);
    } catch (e) {
      console.warn("import missing:", n.attrs.src);
    }
  });
}

function renderNodes(nodes, ctx) {
  let html = "";
  let lastIfShown = null;
  nodes.forEach((node) => {
    if (node.type === "text") {
      html += interpolate(node.content, ctx);
      return;
    }
    const a = node.attrs;

    // wx:for
    if (a["wx:for"] !== undefined) {
      const list = evalExpr(a["wx:for"].replace(/^\{\{|\}\}$/g, ""), ctx) || [];
      const itemName = a["wx:for-item"] || "item";
      const idxName = a["wx:for-index"] || "index";
      const clone = Object.assign({}, node, { attrs: Object.assign({}, a) });
      delete clone.attrs["wx:for"];
      delete clone.attrs["wx:key"];
      delete clone.attrs["wx:for-item"];
      delete clone.attrs["wx:for-index"];
      clone.children = node.children;
      list.forEach((it, i) => {
        const sub = Object.create(ctx);
        sub[itemName] = it;
        sub[idxName] = i;
        html += renderNodes([clone], sub);
      });
      return;
    }

    // wx:if / elif / else
    if (a["wx:if"] !== undefined) {
      const ok = !!evalExpr(a["wx:if"].replace(/^\{\{|\}\}$/g, ""), ctx);
      lastIfShown = ok;
      if (!ok) return;
    } else if (a["wx:elif"] !== undefined) {
      if (lastIfShown) return;
      const ok = !!evalExpr(a["wx:elif"].replace(/^\{\{|\}\}$/g, ""), ctx);
      lastIfShown = ok;
      if (!ok) return;
    } else if (a["wx:else"] !== undefined) {
      if (lastIfShown) return;
    }

    html += renderElement(node, ctx);
  });
  return html;
}

/* ---------------- 笔顺 SVG（预览用：真实环境是 canvas 绘制） ---------------- */
function strokeSvg(ctx) {
  let strokeLib = null;
  try {
    strokeLib = require(path.join(ROOT, "utils", "strokeData.js"));
  } catch (e) {
    return "";
  }
  const ch = evalExpr("char.c", ctx);
  const list = strokeLib.getStrokes(ch) || [];
  const total = list.length;
  if (!total) return "";
  let idx = Number(evalExpr("tut.index", ctx));
  if (isNaN(idx) || idx < 0) idx = 0;
  if (idx > total - 1) idx = total - 1;

  const BW = 62; // 与 strokePlay 的 widthRatio 对齐（1000 * 0.062）
  const ptsOf = (flat) => {
    const s = [];
    for (let i = 0; i + 1 < flat.length; i += 2) s.push(flat[i] + "," + flat[i + 1]);
    return s.join(" ");
  };
  const prefixOf = (flat, t) => {
    const arr = [];
    for (let i = 0; i + 1 < flat.length; i += 2) arr.push([flat[i], flat[i + 1]]);
    if (arr.length < 2 || t >= 1) return arr.map((p) => p.join(",")).join(" ");
    let len = 0;
    for (let i = 1; i < arr.length; i++) len += Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1]);
    const need = len * t;
    const out = [arr[0]];
    let acc = 0;
    for (let i = 1; i < arr.length; i++) {
      const d = Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1]);
      if (acc + d >= need) {
        const k = d > 0 ? (need - acc) / d : 0;
        out.push([
          Math.round(arr[i - 1][0] + (arr[i][0] - arr[i - 1][0]) * k),
          Math.round(arr[i - 1][1] + (arr[i][1] - arr[i - 1][1]) * k),
        ]);
        break;
      }
      acc += d;
      out.push(arr[i]);
    }
    return out.map((p) => p.join(",")).join(" ");
  };

  let g = "";
  list.forEach((f, i) => {
    if (i > idx) {
      g += `<polyline points="${ptsOf(f)}" fill="none" stroke="rgba(99,14,212,0.14)" stroke-width="${(BW * 0.78).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  list.forEach((f, i) => {
    if (i < idx) {
      g += `<polyline points="${ptsOf(f)}" fill="none" stroke="#5b21b6" stroke-width="${BW}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  if (idx < total) {
    const f = list[idx];
    g += `<polyline points="${prefixOf(f, 0.62)}" fill="none" stroke="#630ed4" stroke-width="${(BW * 1.04).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<svg viewBox="0 0 1000 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${g}</svg>`;
}

/* ---------------- 口舌图 SVG（预览用：真实环境是 canvas 绘制） ---------------- */
function mouthSvg(ctx) {
  let mc = null;
  try {
    mc = require(path.join(ROOT, "utils", "mouthChart.js"));
  } catch (e) {
    return "";
  }
  // 拼音页用 item.mouth（整体认读复用声母/韵母的口型），音标页用 item.id
  const id = evalExpr("item.mouth", ctx) || evalExpr("item.id", ctx);
  if (!id) return "";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let g = "";
  mc.buildShapes(id).forEach((s) => {
    if (s.t === "p") {
      g +=
        `<path d="${esc(s.d)}" fill="${s.f && s.f !== "none" ? s.f : "none"}"` +
        (s.s
          ? ` stroke="${s.s}" stroke-width="${s.sw || 4}" stroke-linecap="round" stroke-linejoin="round"` +
            (s.dash ? ` stroke-dasharray="${s.dash}"` : "")
          : "") +
        "/>";
    } else if (s.t === "c") {
      g += `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.f || "none"}"${s.s ? ` stroke="${s.s}" stroke-width="${s.sw || 4}"` : ""}/>`;
    } else if (s.t === "e") {
      g += `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}" fill="${s.f || "none"}"${s.s ? ` stroke="${s.s}" stroke-width="${s.sw || 4}"` : ""}/>`;
    } else if (s.t === "t") {
      g += `<text x="${s.x}" y="${s.y}" font-size="${s.size || 28}" fill="${s.f || "#64748b"}" text-anchor="${s.anchor === "start" ? "start" : "middle"}" dominant-baseline="central" font-family="sans-serif">${esc(s.str)}</text>`;
    }
  });
  return `<svg viewBox="0 0 1000 800" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${g}</svg>`;
}

function renderElement(node, ctx) {
  const a = node.attrs;
  /* template：定义跳过，is= 引用展开 */
  if (node.name === "template") {
    if (!a.is) return "";
    const def = TEMPLATES[a.is];
    if (!def) return "";
    let extra = {};
    if (a.data) {
      const expr = String(a.data).replace(/^\{\{|\}\}$/g, "");
      try {
        extra = evalExpr("({" + expr + "})", ctx) || {};
      } catch (e) {
        extra = {};
      }
    }
    return renderNodes(def.children, Object.assign({}, ctx, extra));
  }
  const tag = Object.prototype.hasOwnProperty.call(TAG_MAP, node.name) ? TAG_MAP[node.name] : node.name;
  const inner = renderNodes(node.children, ctx);
  if (tag === null || tag === undefined) return inner;

  const parts = [];
  if (a.class) parts.push('class="' + interpolate(a.class, ctx).replace(/\s+/g, " ").trim() + '"');
  if (a.style) parts.push('style="' + rpx2px(interpolate(a.style, ctx)) + '"');
  if (node.name === "image") parts.push('src="' + interpolate(a.src || "", ctx) + '"');
  if (node.name === "canvas" && a.id === "tut") {
    return "<" + tag + (parts.length ? " " + parts.join(" ") : "") + ">" + strokeSvg(ctx) + "</" + tag + ">";
  }
  if (node.name === "canvas" && a.id === "mouth") {
    return "<" + tag + (parts.length ? " " + parts.join(" ") : "") + ">" + mouthSvg(ctx) + "</" + tag + ">";
  }
  // 迷宫（练习册风格）：真实环境 canvas 绘制，预览把绘制指令转成 SVG
  if (node.name === "canvas" && a.id === "mazeCanvas") {
    const svg = mazeDraw.opsToSvg(ctx.__mazeOps || []);
    return "<" + tag + (parts.length ? " " + parts.join(" ") : "") + ">" + svg + "</" + tag + ">";
  }
  if (node.name === "input") {
    if (a.placeholder) parts.push('placeholder="' + interpolate(a.placeholder, ctx) + '"');
    if (a.value) parts.push('value="' + interpolate(a.value, ctx) + '"');
    if (a.type) parts.push('type="' + a.type + '"');
    return "<input " + parts.join(" ") + " />";
  }
  return "<" + tag + (parts.length ? " " + parts.join(" ") : "") + ">" + inner + "</" + tag + ">";
}

/* ---------------- 样式 ---------------- */
function rpx2px(css) {
  return css.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, n) => (parseFloat(n) * 0.5).toFixed(2) + "px");
}

/* ---------------- 主题试色（仅预览用，不改项目文件） ----------------
 * THEME=skyA|skyB|skyC 时把紫色系整体替换为天蓝色系，出效果图供确认 */
const THEMES = {
  // A 晴空：鲜亮天蓝
  skyA: {
    dark: "#0369a1", darkRGB: "3,105,161",
    main: "#0ea5e9", mainRGB: "14,165,233",
    light: "#38bdf8", lightRGB: "56,189,248",
    end: "#22d3ee",
    pale: "#e0f2fe", pale2: "#f0f9ff",
    glow: "125,211,252",
  },
  // B 海盐：蓝→青，更清爽
  skyB: {
    dark: "#0e7490", darkRGB: "14,116,144",
    main: "#06b6d4", mainRGB: "6,182,212",
    light: "#22d3ee", lightRGB: "34,211,238",
    end: "#2dd4bf",
    pale: "#cffafe", pale2: "#ecfeff",
    glow: "165,243,252",
  },
  // C 雾蓝：低饱和淡雅
  skyC: {
    dark: "#0284c7", darkRGB: "2,132,199",
    main: "#38bdf8", mainRGB: "56,189,248",
    light: "#7dd3fc", lightRGB: "125,211,252",
    end: "#a5f3fc",
    pale: "#dbeafe", pale2: "#f0f9ff",
    glow: "224,242,254",
  },
};

function applyTheme(css) {
  const t = THEMES[process.env.THEME];
  if (!t) return css;
  const map = [
    [/rgba\(124,\s*58,\s*237/g, "rgba(" + t.mainRGB],
    [/rgba\(99,\s*14,\s*212/g, "rgba(" + t.darkRGB],
    [/rgba\(139,\s*92,\s*246/g, "rgba(" + t.lightRGB],
    [/rgba\(234,\s*221,\s*255/g, "rgba(" + t.glow],
    [/#630ed4/gi, t.dark],
    [/#7c3aed/gi, t.main],
    [/#8b5cf6/gi, t.light],
    [/#a78bfa/gi, t.light],
    [/#4cd7f6/gi, t.end],
    [/#ede9fe/gi, t.pale],
    [/#f6f0ff/gi, t.pale2],
  ];
  map.forEach(([re, to]) => (css = css.replace(re, to)));
  return css;
}

function loadCss(pageKey) {
  const icons = fs.readFileSync(path.join(ROOT, "styles", "icons.wxss"), "utf-8");
  let app = fs.readFileSync(path.join(ROOT, "app.wxss"), "utf-8");
  app = app.replace(/@import\s+"[^"]+";/, icons);
  let page = fs.readFileSync(path.join(ROOT, SUB.has(pageKey) ? "pkgLearn" : "", "pages", pageKey, pageKey + ".wxss"), "utf-8");
  // 页面 wxss 里的 @import（微信支持相对路径引入），逐层展开
  let guard = 0;
  while (/@import\s+"([^"]+)";/.test(page) && guard < 5) {
    guard++;
    page = page.replace(/@import\s+"([^"]+)";/, (m, rel) => {
      const f = path.join(ROOT, SUB.has(pageKey) ? "pkgLearn" : "", "pages", pageKey, rel);
      try {
        return fs.readFileSync(f, "utf-8");
      } catch (e) {
        return "/* import missing: " + rel + " */";
      }
    });
  }
  let css = rpx2px(app + "\n" + page);
  css = applyTheme(css);
  // 预览环境适配：page -> 手机框
  css = css.replace(/(^|\})\s*page\s*\{/g, "$1 .frame{");
  css = css.replace(/background-attachment:[^;]*;/g, "");
  css += `
.frame{position:relative;width:${WIN.w}px;min-height:${WIN.h}px;overflow:visible;padding-bottom:60px;}
.frame .hd,.frame .mask,.frame .lv-bar{position:absolute;}
.frame .toast{position:absolute;}
/* 微信原生胶囊按钮（预览用，检查右上角是否被压住） */
.capsule{position:absolute;top:${CAPSULE.top}px;right:${WIN.w - CAPSULE.right}px;width:${CAPSULE.width}px;height:${CAPSULE.height}px;border-radius:16px;background:rgba(15,23,42,.55);border:1px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:space-around;padding:0 10px;z-index:9999;box-shadow:0 2px 8px rgba(15,23,42,.18);}
/* 预览里 100vw 是浏览器窗口宽度，不一定是手机宽，横屏容器改成撑满手机框 */
.frame>.ls{width:100% !important;}
.capsule i{width:5px;height:5px;border-radius:50%;background:#fff;opacity:.92;}
.capsule b{width:1px;height:16px;background:rgba(255,255,255,.45);}
`;
  return css;
}

/* ---------------- 输出 ---------------- */
function main() {
  fs.mkdirSync(OUT, { recursive: true });
  PAGES.forEach((p) => {
    const data = loadData(p.key);
    const wxml = fs.readFileSync(path.join(ROOT, SUB.has(p.key) ? "pkgLearn" : "", "pages", p.key, p.key + ".wxml"), "utf-8");
    const tree = buildTree(tokenize(wxml));
    TEMPLATES = {};
    collectTemplates(tree);
    collectImportedTemplates(tree, path.join(ROOT, SUB.has(p.key) ? "pkgLearn" : "", "pages", p.key));
    const body = renderNodes(tree, data);
    const css = loadCss(p.key);
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${WIN.w},initial-scale=1"/>
<title>${p.title}</title>
<style>html,body{margin:0;padding:0;background:#eef1f6;font-family:"PingFang SC","Microsoft YaHei",sans-serif;}
*{box-sizing:border-box;}
${css}</style></head><body><div class="frame">${body}<div class="capsule"><i></i><i></i><i></i><b></b><i></i></div></div></body></html>`;
    fs.writeFileSync(path.join(OUT, p.key + ".html"), html, "utf-8");
    console.log("rendered", p.key, (html.length / 1024).toFixed(1) + "KB");
  });
}

main();
