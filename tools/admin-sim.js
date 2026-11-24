/**
 * 数据后台页逻辑仿真（Node 环境）
 * 运行：node tools/admin-sim.js
 * 覆盖：门禁（无口令/空口令/错口令/对口令）、概览装饰（数字千分位/涨跌/柱高/用户行）、
 *       已存口令自动进入、刷新失败提示、上报静默失败、时间与格式化工具
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

let storage = {};
let cloudHandler = null;
let cloudCalls = [];

global.wx = {
  _s: {},
  getStorageSync(k) {
    return this._s[k] !== undefined ? this._s[k] : "";
  },
  setStorageSync(k, v) {
    this._s[k] = v;
  },
  removeStorageSync(k) {
    delete this._s[k];
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast() {},
  showModal() {},
  showLoading() {},
  hideLoading() {},
  navigateTo() {},
  redirectTo() {},
  navigateBack() {},
  nextTick: (cb) => setTimeout(cb, 0),
  cloud: {
    init() {},
    callFunction(opt) {
      const data = opt.data || {};
      cloudCalls.push(data);
      const r = cloudHandler ? cloudHandler(data) : { ok: false, errMsg: "云未配置" };
      setTimeout(() => {
        if (r && r.__fail) opt.fail && opt.fail({ errMsg: r.__fail });
        else opt.success && opt.success({ result: r });
      }, 0);
    },
  },
};

const page = (() => {
  require(path.join(ROOT, "pages", "admin", "admin.js"));
  const def = captured;
  const p = Object.assign({}, def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = p.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        p.data[k] = obj[k];
      }
    });
  };
  return p;
})();

/** 造一个干净的页面实例（自己的 data + setData） */
function makePage() {
  const p = Object.assign({}, captured);
  p.data = JSON.parse(JSON.stringify(captured.data));
  p.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = p.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        p.data[k] = obj[k];
      }
    });
  };
  return p;
}

const stats = require(path.join(ROOT, "utils", "stats.js"));

