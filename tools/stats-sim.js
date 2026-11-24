/**
 * 云函数 stats 仿真（Node 环境，内存版云数据库）
 * 运行：node tools/stats-sim.js
 *
 * 覆盖：
 *  - track 上报：老用户自增、新用户建档、天表 stats_days 首日建档（曾经「update 不抛错 → 天表永远不建」的 bug）
 *  - 东八区日键：与运行时区无关、不出现「加 8 小时又加一次」的双重偏移
 *  - overview：今日/昨日启动数、近 7 日序列含今天、今日活跃/新增
 *  - 天表缺数据时用用户 lastDay 兜底，不再出现「活跃 1 人、近 7 日全 0」
 *  - 管理员：认领 / 非管理员拒绝 / 口令错
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "shushengdao");
const SRC = fs.readFileSync(path.join(ROOT, "cloudfunctions", "stats", "index.js"), "utf8");

/* ---------------- 内存版云数据库 ---------------- */
const tables = {};
let currentOpenid = "openid-a";

function table(name) {
  if (!tables[name]) tables[name] = new Map();
  return tables[name];
}
const clone = (o) => JSON.parse(JSON.stringify(o));

function applyData(cur, data) {
  Object.keys(data).forEach((k) => {
    const v = data[k];
    if (v && typeof v === "object" && "__inc" in v) cur[k] = (cur[k] || 0) + v.__inc;
    else cur[k] = v;
  });
}

function collection(name) {
  const opts = { order: null, limit: 100, cond: null };
  const api = {
    doc(id) {
      return {
        async get() {
          const m = table(name);
          if (!m.has(id)) {
            const e = new Error("document.get:fail document not exists");
            e.errCode = -1;
            throw e;
          }
          return { data: Object.assign({ _id: id }, clone(m.get(id))) };
        },
        async set({ data }) {
          table(name).set(id, clone(data));
          return { stats: { created: 1, updated: 0 } };
        },
        // 关键：文档不存在时「不抛错、返回 updated:0」——老代码就栽在这里
        async update({ data }) {
          const m = table(name);
          if (!m.has(id)) return { stats: { updated: 0 } };
          const cur = m.get(id);
          applyData(cur, data);
          return { stats: { updated: 1 } };
        },
      };
    },
    where(cond) {
      opts.cond = cond;
      return api;
    },
    orderBy(field, dir) {
      opts.order = { field: field, dir: dir };
      return api;
    },
    limit(n) {
      opts.limit = n;
      return api;
    },
    async get() {
      let rows = Array.from(table(name).entries()).map(([id, v]) =>
        Object.assign({ _id: id }, clone(v))
      );
      if (opts.cond) {
        rows = rows.filter((r) =>
          Object.keys(opts.cond).every((k) => {
            const c = opts.cond[k];
            if (c && typeof c === "object" && "__in" in c) return c.__in.indexOf(r[k]) > -1;
            return r[k] === c;
          })
        );
      }
      if (opts.order) {
        const f = opts.order.field;
        rows.sort((a, b) => (opts.order.dir === "desc" ? (b[f] || 0) - (a[f] || 0) : (a[f] || 0) - (b[f] || 0)));
      }
      return { data: rows.slice(0, opts.limit) };
    },
    async count() {
      return { total: table(name).size };
    },
  };
  return api;
}

const db = {
  collection: collection,
  async createCollection(name) {
    table(name);
    return { ok: true };
  },
  command: {
    inc: (n) => ({ __inc: n }),
    in: (arr) => ({ __in: arr }),
  },
};

const cloud = {
  DYNAMIC_CURRENT_ENV: "env-test",
  init() {},
  database: () => db,
  getWXContext: () => ({ OPENID: currentOpenid }),
};

/* ---------------- 载入云函数 ---------------- */
const mod = { exports: {} };
vm.runInNewContext(SRC, {
  require: (n) => {
    if (n === "wx-server-sdk") return cloud;
    throw new Error("unexpected require: " + n);
  },
  module: mod,
  exports: mod.exports,
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  Promise: Promise,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  setTimeout: setTimeout,
  process: process,
});
const fn = mod.exports;

/* ---------------- 断言 ---------------- */
let pass = 0;
let failCount = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    failCount++;
    console.log("  FAIL " + name + (extra === undefined ? "" : " :: " + JSON.stringify(extra)));
  }
}

/** 与实现无关的北京时间日键基准算法 */
function expectDay(ts) {
  const d = new Date((ts == null ? Date.now() : ts) + 8 * 3600e3);
  return (
    d.getUTCFullYear() +
    "-" +
    ("0" + (d.getUTCMonth() + 1)).slice(-2) +
    "-" +
    ("0" + d.getUTCDate()).slice(-2)
  );
}

