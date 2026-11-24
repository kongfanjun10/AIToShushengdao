/**
 * 文字描写「笔迹保存 → 回看恢复」链路仿真（Node 环境，无微信真机）
 * 运行：node tools/trace-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

/* --- 录制型 2d context --- */
function makeCtx() {
  const ops = [];
  const handler = {
    get(target, prop) {
      if (prop === "__ops") return ops;
      if (prop in target) return target[prop];
      return (...args) => {
        ops.push([prop, args.length]);
      };
    },
    set(target, prop, v) {
      target[prop] = v;
      return true;
    },
  };
  return new Proxy({}, handler);
}
const ctx = makeCtx();
let canvasReady = true;

global.wx = {
  _storage: {},
  getStorageSync(k) {
    return this._storage[k] || "";
  },
  setStorageSync(k, v) {
    this._storage[k] = v;
  },
  removeStorageSync(k) {
    delete this._storage[k];
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast() {},
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  redirectTo() {},
  stopSpeak() {},
  createSelectorQuery() {
    const q = {
      in() {
        return q;
      },
      select() {
        return q;
      },
      fields() {
        return q;
      },
      exec(cb) {
        if (!canvasReady) return cb && cb([]);
        cb &&
          cb([
            {
              node: { width: 0, height: 0, getContext: () => ctx },
              width: 294,
              height: 294,
            },
          ]);
      },
    };
    return q;
  },
};

function makePage() {
  const file = path.join(ROOT, "pages", "write", "write.js");
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = Object.assign({}, captured.data);
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      page.data[k] = obj[k];
    });
  };
  return page;
}

function stroke(page, pts) {
  page.onInkStart({ touches: [{ x: pts[0][0], y: pts[0][1] }] });
  for (let i = 1; i < pts.length; i++) page.onInkMove({ touches: [{ x: pts[i][0], y: pts[i][1] }] });
  page.onInkEnd();
}

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

/* ---------- 第一遍：写字并保存 ---------- */
const store = require(path.join(ROOT, "utils", "store.js"));
const charLib = require(path.join(ROOT, "utils", "chars.js"));
const lv = charLib.getLevel("kid");
const firstChar = lv.chars[0].c; // 「一」

const p1 = makePage();
p1.onLoad({});
p1.onReady();
check("画布初始化", !!p1._ctx);
check("初始无回看态", p1.data.reviewing === false);

stroke(p1, [[80, 140], [120, 142], [180, 140], [230, 141]]);
stroke(p1, [[100, 200], [160, 202], [220, 200]]);
check("描了两笔", p1._paths.length === 2, String(p1._paths.length));
check("撤销可用", p1.data.canUndo === true);

p1.markDone();
const tr1 = store.getTrace(firstChar);
console.log("[debug] p1 char:", p1.data.char.c, "| saved:", JSON.stringify(tr1));
check("字已打勾", store.isWritten(firstChar) === true);
const tr = store.getTrace(firstChar);
check("笔迹已保存", !!tr && tr.paths.length === 2, tr ? tr.paths.length + " 笔" : "无");
check("保存后进入回看态收尾", p1._baseCount === 2);

setTimeout(() => {
  /* ---------- 第二遍：重新进入页面回看 ---------- */
  canvasReady = true;
  const p2 = makePage();
  p2.onLoad({ char: firstChar });
  console.log("[debug] pending:", JSON.stringify(p2._pendingTrace), "| ctx:", !!p2._ctx);
  check("画布未就绪时挂起笔迹", !!p2._pendingTrace, p2._pendingTrace ? "pending" : "无");
  p2.onReady();
  console.log("[debug] reviewing:", p2.data.reviewing, "| paths:", JSON.stringify(p2._paths), "| w:", p2._w);
  check("回看态已恢复", p2.data.reviewing === true, String(p2.data.reviewing));
  check("笔迹笔画数一致", p2._paths.length === 2, String(p2._paths.length));
  check("坐标按比例还原", Math.abs(p2._paths[0].pts[0].x - (80 / 294) * p2._w) < 1.5, p2._paths[0].pts[0].x.toFixed(1));
  const drawOps = ctx.__ops.filter((o) => o[0] === "quadraticCurveTo" || o[0] === "lineTo" || o[0] === "arc");
  check("笔迹重新绘制到画布", drawOps.length >= 2, drawOps.length + " 个绘制指令");

  /* ---------- 撤销保护：回看态不能撤掉已保存的笔画 ---------- */
  const before = p2._paths.length;
  p2.undo();
  check("回看态撤销被拦截", p2._paths.length === before, String(p2._paths.length));

  /* ---------- 重新描写 ---------- */
  p2.restartInk();
  check("重新描写清空画布", p2._paths.length === 0 && p2.data.reviewing === false);
  check("旧笔迹仍保留在存储里", (store.getTrace(firstChar) || {}).paths !== undefined);

  /* ---------- 清空后直接退出不覆盖旧笔迹 ---------- */
  stroke(p2, [[10, 10], [50, 12]]);
  check("重描后可撤销", p2.data.canUndo === true);

  /* ---------- 存储体积 ---------- */
  const raw = JSON.stringify(global.wx._storage);
  check("存储体积 < 200KB", raw.length < 200 * 1024, (raw.length / 1024).toFixed(1) + "KB");

  console.log("---- 通过 " + ok.length + " 项 ----");
  ok.forEach((s) => console.log("  ✓ " + s));
  if (bad.length) {
    console.log("---- 失败 " + bad.length + " 项 ----");
    bad.forEach((s) => console.log("  ✗ " + s));
    process.exit(1);
  }
  console.log("ALL PASS");
  process.exit(0);
}, 700);
