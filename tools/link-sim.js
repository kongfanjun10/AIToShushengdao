/**
 * 图案与数字连线页逻辑仿真（Node 环境）
 * 运行：node tools/link-sim.js
 * 覆盖：十格阵、出轮（左右列同集合/互不重复）、选择与判分、连线记录、抖动、轮完成、难度持久化、统计
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
});

global.wx = {
  _s: {},
  _toast: "",
  getStorageSync(k) {
    return this._s[k] || "";
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
  showToast(o) {
    this._toast = (o && o.title) || "";
  },
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  navigateTo() {},
  createInnerAudioContext: () => ({
    play() {},
    stop() {},
    destroy() {},
    onEnded() {},
    onError() {},
  }),
  createSelectorQuery() {
    // 按真实语义：select 压栈，exec 一次性返回所有 rect
    const rects = [];
    function rectFor(sel) {
      let m;
      if (sel && (m = /^#lc-(\d+)$/.exec(sel))) {
        const i = Number(m[1]);
        return { left: 30, top: 200 + i * 96, width: 150, height: 80 };
      }
      if (sel && (m = /^#rc-(\d+)$/.exec(sel))) {
        const i = Number(m[1]);
        return { left: 220, top: 200 + i * 84, width: 64, height: 50 };
      }
      if (sel === "#board") return { left: 20, top: 180, width: 335, height: 420 };
      return null;
    }
    const q = {
      in() {
        return q;
      },
      select(s) {
        rects.push(rectFor(s));
        return q;
      },
      boundingClientRect() {
        return q;
      },
      exec(cb) {
        return cb && cb(rects.slice());
      },
    };
    return q;
  },
};

function makePage() {
  const file = path.join(ROOT, "pages", "link", "link.js");
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
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

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = require(path.join(ROOT, "utils", "store.js"));
const link = require(path.join(ROOT, "utils", "link.js"));

const tapL = (i) => ({ currentTarget: { dataset: { i } } });

async function main() {
  store.resetAll();
  delete wx._s[store.KEY];

  /* ---------- 1. utils/link.js ---------- */
  check("十格阵 frame(7) = 5+2", JSON.stringify(link.frame(7)) === "[[1,1,1,1,1],[1,1,0,0,0]]", JSON.stringify(link.frame(7)));
  check(
    "十格阵 frame(20) 四行满格",
    link.frame(20).length === 4 && link.frame(20).every((row) => row.reduce((a, b) => a + b, 0) === 5)
  );
  check("补齐行数 frame(3,2)：空行占位等高", JSON.stringify(link.frame(3, 2)) === "[[1,1,1,0,0],[0,0,0,0,0]]", JSON.stringify(link.frame(3, 2)));
  check("三档各有一种小动物且互不相同", link.LEVELS[0].animal !== link.LEVELS[1].animal && link.LEVELS[1].animal !== link.LEVELS[2].animal && link.LEVELS.every((l) => !!l.animal));
  check("edgeOf 左卡取右边缘中点", link.edgeOf({ left: 0, top: 0, width: 100, height: 50 }, "L").x === 100 && link.edgeOf({ left: 0, top: 0, width: 100, height: 50 }, "L").y === 25);
  check("edgeOf 右卡取左边缘中点", link.edgeOf({ left: 200, top: 0, width: 60, height: 40 }, "R").x === 200);
  check("默认难度 10 以内", link.levelOf("nope").key === "l10");
  const rectA = { left: 0, top: 0, width: 100, height: 50 };
  const rectB = { left: 200, top: 100, width: 60, height: 40 };
  check("hitRect 命中第 2 个", link.hitRect([rectA, rectB], 210, 110) === 1);
  check("hitRect 外扩容错", link.hitRect([rectA, rectB], 205, 95, 8) === 1);
  check("hitRect 未命中返回 -1", link.hitRect([rectA, rectB], 150, 10) === -1);
  const geom = link.lineGeom(0, 0, 30, 40);
  check("lineGeom 长度/角度", Math.abs(geom.len - 50) < 0.01 && Math.abs(geom.ang - 53.13) < 0.1);

  // 出轮性质：30 轮，数字都在界内、左右列是同一组数、无重复
  let okGen = true;
  for (let i = 0; i < 30; i++) {
    const r = link.gen("l10");
    const nums = r.left.map((x) => x.n);
    if (nums.length !== r.total) okGen = false;
    if (new Set(nums).size !== nums.length) okGen = false;
    if (nums.some((n) => n < 3 || n > 10)) okGen = false;
    const rSet = r.right.map((x) => x.n).sort().join(",");
    if (rSet !== nums.slice().sort().join(",")) okGen = false;
    r.left.forEach((x) => {
      const cnt = x.cells.reduce((a, row) => a + row.reduce((p, c) => p + c, 0), 0);
      if (cnt !== x.n) okGen = false;
      if (!x.animal) okGen = false;
      if (x.cells.length !== 2) okGen = false; // l10 档统一 2 行 → 卡片等高
    });
  }
  check("30 轮出题：界内/去重/左右同集合/点数一致", okGen);

  /* ---------- 2. 页面流程 ---------- */
  const p = makePage();
  p.onLoad({});
  check("初始右列数字与左列同集合", JSON.stringify(p.data.right.map((x) => x.n).sort()) === JSON.stringify(p.data.left.map((x) => x.n).sort()));
  check("初始无可选", p.data.selSide === "" && p.data.matchedCount === 0);
  check("l10 档卡片统一高度 128rpx", p.data.cardH === 128, String(p.data.cardH));
  check("本轮动物与难度档一致", p.data.left.every((x) => x.animal === link.levelOf(p.data.levelKey).animal));

  // 选择 → 取消
  p.tapLeft(tapL(0));
  check("点左列进入选中态", p.data.selSide === "L" && p.data.selIdx === 0);
  p.tapLeft(tapL(0));
  check("再点一次取消", p.data.selSide === "" && p.data.selIdx === -1);

  // 连错：找一个不匹配的组合
  const l0 = p.data.left[0].n;
  const wrongR = p.data.right.findIndex((x) => x.n !== l0);
  p.tapLeft(tapL(0));
  p.tapRight(tapL(wrongR));
  check("连错：不标记完成", !p.data.matchedL[0] && !p.data.matchedR[wrongR]);
  check("连错：计今日错 1", p.data.stats.todayWrong === 1, String(p.data.stats.todayWrong));
  check("连错：选择清空", p.data.selSide === "");
  await sleep(500);
  check("连错：抖动复位", p.data.shakeL === -1 && p.data.shakeR === -1);

  // 连对：构造找匹配
  const want = p.data.left[0].n;
  const hitR = p.data.right.findIndex((x) => x.n === want);
  p.tapLeft(tapL(0));
  p.tapRight(tapL(hitR));
  check("连对：两侧标记完成", p.data.matchedL[0] === true && p.data.matchedR[hitR] === true);
  check("连对：今日对 +1", p.data.stats.todayRight === 1, String(p.data.stats.todayRight));
  await sleep(60);
  check("连对：连线已记录", p.data.lines.length === 1 && p.data.lines[0].len > 0, JSON.stringify(p.data.lines[0] || {}));
  // 连线两端都落在卡片边缘：起点 = 左卡右边缘(160)，终点 x = 右卡左边缘(220-20=200)
  check("连线起点在左卡右边缘", p.data.lines[0].x === 160, String(p.data.lines && p.data.lines[0] && p.data.lines[0].x));
  check("连线终点在右卡左边缘", Math.abs(p.data.lines[0].x + p.data.lines[0].len * Math.cos((p.data.lines[0].ang * Math.PI) / 180) - 200) < 0.6, String(p.data.lines[0].x + p.data.lines[0].len * Math.cos((p.data.lines[0].ang * Math.PI) / 180)));
  const stAfter = store.linkStats();
  check("连对：看板持久化", stAfter.todayRight === 1);

  // 已完成项再点不响应
  p.tapLeft(tapL(0));
  check("已完成项不可再选", p.data.selSide === "");

  // 反向操作：先右后左
  const want2 = p.data.left[1].n;
  const hit2 = p.data.right.findIndex((x) => x.n === want2);
  p.tapRight(tapL(hit2));
  check("先右后左也能选中", p.data.selSide === "R");
  p.tapLeft(tapL(1));
  check("反向连对成功", p.data.matchedL[1] === true && p.data.matchedR[hit2] === true);

  /* ---------- 2.5 拖拽连线 ---------- */
  p.cacheRects();
  check("卡片位置已缓存", !!p._box && (p._rectL || []).length === p.data.left.length && (p._rectR || []).length === p.data.right.length);

  const li2 = p.data.left.findIndex((x, i) => !p.data.matchedL[i]);
  const ri2 = p.data.right.findIndex((x) => x.n === p.data.left[li2].n);
  const grab = (side, i, x, y) => ({ currentTarget: { dataset: { side, i } }, touches: [{ clientX: x, clientY: y }] });
  p.onGrab(grab("L", li2, 60, 320));
  check("按住卡片出现拖拽线", !!p.data.drag && p.data.actSide === "L" && p.data.actIdx === li2);
  // 连线起点在左卡右边缘（rect.right - board.left = 30+150-20 = 160），而不是卡片中心
  check("拖拽线从卡片右边缘出发", p.data.drag.x === 160 && p.data.drag.y === 200 + li2 * 96 + 40 - 180, JSON.stringify(p.data.drag));
  const expLen = Math.hypot(200 - 20 - 160, 350 - 180 - (200 + li2 * 96 + 40 - 180));
  p.onDragMove({ touches: [{ clientX: 200, clientY: 350 }] });
  check("拖动时连线跟着手指变长", Math.abs(p.data.drag.len - expLen) < 1 && p.data.drag.len > 0, String(Math.round(p.data.drag.len)) + " (期望 " + Math.round(expLen) + ")");
  const rc = p._rectR[ri2];
  const endAt = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }] });
  p.onDragEnd(endAt(rc.left + rc.width / 2, rc.top + rc.height / 2));
  check("拖到对应数字即连对", p.data.matchedL[li2] === true && p.data.matchedR[ri2] === true);
  check("松手后拖拽线清除", p.data.drag === null && p.data.actSide === "" && p.data.actIdx === -1);

  // 拖错 / 拖空 / 轻点 / 反向拖：用一局全新的棋盘测，避免受上面已连对影响
  const p2 = makePage();
  p2.onLoad({});
  p2.cacheRects();
  const liBad = 0;
  const riBad = p2.data.right.findIndex((x) => x.n !== p2.data.left[liBad].n);
  p2.onGrab(grab("L", liBad, 60, 320));
  p2.onDragMove({ touches: [{ clientX: 230, clientY: 360 }] });
  const rb = p2._rectR[riBad];
  p2.onDragEnd(endAt(rb.left + 4, rb.top + 4));
  check("拖错：抖动提示两侧", p2.data.shakeL === liBad && p2.data.shakeR === riBad);
  check("拖错：不标记连线", !p2.data.matchedL[liBad] && !p2.data.matchedR[riBad]);
  await sleep(500);

  // 拖到卡片外面松手 → 取消，不判分
  const matchedBefore = Object.keys(p2.data.matchedL).length;
  p2.onGrab(grab("L", liBad, 60, 430));
  p2.onDragMove({ touches: [{ clientX: 120, clientY: 470 }] });
  p2.onDragEnd(endAt(5, 5));
  check("拖到空白处松手：不判分", Object.keys(p2.data.matchedL).length === matchedBefore && p2.data.drag === null);

  // 轻点（没拖动）→ 退回点选玩法
  p2.onGrab(grab("L", liBad, 80, 440));
  p2.onDragEnd(endAt(80, 440));
  check("轻点仍可点选（兜底玩法）", p2.data.selSide === "L" && p2.data.selIdx === liBad);
  p2.setData({ selSide: "", selIdx: -1 });

  // 反向拖：从数字拖回点阵
  const riRev = 0;
  const liRev = p2.data.left.findIndex((x) => x.n === p2.data.right[riRev].n);
  p2.onGrab(grab("R", riRev, 250, 300));
  check("从数字侧也能拉出线", p2.data.actSide === "R" && p2.data.actIdx === riRev);
  p2.onDragMove({ touches: [{ clientX: 120, clientY: 320 }] });
  const lc = p2._rectL[liRev];
  p2.onDragEnd(endAt(lc.left + lc.width / 2, lc.top + lc.height / 2));
  check("反向拖拽连对成功", p2.data.matchedL[liRev] === true && p2.data.matchedR[riRev] === true);

  // 剩余全部连对 → 一轮完成
  for (let li = 0; li < p.data.left.length; li++) {
    if (p.data.matchedL[li]) continue;
    const n = p.data.left[li].n;
    const ri = p.data.right.findIndex((x) => x.n === n);
    p.tapLeft(tapL(li));
    p.tapRight(tapL(ri));
  }
  check("全部连对后轮数 +1", p.data.doneRounds === 1, String(p.data.doneRounds));
  await sleep(1800);
  check("自动进入下一轮（换新数据）", p.data.matchedCount === 0 && p.data.lines.length === 0 && p.data.round === 2);

  /* ---------- 3. 难度 ---------- */
  p.pickLevel({ currentTarget: { dataset: { key: "l20" } } });
  check("难度已切换", p.data.levelKey === "l20");
  check("难度已持久化", store.linkLevel() === "l20");
  check("新轮数字在 10~20", p.data.left.every((x) => x.n >= 10 && x.n <= 20), JSON.stringify(p.data.left.map((x) => x.n)));
  p.pickLevel({ currentTarget: { dataset: { key: "l5" } } });
  check("5 以内档点数界内", p.data.left.every((x) => x.n >= 2 && x.n <= 5));

  /* ---------- 4. 清理 ---------- */
  p.onUnload();
  check("onUnload 不抛错", true);

  console.log("\n结果: " + ok.length + " 通过, " + bad.length + " 失败");
  if (bad.length) {
    bad.forEach((b) => console.log("  ✗ " + b));
    process.exit(1);
  }
}

main();