(async () => {
  console.log("== 云函数 stats 仿真 ==");

  /* 1. 新用户首次上报：建档 + 天表首日建档 */
  const r1 = await fn.main({ action: "track", nickname: "小明", ageMode: "kid" });
  ok("新用户上报成功", r1.ok === true, r1);
  const userA = table("stats_users").get("openid-a");
  ok("用户建档字段", !!userA && userA.launches === 1 && userA.nickname === "小明" && userA.ageMode === "kid", userA);

  const today = expectDay();
  const dayDoc = table("stats_days").get(today);
  ok("天表当天文档已创建（原 bug：永远不建）", !!dayDoc && dayDoc.count === 1, dayDoc);

  /* 2. 同日再次启动：用户自增、天表自增 */
  await fn.main({ action: "track", nickname: "小明", ageMode: "kid" });
  ok("老用户启动次数累加", table("stats_users").get("openid-a").launches === 2);
  ok("天表计数累加", table("stats_days").get(today).count === 2);

  /* 3. 第二位用户 + 手机号绑定 */
  currentOpenid = "openid-b";
  await fn.main({ action: "track", nickname: "小红", ageMode: "primary" });
  await fn.main({ action: "bindPhone", phone: "13800008000", phoneSource: "wechat", nickname: "小红" });
  ok("手机号写入（完整号只在云端）", table("stats_users").get("openid-b").phone === "13800008000");

  /* 4. 管理员认领 */
  const denied = await fn.main({ action: "overview" });
  ok("未认领时 overview 拒绝", denied.ok === false && denied.code === "NO_PERM", denied);
  const badKey = await fn.main({ action: "claimAdmin", adminKey: "wrong" });
  ok("错误口令不能认领", badKey.ok === false && badKey.code === "BAD_KEY");
  const adminId = currentOpenid; // openid-b 成为唯一管理员
  const claimed = await fn.main({ action: "claimAdmin", adminKey: "Jason-ssd-admin" });
  ok("正确口令认领管理员", claimed.ok === true && claimed.claimed === true, claimed);

  /* 5. 概览：今日/近 7 日 */
  currentOpenid = adminId;
  const ov = await fn.main({ action: "overview" });
  ok("overview 成功", ov.ok === true, ov);
  ok("今日启动数 = 3", ov.todayLaunches === 3, ov.todayLaunches);
  ok("近 7 日恰好 7 个点", ov.days.length === 7, ov.days.length);
  ok("近 7 日最后一点是今天", ov.days[6].day === today, ov.days[6]);
  ok("今日柱不为 0（原 bug 症状）", ov.days[6].count === 3, ov.days[6]);
  ok("今日活跃用户 2 位", ov.todayUsers === 2, ov.todayUsers);
  ok("今日新增 2 位", ov.todayNewUsers === 2, ov.todayNewUsers);
  ok("累计用户 2 位", ov.totalUsers === 2);
  ok("手机号脱敏", ov.users.some((u) => u.phone === "138****8000"), ov.users);

  /* 6. 昨日数据（含用户 lastDay 兜底） */
  const yTs = Date.now() - 86400e3;
  const yKey = expectDay(yTs);
  pastDay(yKey, 4); // 天表有记录
  currentOpenid = "openid-c";
  await fn.main({ action: "track", nickname: "小刚" });
  // 把小刚的 lastDay 改成昨天，模拟「天表没写、但用户昨天来过」
  const cUser = table("stats_users").get("openid-c");
  cUser.lastDay = yKey;
  currentOpenid = adminId;
  const ov2 = await fn.main({ action: "overview" });
  ok("昨日启动数读天表", ov2.yesterdayLaunches === 4, ov2.yesterdayLaunches);
  ok("昨日有记录时不被兜底覆盖", ov2.days[5].count === 4, ov2.days[5]);

  /* 7. 天表缺数据 → 用用户 lastDay 兜底（不再显示 0） */
  const tKey = expectDay(Date.now() - 2 * 86400e3);
  table("stats_days").delete(tKey);
  currentOpenid = "openid-d";
  await fn.main({ action: "track", nickname: "小美" });
  const dUser = table("stats_users").get("openid-d");
  dUser.lastDay = tKey; // 用户那天来过，但天表没记
  currentOpenid = adminId;
  const ov3 = await fn.main({ action: "overview" });
  const slot = ov3.days.filter((d) => d.day === tKey)[0];
  ok("天表缺失时用 lastDay 兜底", !!slot && slot.count === 1, slot);

  /* 8. 日键与运行时区无关：不加双份 8 小时 */
  ok("日键 = 北京时间当日", ov3.days[6].day === expectDay(), ov3.days[6]);
  const labels = ov3.days.map((d) => d.label);
  ok("轴标签 M.D 格式", labels.every((l) => /^\d{1,2}\.\d{1,2}$/.test(l)), labels);
  ok("轴标签与 day 对齐", labels[6] === today.split("-")[1].replace(/^0/, "") + "." + today.split("-")[2].replace(/^0/, ""), labels[6]);

  /* 9. 非管理员看不到数据 */
  currentOpenid = "openid-x";
  const ovDeny = await fn.main({ action: "overview" });
  ok("非管理员拒绝查看", ovDeny.ok === false && ovDeny.code === "NO_PERM", ovDeny);

  /* 10. 未知 action */
  const bad = await fn.main({ action: "nope" });
  ok("未知 action 兜底", bad.ok === false && bad.code === "BAD_ACTION");

  /* 11. 源码层面不再有双重 +8h 的老函数 */
  ok("已移除 todayStr 双重时区偏移", SRC.indexOf("todayStr") === -1);
  ok("bumpDay 检查 update 返回值", /stats\.updated/.test(SRC));

  console.log("\n结果：" + pass + " PASS，" + failCount + " FAIL");
  process.exit(failCount ? 1 : 0);
})();

function pastDay(key, count) {
  table("stats_days").set(key, { count: count });
}
