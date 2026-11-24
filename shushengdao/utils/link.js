/**
 * 图案与数字连线：左边一列「小动物数量卡」（每种难度一种小动物，按 5 个一行摆放），
 * 右边一列打乱的数字。按住卡片拖出连线到对面的数字上，连对画线，全连对进入下一轮。
 */

// 每档一种小动物（幼儿园阶段认得、任何机型都能显示的 emoji）
const LEVELS = [
  { key: "l5", name: "5 以内", sub: "2~5", desc: "先热身：数一数有几只小兔子", min: 2, max: 5, pairs: 3, rows: 1, animal: "🐰", tip: "数小兔子" },
  { key: "l10", name: "10 以内", sub: "3~10", desc: "小狗排队：5 只一行，一眼看出数", min: 3, max: 10, pairs: 4, rows: 2, animal: "🐶", tip: "数小狗" },
  { key: "l20", name: "20 以内", sub: "10~20", desc: "青蛙来啦：两行满格就是 10", min: 10, max: 20, pairs: 5, rows: 4, animal: "🐸", tip: "数青蛙" },
];

// 备选动物（想换口味时可用；当前每档固定一种，孩子专注数数不分心）
const ANIMAL_POOLS = {
  l5: ["🐰", "🐤", "🐝"],
  l10: ["🐶", "🐱", "🦊"],
  l20: ["🐸", "🐒", "🦋"],
};

function levelOf(key) {
  return LEVELS.filter(function (l) { return l.key === key; })[0] || LEVELS[1];
}

function rand(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

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

/**
 * 数量摆位：n 个动物按每行 5 个摆放，并把总行数补齐到 rows（不足的行留空）。
 * 所有卡片行数一致 → 左右两列卡片等高、整齐。
 * @returns 每行占位数组 [[1,0,0,0,0],...]
 */
function frame(n, rows) {
  const out = [];
  let left = Math.max(0, n);
  while (left > 0) {
    const take = Math.min(5, left);
    const row = [];
    for (let i = 0; i < 5; i++) row.push(i < take ? 1 : 0);
    out.push(row);
    left -= take;
  }
  const need = typeof rows === "number" ? rows : out.length;
  while (out.length < need) out.push([0, 0, 0, 0, 0]);
  return out;
}

/**
 * 生成一轮
 * @returns {left:[{n,cells,animal}], right:[{n}], total, animal}
 */
function gen(key) {
  const lv = levelOf(key);
  const nums = [];
  const span = lv.max - lv.min + 1;
  while (nums.length < Math.min(lv.pairs, span)) {
    const n = rand(lv.min, lv.max);
    if (nums.indexOf(n) < 0) nums.push(n);
  }
  const animal = lv.animal;
  return {
    level: lv,
    left: shuffle(nums.map(function (n) { return { n: n, cells: frame(n, lv.rows), animal: animal }; })),
    right: shuffle(nums.map(function (n) { return { n: n }; })),
    total: nums.length,
    animal: animal,
  };
}

/**
 * 命中测试：手指 (x,y) 落在 rects 哪个矩形里。
 * rects 为 boundingClientRect 结果（client 坐标），pad 为外扩容错（px）。
 * 返回下标，未命中返回 -1。拖动连线松手时用它判断「拖到了哪张数字卡」。
 */
function hitRect(rects, x, y, pad) {
  const p = pad || 0;
  const list = rects || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r) continue;
    if (x >= r.left - p && x <= r.left + r.width + p && y >= r.top - p && y <= r.top + r.height + p) return i;
  }
  return -1;
}

/** 左卡「朝右的边缘中点」：连线从这里出发（client 坐标 → 需先减棋盘偏移） */
function edgeOf(rect, side) {
  if (!rect) return null;
  const cy = rect.top + rect.height / 2;
  if (side === "L") return { x: rect.left + rect.width, y: cy };
  if (side === "R") return { x: rect.left, y: cy };
  return { x: rect.left + rect.width / 2, y: cy };
}

/** 两点 → 一条线的渲染参数（相对棋盘左上角，配合 .ln 的 left/top/width/rotate） */
function lineGeom(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { x: x1, y: y1 - 2, len: len, ang: (Math.atan2(dy, dx) * 180) / Math.PI };
}

module.exports = { LEVELS, ANIMAL_POOLS, levelOf, gen, frame, hitRect, edgeOf, lineGeom };
