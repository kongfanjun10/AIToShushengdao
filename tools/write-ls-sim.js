/**
 * 文字描写「横屏笔顺教程」链路仿真（Node 环境，无微信真机）
 * 运行：node tools/write-ls-sim.js
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
const inkCtx = makeCtx();
const tutCtx = makeCtx();

/* --- 窗口尺寸（可切换横竖屏） --- */
let WIN = { w: 375, h: 812 };
function capsule() {
  if (WIN.w > WIN.h) return { width: 87, height: 32, top: 6, left: WIN.w - 94, right: WIN.w - 7, bottom: 38 };
  return { width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 };
}

function makeCanvas(ctx, size) {
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    requestAnimationFrame: (cb) => setTimeout(() => cb(), 16),
  };
}

let inkReady = true;
/* 画布尺寸探针：横屏时按页面算出的尺寸返回 */
let probe = () => ({ ink: 294, tut: 0 });
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
  getWindowInfo: () => ({ statusBarHeight: WIN.w > WIN.h ? 0 : 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: WIN.w > WIN.h ? 0 : 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => capsule(),
  nextTick: (cb) => setTimeout(cb, 0),
  onWindowResize() {},
  offWindowResize() {},
  showToast() {},
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  redirectTo() {},
  createSelectorQuery() {
    let sel = "";
    const q = {
      in() {
        return q;
      },
      select(s) {
        sel = s;
        return q;
      },
      fields() {
        return q;
      },
      exec(cb) {
        if (sel === "#tut") {
          return cb && cb(inkReady ? [{ node: makeCanvas(tutCtx), width: probe().tut, height: probe().tut }] : []);
        }
        const s = probe().ink;
        return cb && cb(inkReady ? [{ node: makeCanvas(inkCtx), width: s, height: s }] : []);
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
      // 支持 a.b 点号写法（真实 setData 的语义）
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
  return page;
}

function stroke(page, pts) {
  page.onInkStart({ touches: [{ x: pts[0][0], y: pts[0][1] }] });
  for (let i = 1; i < pts.length; i++) page.onInkMove({ touches: [{ x: pts[i][0], y: pts[i][1] }] });
  page.onInkEnd();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

const strokeLib = require(path.join(ROOT, "utils", "strokeData.js"));
const charLib = require(path.join(ROOT, "utils", "chars.js"));

async function main() {
  /* ---------- 竖屏：默认单栏 ---------- */
  const p = makePage();
  probe = () => (p.data.landscape ? { ink: p.data.ls.ink, tut: p.data.ls.tut } : { ink: 294, tut: 0 });
  p.onLoad({ level: "kid", char: "三" });
  p.onReady();
  check("竖屏模式", p.data.landscape === false);
  const total3 = (strokeLib.getStrokes("三") || []).length;
  check("「三」的笔顺数据已载入", p.data.tut.total === total3 && total3 === 3, p.data.tut.total + " 笔");
  check("竖屏不建教程画布", !p._tutCtx);
  check("竖屏挂起自动演示", p._autoPlay === true);
  check("横屏提示数据就绪", p.data.tutDots.length === 3);

  /* 描两笔，供横屏缩放测试 */
  stroke(p, [[80, 140], [180, 142]]);
  stroke(p, [[100, 200], [160, 202]]);
  const pxBefore = p._paths.map((s) => s.pts.map((q) => [q.x, q.y]));

  /* ---------- 转横屏 ---------- */
  WIN = { w: 812, h: 375 };
  p.onResize({ size: { windowWidth: 812, windowHeight: 375 } });
  await sleep(250);
  check("横屏模式已切换", p.data.landscape === true);
  const ls = p.data.ls;
  check("横屏尺寸为正", ls.ink > 150 && ls.tut > 110 && ls.leftW > 0 && ls.rightW > 0,
    `ink=${ls.ink} tut=${ls.tut} left=${ls.leftW} right=${ls.rightW}`);
  check("横屏高度不超屏", ls.head + ls.bodyH <= 375, `${ls.head}+${ls.bodyH}`);
  check("田字格不超过卡片", ls.ink + ls.cardPad * 2 + ls.toolW <= ls.rightW);
  check("教程格不超过卡片", ls.tut + ls.cardPad * 2 <= ls.leftW);
  check("两块画布都已重建", !!p._ctx && !!p._tutCtx);
  check("教程画布尺寸独立", p._tutSize === p.data.ls.tut, `${p._tutSize} vs ${p.data.ls.tut}`);

  /* 笔迹按比例还原 */
  const ratio = p._w / 294;
  const x0After = p._paths[0].pts[0].x;
  check("笔迹随横屏缩放", Math.abs(x0After - pxBefore[0][0][0] * ratio) < 1.5,
    `${pxBefore[0][0][0]} -> ${x0After.toFixed(1)} (x${ratio.toFixed(2)})`);
  check("缩放后笔画数不变", p._paths.length === 2);

  /* ---------- 自动演示 ---------- */
  check("转横屏后自动演示已启动", p.data.tut.playing === true, String(p.data.tut.playing));
  await sleep(400);
  const midIdx = p._ph.idx;
  const midT = p._ph.t;
  check("演示推进中", p.data.tut.playing === true && (midT > 0 || midIdx > 0), `idx=${midIdx} t=${midT.toFixed(2)}`);
  check("正在绘制笔顺", tutCtx.__ops.filter((o) => o[0] === "lineTo" || o[0] === "arc").length >= 1);
  p.pauseTut();
  check("暂停生效", p.data.tut.playing === false);
  const frozen = p._ph.t;
  await sleep(120);
  check("暂停后不再推进", p._ph.t === frozen);

  /* 手动逐笔 */
  p.tutStep({ currentTarget: { dataset: { d: 1 } } });
  check("下一笔推进", p._ph.idx === Math.min(2, midIdx + 1) && p._ph.t === 1, `idx=${p._ph.idx}`);
  p.tutStep({ currentTarget: { dataset: { d: -1 } } });
  p.tutStep({ currentTarget: { dataset: { d: -1 } } });
  check("上一笔到头不再退", p._ph.idx === 0, String(p._ph.idx));

  /* 完整播完 */
  p.tutReplay();
  await sleep(2600);
  check("演示完整播完并停止", p.data.tut.playing === false && p._ph.idx === 2 && p._ph.t === 1,
    `idx=${p._ph.idx} t=${p._ph.t}`);

  /* ---------- 换字 ---------- */
  p.loadLevel("kid", 0, true); // 「一」
  check("换字后笔顺刷新", p.data.tut.total === 1, String(p.data.tut.total));
  check("换字后旧笔迹按设计清空", p._paths.length === 0, String(p._paths.length));

  /* ---------- 重复回调不重建 ---------- */
  const ctxToken = p._ctx;
  p.onResize({ size: { windowWidth: 812, windowHeight: 375 } });
  await sleep(200);
  check("同尺寸回调不重建画布", p._ctx === ctxToken);

  /* ---------- 转回竖屏 ---------- */
  WIN = { w: 375, h: 812 };
  p.onResize({ size: { windowWidth: 375, windowHeight: 812 } });
  await sleep(250);
  check("转回竖屏", p.data.landscape === false);
  check("竖屏画布恢复", !!p._ctx && !p._tutCtx);

  console.log("---- 通过 " + ok.length + " 项 ----");
  ok.forEach((s) => console.log("  ✓ " + s));
  if (bad.length) {
    console.log("---- 失败 " + bad.length + " 项 ----");
    bad.forEach((s) => console.log("  ✗ " + s));
    process.exit(1);
  }
  console.log("ALL PASS");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
