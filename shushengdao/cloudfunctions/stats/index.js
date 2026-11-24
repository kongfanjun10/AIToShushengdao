/**
 * 云函数：使用统计（管理员后台数据源）
 *
 * 部署：微信开发者工具 → cloudfunctions/stats 右键「上传并部署：云端安装依赖」
 * 数据：云开发数据库三个集合（首次调用自动创建）
 *  - stats_users  文档 id = 用户 openid：{ nickname, ageMode, phone, phoneSource, launches, firstAt, firstDay, lastAt, lastDay }
 *  - stats_days   文档 id = "YYYY-MM-DD"：{ count }（当天启动次数）
 *
 * action：
 *  - track      { nickname, ageMode }            启动上报（每次打开小程序调用，静默失败不影响使用）
 *  - bindPhone  { phone, phoneSource, nickname } 绑定手机号后同步（家长中心触发）
 *  - checkAdmin                                  查询当前微信身份是否为管理员
 *  - claimAdmin { adminKey }                     首次认领（口令 + 当前微信身份；认领后仅此身份可看后台）
 *  - overview                                    后台总览（仅管理员 openid 可调用，无需口令）
 *
 * 返回：{ ok, ... } 或 { ok:false, code, errMsg }
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COL_USERS = "stats_users";
const COL_DAYS = "stats_days";
const COL_ADMINS = "stats_admins"; // 管理员白名单：文档 _id = 微信 openid

/**
 * 首次认领用的口令：与 cloudfunctions/feedback/index.js 的 ADMIN_KEY 保持一致。
 * ⚠️ 发布前请改成一串只有自己知道的口令；认领完成后，后台访问只认微信身份（openid），
 * 其他人即使拿到口令也进不来。
 */
const ADMIN_KEY = "Jason-ssd-admin";

const MAX_USERS = 200;

function fail(code, errMsg) {
  return { ok: false, code: code, errMsg: errMsg };
}

async function ensureCols() {
  for (const col of [COL_USERS, COL_DAYS, COL_ADMINS]) {
    try {
      await db.createCollection(col);
    } catch (e) {
      /* 已存在时忽略 */
    }
  }
}

/**
 * 东八区「日」换算。
 * 云函数运行时区不一定是 +8，所以先把时间戳整体平移到北京时间，
 * 再用 UTC 取值——结果与运行时区无关，也不会出现「加了 8 小时又加一次」的双重偏移。
 */
const TZ_MS = 8 * 3600e3;
const DAY_MS = 86400e3;

function bjDate(ts) {
  return new Date((ts == null ? Date.now() : Number(ts)) + TZ_MS);
}

/** 时间戳 → "YYYY-MM-DD"（北京时间） */
function dayKey(ts) {
  const d = bjDate(ts);
  return (
    d.getUTCFullYear() +
    "-" +
    ("0" + (d.getUTCMonth() + 1)).slice(-2) +
    "-" +
    ("0" + d.getUTCDate()).slice(-2)
  );
}

/** 时间戳 → "M.D" 轴标签（北京时间） */
function dayLabel(ts) {
  const d = bjDate(ts);
  return d.getUTCMonth() + 1 + "." + d.getUTCDate();
}

function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** 手机号脱敏：138****8000（后台只展示脱敏值，完整号不出云函数） */
function maskPhone(num) {
  const s = String(num || "");
  if (!/^1\d{10}$/.test(s)) return "";
  return s.slice(0, 3) + "****" + s.slice(-4);
}

/* ---------------- 上报 ---------------- */

async function track(event, openid) {
  if (!openid) return fail("NO_OPENID", "取不到用户身份");
  const nickname = cleanText(event.nickname, 16) || "小朋友";
  const ageMode = event.ageMode === "kid" ? "kid" : "primary";
  const now = Date.now();
  const day = dayKey();

  const userRef = db.collection(COL_USERS).doc(openid);

  // 老用户：只累计次数与活跃时间。
  // ⚠️ 不再覆盖 nickname/ageMode——以前每次启动都会用本地昵称覆盖云端，
  // 导致后台用户名「自动漂移」（本地改个昵称，后台刷新就变了）。
  // 昵称/模式的变更由用户在家长中心主动保存时走 profile 同步。
  try {
    const doc = await userRef.get();
    if (doc && doc.data) {
      await userRef.update({
        data: {
          launches: _.inc(1),
          lastAt: now,
          lastDay: day,
          firstAt: doc.data.firstAt || now,
          firstDay: doc.data.firstDay || dayKey(doc.data.firstAt || now),
        },
      });
      await bumpDay(day);
      return { ok: true };
    }
  } catch (e) {
    /* 文档不存在 → 走建档 */
  }

  // 新用户建档
  await userRef.set({
    data: {
      nickname: nickname,
      ageMode: ageMode,
      phone: "",
      phoneSource: "",
      launches: 1,
      firstAt: now,
      firstDay: day,
      lastAt: now,
      lastDay: day,
    },
  });
  await bumpDay(day);
  return { ok: true };
}

