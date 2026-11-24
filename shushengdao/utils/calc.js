/**
 * 口算闯关：出题 + 判定（纯函数，方便单测）
 * 难度档与小学数学进度对齐：10 以内 → 20 以内进位/退位 → 乘法口诀 → 100 以内。
 */

const LEVELS = [
  { key: "add10", name: "10 以内", sub: "加减", icon: "ico-calc", desc: "1~10 的加减法，先练熟" },
  { key: "add20", name: "20 以内", sub: "进位 / 退位", icon: "ico-calc", desc: "进位加、退位减，最容易错的一档" },
  { key: "mul", name: "乘法口诀", sub: "2~9", icon: "ico-list-check", desc: "2~9 的口诀，一张一张背" },
  { key: "mix100", name: "100 以内", sub: "两位数加减", icon: "ico-target", desc: "两位数加减，为竖式打基础" },
];

function rand(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function levelOf(key) {
  return LEVELS.filter((l) => l.key === key)[0] || LEVELS[0];
}

function keyOf(a, op, b) {
  return a + op + b;
}

/** 生成一道题：{ a, b, op, answer, expr, speak } */
function gen(levelKey) {
  const key = levelOf(levelKey).key;
  let a = 0;
  let b = 0;
  let op = "+";

  if (key === "add10") {
    if (Math.random() < 0.5) {
      a = rand(1, 9);
      b = rand(1, 10 - a);
      op = "+";
    } else {
      a = rand(2, 10);
      b = rand(1, a - 1);
      op = "-";
    }
  } else if (key === "add20") {
    if (Math.random() < 0.5) {
      a = rand(3, 9);
      b = rand(2, 9);
      while (a + b < 11 || a + b > 18) b = rand(2, 9);
      op = "+";
    } else {
      a = rand(11, 18);
      b = rand(2, 9);
      while (a - b < 1 || a - b > 9) b = rand(2, 9);
      op = "-";
    }
  } else if (key === "mul") {
    a = rand(2, 9);
    b = rand(2, 9);
    op = "×";
  } else {
    if (Math.random() < 0.5) {
      a = rand(10, 89);
      b = rand(2, Math.max(2, 100 - a));
      op = "+";
    } else {
      a = rand(21, 99);
      b = rand(2, a - 10);
      op = "-";
    }
  }

  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return {
    a,
    b,
    op,
    answer,
    expr: keyOf(a, op, b),
    speak: speakOf(a, op, b),
    level: key,
  };
}

/** 语音读题文案（中文数字交给 TTS 读阿拉伯数字也能读对） */
function speakOf(a, op, b) {
  const w = op === "+" ? "加" : op === "-" ? "减" : "乘";
  return a + " " + w + " " + b + " 等于几";
}

/** 答案校验：允许字符串输入 */
function check(question, input) {
  const val = Number(String(input == null ? "" : input).trim());
  if (!Number.isFinite(val)) return false;
  return val === question.answer;
}

/** 从题面字符串还原题目（错题重练用），如 "23+45" / "7×8" */
function fromExpr(expr) {
  const m = String(expr || "").match(/^(\d+)\s*([+\-×])\s*(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2];
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { a, b, op, answer, expr: keyOf(a, op, b), speak: speakOf(a, op, b), level: null };
}

module.exports = { LEVELS, levelOf, gen, keyOf, speakOf, check, fromExpr };
