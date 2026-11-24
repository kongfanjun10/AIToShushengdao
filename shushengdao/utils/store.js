/**
 * 本地数据层（v1：微信静默登录 + 本地存储，不做服务端同步）
 * 所有页面只通过本模块读写数据，后续接入云开发时只需替换这一层。
 */
const KEY = "wj_store_v1";
const DEMO_GROUP_ID = "demo-qiutian";
// 数字测试的取值范围（对齐 numberSpeech 的中文读法实现，最大 9999）
const MATH_MIN = 0;
const MATH_MAX = 9999;
const MATH_WRONG_MAX = 30;
const charLib = require("./chars");
const phoneticLib = require("./phonetics");
const pinyinLib = require("./pinyinLib");

const DEMO_SENTENCES = [
  "秋天的雨，是一把钥匙。",
  "它带着清凉和温柔，轻轻地，轻轻地，趁你没留意，把秋天的大门打开了。",
  "秋天的雨，有一盒五彩缤纷的颜料。",
  "你看，它把黄色给了银杏树，黄黄的叶子像一把把小扇子。",
  "它把红色给了枫树，红红的枫叶像一枚枚邮票。",
];

const DEMO_VOCAB = [
  { word: "钥匙", pinyin: "yào shi", sentence: "秋天的雨，是一把钥匙。", offset: 0 },
  { word: "清凉", pinyin: "qīng liáng", sentence: "它带着清凉和温柔，轻轻地，轻轻地。", offset: 1 },
  { word: "五彩缤纷", pinyin: "wǔ cǎi bīn fēn", sentence: "秋天的雨，有一盒五彩缤纷的颜料。", offset: 2 },
];

let cache = null;