/**
 * 当天启动计数 +1（stats_days 文档不存在时先建）
 *
 * ⚠️ 这里必须看 update 的返回值：文档不存在时 `doc().update()` 不抛错，
 * 只返回 stats.updated = 0。老写法「catch 里才 set」导致天表从来没建过，
 * 后台就出现「今日活跃 1 人、近 7 日全是 0」。
 */
async function bumpDay(day) {
  const dayRef = db.collection(COL_DAYS).doc(day);
  let updated = 0;
  try {
    const res = await dayRef.update({ data: { count: _.inc(1) } });
    updated = (res && res.stats && res.stats.updated) || 0;
  } catch (e) {
    updated = 0;
  }
  if (updated > 0) return;
  try {
    await dayRef.set({ data: { count: 1 } });
  } catch (e) {
    // 并发下另一个请求刚建好文档：补一次自增，失败也不影响主流程
    try {
      await dayRef.update({ data: { count: _.inc(1) } });
    } catch (e2) {}
  }
}

async function bindPhone(event, openid) {
  if (!openid) return fail("NO_OPENID", "取不到用户身份");
  const phone = cleanText(event.phone, 11);
  if (phone && !/^1\d{10}$/.test(phone)) return fail("BAD_PHONE", "手机号格式不对");
  const nickname = cleanText(event.nickname, 16);
  const day = dayKey();
  const now = Date.now();
  const userRef = db.collection(COL_USERS).doc(openid);

  // 先保证文档存在（没启动过就先建档）
  try {
    await userRef.get();
  } catch (e) {
    await userRef.set({
      data: {
        nickname: nickname || "小朋友",
        ageMode: "primary",
        launches: 0,
        firstAt: now,
        firstDay: day,
        lastAt: now,
        lastDay: day,
      },
    });
  }
  const data = phone
    ? { phone: phone, phoneSource: event.phoneSource === "wechat" ? "wechat" : "manual", phoneAt: now }
    : { phone: "", phoneSource: "", phoneAt: 0 }; // 传空手机号 = 清除（解绑）
  if (nickname) data.nickname = nickname;
  await userRef.update({ data: data });
  return { ok: true };
}

/**
 * 用户主动保存资料（家长中心改昵称/切换模式）时同步。
 * 与 track 分开：启动上报不再覆盖昵称，只有用户明确保存才更新云端显示名。
 */
async function profile(event, openid) {
  if (!openid) return fail("NO_OPENID", "取不到用户身份");
  const nickname = cleanText(event.nickname, 16);
  const ageMode = event.ageMode === "kid" ? "kid" : "primary";
  const now = Date.now();
  const day = dayKey();
  const userRef = db.collection(COL_USERS).doc(openid);

  const data = { ageMode: ageMode };
  if (nickname) data.nickname = nickname;
  try {
    const res = await userRef.update({ data: data });
    if ((res && res.stats && res.stats.updated) || 0) return { ok: true };
  } catch (e) {
    /* 文档不存在 → 建档 */
  }
  await userRef.set({
    data: {
      nickname: nickname || "小朋友",
      ageMode: ageMode,
      phone: "",
      phoneSource: "",
      launches: 0,
      firstAt: now,
      firstDay: day,
      lastAt: now,
      lastDay: day,
    },
  });
  return { ok: true };
}

/* ---------------- 管理员白名单 ---------------- */

/** 当前 openid 是否已登记为管理员 */
async function isAdminOpenid(openid) {
  if (!openid) return false;
  try {
    const doc = await db.collection(COL_ADMINS).doc(openid).get();
    return !!(doc && doc.data);
  } catch (e) {
    return false;
  }
}

/** 是否已有任何人认领过管理员 */
async function hasAnyAdmin() {
  try {
    const res = await db.collection(COL_ADMINS).count();
    return (res.total || 0) > 0;
  } catch (e) {
    return false;
  }
}

