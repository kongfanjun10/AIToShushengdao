/**
 * 宠物学伴 + 换字动效 + 音标口舌图 仿真测试（Node 环境）
 * 运行：node tools/pet-mouth-sim.js
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
  return new Proxy(
    {},
    {
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
    }
  );
}
const inkCtx = makeCtx();
const mouthCtx = makeCtx();

const WIN = { w: 375, h: 812 };
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
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
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
    let rectCb = null;
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
      boundingClientRect(cb) {
        rectCb = cb;
        return q;
      },
      exec(cb) {
        if (sel === "#mouth") {
          // 旧版 canvas：只需要尺寸，画布上下文由 createCanvasContext 提供
          return rectCb && rectCb({ width: 150, height: 120 });
        }
        return cb && cb([{ node: { width: 0, height: 0, getContext: () => inkCtx }, width: 294, height: 294 }]);
      },
    };
    return q;
  },
  createCanvasContext: () => mouthCtx,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makePage(file) {
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      // 支持 "a.b" 点号路径
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        page.data[k] = obj[k];
      }
    });
  };
  return page;
}

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : ""));
  }
}

(async () => {
  const store = require(path.join(ROOT, "utils", "store.js"));
  const mouthChart = require(path.join(ROOT, "utils", "mouthChart.js"));
  const phonetics = require(path.join(ROOT, "utils", "phonetics.js"));

  /* ================= 描写页：宠物 + 换字动效 ================= */
  console.log("\n[描写页] 宠物学伴");
  const writePage = makePage(path.join(ROOT, "pages", "write", "write.js"));
  const p = writePage;
  p.onLoad({});
  check("默认宠物小鸡", p.data.petSkin === "chick", p.data.petSkin);
  check("宠物初始 idle 态", p.data.petState === "idle", p.data.petState);

  p.cyclePet();
  check("点一下换成小狐狸", p.data.petSkin === "fox", p.data.petSkin);
  check("皮肤已持久化", store.getUser().pet === "fox", store.getUser().pet);
  p.cyclePet();
  check("再点换成小青蛙", p.data.petSkin === "frog", p.data.petSkin);
  p.cyclePet();
  check("循环回小鸡", p.data.petSkin === "chick", p.data.petSkin);

  console.log("\n[描写页] 换字动效序列");
  p.onReady();
  p._paths = [{ w: 24, pts: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }];
  p._w = 294;
  p._h = 294;
  const firstIdx = p.data.index;
  const firstChar = p.data.char.c;
  p.markDone();
  check("点完成 → 宠物庆祝", p.data.petState === "cheer", p.data.petState);
  check("笔迹已保存", !!store.getTrace(firstChar));
  check("当前字已打勾", !!store.writtenMap()[firstChar]);
  await sleep(700);
  check("庆祝后 → 宠物飞走", p.data.petState === "fly", p.data.petState);
  check("旧字滑出动画", p.data.swap === "out", p.data.swap);
  await sleep(420);
  check("已切到下一个字", p.data.index === firstIdx + 1, p.data.index + "/" + firstIdx);
  check("宠物回到 idle", p.data.petState === "idle", p.data.petState);
  check("新字滑入动画", p.data.swap === "in", p.data.swap);
  await sleep(560);
  check("动画类已复位", p.data.swap === "", p.data.swap);

  /* ================= 音标页：口舌图 ================= */
  console.log("\n[音标页] 口型舌位图");
  let drawCalls = [];
  const origDraw = mouthChart.draw;
  mouthChart.draw = (...a) => {
    drawCalls.push(a[3]);
    return origDraw.apply(null, a);
  };
  const q = makePage(path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.js"));
  // 音标页默认组已改为「全部」总览（不画口舌图）；单音标模式需显式传组
  q.onLoad({ group: "v-long" });
  q.onReady();
  await sleep(20);
  check("进入页面画出当前音标口舌图", drawCalls.includes(q.data.item.id), drawCalls.join(","));
  check("口型提示已注入视图", !!q.data.mouthHint, q.data.mouthHint);
  check("48 个音标都有口型提示", phonetics.all().every((it) => (mouthChart.params(it.id) || {}).hint));

  drawCalls = [];
  const before = q.data.item.id;
  q.nextItem();
  await sleep(10);
  check("下一个音标重画口舌图", drawCalls.includes(q.data.item.id) && q.data.item.id !== before, drawCalls.join(","));

  drawCalls = [];
  q.pickGroup({ currentTarget: { dataset: { key: "c-nasal" } } });
  await sleep(10);
  check("切分类重画口舌图", drawCalls.length > 0, String(drawCalls.length));
  check("鼻音分类的提示含鼻音要点", /鼻子/.test(q.data.mouthHint), q.data.mouthHint);
  q.pickItem({ currentTarget: { dataset: { id: "/ŋ/" } } });
  check("总览点选更新口型提示", /舌后部/.test(q.data.mouthHint), q.data.mouthHint);

  mouthChart.draw = origDraw;
  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
