/**
 * 文本处理：OCR 原始文本 → 可朗读的分句
 * 规则对齐 PRD 4.2 / 4.3：按句末标点切分、超长句二次切分、过滤页眉页脚与页码
 */
const pinyin = require("./pinyin");

const MAX_SENTENCE = 42; // 单句超过该字数，按逗号二次切分
const MIN_SENTENCE = 6; // 短于该字数的残句并入相邻句
const MAX_SENTENCES = 80; // 单次识别的句子上限，避免长文拖垮页面

const END_PUNCT = /[。！？!?…]/;
const PAGE_NOISE = [/^\d{1,3}$/, /^第?\s*\d+\s*页$/, /^[-—\s]*\d+[-—\s]*$/, /^(共\s*\d+\s*页)$/];

function cleanLine(line) {
  return String(line || "")
    .replace(/[\u3000\s]+/g, " ")
    .replace(/[|｜_—]{2,}/g, "")
    .trim();
}

function isNoise(line) {
  if (!line) return true;
  if (line.length < 2) return true;
  if (PAGE_NOISE.some((re) => re.test(line))) return true;
  // 纯符号行
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(line)) return true;
  return false;
}

/** 按句末标点+逗号切分一个长行 */
function splitLong(line) {
  const out = [];
  // 先按句末标点切，保留标点
  const chunks = line.match(/[^。！？!?…]+[。！？!?…]*/g) || [];
  chunks.forEach((chunk) => {
    const s = chunk.trim();
    if (!s) return;
    if (s.length <= MAX_SENTENCE) {
      out.push(s);
      return;
    }
    // 二次切分：按逗号/分号/顿号聚合
    const parts = s.match(/[^，,；;、]+[，,；;、]*/g) || [s];
    let buf = "";
    parts.forEach((p) => {
      if (buf && (buf + p).length > MAX_SENTENCE) {
        out.push(buf.trim());
        buf = p;
      } else {
        buf += p;
      }
    });
    if (buf.trim()) out.push(buf.trim());
  });
  return out;
}

/** 残句并入相邻句；短标题行（无标点）保持独立 */
function mergeShort(list) {
  const out = [];
  list.forEach((s) => {
    const text = s.trim();
    if (!text) return;
    const prev = out[out.length - 1];
    const isResidual = (text.length < MIN_SENTENCE && !END_PUNCT.test(text)) || text.length <= 3;
    if (prev && isResidual) {
      out[out.length - 1] = prev + text;
    } else if (prev && prev === text) {
      // 丢弃完全重复的行（跨页重复的页眉）
    } else {
      out.push(text);
    }
  });
  return out;
}

function splitSentences(rawText) {
  const raw = String(rawText || "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n").map(cleanLine).filter((l) => !isNoise(l));
  let sentences = [];
  lines.forEach((line) => {
    splitLong(line).forEach((s) => sentences.push(s));
  });
  sentences = mergeShort(sentences);
  // 去掉句首的孤立标点
  sentences = sentences.map((s) => s.replace(/^[，。；、,;]+/, "").trim()).filter((s) => s.length > 0);
  return sentences.slice(0, MAX_SENTENCES);
}

/** 单句注音：[{ c, py, punct }] */
function annotate(sentence) {
  const chars = Array.from(String(sentence || ""));
  return chars.map((c) => ({
    c,
    py: pinyin.isPunct(c) ? "" : pinyin.getPinyin(c),
    punct: pinyin.isPunct(c),
  }));
}

/**
 * 注音并按「字 + 其后标点」聚合成列，用于拼音压字的一一对应排版：
 * 标点附着在前一个字的列尾，换行时不会孤立成行。
 * 返回 [{ c, py, punct, tail }]，c 为主字（可点读），tail 为跟随的标点串。
 */
function annotateGroups(sentence) {
  const out = [];
  annotate(sentence).forEach((item) => {
    const last = out[out.length - 1];
    if (item.punct && last) {
      last.tail += item.c;
      return;
    }
    out.push({
      c: item.c,
      py: item.py,
      punct: item.punct,
      tail: "",
    });
  });
  return out;
}

/** 整段注音：按句子维度返回 */
function annotateAll(sentences) {
  return sentences.map((s) => annotate(s));
}

/**
 * 智能分行：把 annotateGroups 的字列按标点短语聚合，每行不超过 maxCols 列。
 * 规则：
 *  1) 优先在标点处断行（短语是天然的语义单元，标点列跟随短语尾）；
 *  2) 行内按 maxCols 贪心装短语，装不下就换行；
 *  3) 无标点超长短语内部硬切，避免一行溢出。
 * 返回 [[{c,py,punct,tail,gi}]]，gi 为全局字列序号（播放高亮用）。
 */
function layoutLines(groups, maxCols) {
  const max = Math.max(4, maxCols || 10);
  const segs = [];
  let cur = [];
  groups.forEach((g) => {
    cur.push(g);
    if (g.punct || g.tail) {
      segs.push(cur);
      cur = [];
    }
  });
  if (cur.length) segs.push(cur);

  const lines = [];
  let line = [];
  segs.forEach((seg) => {
    if (seg.length > max) {
      if (line.length) {
        lines.push(line);
        line = [];
      }
      for (let i = 0; i < seg.length; i += max) lines.push(seg.slice(i, i + max));
      return;
    }
    if (line.length && line.length + seg.length > max) {
      lines.push(line);
      line = seg.slice();
    } else {
      line = line.concat(seg);
    }
  });
  if (line.length) lines.push(line);

  let gi = 0;
  lines.forEach((l) => l.forEach((g) => (g.gi = gi++)));
  return lines;
}

/** 从文本里挑出生词候选：非常用字 / 三字以上词 */
function pickCandidates(sentence, limit) {
  const chars = Array.from(String(sentence || "")).filter((c) => /[\u4e00-\u9fa5]/.test(c));
  const unknown = chars.filter((c) => !pinyin.has(c));
  const uniq = [];
  unknown.forEach((c) => {
    if (uniq.indexOf(c) === -1) uniq.push(c);
  });
  return uniq.slice(0, limit || 3);
}

function countChars(text) {
  return Array.from(String(text || "")).filter((c) => /[\u4e00-\u9fa5a-zA-Z0-9]/.test(c)).length;
}

/** 从文本首行推断标题（限制 18 字） */
function guessTitle(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map(cleanLine)
    .filter((l) => l && !isNoise(l));
  const first = lines[0] || "";
  return first.length > 18 ? first.slice(0, 18) : first || "未命名课文";
}

module.exports = {
  splitSentences,
  annotate,
  annotateGroups,
  annotateAll,
  layoutLines,
  pickCandidates,
  countChars,
  guessTitle,
  cleanLine,
};