/** 状态查询：前端据此决定「直接进入 / 首次认领 / 无权限」 */
async function checkAdmin(openid) {
  const isAdmin = await isAdminOpenid(openid);
  const hasAdmin = isAdmin || (await hasAnyAdmin());
  return { ok: true, isAdmin: isAdmin, hasAdmin: hasAdmin };
}

/**
 * 首次认领：输入口令 + 当前微信身份一起生效。
 * 已有管理员时，其他人即使口令正确也不能认领（保证后台只有管理员一个人能看）。
 */
async function claimAdmin(event, openid) {
  if (!openid) return fail("NO_OPENID", "取不到用户身份");
  if (await isAdminOpenid(openid)) return { ok: true, claimed: true };
  const key = cleanText(event.adminKey, 64);
  if (key !== ADMIN_KEY) return fail("BAD_KEY", "管理口令不对");
  if (await hasAnyAdmin()) return fail("NO_PERM", "管理员已设置，只有管理员本人可以查看");
  await db.collection(COL_ADMINS).doc(openid).set({ data: { at: Date.now() } });
  return { ok: true, claimed: true };
}

/* ---------------- 后台总览 ---------------- */

async function overview(event, openid) {
  // 访问控制：只认微信身份。口令只在首次认领时用一次。
  if (!(await isAdminOpenid(openid))) {
    return fail("NO_PERM", (await hasAnyAdmin()) ? "仅管理员本人可以查看" : "尚未设置管理员");
  }

  const today = dayKey();

  // 近 7 天每日启动数（day 与 label 都按北京时间算，且不再二次偏移）
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ts = Date.now() - i * DAY_MS;
    days.push({ day: dayKey(ts), label: dayLabel(ts) });
  }

  // 用户列表
  const userRes = await db
    .collection(COL_USERS)
    .orderBy("lastAt", "desc")
    .limit(MAX_USERS)
    .get();
  const users = (userRes.data || []).map((u) => ({
    nickname: u.nickname || "小朋友",
    ageMode: u.ageMode || "primary",
    phone: maskPhone(u.phone),
    phoneBound: !!u.phone,
    phoneSource: u.phoneSource || "",
    launches: u.launches || 0,
    lastAt: u.lastAt || 0,
    lastDay: u.lastDay || "",
    firstDay: u.firstDay || "",
    todayActive: u.lastDay === today,
  }));

  /**
   * 每日启动数：优先读天表 stats_days。
   * 天表缺数据（历史版本 bumpDay 失效留下的空档）时，用用户的 lastDay 兜底，
   * 避免出现「今日活跃 1 人、近 7 日却是 0」这种自相矛盾的看板。
   */
  const dayCounts = await Promise.all(
    days.map(async (d) => {
      try {
        const r = await db.collection(COL_DAYS).doc(d.day).get();
        return (r && r.data && r.data.count) || 0;
      } catch (e) {
        return 0;
      }
    })
  );
  const activeOn = {};
  users.forEach((u) => {
    if (u.lastDay) activeOn[u.lastDay] = (activeOn[u.lastDay] || 0) + 1;
  });
  days.forEach((d, i) => {
    d.count = dayCounts[i] || activeOn[d.day] || 0;
  });

  // 口径说明：总次数 = 所有用户 launches 合计（每次启动 track 时 +1）
  const total = users.reduce((s, u) => s + u.launches, 0);

  return {
    ok: true,
    generatedAt: Date.now(),
    totalLaunches: total,
    todayLaunches: days[6].count,
    yesterdayLaunches: days[5].count,
    totalUsers: users.length,
    todayUsers: users.filter((u) => u.todayActive).length,
    todayNewUsers: users.filter((u) => u.firstDay === today).length,
    days: days,
    users: users,
  };
}

exports.main = async (event) => {
  const action = (event && event.action) || "";
  const wxContext = cloud.getWXContext();
  const openid = wxContext && wxContext.OPENID ? wxContext.OPENID : "";

  await ensureCols();

  try {
    if (action === "track") return await track(event, openid);
    if (action === "bindPhone") return await bindPhone(event, openid);
    if (action === "profile") return await profile(event, openid);
    if (action === "checkAdmin") return await checkAdmin(openid);
    if (action === "claimAdmin") return await claimAdmin(event, openid);
    if (action === "overview") return await overview(event, openid);
    return fail("BAD_ACTION", "未知 action：" + action);
  } catch (e) {
    return fail((e && (e.errCode || e.code)) || "FAIL", (e && (e.errMsg || e.message)) || "统计服务异常");
  }
};
