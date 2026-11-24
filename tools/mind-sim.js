/**
 * 思维游戏页（迷宫 + 方块滑块）逻辑仿真（Node 环境）
 * 运行：node tools/mind-sim.js
 * 覆盖：迷宫生成连通性、撞墙、走到终点过关、难度切换、滑块合法性、复原判分、最少步数记录
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
  vibrateShort() {
    this._vibrate = (this._vibrate || 0) + 1;
  },
  vibrateLong() {},
  navigateBack() {},
  navigateTo() {},
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
        cb && cb([]); // 无 canvas 环境：页面只保留绘制指令
      },
    };
    return q;
  },
  createInnerAudioContext: () => ({
    play() {},
    stop() {},
    destroy() {},
    onEnded() {},
    onError() {},
  }),
};

function makePage() {
  const file = path.join(ROOT, "pages", "mind", "mind.js");
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
const mind = require(path.join(ROOT, "utils", "mind.js"));
const mazeDraw = require(path.join(ROOT, "utils", "mazeDraw.js"));

const tap = (i) => ({ currentTarget: { dataset: { i } } });

/** BFS：迷宫从 (1,1) 能否走到 (size-2,size-2) */
function reachable(g) {
  const n = g.length;
  const seen = {};
  const queue = [[1, 1]];
  seen["1,1"] = true;
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === n - 2 && c === n - 2) return true;
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
      if (g[nr][nc] === 1 || seen[nr + "," + nc]) return;
      seen[nr + "," + nc] = true;
      queue.push([nr, nc]);
    });
  }
  return false;
}

/** BFS 找最短路径方向序列 */
function solvePath(g) {
  const n = g.length;
  const prev = {};
  const queue = [[1, 1]];
  prev["1,1"] = null;
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === n - 2 && c === n - 2) break;
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
      if (g[nr][nc] === 1 || prev[nr + "," + nc] !== undefined) return;
      prev[nr + "," + nc] = [r, c];
      queue.push([nr, nc]);
    });
  }
  // 回溯出移动序列（从终点回到起点再反转）
  const moves = [];
  let cur = [n - 2, n - 2];
  while (prev[cur[0] + "," + cur[1]]) {
    const [pr, pc] = prev[cur[0] + "," + cur[1]];
    moves.unshift([cur[0] - pr, cur[1] - pc]);
    cur = [pr, pc];
  }
  return moves;
}

