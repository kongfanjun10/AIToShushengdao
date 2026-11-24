/**
 * 小朗读者 ID 仿真
 *  - 首次访问生成 6 位数字 ID，之后永久稳定
 *  - 只清学习记录（learn）保留 ID；恢复出厂（all）重新生成
 *  - 成长档案用户卡展示真实 ID（不再是写死的 849204），点按可复制
 *
 * 运行：node tools/readerid-sim.js
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    console.log("  ✗ " + name + (detail !== undefined ? " —— " + detail : ""));
  }
}

/* ---------------- wx mock（复用 nav-sim 的轻量方案） ---------------- */
const storage = {};
const toasts = [];
const clipboards = [];
let captured = null;
const noop = () => {};
global.wx = new Proxy(
  {
    getStorageSync: (k) => (k in storage ? storage[k] : ""),
    setStorageSync: (k, v) => {
      storage[k] = v;
    },
    removeStorageSync: (k) => {
      delete storage[k];
    },
    getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812 }),
    getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812 }),
    getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, bottom: 80, left: 281, right: 368 }),
    setClipboardData: (o) => {
      clipboards.push(o && o.data);
      o && o.success && o.success({});
    },
    showToast: (o) => toasts.push((o && o.title) || ""),
    pageScrollTo: noop,
    vibrateShort: noop,
    env: { USER_DATA_PATH: "wxfile://usr" },
  },
  { get(t, k) { if (k in t) return t[k]; return noop; } }
);
global.getApp = () => ({ globalData: { statusBarHeight: 44, userInfo: { nickname: "孔老师" } } });
global.getCurrentPages = () => [{}];
global.requirePlugin = () => ({});
global.Page = (opt) => {
  captured = opt;
};

const store = require(path.join(ROOT, "utils", "store.js"));

/** mock 的 setStorageSync 直接存对象；真实环境也是存对象，这里统一取 user */
function storedUser() {
  const raw = storage[store.KEY];
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

console.log("\n[A] ID 生成与稳定");
const id1 = store.readerId();
check("生成 6 位数字 ID（100000~999999）", /^\d{6}$/.test(id1), id1);
check("数值在 6 位范围内", Number(id1) >= 100000 && Number(id1) <= 999999, id1);
const id2 = store.readerId();
check("再次获取不变（永久稳定）", id1 === id2, id1 + " vs " + id2);
check("已写入本地存储", !!storedUser() && storedUser().user.readerId === id1, "storage.user.readerId");
check("不与时间戳前缀雷同（混合了随机数）", id1 !== String(Date.now()).slice(-6), id1);

console.log("\n[B] 清理时的保留策略");
store.setUser({ nickname: "小明", phone: "13800008000" });
store.cleanupApply("learn");
check("只清学习记录：ID 保留", store.readerId() === id1, store.readerId());
store.cleanupApply("all");
const id3 = store.readerId();
check("恢复出厂：重新生成新 ID", /^\d{6}$/.test(id3) && id3 !== id1, id1 + " → " + id3);
check("新 ID 同样稳定", store.readerId() === id3, store.readerId());

console.log("\n[C] 成长档案展示真实 ID");
const archiveFile = path.join(ROOT, "pages", "archive", "archive.js");
delete require.cache[require.resolve(archiveFile)];
captured = null;
require(archiveFile);
const page = Object.assign({}, captured, { data: JSON.parse(JSON.stringify(captured.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};
page.onLoad({});
page.onShow({});
check("页面 data.readerId 与存储一致", page.data.readerId === id3, page.data.readerId);
check("复制动作写入剪贴板", (page.copyReaderId(), clipboards[clipboards.length - 1] === id3), clipboards[clipboards.length - 1]);
check("复制后给提示", toads_len() > 0, toasts.join(","));
function toads_len() {
  return toasts.length;
}

console.log("\n[D] WXML 绑定（不再写死 849204）");
const wxml = fs.readFileSync(path.join(ROOT, "pages", "archive", "archive.wxml"), "utf8");
check("绑定 {{readerId}}", wxml.indexOf("{{readerId}}") > -1, "");
check("绑定复制事件 copyReaderId", wxml.indexOf('bindtap="copyReaderId"') > -1, "");
check("硬编码 849204 已移除", wxml.indexOf("849204") === -1, "");
const js = fs.readFileSync(archiveFile, "utf8");
check("load() 里调用了 store.readerId()", js.indexOf("store.readerId()") > -1, "");

console.log("\n[E] 旧数据兼容（无 readerId 字段的老档案）");
// 模拟「小程序冷启动」：重载 store 模块，让缓存清空、重新从存储读
delete require.cache[require.resolve(path.join(ROOT, "utils", "store.js"))];
const store2 = require(path.join(ROOT, "utils", "store.js"));
storage[store2.KEY] = {
  version: 1,
  user: { nickname: "老用户" },
  groups: [],
  vocab: [],
  stats: { daily: {} },
};
const legacy = store2.readerId();
check("老档案自动补发 ID", /^\d{6}$/.test(legacy), legacy);
check("补发后写回存储", storedUser().user.readerId === legacy, "");

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