let pass = 0;
let failCount = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    failCount++;
    console.log("  FAIL " + name);
  }
}
function reset() {
  cloudCalls = [];
  cloudHandler = null;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

function sampleOverview() {
  const now = Date.now();
  return {
    ok: true,
    generatedAt: now,
    totalLaunches: 1286,
    todayLaunches: 23,
    yesterdayLaunches: 32,
    totalUsers: 4,
    todayUsers: 2,
    todayNewUsers: 1,
    days: [
      { day: "d6", label: "10.30", count: 14 },
      { day: "d5", label: "10.31", count: 21 },
      { day: "d4", label: "11.1", count: 9 },
      { day: "d3", label: "11.2", count: 28 },
      { day: "d2", label: "11.3", count: 17 },
      { day: "d1", label: "11.4", count: 32 },
      { day: "d0", label: "11.5", count: 23 },
    ],
    users: [
      { nickname: "孔老师", ageMode: "primary", phone: "138****8000", phoneBound: true, launches: 214, lastAt: now - 10 * 60e3, todayActive: true },
      { nickname: "果果", ageMode: "kid", phone: "", phoneBound: false, launches: 97, lastAt: now - 86400e3, todayActive: false },
    ],
  };
}

(async () => {
  console.log("== 数据后台仿真（openid 白名单版） ==");

  /* 1. 云不可用：拒绝态并给出原因 */
  reset();
  cloudHandler = () => ({ __fail: "云开发未开通" });
  page.onLoad.call(page, {});
  await tick();
  await tick();
  ok("云不可用进入拒绝态", page.data.phase === "denied" && page.data.deniedText.indexOf("云开发未开通") > -1);

  /* 2. 管理员本人：直接进入看板，数据装饰正确 */
  reset();
  cloudHandler = (d) => {
    if (d.action === "checkAdmin") return { ok: true, isAdmin: true, hasAdmin: true };
    if (d.action === "overview") return sampleOverview();
    return { ok: false };
  };
  page.onLoad.call(page, {});
  await tick();
  await tick();
  ok("管理员直接进入看板", page.data.phase === "in");
  ok("数字千分位", page.data.overview.totalLaunches === "1,286");
  ok("涨跌文案", page.data.overview.diffText === "▼ 较昨日 9");
  ok("7 日柱状图装饰", page.data.overview.days.length === 7 && page.data.overview.days[6].isToday === true && page.data.overview.days[6].h > 0);
  ok("用户行装饰", page.data.overview.users[0].avaChar === "孔" && page.data.overview.users[0].modeText === "小学" && page.data.overview.users[1].modeText === "幼儿园");
  ok("未绑定手机显示", page.data.overview.users[1].phoneBound === false);
  ok("更新时间", page.data.updatedAtText.indexOf("更新于 ") === 0);

  /* 3. 已有管理员但不是当前微信：拒绝且不给口令入口 */
  reset();
  cloudHandler = (d) => (d.action === "checkAdmin" ? { ok: true, isAdmin: false, hasAdmin: true } : { ok: false });
  const p2 = makePage();
  p2.onLoad.call(p2, {});
  await tick();
  ok("非管理员被拒绝", p2.data.phase === "denied" && p2.data.deniedText.indexOf("仅管理员本人") > -1);

  /* 4. 首次使用（还没有管理员）：认领态 */
  reset();
  cloudHandler = (d) => {
    if (d.action === "checkAdmin") return { ok: true, isAdmin: false, hasAdmin: false };
    return { ok: false };
  };
  const p3 = makePage();
  p3.onLoad.call(p3, {});
  await tick();
  ok("首次使用进入认领态", p3.data.phase === "claim");

  /* 5. 认领：空口令 / 错口令 / 对口令 */
  p3.onKeyInput({ detail: { value: "" } });
  p3.submitKey();
  await tick();
  ok("空口令提示", p3.data.keyError === "请输入管理口令");

  reset();
  cloudHandler = (d) => (d.action === "claimAdmin" ? { ok: false, code: "BAD_KEY", errMsg: "管理口令不对" } : { ok: false });
  p3.onKeyInput({ detail: { value: "wrong" } });
  p3.submitKey();
  await tick();
  await tick();
  ok("错口令提示", p3.data.keyError === "管理口令不对" && p3.data.checking === false);

  reset();
  cloudCalls = [];
  cloudHandler = (d) => {
    if (d.action === "claimAdmin") return { ok: true, claimed: true };
    if (d.action === "overview") return sampleOverview();
    return { ok: false };
  };
  p3.onKeyInput({ detail: { value: "k1" } });
  p3.submitKey();
  await tick();
  await tick();
  ok("对口令认领成功进入看板", p3.data.phase === "in" && stats.getAdminKey() === "k1");
  ok("认领动作带上口令", cloudCalls.some((c) => c.action === "claimAdmin" && c.adminKey === "k1"));
  ok("认领后拉取总览不带口令", cloudCalls.some((c) => c.action === "overview" && c.adminKey === undefined));

  /* 6. 认领被拒（管理员已被其他微信占用） */
  reset();
  cloudHandler = (d) => (d.action === "claimAdmin" ? { ok: false, code: "NO_PERM", errMsg: "管理员已设置" } : { ok: false });
  p3.onKeyInput({ detail: { value: "k1" } });
  p3.submitKey();
  await tick();
  await tick();
  ok("认领被拒提示", p3.data.keyError === "管理员已被其他微信认领");

  /* 7. 看板内刷新失败提示 */
  reset();
  cloudHandler = (d) => (d.action === "checkAdmin" ? { ok: true, isAdmin: true, hasAdmin: true } : { __fail: "网络开小差" });
  const p4 = makePage();
  p4.onLoad.call(p4, {});
  await tick();
  await tick();
  ok("刷新失败提示", p4.data.loadErr === "网络开小差" && p4.data.loading === false);

  /* 8. 刷新时身份被取消：回到拒绝态 */
  reset();
  cloudHandler = (d) => (d.action === "overview" ? { ok: false, code: "NO_PERM", errMsg: "仅管理员本人可以查看" } : { ok: false });
  p4.refresh();
  await tick();
  await tick();
  ok("身份失效回到拒绝态", p4.data.phase === "denied");

  /* 9. 上报静默失败：track/bindPhone 不抛错 */
  delete wx.cloud;
  let threw = false;
  try {
    await stats.track("孔老师", "primary");
    await stats.bindPhone("13800008000", "manual", "孔老师");
  } catch (e) {
    threw = true;
  }
  ok("上报静默失败", threw === false);

  /* 10. lastText / fmtNum / fmtClock */
  const now = Date.now();
  ok("lastText 刚刚", stats.lastText(now - 10e3) === "刚刚");
  ok("lastText 分钟", stats.lastText(now - 5 * 60e3) === "5 分钟前");
  ok("lastText 小时", stats.lastText(now - 3 * 3600e3) === "3 小时前");
  ok("lastText 昨天", stats.lastText(now - 86400e3 - 60e3) === "昨天");
  ok("lastText 日期", stats.lastText(new Date(2026, 10, 2, 9, 0).getTime()) === "11月2日");
  ok("fmtNum", stats.fmtNum(1286) === "1,286" && stats.fmtNum(0) === "0" && stats.fmtNum("x") === "0");
  ok("fmtClock", /^\d{2}:\d{2}$/.test(stats.fmtClock(now)));

  console.log("\n结果：" + pass + " PASS，" + failCount + " FAIL");
  process.exit(failCount ? 1 : 0);
})();
