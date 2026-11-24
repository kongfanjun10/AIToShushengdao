/**
 * 思维游戏：迷宫 + 方块（3x3 数字滑块）
 */

/* ---------------- 迷宫 ---------------- */
// 递归回溯生成：size 为奇数；1=墙 0=路；起点 (1,1)，终点 (size-2,size-2)
function genMaze(size) {
  const n = size % 2 === 0 ? size + 1 : size;
  const g = [];
  for (let r = 0; r < n; r++) {
    g.push([]);
    for (let c = 0; c < n; c++) g[r].push(1);
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  function carve(r, c) {
    g[r][c] = 0;
    const dirs = shuffle([
      [0, 2],
      [0, -2],
      [2, 0],
      [-2, 0],
    ]);
    for (let i = 0; i < dirs.length; i++) {
      const nr = r + dirs[i][0];
      const nc = c + dirs[i][1];
      if (nr > 0 && nr < n - 1 && nc > 0 && nc < n - 1 && g[nr][nc] === 1) {
        g[r + dirs[i][0] / 2][c + dirs[i][1] / 2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);
  return g;
}

/** 网格尺寸档位（参考练习册：走廊细密、弯弯曲曲，所以网格取 9/13/15） */
const MAZE_LEVELS = [
  { key: "mz5", name: "小迷宫", sub: "9×9", size: 9 },
  { key: "mz7", name: "中迷宫", sub: "13×13", size: 13 },
  { key: "mz9", name: "大迷宫", sub: "15×15", size: 15 },
];

function mazeLevelOf(key) {
  return MAZE_LEVELS.filter((l) => l.key === key)[0] || MAZE_LEVELS[1];
}

/* ---------------- 方块（3x3 数字滑块） ---------------- */

/** 把 1~8 打乱：从完成态出发做 80+ 次随机合法移动，保证一定有解 */
function shuffleBlocks() {
  let tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  let blank = 8;
  for (let i = 0; i < 90; i++) {
    const opts = blockNeighbors(blank);
    const pick = opts[Math.floor(Math.random() * opts.length)];
    tiles[blank] = tiles[pick];
    tiles[pick] = 0;
    blank = pick;
  }
  if (blocksSolved(tiles)) return shuffleBlocks();
  return { tiles: tiles, blank: blank };
}

/** 与空格相邻的下标 */
function blockNeighbors(i) {
  const r = Math.floor(i / 3);
  const c = i % 3;
  const out = [];
  if (r > 0) out.push(i - 3);
  if (r < 2) out.push(i + 3);
  if (c > 0) out.push(i - 1);
  if (c < 2) out.push(i + 1);
  return out;
}

function blocksSolved(tiles) {
  for (let i = 0; i < 8; i++) if (tiles[i] !== i + 1) return false;
  return true;
}

/** 点第 i 块：与空格相邻就交换，返回 { tiles, blank, moved } */
function moveBlock(tiles, blank, i) {
  if (blockNeighbors(blank).indexOf(i) < 0) return { tiles: tiles, blank: blank, moved: false };
  const next = tiles.slice();
  next[blank] = next[i];
  next[i] = 0;
  return { tiles: next, blank: i, moved: true };
}

/* ---- 拖动交互工具（按住拖动滑方块） ---- */

/** 手指位移 → 主方向 'u'|'d'|'l'|'r'；位移太小返回 null */
function snapDir(dx, dy, min) {
  const m = typeof min === "number" ? min : 6;
  if (Math.abs(dx) < m && Math.abs(dy) < m) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "r" : "l";
  return dy > 0 ? "d" : "u";
}

/**
 * 迷宫拖动走位：手指从 anchor 拖到 point，够「大半格」就返回 { dir, x, y }
 * - 阈值 = 格宽 × 0.6（最少 16px），太小会抖、太大会拖不动
 * - 返回的 x/y 是新的参照点（跟随手指），所以按住一路滑能连着走好几格
 * - 位移不够返回 null（不动）
 */
function dragStep(ax, ay, px, py, cell) {
  const c = typeof cell === "number" && cell > 0 ? cell : 36;
  const min = Math.max(16, c * 0.6);
  const dir = snapDir(px - ax, py - ay, min);
  if (!dir) return null;
  return { dir: dir, x: px, y: py };
}

/** 沿方向走一格后的下标；越界返回 -1 */function stepIndex(i, dir) {
  const r = Math.floor(i / 3);
  const c = i % 3;
  if (dir === "u") return r > 0 ? i - 3 : -1;
  if (dir === "d") return r < 2 ? i + 3 : -1;
  if (dir === "l") return c > 0 ? i - 1 : -1;
  if (dir === "r") return c < 2 ? i + 1 : -1;
  return -1;
}

/** 方向的格子位移 { dr, dc } */
function dirOffset(dir) {
  if (dir === "u") return { dr: -1, dc: 0 };
  if (dir === "d") return { dr: 1, dc: 0 };
  if (dir === "l") return { dr: 0, dc: -1 };
  if (dir === "r") return { dr: 0, dc: 1 };
  return { dr: 0, dc: 0 };
}

/** 点按（没拖动）时，第 i 块朝空格的方向；不在同一行/列返回 null */
function dirToBlank(i, blank) {
  if (i === blank) return null;
  const ri = Math.floor(i / 3);
  const ci = i % 3;
  const rb = Math.floor(blank / 3);
  const cb = blank % 3;
  if (ri === rb) return cb > ci ? "r" : "l";
  if (ci === cb) return rb > ri ? "d" : "u";
  return null;
}

/* ---------------- 找不同（幼儿园类别归类） ---------------- */

/** 模块级洗牌（genMaze 内部的 shuffle 是局部函数，这里单独备一份） */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// 类别题库：cat 是类别名（答对后播报用），items 是该类常见物品 emoji（幼儿园阶段都认识）
const ODD_CATS = [
  { cat: "水果", items: ["🍎", "🍌", "🍇", "🍓", "🍊", "🍉", "🍑"] },
  { cat: "动物", items: ["🐶", "🐱", "🐰", "🐘", "🦁", "🐼", "🐮"] },
  { cat: "交通工具", items: ["🚗", "🚌", "🚕", "🚓", "🚜", "🚲", "✈️"] },
  { cat: "蔬菜", items: ["🥕", "🥦", "🍅", "🥬", "🌽", "🥒", "🍆"] },
  { cat: "玩具", items: ["🧸", "🪀", "🪁", "⚽", "🏀", "🧩", "🎲"] },
  { cat: "文具", items: ["✏️", "📚", "🖍️", "📐", "✂️", "🖊️", "📎"] },
  { cat: "天气", items: ["☀️", "🌙", "⭐", "☁️", "🌈", "❄️", "⚡"] },
  { cat: "甜品零食", items: ["🍰", "🍩", "🍪", "🍦", "🍭", "🧁", "🍫"] },
];

/** 从数组里随机取 k 个不重复的 */
function sample(arr, k) {
  return shuffle(arr).slice(0, Math.min(k, arr.length));
}

/**
 * 生成一题「找不同」：3 个同类 + 1 个不同类，位置打乱。
 * @param {number} size 选项数，默认 4（3+1）
 * @returns {opts:[{e, odd}], cat}  odd=true 的是异类；cat 是多数类别名
 */
function genOdd(size) {
  const n = size === 3 ? 3 : 4;
  const sameCount = n - 1;
  // 随机挑两个不同类别，避免同类目连续出现
  const idxs = shuffle(ODD_CATS.map(function (_, i) { return i; })).slice(0, 2);
  const sameCat = ODD_CATS[idxs[0]];
  const oddCat = ODD_CATS[idxs[1]];
  const sameItems = sample(sameCat.items, sameCount);
  const oddItem = sample(oddCat.items, 1)[0];
  const opts = shuffle(
    sameItems.map(function (e) { return { e: e, odd: false }; }).concat([{ e: oddItem, odd: true }])
  );
  return { opts: opts, cat: sameCat.cat, oddCat: oddCat.cat };
}

module.exports = {
  genMaze,
  MAZE_LEVELS,
  mazeLevelOf,
  shuffleBlocks,
  blockNeighbors,
  blocksSolved,
  moveBlock,
  snapDir,
  dragStep,
  stepIndex,
  dirOffset,
  dirToBlank,
  ODD_CATS,
  genOdd,
};