async function main() {
  store.resetAll();
  delete wx._s[store.KEY];

  /* ---------- 1. 迷宫生成 ---------- */
  let allOk = true;
  for (const key of ["mz5", "mz7", "mz9"]) {
    for (let i = 0; i < 10; i++) {
      const lv = mind.mazeLevelOf(key);
      const g = mind.genMaze(lv.size);
      if (g.length !== lv.size) allOk = false;
      if (!reachable(g)) allOk = false;
      // 边界全是墙
      for (let c = 0; c < g.length; c++) {
        if (g[0][c] !== 1 || g[g.length - 1][c] !== 1) allOk = false;
      }
    }
  }
  check("三档迷宫 30 次：尺寸/连通/边界封闭", allOk);

  /* ---------- 2. 方块工具 ---------- */
  check("blockNeighbors 角 2 / 边 3 / 心 4", mind.blockNeighbors(0).length === 2 && mind.blockNeighbors(1).length === 3 && mind.blockNeighbors(4).length === 4);
  check("完成态判定", mind.blocksSolved([1, 2, 3, 4, 5, 6, 7, 8, 0]) && !mind.blocksSolved([2, 1, 3, 4, 5, 6, 7, 8, 0]));
  let solvable = true;
  for (let i = 0; i < 20; i++) {
    const r = mind.shuffleBlocks();
    if (r.tiles.slice().sort().join(",") !== "0,1,2,3,4,5,6,7,8") solvable = false;
    if (mind.blocksSolved(r.tiles)) solvable = false;
  }
  check("20 次打乱：数字齐全且不落在完成态", solvable);
  const mv = mind.moveBlock([1, 2, 3, 4, 5, 6, 7, 0, 8], 7, 8);
  check("相邻滑块合法移动", mv.moved && mv.tiles[7] === 8 && mv.tiles[8] === 0 && mv.blank === 8);
  const mvBad = mind.moveBlock([1, 2, 3, 4, 5, 6, 7, 0, 8], 7, 0);
  check("不相邻移动被拒绝", mvBad.moved === false);

  /* ---------- 2.5 拖动交互工具 ---------- */
  check(
    "snapDir 判主方向",
    mind.snapDir(30, 5) === "r" && mind.snapDir(-30, 5) === "l" && mind.snapDir(3, 40) === "d" && mind.snapDir(-2, -40) === "u"
  );
  check("snapDir 位移过小返回 null", mind.snapDir(3, 4) === null && mind.snapDir(3, 4, 2) === "d");
  check("stepIndex 走一格 / 越界", mind.stepIndex(0, "r") === 1 && mind.stepIndex(0, "d") === 3 && mind.stepIndex(0, "u") === -1 && mind.stepIndex(8, "d") === -1);
  check("dirOffset 位移量", JSON.stringify(mind.dirOffset("l")) === '{"dr":0,"dc":-1}' && JSON.stringify(mind.dirOffset("d")) === '{"dr":1,"dc":0}');
  check("dirToBlank 同行/同列/斜角", mind.dirToBlank(0, 2) === "r" && mind.dirToBlank(6, 0) === "u" && mind.dirToBlank(0, 4) === null);

  /* ---------- 2.6 迷宫拖动走位 dragStep ---------- */
  check("dragStep 位移不足返回 null", mind.dragStep(0, 0, 10, 4, 40) === null);
  const ds = mind.dragStep(100, 100, 130, 104, 40);
  check("dragStep 够大半格 → 方向 + 新参照点", !!ds && ds.dir === "r" && ds.x === 130 && ds.y === 104, JSON.stringify(ds));
  check("dragStep 按主方向判定", mind.dragStep(0, 0, 5, -30, 40).dir === "u" && mind.dragStep(0, 0, -30, 5, 40).dir === "l");
  check(
    "dragStep 小格子时阈值保底 16px",
    mind.dragStep(0, 0, 15, 0, 10) === null && mind.dragStep(0, 0, 17, 0, 10).dir === "r"
  );

  /* ---------- 2.8 迷宫绘制（练习册风格，utils/mazeDraw.js） ---------- */
  // 死胡同数量随机（7×7 完美迷宫最多 2 个）：多抽几局，避免偶发「一个死胡同都没有」导致误报
  let g7 = mind.genMaze(7);
  let de = mazeDraw.deadEnds(g7, [{ r: 1, c: 1 }, { r: 5, c: 5 }]);
  for (let i = 0; i < 60 && de.length < 2; i++) {
    g7 = mind.genMaze(7);
    de = mazeDraw.deadEnds(g7, [{ r: 1, c: 1 }, { r: 5, c: 5 }]);
  }
  const runs = mazeDraw.wallRuns(g7);
  check("墙条合并：每条 run 至少占 1 格", runs.length > 0 && runs.every((r) => Math.abs(r.x2 - r.x1) > 0.01 || Math.abs(r.y2 - r.y1) > 0.01));
  check("墙条同时含横竖两种", runs.some((r) => r.y1 === r.y2) && runs.some((r) => r.x1 === r.x2));
  check("死胡同检测：都是路且只对一个开口", de.length > 0 && de.every((p) => g7[p.r][p.c] === 0));
  const pal = mazeDraw.palOf(0);
  const ops = mazeDraw.paintOps(g7, {
    cell: 20,
    pal: pal,
    entrance: { r: 0, c: 1 },
    exit: { r: 5, c: 5 },
    player: { r: 1, c: 1 },
    goal: { r: 5, c: 5 },
    decor: mazeDraw.decorate(de.slice(0, 3)),
  });
  check("paintOps 含画布尺寸", ops[0].t === "meta" && ops[0].w > 20 * 7 && ops[0].w < 20 * 9.2);
  check("paintOps 墙条两遍描边", ops.filter((o) => o.t === "line").length >= runs.length * 2);
  check("paintOps 有果点", ops.some((o) => o.t === "circle"));
  check("paintOps 红进蓝出两支箭头", ops.some((o) => o.t === "tri" && o.fill === "#e8524a") && ops.some((o) => o.t === "tri" && o.fill === "#3a5fa8"));
  check("paintOps 有小人/终点/装饰 emoji", ops.some((o) => o.t === "text" && o.s === "🧒") && ops.some((o) => o.t === "text" && o.s === "🎯") && ops.some((o) => o.t === "text" && o.s !== "🧒" && o.s !== "🎯"));
  // 过关后小人隐藏
  const opsDone = mazeDraw.paintOps(g7, { cell: 20, pal: pal, player: null, goal: { r: 5, c: 5 }, decor: [] });
  check("过关后只画终点不画小人", !opsDone.some((o) => o.t === "text" && o.s === "🧒") && opsDone.some((o) => o.t === "text" && o.s === "🎯"));
  const svg = mazeDraw.opsToSvg(ops);
  check("opsToSvg 可转 SVG", svg.indexOf("<svg") === 0 && svg.indexOf("<line") > -1 && svg.indexOf("<text") > -1);
  check("三套配色轮换", mazeDraw.palOf(0).key !== mazeDraw.palOf(1).key && mazeDraw.palOf(1).key !== mazeDraw.palOf(2).key && mazeDraw.palOf(3).key === mazeDraw.palOf(0).key);

  /* ---------- 3. 迷宫页流程 ---------- */
  const p = makePage();
  p.onLoad({});
  await sleep(120); // 等 renderMazeCanvas 的 setTimeout
  check("默认中迷宫 13×13", p.data.maze.length === 13 && p.data.mazeKey === "mz7");
  check("起点在 (1,1)", p.data.player.r === 1 && p.data.player.c === 1);
  check("canvas 尺寸已计算", p.data.cvW > 0 && Math.abs(p.data.cvH - p.data.cvW) < 0.01, String(p.data.cvW));
  check("主题名已设置", !!p.data.palName, p.data.palName);
  check("绘制指令已生成", Array.isArray(p._mazeOps) && p._mazeOps.length > 20, String((p._mazeOps || []).length));
  check("装饰来自死胡同", p.data.decor.length > 0 && p.data.decor.every((d) => p.data.maze[d.r][d.c] === 0), JSON.stringify(p.data.decor));
  const palBefore = p._palIdx;
  p.newMaze();
  await sleep(120);
  check("换一局主题轮换", p._palIdx === palBefore + 1, String(p._palIdx));

  // 撞墙：找到起点旁边的一面墙
  const wallDir = [[-1, 0], [1, 0], [0, -1], [0, 1]].find(([dr, dc]) => p.data.maze[1 + dr] && p.data.maze[1 + dr][1 + dc] === 1);
  if (wallDir) {
    const vBefore = global.wx._vibrate || 0;
    p.doMove(wallDir[0], wallDir[1]);
    check("撞墙不动", p.data.player.r === 1 && p.data.player.c === 1 && p.data.steps === 0);
    check("撞墙不再震动", (global.wx._vibrate || 0) === vBefore);
    check("不再有 bump 抖屏状态", p.data.bump === undefined && !p._bumpT);
  }

  // 沿最短路径走到终点
  const moves = solvePath(p.data.maze);
  check("BFS 能给出路径", moves.length > 0, String(moves.length));
  moves.forEach(([dr, dc]) => p.doMove(dr, dc));
  check("走到终点过关", p.data.mazeDone === true);
  check("过关计一次", p.data.stats.todayRight === 1, String(p.data.stats.todayRight));
  const stMaze = store.mindStats();
  check("过关持久化", stMaze.todayRight === 1);
  await sleep(1900);
  check("过关自动换新迷宫", p.data.mazeDone === false && p.data.steps === 0 && p.data.player.r === 1);

  // 难度切换
  p.pickMazeLevel({ currentTarget: { dataset: { key: "mz9" } } });
  await sleep(120);
  check("切大迷宫 15×15", p.data.maze.length === 15);
  check("画布尺寸随档位变大", p.data.cvW > 0 && Math.abs(p.data.cvH - p.data.cvW) < 0.01, String(p.data.cvW));
  check("9×9 绘制指令已生成", Array.isArray(p._mazeOps) && p._mazeOps.length > 20);

  // 手指拖动走位（方向键已移除，只能拖）
  p.setData({ player: { r: 1, c: 1 }, steps: 0, mazeDone: false });
  const openDir = [[-1, 0], [1, 0], [0, -1], [0, 1]].find(([dr, dc]) => p.data.maze[1 + dr] && p.data.maze[1 + dr][1 + dc] === 0);
  check("起点有可走方向", !!openDir, JSON.stringify(openDir));
  const cellPx = p.cellPx(p.data.maze.length);
  const dragPx = Math.max(20, cellPx * 0.9);
  p.onBoardTouchStart({ touches: [{ clientX: 100, clientY: 100 }] });
  check("按下盘面进入拖动态（画框高亮）", p.data.dragOn === true);
  p.onBoardTouchMove({ touches: [{ clientX: 100 + openDir[1] * dragPx, clientY: 100 + openDir[0] * dragPx }] });
  check(
    "拖一格 → 小人走一格",
    p.data.player.r === 1 + openDir[0] && p.data.player.c === 1 + openDir[1] && p.data.steps === 1,
    JSON.stringify(p.data.player)
  );
  const stDragged = p.data.steps;
  p.onBoardTouchMove({ touches: [{ clientX: 100 + openDir[1] * dragPx + 6, clientY: 100 + openDir[0] * dragPx + 6 }] });
  check("拖动位移不够不动", p.data.steps === stDragged);
  p.onBoardTouchEnd({});
  check("松手退出拖动态", p.data.dragOn === false);

  /* ---------- 4. 方块页流程 ---------- */
  p.pickGame({ currentTarget: { dataset: { g: "blocks" } } });
  check("页签切到方块", p.data.game === "blocks");
  check("打乱加载 9 格", p.data.tiles.length === 9 && p.data.tiles.indexOf(0) > -1);
  const t0 = JSON.stringify(p.data.tiles);
  // 点一个不在空格旁边的块
  const blank = p.data.tiles.indexOf(0);
  const far = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => mind.blockNeighbors(blank).indexOf(i) < 0)[0];
  p.tapTile(tap(far));
  check("非相邻块不动", JSON.stringify(p.data.tiles) === t0 && p.data.moves === 0);
  // 点相邻块
  const near = mind.blockNeighbors(blank)[0];
  p.tapTile(tap(near));
  check("相邻块滑动 + 步数 +1", p.data.moves === 1 && p.data.tiles[near] === 0);

  /* ---------- 4.1 按住拖动 ---------- */
  p.newBlocks();
  check("渲染数据 9 块 + 绝对定位", p.data.bview.length === 9 && /left:\d+rpx;top:\d+rpx;/.test(p.data.bview[0].style), p.data.bview[0].style);
  const blank2 = p.data.tiles.indexOf(0);
  const near2 = mind.blockNeighbors(blank2)[0];
  const nNear = p.data.tiles[near2];
  const dir2 = mind.dirToBlank(near2, blank2);
  check("相邻块有明确方向", !!dir2, String(dir2));
  p.onTileStart({ currentTarget: { dataset: { i: near2, n: nNear } }, touches: [{ clientX: 100, clientY: 100 }] });
  check("按住方块抬起（drag 记录）", !!p.data.drag && p.data.drag.n === nNear);
  const off2 = mind.dirOffset(dir2);
  p.onTileMove({ touches: [{ clientX: 100 + off2.dc * 60, clientY: 100 + off2.dr * 60 }] });
  check("拖动中跟随手指", /translate3d\(-?\d+px,-?\d+px/.test(p.data.drag.style), p.data.drag.style);
  const movesBefore = p.data.moves;
  p.onTileEnd({ changedTouches: [{ clientX: 100 + off2.dc * 60, clientY: 100 + off2.dr * 60 }] });
  check("松手先播放滑动动画", !!p.data.drag && p.data.drag.anim === true);
  await sleep(240);
  check("松手后滑入空位 + 步数 +1", p.data.tiles[blank2] === nNear && p.data.tiles[near2] === 0 && p.data.moves === movesBefore + 1);

  // 拖向错误方向：弹回，不移动
  const blank3 = p.data.tiles.indexOf(0);
  const near3 = mind.blockNeighbors(blank3)[0];
  const nNear3 = p.data.tiles[near3];
  const dir3 = mind.dirToBlank(near3, blank3);
  const badDir = dir3 === "r" ? "d" : "r";
  const off3 = mind.dirOffset(badDir);
  p.onTileStart({ currentTarget: { dataset: { i: near3, n: nNear3 } }, touches: [{ clientX: 120, clientY: 120 }] });
  p.onTileMove({ touches: [{ clientX: 120 + off3.dc * 60, clientY: 120 + off3.dr * 60 }] });
  p.onTileEnd({ changedTouches: [{ clientX: 120 + off3.dc * 60, clientY: 120 + off3.dr * 60 }] });
  await sleep(240);
  check("拖向错误方向：弹回不移动", p.data.tiles[near3] === nNear3 && p.data.drag === null);

  // 空格本身不可拖
  p.onTileStart({ currentTarget: { dataset: { i: p.data.tiles.indexOf(0), n: 0 } }, touches: [{ clientX: 10, clientY: 10 }] });
  check("空格不可拖", p.data.drag === null);

  // 轻点（没拖动）：朝空位方向自动滑一格
  const blank4 = p.data.tiles.indexOf(0);
  const near4 = mind.blockNeighbors(blank4)[0];
  const nNear4 = p.data.tiles[near4];
  p.onTileStart({ currentTarget: { dataset: { i: near4, n: nNear4 } }, touches: [{ clientX: 60, clientY: 60 }] });
  p.onTileEnd({ changedTouches: [{ clientX: 61, clientY: 60 }] });
  await sleep(240);
  check("轻点相邻块也能滑一格", p.data.tiles[blank4] === nNear4);

  // 直接摆成差一步的完成态再复原
  p.setData({ tiles: [1, 2, 3, 4, 5, 6, 7, 0, 8], moves: 41, blocksDone: false });
  p.tapTile(tap(8));
  check("复原判过关", p.data.blocksDone === true && mind.blocksSolved(p.data.tiles));
  check("最少步数已记录", p.data.bestMoves === 42, String(p.data.bestMoves));
  const bs = store.mindStats();
  check("方块过关持久化", bs.todayRight >= 1 && bs.byLevel.blocks.moves === 42, JSON.stringify(bs.byLevel.blocks || {}));
  await sleep(2100);
  check("过关自动重新打乱", p.data.blocksDone === false && p.data.moves === 0);

  /* ---------- 4.5 找不同（类别归类） ---------- */
  // 纯逻辑：30 题，3 同类 + 1 异类、四个 emoji 互不重复、异类恰一个
  let oddOk = true;
  for (let i = 0; i < 30; i++) {
    const q = mind.genOdd(4);
    if (q.opts.length !== 4) oddOk = false;
    const odds = q.opts.filter((o) => o.odd);
    if (odds.length !== 1) oddOk = false;
    const emojis = q.opts.map((o) => o.e);
    if (new Set(emojis).size !== 4) oddOk = false;
    // 多数类的 3 个必须真的属于同一类别（在题库里能找到所属类）
    const same = q.opts.filter((o) => !o.odd).map((o) => o.e);
    const cats = mind.ODD_CATS.filter((c) => same.every((e) => c.items.indexOf(e) > -1));
    if (cats.length !== 1 || cats[0].cat !== q.cat) oddOk = false;
    if (q.opts.some((o) => o.e === undefined)) oddOk = false;
  }
  check("找不同 30 题：3+1 / 唯一异类 / 无重复 / 类别正确", oddOk);

  // 页面流程
  p.pickGame({ currentTarget: { dataset: { g: "odd" } } });
  check("页签切到找不同", p.data.game === "odd");
  p.newOdd();
  check("加载 4 个选项", p.data.oddOpts.length === 4);
  const oddIdx = p.data.oddOpts.findIndex((o) => o.odd);
  check("恰好一个异类", oddIdx > -1);
  // 答错：点同类项 → 抖动不换题
  const sameIdx = p.data.oddOpts.findIndex((o) => !o.odd);
  const stOddBefore = store.mindStats();
  p.tapOdd(tap(sameIdx));
  check("答同类项：抖动提示", p.data.oddShake === sameIdx && p.data.oddDone === false);
  check("答错计一次", store.mindStats().todayWrong === stOddBefore.todayWrong + 1);
  // 答对：异类点亮 + 播报类别，自动换题
  p.tapOdd(tap(oddIdx));
  check("答异类项：点亮过关", p.data.oddDone === true && p.data.oddPick === oddIdx);
  check("答对播报多数类别", p.data.oddTip.indexOf(p.data.oddCat) > -1, p.data.oddTip);
  check("答对计一次", store.mindStats().todayRight >= 1);
  await sleep(2000);
  check("答对后自动换新题", p.data.oddDone === false && p.data.oddOpts.length === 4);

  /* ---------- 5. 清理 ---------- */
  p.onUnload();
  check("onUnload 不抛错", true);

  console.log("\n结果: " + ok.length + " 通过, " + bad.length + " 失败");
  if (bad.length) {
    bad.forEach((b) => console.log("  ✗ " + b));
    process.exit(1);
  }
}

main();
