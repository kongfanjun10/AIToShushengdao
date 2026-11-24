/**
 * 竖式计算：出题 + 逐位校验（纯函数，方便单测）
 * 数字一律从「个位」开始编号：digits(n, cols)[0] 是个位。
 */

const LEVELS = [
  { key: "add2", name: "两位数加", sub: "进位 / 不进位" },
  { key: "sub2", name: "两位数减", sub: "退位 / 不退位" },
  { key: "add3", name: "三位数加", sub: "两位数 + 三位数" },
];

function rand(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function levelOf(key) {
  return LEVELS.filter((l) => l.key === key)[0] || LEVELS[0];
}

/** 把一个数拆成 cols 位（个位在前），不足补 0 */
function digits(n, cols) {
  const out = [];
  let v = Math.abs(Math.floor(Number(n) || 0));
  for (let i = 0; i < cols; i++) {
    out.push(v % 10);
    v = Math.floor(v / 10);
  }
  return out;
}

function gen(levelKey) {
  const key = levelOf(levelKey).key;
  let a = 0;
  let b = 0;
  let op = "+";

  if (key === "add2") {
    a = rand(12, 88);
    // 保证和不超过 99，答案不会多出一位
    b = rand(11, Math.max(11, 99 - a));
    op = "+";
  } else if (key === "sub2") {
    a = rand(31, 98);
    b = rand(11, a - 6);
    op = "-";
  } else {
    a = rand(105, 480);
    b = rand(26, 99);
    op = "+";
  }

  const answer = op === "+" ? a + b : a - b;
  const cols = Math.max(String(a).length, String(b).length, String(answer).length);
  return {
    a,
    b,
    op,
    answer,
    cols,
    expr: a + op + b,
    level: key,
    steps: steps(a, b, op, cols),
    answerDigits: digits(answer, cols),
  };
}

/** 逐位计算过程：in 表示进来的进位/借位，out 表示往高位的进位/借位 */
function steps(a, b, op, cols) {
  const da = digits(a, cols);
  const db = digits(b, cols);
  const out = [];
  if (op === "-") {
    let borrow = 0;
    for (let i = 0; i < cols; i++) {
      let d = da[i] - db[i] - borrow;
      const take = d < 0 ? 1 : 0;
      if (take) d += 10;
      out.push({ i, in: borrow, digit: d, out: take });
      borrow = take;
    }
  } else {
    let carry = 0;
    for (let i = 0; i < cols; i++) {
      const s = da[i] + db[i] + carry;
      out.push({ i, in: carry, digit: s % 10, out: s >= 10 ? 1 : 0 });
      carry = s >= 10 ? 1 : 0;
    }
  }
  return out;
}

/** 检查已填的位：返回第一个出错的位（-1 表示目前都对） */
function firstWrong(question, cells) {
  const ans = question.answerDigits;
  for (let i = 0; i < question.cols; i++) {
    const v = String((cells && cells[i]) == null ? "" : cells[i]).trim();
    if (!v) return -1; // 还没填到这里
    if (Number(v) !== ans[i]) return i;
  }
  return -1;
}

/** 全部填完且正确 */
function isComplete(question, cells) {
  const ans = question.answerDigits;
  for (let i = 0; i < question.cols; i++) {
    const v = String((cells && cells[i]) == null ? "" : cells[i]).trim();
    if (!v) return false;
    if (Number(v) !== ans[i]) return false;
  }
  return true;
}

/** 把 cells 拼成数字（个位在前） */
function joinCells(cells) {
  const arr = (cells || []).map((c) => String(c == null ? "" : c));
  return arr.slice().reverse().join("");
}

/** 从题面还原（错题重练），如 "123+45" */
function fromExpr(expr) {
  const m = String(expr || "").match(/^(\d+)\s*([+\-])\s*(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2];
  const answer = op === "+" ? a + b : a - b;
  const cols = Math.max(String(a).length, String(b).length, String(answer).length);
  return {
    a,
    b,
    op,
    answer,
    cols,
    expr: a + op + b,
    level: null,
    steps: steps(a, b, op, cols),
    answerDigits: digits(answer, cols),
  };
}

module.exports = { LEVELS, levelOf, gen, steps, digits, firstWrong, isComplete, joinCells, fromExpr };