function dateKey(d) {
  const t = d || new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const day = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${day}`;
}

function offsetDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function seedDaily() {
  const daily = {};
  const plan = [3, 5, 2, 4, 6, 3, 0];
  for (let i = 6; i >= 0; i--) {
    const k = dateKey(offsetDate(-i));
    const sentences = plan[6 - i];
    daily[k] = { sentences, seconds: sentences * 38, groups: sentences > 0 ? 1 : 0 };
  }
  return daily;
}

function seed() {
  const now = Date.now();
  return {
    version: 1,
    user: {
      nickname: "", // 新用户昵称为空：首次进家长中心时引导设置（显示处兜底「小朋友」）
      avatar: "", // 孩子头像（本地持久化路径，空 = 用默认图标）
      avatarAt: 0,
      ageMode: "primary", // primary | kid
      pinyinOn: true,
      speechRate: 1,
      phone: "",
      nightMode: false, // 夜览模式：主要页面盖暗色护眼遮罩
      dailyGoal: 1,
      dailyLimit: 20, // 分钟
      subject: "chinese", // chinese | math | english（首页学科分区）
      writeLevel: "kid", // 文字描写当前学段
      writeChar: "", // 上次描写的字
      pet: "chick", // 描写页学伴宠物：chick | fox | frog
      createdAt: now,
    },
    groups: [
      {
        id: DEMO_GROUP_ID,
        title: "小学语文三年级上册",
        lessonTitle: "第3课《古诗三首》· 望天门山",
        createdAt: now - 20 * 60000,
        updatedAt: now - 20 * 60000,
        images: [],
        ocrMode: "demo",
        sentences: DEMO_SENTENCES.map((text, i) => ({
          id: "demo_s" + i,
          text,
          heard: i < 4,
          heardAt: i < 4 ? now - (4 - i) * 60000 : 0,
          read: i < 3,
          readAt: i < 3 ? now - (3 - i) * 60000 : 0,
          seconds: i < 3 ? 32 : 0,
        })),
        cursor: 3,
        done: false,
        source: "demo",
      },
    ],
    vocab: DEMO_VOCAB.map((v, i) => ({
      id: "demo_w" + i,
      word: v.word,
      pinyin: v.pinyin,
      sentence: v.sentence,
      groupId: DEMO_GROUP_ID,
      createdAt: now - (i + 1) * 3600000,
      mastered: false,
      reviews: 0,
      lastReview: 0,
    })),
    stats: { daily: seedDaily() },
    // 文字描写记录：chars 按字记录次数，daily 记每天写了几个字，traces 存笔迹（回看用）
    writing: { chars: {}, daily: {}, traces: {} },
    // 英语音标：ids 按音标记录次数，daily 记每天学几个
    phonics: { ids: {}, daily: {} },
    // 数字测试：range 数字区间，daily 每天答对/答错，wrong 错题（最近 30 个）
    math: {
      range: { min: 1, max: 10 },
      daily: {},
      all: { right: 0, wrong: 0 },
      streak: { cur: 0, best: 0 },
      wrong: [],
    },
    // 口算闯关 / 竖式计算：与数字测试同构的答题看板
    calc: { level: "add10", daily: {}, all: { right: 0, wrong: 0 }, streak: { cur: 0, best: 0 }, wrong: [], best: {} },
    column: { level: "add2", daily: {}, all: { right: 0, wrong: 0 }, streak: { cur: 0, best: 0 }, wrong: [], best: {} },
    // 英语单词跟读：ids 每个词读过的次数，daily 每天读/跟读数量
    words: { ids: {}, daily: {}, all: { read: 0, follow: 0 }, streak: { cur: 0, best: 0 } },
    createdAt: now,
  };
}

/**
 * 真·出厂空状态：清理/恢复出厂后用这份。
 * 与 seed() 的区别：不带演示书单 / 演示生词 / 近 7 天演示统计——
 * 否则家长执行「彻底恢复出厂」后，近 7 天学习报告、每日完成情况、
 * 孩子的书单里又冒出演示数据，看起来像没清干净。
 * （演示数据只在首次安装时出现，见 read()）
 */
function blank() {
  const base = seed();
  base.groups = [];
  base.vocab = [];
  base.stats = { daily: {} };
  base.writing = { chars: {}, daily: {}, traces: {} };
  base.phonics = { ids: {}, daily: {} };
  base.math = {
    range: { min: 1, max: 10 },
    daily: {},
    all: { right: 0, wrong: 0 },
    streak: { cur: 0, best: 0 },
    wrong: [],
  };
  base.calc = { level: "add10", daily: {}, all: { right: 0, wrong: 0 }, streak: { cur: 0, best: 0 }, wrong: [], best: {} };
  base.column = { level: "add2", daily: {}, all: { right: 0, wrong: 0 }, streak: { cur: 0, best: 0 }, wrong: [], best: {} };
  base.words = { ids: {}, daily: {}, all: { read: 0, follow: 0 }, streak: { cur: 0, best: 0 } };
  return base;
}

function normalize(state) {
  const s = state || seed();
  s.user = Object.assign({}, seed().user, s.user || {});
  s.groups = Array.isArray(s.groups) ? s.groups : [];
  s.vocab = Array.isArray(s.vocab) ? s.vocab : [];
  s.stats = s.stats && s.stats.daily ? s.stats : { daily: {} };
  if (!s.writing || typeof s.writing !== "object") s.writing = { chars: {}, daily: {}, traces: {} };
  if (!s.writing.chars) s.writing.chars = {};
  if (!s.writing.daily) s.writing.daily = {};
  // traces：每个字最近一次的笔迹（用于「回看」），老数据没有这个字段
  if (!s.writing.traces) s.writing.traces = {};
  s.phonics = s.phonics && typeof s.phonics === "object" ? s.phonics : { ids: {}, daily: {} };
  if (!s.phonics.ids) s.phonics.ids = {};
  if (!s.phonics.daily) s.phonics.daily = {};
  // 数字测试：老数据没有 math 字段
  if (!s.math || typeof s.math !== "object") s.math = {};
  if (!s.math.daily) s.math.daily = {};
  if (!s.math.all) s.math.all = { right: 0, wrong: 0 };
  if (!s.math.streak) s.math.streak = { cur: 0, best: 0 };
  if (!Array.isArray(s.math.wrong)) s.math.wrong = [];
  if (!s.math.range || typeof s.math.range !== "object") s.math.range = { min: 1, max: 10 };
  const rg = s.math.range;
  if (!Number.isFinite(rg.min)) rg.min = 1;
  if (!Number.isFinite(rg.max)) rg.max = 10;
  if (rg.min < MATH_MIN) rg.min = MATH_MIN;
  if (rg.max > MATH_MAX) rg.max = MATH_MAX;
  if (rg.max <= rg.min) rg.max = Math.min(MATH_MAX, rg.min + 1);
  // 口算 / 竖式 / 单词跟读：老数据没有，补默认结构
  ["calc", "column"].forEach((k) => {
    if (!s[k] || typeof s[k] !== "object") s[k] = {};
    if (!s[k].daily) s[k].daily = {};
    if (!s[k].all) s[k].all = { right: 0, wrong: 0 };
    if (!s[k].streak) s[k].streak = { cur: 0, best: 0 };
    if (!Array.isArray(s[k].wrong)) s[k].wrong = [];
    if (!s[k].best || typeof s[k].best !== "object") s[k].best = {};
  });
  if (!s.words || typeof s.words !== "object") s.words = {};
  if (!s.words.ids) s.words.ids = {};
  if (!s.words.daily) s.words.daily = {};
  if (!s.words.all) s.words.all = { read: 0, follow: 0 };
  if (!s.words.streak) s.words.streak = { cur: 0, best: 0 };
  // 头像 / 昵称：老数据补类型默认值。⚠️ 昵称不再回填「孔老师」——
  // 曾导致新设备/体验用户一进来就顶着「孔老师」的名字；现在空昵称保持为空，由首次引导补上
  if (!s.user || typeof s.user !== "object") s.user = {};
  if (typeof s.user.avatar !== "string") s.user.avatar = "";
  if (typeof s.user.nickname !== "string") s.user.nickname = "";
  if (typeof s.user.avatarAt !== "number") s.user.avatarAt = 0;
  return s;
}

function read() {
  if (cache) return cache;
  let raw = null;
  try {
    raw = wx.getStorageSync(KEY);
  } catch (e) {
    raw = null;
  }
  if (raw && typeof raw === "object") {
    cache = normalize(raw);
  } else {
    cache = seed();
    write();
  }
  return cache;
}

function write() {
  try {
    wx.setStorageSync(KEY, cache);
  } catch (e) {
    // 存储超限时静默失败，保证页面可用
  }
  return cache;
}

function save() {
  return write();
}

/* ---------------- 用户与设置 ---------------- */
function getUser() {
  return read().user;
}

function setUser(patch) {
  const s = read();
  s.user = Object.assign({}, s.user, patch || {});
  write();
  // 广播给已打开的页面（成长档案/首页等即时同步昵称、头像）
  try {
    require("./bus").emit("user", s.user);
  } catch (e) {
    /* 总线异常不影响存储 */
  }
  return s.user;
}

/**
 * 小朗读者 ID：这台设备上孩子的唯一编号（6 位数字，首次访问时生成并永久保存）。
 * - 展示在成长档案用户卡，可用于老师/家长之间核对是同一个孩子
 * - 时间戳低位 + 随机数混合，6 位内几乎不会撞号；只生成一次，之后一直不变
 * - 「只清学习记录」保留 ID；「恢复出厂/清资料」视为新孩子，重新生成
 */
function readerId() {
  const s = read();
  if (s.user.readerId) return s.user.readerId;
  // 6 位数字（100000~999999）：时间戳与随机数混合，保证稳定唯一又看不出规律
  const n = 100000 + ((Date.now() + Math.floor(Math.random() * 810000)) % 900000);
  s.user.readerId = String(n);
  write();
  return s.user.readerId;
}

/* ---------------- 书组 / 句子 ---------------- */
function listGroups() {
  return read().groups.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

function getGroup(id) {
  return read().groups.filter((g) => g.id === id)[0] || null;
}

function activeGroup() {
  const list = listGroups().filter((g) => !g.done);
  return list[0] || null;
}

function createGroup(payload) {
  const s = read();
  const now = Date.now();
  const sentences = (payload.sentences || [])
    .map((item) => (typeof item === "string" ? item : item && item.text))
    .filter((t) => t && String(t).trim())
    .map((text, i) => ({
      id: uid("s") + i,
      text: String(text).trim(),
      heard: false,
      heardAt: 0,
      read: false,
      readAt: 0,
      seconds: 0,
    }));
  const group = {
    id: uid("g"),
    title: payload.title || "拍照朗读",
    lessonTitle: payload.lessonTitle || payload.title || "未命名课文",
    createdAt: now,
    updatedAt: now,
    images: payload.images || [],
    ocrMode: payload.ocrMode || "unknown",
    sentences,
    cursor: 0,
    done: false,
    source: payload.source || "camera",
  };
  s.groups.unshift(group);
  if (s.groups.length > 30) s.groups = s.groups.slice(0, 30);
  write();
  return group;
}

function updateGroup(id, patch) {
  const g = getGroup(id);
  if (!g) return null;
  Object.assign(g, patch || {});
  g.updatedAt = Date.now();
  write();
  return g;
}

function removeGroup(id) {
  const s = read();
  s.groups = s.groups.filter((g) => g.id !== id);
  write();
}

function setCursor(id, index) {
  const g = getGroup(id);
  if (!g) return;
  g.cursor = Math.max(0, Math.min(index, g.sentences.length - 1));
  g.updatedAt = Date.now();
  write();
}

/** 标记某句已读，同时累计当日统计 */
function markRead(id, index, seconds) {
  const g = getGroup(id);
  if (!g) return null;
  const item = g.sentences[index];
  if (!item) return null;
  const first = !item.read;
  item.read = true;
  item.readAt = Date.now();
  item.seconds = (item.seconds || 0) + (seconds || 0);
  g.cursor = Math.min(index + 1, g.sentences.length - 1);
  g.done = g.sentences.every((x) => x.read);
  g.updatedAt = Date.now();
  if (first) bumpDaily({ sentences: 1, seconds: seconds || 0 });
  write();
  return g;
}

/** 重置某句的朗读状态（重读本句用；不回收已计入的当日统计，避免数据回退） */
function resetRead(id, index) {
  const g = getGroup(id);
  if (!g) return null;
  const item = g.sentences[index];
  if (!item) return null;
  item.read = false;
  item.readAt = 0;
  item.seconds = 0;
  g.cursor = Math.max(0, Math.min(index, g.sentences.length - 1));
  g.done = false;
  g.updatedAt = Date.now();
  write();
  return g;
}

/** 标记某句已听（磨耳朵阶段，只记听读进度，不计入朗读统计） */
function markHeard(id, index) {
  const g = getGroup(id);
  if (!g) return null;
  const item = g.sentences[index];
  if (!item) return null;
  if (!item.heard) {
    item.heard = true;
    item.heardAt = Date.now();
    g.updatedAt = Date.now();
    write();
  }
  g.heardAt = g.sentences.every((x) => x.heard) ? g.heardAt || Date.now() : 0;
  return g;
}

function listenProgress(group) {
  if (!group || !group.sentences.length) return { heard: 0, total: 0, percent: 0, done: false };
  const heard = group.sentences.filter((s) => s.heard).length;
  const total = group.sentences.length;
  return { heard, total, percent: Math.round((heard / total) * 100), done: heard >= total };
}

function progressOf(group) {
  if (!group || !group.sentences.length) return { read: 0, total: 0, percent: 0 };
  const read = group.sentences.filter((s) => s.read).length;
  const total = group.sentences.length;
  return { read, total, percent: Math.round((read / total) * 100) };
}

/* ---------------- 文字描写 ---------------- */
/** 描完一个字：累计该字次数 + 当日写字数 */
function markWritten(ch) {
  const s = read();
  const key = String(ch || "").trim();
  if (!key) return null;
  const rec = s.writing.chars[key] || { times: 0, at: 0 };
  rec.times += 1;
  rec.at = Date.now();
  s.writing.chars[key] = rec;
  const k = dateKey();
  s.writing.daily[k] = (s.writing.daily[k] || 0) + 1;
  write();
  return rec;
}

/* ---- 笔迹回看：把笔画按比例存下来，换台设备 / 换个格子大小也能对上 ---- */
const TRACE_MAX = 100; // 最多保留 100 个字的笔迹，避免占用太多本地存储
const TRACE_SCALE = 1000; // 坐标量化到 0~1000，减小体积

/** 保存某个字的笔迹（覆盖上一次） */
function saveTrace(ch, trace) {
  const s = read();
  const key = String(ch || "").trim();
  if (!key || !trace || !Array.isArray(trace.paths) || !trace.paths.length) return null;
  const w = trace.w || 0;
  const h = trace.h || 0;
  if (w <= 0 || h <= 0) return null;
  if (!s.writing.traces) s.writing.traces = {};

  const paths = [];
  trace.paths.forEach((p) => {
    const pts = (p && p.pts) || [];
    const flat = [];
    for (let i = 0; i < pts.length; i++) {
      flat.push(Math.round((pts[i].x / w) * TRACE_SCALE), Math.round((pts[i].y / h) * TRACE_SCALE));
    }
    if (!flat.length) return;
    paths.push({ w: Math.round(((p.w || 24) / w) * TRACE_SCALE), p: flat });
  });
  if (!paths.length) return null;

  s.writing.traces[key] = {
    w: Math.round(w),
    h: Math.round(h),
    at: Date.now(),
    paths: paths,
  };

  // 超出上限时淘汰最旧的笔迹
  const keys = Object.keys(s.writing.traces);
  if (keys.length > TRACE_MAX) {
    keys
      .sort((a, b) => (s.writing.traces[a].at || 0) - (s.writing.traces[b].at || 0))
      .slice(0, keys.length - TRACE_MAX)
      .forEach((k) => {
        delete s.writing.traces[k];
      });
  }

  write();
  return s.writing.traces[key];
}

/** 取某个字的笔迹（没有则返回 null） */
function getTrace(ch) {
  const key = String(ch || "").trim();
  if (!key) return null;
  const traces = read().writing.traces || {};
  const t = traces[key];
  return t && t.paths && t.paths.length ? t : null;
}

/** 这个字有没有存过笔迹 */
function hasTrace(ch) {
  return !!getTrace(ch);
}

/** 清掉某个字的笔迹 */
function clearTrace(ch) {
  const key = String(ch || "").trim();
  const s = read();
  if (!key || !s.writing.traces || !s.writing.traces[key]) return false;
  delete s.writing.traces[key];
  write();
  return true;
}

/** 已描写过的字（用于字库打勾） */
function writtenMap() {
  return read().writing.chars || {};
}

function isWritten(ch) {
  return !!writtenMap()[ch];
}

function todayWritten() {
  return (read().writing.daily || {})[dateKey()] || 0;
}

/** 某学段的描写进度 */
function writingStats(levelKey) {
  const lv = charLib.getLevel(levelKey);
  const map = writtenMap();
  const done = lv.chars.filter((c) => map[c.c]).length;
  return {
    levelKey: lv.key,
    name: lv.name,
    done,
    total: lv.chars.length,
    percent: lv.chars.length ? Math.round((done / lv.chars.length) * 100) : 0,
  };
}

/** 全部学段合计进度 */
function writingOverview() {
  const map = writtenMap();
  const all = charLib.allChars();
  const done = all.filter((c) => map[c.c]).length;
  return { done, total: all.length, today: todayWritten(), percent: all.length ? Math.round((done / all.length) * 100) : 0 };
}

/* ---------------- 英语音标 ---------------- */
/** 点「我读会啦」：记录该音标练过几次 + 当日学会数 */
function markPhoneme(id) {
  const s = read();
  const key = String(id || "").trim();
  if (!key) return null;
  if (!s.phonics) s.phonics = { ids: {}, daily: {} };
  const rec = s.phonics.ids[key] || { times: 0, at: 0 };
  rec.times += 1;
  rec.at = Date.now();
  s.phonics.ids[key] = rec;
  const k = dateKey();
  s.phonics.daily[k] = (s.phonics.daily[k] || 0) + 1;
  write();
  return rec;
}

/** 已读过的音标（用于总览打勾） */
function phonemeMap() {
  const s = read();
  return (s.phonics && s.phonics.ids) || {};
}

function isPhonemeLearned(id) {
  return !!phonemeMap()[id];
}

function todayPhonemes() {
  const s = read();
  return ((s.phonics && s.phonics.daily) || {})[dateKey()] || 0;
}

/** 全部 48 个音标的掌握进度 */
function phonemeStats() {
  const map = phonemeMap();
  const all = phoneticLib.all();
  const done = all.filter((p) => map[p.id]).length;
  return {
    done,
    total: all.length,
    today: todayPhonemes(),
    percent: all.length ? Math.round((done / all.length) * 100) : 0,
  };
}

/* ---------------- 汉语拼音卡片 ---------------- */
/** 点「我读会啦」：记录该拼音练过几次 + 当日学会数 */
function markPinyin(id) {
  const s = read();
  const key = String(id || "").trim();
  if (!key) return null;
  if (!s.pinyins) s.pinyins = { ids: {}, daily: {} };
  const rec = s.pinyins.ids[key] || { times: 0, at: 0 };
  rec.times += 1;
  rec.at = Date.now();
  s.pinyins.ids[key] = rec;
  const k = dateKey();
  s.pinyins.daily[k] = (s.pinyins.daily[k] || 0) + 1;
  write();
  return rec;
}

/** 已读过的拼音（用于总览打勾） */
function pinyinMap() {
  const s = read();
  return (s.pinyins && s.pinyins.ids) || {};
}

function todayPinyins() {
  const s = read();
  return ((s.pinyins && s.pinyins.daily) || {})[dateKey()] || 0;
}

/** 全部 63 个拼音的掌握进度 */
function pinyinStats() {
  const map = pinyinMap();
  const all = pinyinLib.all();
  const done = all.filter((p) => map[p.id]).length;
  return {
    done,
    total: all.length,
    today: todayPinyins(),
    percent: all.length ? Math.round((done / all.length) * 100) : 0,
  };
}

/* ---------------- 数字测试（数学） ---------------- */
function mathState() {
  const s = read();
  if (!s.math) s.math = { range: { min: 1, max: 10 }, daily: {}, all: { right: 0, wrong: 0 }, streak: { cur: 0, best: 0 }, wrong: [] };
  return s.math;
}

function mathRange() {
  const r = mathState().range;
  return { min: r.min, max: r.max };
}

/** 设置数字区间；不合法时返回 {ok:false, err}，不改动原设置 */
function setMathRange(min, max) {
  const a = Math.floor(Number(min));
  const b = Math.floor(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, err: "请输入数字" };
  if (a < MATH_MIN || b > MATH_MAX) return { ok: false, err: "范围请设在 0 ~ " + MATH_MAX + " 之间" };
  if (b <= a) return { ok: false, err: "最大数要大于最小数" };
  if (b - a < 1) return { ok: false, err: "区间太小啦，至少相差 2" };
  const s = read();
  s.math.range = { min: a, max: b };
  write();
  return { ok: true, range: s.math.range };
}

/**
 * 记录一次作答
 * @param {number} n  题面数字
 * @param {boolean} ok 是否读对
 */
function markAnswer(n, ok) {
  const m = mathState();
  const num = Math.floor(Number(n));
  const k = dateKey();
  const d = m.daily[k] || { right: 0, wrong: 0 };
  if (ok) {
    d.right += 1;
    m.all.right += 1;
    m.streak.cur += 1;
    if (m.streak.cur > m.streak.best) m.streak.best = m.streak.cur;
    // 读对了就从错题本里划掉
    m.wrong = m.wrong.filter((w) => w.n !== num);
  } else {
    d.wrong += 1;
    m.all.wrong += 1;
    m.streak.cur = 0;
    if (Number.isFinite(num) && m.wrong.filter((w) => w.n === num).length === 0) {
      m.wrong.unshift({ n: num, at: Date.now() });
      if (m.wrong.length > MATH_WRONG_MAX) m.wrong = m.wrong.slice(0, MATH_WRONG_MAX);
    }
  }
  m.daily[k] = d;
  write();
  return mathStats();
}

function mathStats() {
  const m = mathState();
  const d = m.daily[dateKey()] || { right: 0, wrong: 0 };
  const total = d.right + d.wrong;
  return {
    todayRight: d.right,
    todayWrong: d.wrong,
    todayTotal: total,
    percent: total ? Math.round((d.right / total) * 100) : 0,
    streak: m.streak.cur,
    best: m.streak.best,
    allRight: m.all.right,
    allWrong: m.all.wrong,
    wrongCount: m.wrong.length,
    range: { min: m.range.min, max: m.range.max },
  };
}

/** 错题列表（最近答错的，最新在前） */
function mathWrongList() {
  return mathState().wrong.slice();
}

function clearMathWrong() {
  mathState().wrong = [];
  write();
  return true;
}

/* ---------------- 口算 / 竖式：同构答题看板 ---------------- */
const BOARD_WRONG_MAX = 30;

function boardOf(name) {
  const s = read();
  if (!s[name] || typeof s[name] !== "object") s[name] = {};
  const b = s[name];
  if (!b.daily) b.daily = {};
  if (!b.all) b.all = { right: 0, wrong: 0 };
  if (!b.streak) b.streak = { cur: 0, best: 0 };
  if (!Array.isArray(b.wrong)) b.wrong = [];
  if (!b.best || typeof b.best !== "object") b.best = {};
  return b;
}

function boardLevel(name, fallback) {
  const b = boardOf(name);
  return b.level || fallback || "";
}

function setBoardLevel(name, level) {
  const b = boardOf(name);
  b.level = String(level || b.level || "");
  write();
  return b.level;
}

/**
 * 记一次答题
 * @param {string} name calc | column
 * @param {string} expr 题面（错题去重键）
 * @param {boolean} ok
 * @param {object} extra { ans, level }
 */
function boardMark(name, expr, ok, extra) {
  const b = boardOf(name);
  const e = extra || {};
  const k = dateKey();
  const d = b.daily[k] || { right: 0, wrong: 0 };
  const key = String(expr || "");
  if (ok) {
    d.right += 1;
    b.all.right += 1;
    b.streak.cur += 1;
    if (b.streak.cur > b.streak.best) b.streak.best = b.streak.cur;
    if (key) b.wrong = b.wrong.filter((w) => w.expr !== key);
  } else {
    d.wrong += 1;
    b.all.wrong += 1;
    b.streak.cur = 0;
    if (key && !b.wrong.some((w) => w.expr === key)) {
      b.wrong.unshift({
        expr: key,
        ans: e.ans == null ? null : e.ans,
        level: e.level || b.level || "",
        at: Date.now(),
      });
      if (b.wrong.length > BOARD_WRONG_MAX) b.wrong = b.wrong.slice(0, BOARD_WRONG_MAX);
    }
  }
  const lv = e.level || b.level;
  if (lv) {
    const cur = b.best[lv] || { right: 0, wrong: 0, best: 0 };
    if (ok) cur.right += 1;
    else cur.wrong += 1;
    if (b.streak.cur > (cur.best || 0)) cur.best = b.streak.cur;
    // 最少步数记录（思维游戏·方块用）：extra.moves 传完成步数
    if (ok && e.moves != null) {
      cur.moves = cur.moves == null ? e.moves : Math.min(cur.moves, e.moves);
    }
    b.best[lv] = cur;
  }
  b.daily[k] = d;
  write();
  return boardStats(name);
}

function boardStats(name) {
  const b = boardOf(name);
  const d = b.daily[dateKey()] || { right: 0, wrong: 0 };
  const total = d.right + d.wrong;
  return {
    todayRight: d.right,
    todayWrong: d.wrong,
    todayTotal: total,
    percent: total ? Math.round((d.right / total) * 100) : 0,
    streak: b.streak.cur,
    best: b.streak.best,
    allRight: b.all.right,
    allWrong: b.all.wrong,
    wrongCount: b.wrong.length,
    level: b.level || "",
    byLevel: b.best,
  };
}

function boardWrong(name) {
  return boardOf(name).wrong.slice();
}

function clearBoardWrong(name) {
  boardOf(name).wrong = [];
  write();
  return true;
}

const CALC_LEVELS = ["add10", "add20", "mul", "mix100"];
const COLUMN_LEVELS = ["add2", "sub2", "add3"];

function calcLevel() {
  const lv = boardLevel("calc", "add10");
  return CALC_LEVELS.indexOf(lv) > -1 ? lv : "add10";
}
function setCalcLevel(lv) {
  return setBoardLevel("calc", lv);
}
function markCalc(expr, ok, extra) {
  return boardMark("calc", expr, ok, Object.assign({ level: calcLevel() }, extra || {}));
}
function calcStats() {
  return boardStats("calc");
}
function calcWrongList() {
  return boardWrong("calc");
}
function clearCalcWrong() {
  return clearBoardWrong("calc");
}

function columnLevel() {
  const lv = boardLevel("column", "add2");
  return COLUMN_LEVELS.indexOf(lv) > -1 ? lv : "add2";
}
function setColumnLevel(lv) {
  return setBoardLevel("column", lv);
}
function markColumn(expr, ok, extra) {
  return boardMark("column", expr, ok, Object.assign({ level: columnLevel() }, extra || {}));
}
function columnStats() {
  return boardStats("column");
}
function columnWrongList() {
  return boardWrong("column");
}
function clearColumnWrong() {
  return clearBoardWrong("column");
}

/* ---------------- 连线 / 思维游戏：同构看板 ---------------- */
const LINK_LEVELS = ["l5", "l10", "l20"];

function linkLevel() {
  const lv = boardLevel("link", "l10");
  return LINK_LEVELS.indexOf(lv) > -1 ? lv : "l10";
}
function setLinkLevel(lv) {
  return setBoardLevel("link", lv);
}
/** 连对一个点阵/数字 key="n5"；连错 key 传空串（计次不进错题册） */
function markLink(key, ok, extra) {
  return boardMark("link", key, ok, Object.assign({ level: linkLevel() }, extra || {}));
}
function linkStats() {
  return boardStats("link");
}

/** 思维游戏：key "maze"/"blocks"，过关记一次 */
function markMind(key, ok, extra) {
  return boardMark("mind", key, ok, extra);
}
function mindStats() {
  return boardStats("mind");
}

/* ---------------- 英语单词跟读 ---------------- */
function wordsState() {
  const s = read();
  if (!s.words || typeof s.words !== "object") s.words = {};
  const w = s.words;
  if (!w.ids) w.ids = {};
  if (!w.daily) w.daily = {};
  if (!w.all) w.all = { read: 0, follow: 0 };
  if (!w.streak) w.streak = { cur: 0, best: 0 };
  return w;
}

/** 读一个词；followed = 是否还录了跟读 */
function markWordRead(id, followed) {
  const w = wordsState();
  const key = String(id || "");
  if (!key) return wordsStats();
  const k = dateKey();
  const d = w.daily[k] || { read: 0, follow: 0, new: 0 };
  const first = !w.ids[key];
  w.ids[key] = (w.ids[key] || 0) + 1;
  w.all.read += 1;
  d.read += 1;
  if (first) {
    d.new = (d.new || 0) + 1;
    w.streak.cur += 1;
    if (w.streak.cur > w.streak.best) w.streak.best = w.streak.cur;
  }
  if (followed) {
    w.all.follow += 1;
    d.follow += 1;
  }
  w.daily[k] = d;
  write();
  return wordsStats();
}

function wordMap() {
  return Object.assign({}, wordsState().ids);
}

function wordsStats() {
  const w = wordsState();
  const d = w.daily[dateKey()] || { read: 0, follow: 0, new: 0 };
  return {
    todayRead: d.read || 0,
    todayFollow: d.follow || 0,
    todayNew: d.new || 0,
    allRead: w.all.read,
    allFollow: w.all.follow,
    done: Object.keys(w.ids).length,
    streak: w.streak.cur,
    best: w.streak.best,
  };
}

/* ---------------- 生词本 ---------------- */
function listWords(options) {
  const opt = options || {};
  let list = read().vocab.slice();
  if (opt.filter === "new") list = list.filter((w) => !w.mastered);
  if (opt.filter === "mastered") list = list.filter((w) => w.mastered);
  const kw = String(opt.keyword || "").trim();
  if (kw) {
    list = list.filter((w) => w.word.indexOf(kw) > -1 || (w.sentence || "").indexOf(kw) > -1);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function addWord(payload) {
  const s = read();
  const word = String(payload.word || "").trim();
  if (!word) return null;
  const exist = s.vocab.filter((w) => w.word === word)[0];
  if (exist) return exist;
  const item = {
    id: uid("w"),
    word,
    pinyin: payload.pinyin || "",
    sentence: payload.sentence || "",
    groupId: payload.groupId || "",
    createdAt: Date.now(),
    mastered: false,
    reviews: 0,
    lastReview: 0,
  };
  s.vocab.unshift(item);
  write();
  return item;
}

/** 更新生词字段（拼音补全迁移用） */
function updateWord(id, patch) {
  const s = read();
  const w = s.vocab.filter((x) => x.id === id)[0];
  if (!w) return null;
  Object.assign(w, patch || {});
  write();
  return w;
}

function setMastered(id, value) {  const s = read();
  const w = s.vocab.filter((x) => x.id === id)[0];
  if (!w) return;
  w.mastered = typeof value === "boolean" ? value : !w.mastered;
  w.lastReview = Date.now();
  write();
}

function removeWord(id) {
  const s = read();
  s.vocab = s.vocab.filter((w) => w.id !== id);
  write();
}

function reviewWord(id, known) {
  const s = read();
  const w = s.vocab.filter((x) => x.id === id)[0];
  if (!w) return;
  w.reviews = (w.reviews || 0) + 1;
  w.lastReview = Date.now();
  if (known) w.mastered = true;
  write();
}

function vocabStats() {
  const list = read().vocab;
  const mastered = list.filter((w) => w.mastered).length;
  return { total: list.length, mastered, pending: list.length - mastered };
}

/* ---------------- 统计 ---------------- */
function dailyMap() {
  const s = read();
  if (!s.stats.daily) s.stats.daily = {};
  return s.stats.daily;
}

function todayStat() {
  const d = dailyMap()[dateKey()];
  return d || { sentences: 0, seconds: 0, groups: 0 };
}

function bumpDaily(delta) {
  const map = dailyMap();
  const k = dateKey();
  const cur = map[k] || { sentences: 0, seconds: 0, groups: 0 };
  cur.sentences += delta.sentences || 0;
  cur.seconds += delta.seconds || 0;
  if (delta.groups) cur.groups = (cur.groups || 0) + delta.groups;
  map[k] = cur;
  write();
  return cur;
}

/** 秒数 → 人话时长：48 秒 / 3 分 20 秒 / 1 小时 5 分（不足一分钟不再显示成 0 分） */
function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s <= 0) return "0 秒";
  if (s < 60) return s + " 秒";
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? m + " 分 " + r + " 秒" : m + " 分钟";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? h + " 小时 " + mm + " 分" : h + " 小时";
}

/**
 * 每日时长上限检查（家长中心可设 10/20/30 分钟，0 = 不限制）。
 * 统计口径：朗读秒数（markRead）+ 磨耳朵页停留秒数，都是真实时长。
 */
function dailyUsage() {
  const u = getUser();
  const limit = Number(u.dailyLimit) || 0;
  const usedSec = todayStat().seconds || 0;
  return {
    limit: limit,
    usedSec: usedSec,
    remainSec: limit > 0 ? Math.max(0, limit * 60 - usedSec) : -1,
    over: limit > 0 && usedSec >= limit * 60,
  };
}

const REST_TIP_KEY = "wb_rest_tip";

/** 到点休息提醒是否需要弹（到达上限后每天最多提醒一次，不强制退出） */
function restTipNeeded() {
  if (!dailyUsage().over) return false;
  try {
    return wx.getStorageSync(REST_TIP_KEY) !== dateKey();
  } catch (e) {
    return true;
  }
}

function markRestTip() {
  try {
    wx.setStorageSync(REST_TIP_KEY, dateKey());
  } catch (e) {}
}

function streak() {
  const map = dailyMap();
  let cur = 0;
  // 今天没读也允许从昨天起算（当天还没开始时保留连续天数）
  let start = 0;
  if (!(map[dateKey()] && map[dateKey()].sentences > 0)) start = -1;
  for (let i = start; i > -400; i--) {
    const k = dateKey(offsetDate(i));
    const d = map[k];
    if (d && d.sentences > 0) cur += 1;
    else break;
  }
  // 历史最佳
  const keys = Object.keys(map).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  keys.forEach((k) => {
    const active = map[k].sentences > 0;
    if (!active) {
      run = 0;
      prev = k;
      return;
    }
    if (prev) {
      const gap = (new Date(k) - new Date(prev)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    prev = k;
    if (run > best) best = run;
  });
  return { current: cur, best: Math.max(best, cur) };
}

function weekStats(days) {
  const n = days || 7;
  const map = dailyMap();
  const out = [];
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  for (let i = n - 1; i >= 0; i--) {
    const d = offsetDate(-i);
    const k = dateKey(d);
    const item = map[k] || { sentences: 0, seconds: 0 };
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push({
      date: k,
      // label 短标签（柱状图/文字报告用）；md 月日（家长中心列表用，避免「周几」分不清是哪一天）
      label: n <= 7 ? "周" + weekdays[d.getDay()] : String(d.getDate()),
      md: mm + "/" + dd,
      sentences: item.sentences || 0,
      seconds: item.seconds || 0,
      durationText: fmtDuration(item.seconds),
      minutes: Math.round((item.seconds || 0) / 60),
      active: (item.sentences || 0) > 0,
    });
  }
  return out;
}

/**
 * 最近 days 天（含今天）的朗读统计。
 * 成长档案页顶部的「近 7 天 / 30 天 / 3 个月 / 本年度」用它取数。
 */
function overviewSince(days) {
  const map = dailyMap();
  const n = Math.max(1, Math.floor(days || 7));
  let sentences = 0;
  let seconds = 0;
  let activeDays = 0;
  for (let i = n - 1; i >= 0; i--) {
    const d = map[dateKey(offsetDate(-i))];
    if (!d) continue;
    sentences += d.sentences || 0;
    seconds += d.seconds || 0;
    if ((d.sentences || 0) > 0) activeDays += 1;
  }
  return { days: n, sentences, minutes: Math.round(seconds / 60), activeDays };
}

function overview() {
  const s = read();
  const map = dailyMap();
  let sentences = 0;
  let seconds = 0;
  let activeDays = 0;
  Object.keys(map).forEach((k) => {
    sentences += map[k].sentences || 0;
    seconds += map[k].seconds || 0;
    if ((map[k].sentences || 0) > 0) activeDays += 1;
  });
  const st = streak();
  return {
    sentences,
    minutes: Math.round(seconds / 60),
    activeDays,
    vocab: vocabStats(),
    streak: st.current,
    bestStreak: st.best,
    groups: s.groups.length,
  };
}

/* ---------------- 勋章 ---------------- */
const BADGE_DEFS = [
  {
    key: "first",
    name: "初次开口",
    desc: "完成第 1 句朗读",
    icon: "mic",
    color: "#f97316",
    ring: "linear-gradient(45deg,#fbbf24,#fde68a)",
    target: 1,
    metric: (o) => o.sentences,
  },
  {
    key: "streak3",
    name: "坚持三日",
    desc: "连续打卡 3 天",
    icon: "fire",
    color: "#0ea5e9",
    ring: "linear-gradient(45deg,#0369a1,#e0f2fe)",
    target: 3,
    metric: (o) => o.streak,
  },
  {
    key: "reader200",
    name: "朗读者",
    desc: "累计朗读 200 句",
    icon: "stories",
    color: "#00687a",
    ring: "linear-gradient(45deg,#22d3ee,#d8e3fb)",
    target: 200,
    metric: (o) => o.sentences,
  },
  {
    key: "vocab30",
    name: "生词猎人",
    desc: "收录 30 个生词",
    icon: "search",
    color: "#0ea5e9",
    ring: "linear-gradient(45deg,#7dd3fc,#e0f2fe)",
    target: 30,
    metric: (o) => o.vocab.total,
  },
];

function getBadges() {
  const o = overview();
  return BADGE_DEFS.map((def) => {
    const value = Math.max(0, def.metric(o) || 0);
    const unlocked = value >= def.target;
    const sub = unlocked ? "已点亮 · 继续保持" : `${Math.min(value, def.target)}/${def.target}`;
    return {
      key: def.key,
      name: def.name,
      desc: def.desc,
      sub,
      icon: def.icon,
      color: unlocked ? def.color : "#ffffff",
      ring: unlocked ? def.ring : "#cbd5e1",
      locked: !unlocked,
      tag: unlocked ? "已点亮" : Math.round((value / def.target) * 100) + "%",
      tagStyle: unlocked ? "background:#d1fae5;color:#005b3d" : "background:#e0f2fe;color:#00687a",
      progress: { current: Math.min(value, def.target), target: def.target },
    };
  });
}

function nextBadge() {
  const list = getBadges();
  const locked = list.filter((b) => b.locked);
  if (!locked.length) return null;
  locked.sort((a, b) => b.progress.current / b.progress.target - a.progress.current / a.progress.target);
  const b = locked[0];
  return {
    name: `『${b.name}』勋章`,
    desc: b.desc,
    rarity: "普通",
    current: b.progress.current,
    target: b.progress.target,
    percent: Math.round((b.progress.current / b.progress.target) * 100),
    icon: b.icon,
  };
}

/* ---------------- 导出 / 重置 ---------------- */
function buildReportText() {
  const o = overview();
  const user = getUser();
  const week = weekStats(7);
  const line = week.map((d) => `${d.label} ${d.sentences}句`).join("，");
  return [
    `【书声岛】${user.nickname} 的学习报告`,
    `统计时间：${dateKey()} 生成`,
    `累计朗读：${o.sentences} 句 / ${o.minutes} 分钟`,
    `打卡天数：${o.activeDays} 天（当前连续 ${o.streak} 天，最佳 ${o.bestStreak} 天）`,
    `生词本：共 ${o.vocab.total} 个，已掌握 ${o.vocab.mastered} 个`,
    `近 7 天：${line}`,
    "",
    "坚持每天读一点，声音会越来越响亮。",
  ].join("\n");
}

function resetAll() {
  cache = seed();
  write();
  return cache;
}

/* ---------------- 分区清理与快照（安全重置：三档范围 + 7 天可恢复） ---------------- */
const SNAPSHOT_KEY = "wb_reset_snapshot";
const SNAPSHOT_TTL = 7 * 86400e3;

function maskPhoneStr(p) {
  const s = String(p || "");
  return s.length === 11 ? s.slice(0, 3) + "****" + s.slice(7) : s ? "已绑定" : "";
}

/**
 * 三档清理范围：
 *  learn   只清学习记录（书单朗读/生词/错题/打卡统计/描写音标），孩子资料与设置保留
 *  profile 学习记录 + 孩子资料（昵称/头像/年龄模式/宠物），偏好设置与手机号保留
 *  all     恢复出厂（所有本地数据，含手机号绑定）
 * 返回 { del:[{icon,label,n}], keep:[...] } 供确认页展示真实数量
 */
function cleanupPreview(mode) {
  const s = read();
  const o = overview();
  const wrongCount = ["math", "calc", "column"].reduce(
    (n, k) => n + ((s[k] && s[k].wrong && s[k].wrong.length) || 0),
    0
  );
  const writingChars = Object.keys((s.writing && s.writing.chars) || {}).length;
  const phonics = Object.keys((s.phonics && s.phonics.ids) || {}).length;
  const u = s.user || {};

  const learnDel = [
    { icon: "📚", label: "书单与朗读进度", n: s.groups.length + " 本 · " + o.sentences + " 句" },
    { icon: "📝", label: "生词本", n: (s.vocab || []).length + " 个词" },
    { icon: "✏️", label: "错题本", n: wrongCount + " 道题" },
    { icon: "🔥", label: "打卡与学习统计", n: "连续 " + o.streak + " 天 · 累计 " + o.activeDays + " 天" },
    { icon: "🎙", label: "描写与音标练习", n: writingChars + " 个字 · " + phonics + " 个音标" },
  ];
  const profileDel = [{ icon: "👤", label: "孩子资料", n: (u.nickname || "小朋友") + " · 头像" }];
  const prefKeep = { icon: "⚙️", label: "偏好设置", n: "语速 · 拼音 · 每日目标" };
  const phoneKeep = { icon: "📱", label: "手机号绑定", n: u.phone ? maskPhoneStr(u.phone) : "未绑定" };

  let del;
  let keep;
  if (mode === "all") {
    del = learnDel.concat(profileDel, [
      { icon: "⚙️", label: "偏好设置", n: "恢复默认" },
      { icon: "📱", label: "手机号绑定", n: u.phone ? maskPhoneStr(u.phone) : "未绑定" },
    ]);
    keep = [];
  } else if (mode === "profile") {
    del = learnDel.concat(profileDel);
    keep = [prefKeep, phoneKeep];
  } else {
    del = learnDel;
    keep = [
      { icon: "👤", label: "孩子资料", n: (u.nickname || "小朋友") + " · " + (u.ageMode === "kid" ? "幼儿园模式" : "小学模式") },
      prefKeep,
      phoneKeep,
    ];
  }
  return { del: del, keep: keep };
}

/** 执行清理；先自动备份当前全量数据（7 天内可 restoreSnapshot 找回） */
function cleanupApply(mode) {
  const s = read();
  saveSnapshot(JSON.parse(JSON.stringify(s)));
  const u = s.user || {};
  if (mode === "learn") {
    cache = blank();
    cache.user = Object.assign({}, u); // 资料与设置全保留
  } else if (mode === "profile") {
    cache = blank();
    const merged = Object.assign({}, cache.user, {
      phone: u.phone || "",
      phoneSource: u.phoneSource || "",
      phoneAt: u.phoneAt || 0,
    });
    // 偏好设置保留；昵称/头像/年龄模式/宠物恢复默认
    if (typeof u.pinyinOn === "boolean") merged.pinyinOn = u.pinyinOn;
    if (typeof u.speechRate === "number") merged.speechRate = u.speechRate;
    if (u.dailyGoal) merged.dailyGoal = u.dailyGoal;
    if (u.dailyLimit) merged.dailyLimit = u.dailyLimit;
    if (u.subject) merged.subject = u.subject;
    cache.user = merged;
  } else {
    cache = blank();
  }
  cache.createdAt = s.createdAt;
  write();
  return true;
}

function saveSnapshot(data) {
  try {
    wx.setStorageSync(SNAPSHOT_KEY, { at: Date.now(), data: data });
  } catch (e) {}
}

/* ---------------- 云备份（换设备找回，key = 手机号 + 恢复口令） ---------------- */

/** 导出全量数据供云备份：剔除本机相关字段（头像本地路径换设备无效） */
function exportData() {
  const s = JSON.parse(JSON.stringify(cache || read()));
  if (s.user) {
    s.user.avatar = "";
    s.user.avatarAt = 0;
  }
  return s;
}

/** 从云备份导入：整体替换本地数据；本机头像与恢复口令保留，写盘后由页面自行刷新 */
function importData(data) {
  if (!data || typeof data !== "object" || !data.user) return false;
  const prev = cache || read();
  const avatar = (prev.user && prev.user.avatar) || "";
  const avatarAt = (prev.user && prev.user.avatarAt) || 0;
  const pin = (prev.user && prev.user.phonePin) || "";
  cache = normalize(data);
  cache.user.avatar = avatar;
  cache.user.avatarAt = avatarAt;
  if (!cache.user.phonePin) cache.user.phonePin = pin;
  write();
  return true;
}

/** 4 位恢复口令：首次绑定时生成一次，之后不变 */
function ensurePhonePin() {
  const u = read().user;
  if (u.phonePin && /^\d{4}$/.test(String(u.phonePin))) return u.phonePin;
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  u.phonePin = pin;
  write();
  return pin;
}

/** 7 天内的备份才有效；过期自动清除并返回 null */
function getSnapshot() {
  try {
    const snap = wx.getStorageSync(SNAPSHOT_KEY);
    if (!snap || !snap.data || !snap.at) return null;
    if (Date.now() - snap.at > SNAPSHOT_TTL) {
      try {
        wx.removeStorageSync(SNAPSHOT_KEY);
      } catch (e2) {}
      return null;
    }
    return snap;
  } catch (e) {
    return null;
  }
}

function snapshotAgeText() {
  const snap = getSnapshot();
  if (!snap) return "";
  const d = new Date(snap.at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天";
  if (new Date(now.getTime() - 86400e3).toDateString() === d.toDateString()) return "昨天";
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

/** 恢复备份并清除快照 */
function restoreSnapshot() {
  const snap = getSnapshot();
  if (!snap) return false;
  cache = snap.data;
  write();
  try {
    wx.removeStorageSync(SNAPSHOT_KEY);
  } catch (e) {}
  return true;
}

function discardSnapshot() {
  try {
    wx.removeStorageSync(SNAPSHOT_KEY);
  } catch (e) {}
}


module.exports = {
  KEY,
  DEMO_GROUP_ID,
  dateKey,
  getUser,
  setUser,
  readerId,
  listGroups,
  getGroup,
  activeGroup,
  createGroup,
  updateGroup,
  removeGroup,
  setCursor,
  markRead,
  resetRead,
  markHeard,
  listenProgress,
  progressOf,
  markWritten,
  saveTrace,
  getTrace,
  hasTrace,
  clearTrace,
  writtenMap,
  isWritten,
  todayWritten,
  writingStats,
  writingOverview,
  MATH_MIN,
  MATH_MAX,
  mathRange,
  setMathRange,
  markAnswer,
  mathStats,
  mathWrongList,
  clearMathWrong,
  CALC_LEVELS,
  COLUMN_LEVELS,
  calcLevel,
  setCalcLevel,
  markCalc,
  calcStats,
  calcWrongList,
  clearCalcWrong,
  columnLevel,
  setColumnLevel,
  markColumn,
  columnStats,
  columnWrongList,
  clearColumnWrong,
  linkLevel,
  setLinkLevel,
  markLink,
  linkStats,
  markMind,
  mindStats,
  markWordRead,
  wordMap,
  wordsStats,
  markPhoneme,
  phonemeMap,
  isPhonemeLearned,
  todayPhonemes,
  phonemeStats,
  markPinyin,
  pinyinMap,
  todayPinyins,
  pinyinStats,
  listWords,
  addWord,
  updateWord,
  setMastered,
  removeWord,
  reviewWord,
  vocabStats,
  todayStat,
  bumpDaily,
  fmtDuration,
  dailyUsage,
  restTipNeeded,
  markRestTip,
  streak,
  weekStats,
  overview,
  overviewSince,
  getBadges,
  nextBadge,
  buildReportText,
  resetAll,
  cleanupPreview,
  cleanupApply,
  getSnapshot,
  snapshotAgeText,
  restoreSnapshot,
  discardSnapshot,
  save,
  exportData,
  importData,
  ensurePhonePin,
  _read: read,
};
