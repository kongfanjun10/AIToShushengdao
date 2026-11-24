/**
 * 数字读法解析：把语音识别到的文字还原成数字，用来判断小朋友有没有读对。
 *
 * 支持三种常见读法：
 *   1. 阿拉伯数字      "23"        → 23
 *   2. 中文标准读法    "二十三"    → 23    "一百零五" → 105
 *   3. 逐位读法        "二三"      → 23    "一零五"   → 105
 * 另外兼容口语省略：一百一 = 110、两千三 = 2300（低年级偶尔会这么读）
 *
 * 纯函数、无 wx 依赖，方便在 node 里跑测试。
 */

const DIGIT = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3,
  四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CN_NUM = "零〇一二两俩三四五六七八九";
const UNIT_CHARS = "十百千万";
const CN_REG = new RegExp("[" + CN_NUM + UNIT_CHARS + "]+", "g");
const AR_REG = /\d+/g;

/** 全角 → 半角，顺手去掉可能被识别出来的单位词干扰 */
function normalize(text) {
  return String(text || "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、。．.！!？?；;：:\s"'“”‘’]/g, "")
    .replace(/俩/g, "两");
}

/**
 * 中文数字串 → 整数
 * 无单位字符时按「逐位读」拼接（二三 → 23，一零五 → 105）
 */
function cnToInt(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  for (let i = 0; i < s.length; i++) {
    if (DIGIT[s[i]] === undefined && UNIT_CHARS.indexOf(s[i]) === -1) return null;
  }
  // 纯逐位：二三 / 一零五 / 二零二四
  if (!new RegExp("[" + UNIT_CHARS + "]").test(s)) {
    let out = "";
    for (let i = 0; i < s.length; i++) out += String(DIGIT[s[i]]);
    if (!out) return null;
    return parseInt(out, 10);
  }

  let total = 0;
  let section = 0;
  let num = 0;
  let seen = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (DIGIT[ch] !== undefined) {
      num = DIGIT[ch];
      seen = true;
    } else if (ch === "十" || ch === "百" || ch === "千") {
      const u = ch === "十" ? 10 : ch === "百" ? 100 : 1000;
      // 「十三」开头的「十」= 1×10；「一百十」这种省略也要按 110 算
      const base = num > 0 ? num : seen ? 0 : 1;
      section += (base || 1) * u;
      num = 0;
      seen = true;
    } else if (ch === "万") {
      section += num;
      total += (section || 1) * 10000;
      section = 0;
      num = 0;
      seen = true;
    }
  }
  total += section + num;
  return seen ? total : null;
}

/**
 * 口语省略的额外候选：
 *   一百一 / 一千三 / 三万五 —— 末位省略了「十 / 百 / 千」
 */
function colloquial(s) {
  const out = [];
  const m1 = s.match(/^([一二两三四五六七八九])百([一二三四五六七八九])$/);
  if (m1) out.push(DIGIT[m1[1]] * 100 + DIGIT[m1[2]] * 10);
  const m2 = s.match(/^([一二两三四五六七八九])千([一二三四五六七八九])$/);
  if (m2) out.push(DIGIT[m2[1]] * 1000 + DIGIT[m2[2]] * 100);
  const m3 = s.match(/^([一二两三四五六七八九])万([一二三四五六七八九])$/);
  if (m3) out.push(DIGIT[m3[1]] * 10000 + DIGIT[m3[2]] * 1000);
  return out;
}

/**
 * 从一段识别文本里提取所有可能的数字
 * @returns {number[]} 去重后的候选值（保持出现顺序）
 */
function candidates(text) {
  const s = normalize(text);
  const out = [];
  const push = (n) => {
    if (typeof n === "number" && isFinite(n) && n >= 0 && out.indexOf(n) === -1) out.push(n);
  };

  let m;
  AR_REG.lastIndex = 0;
  while ((m = AR_REG.exec(s))) push(parseInt(m[0], 10));

  CN_REG.lastIndex = 0;
  while ((m = CN_REG.exec(s))) {
    const seg = m[0];
    push(cnToInt(seg));
    colloquial(seg).forEach(push);
  }

  // 逐位读法被标点/停顿切成单字时（"2 3"、"二 三"），把相邻数字拼起来再试
  const parts = [];
  AR_REG.lastIndex = 0;
  while ((m = AR_REG.exec(s))) parts.push({ at: m.index, v: m[0] });
  CN_REG.lastIndex = 0;
  while ((m = CN_REG.exec(s))) {
    const v = cnToInt(m[0]);
    if (v !== null) parts.push({ at: m.index, v: v });
  }
  parts.sort((a, b) => a.at - b.at);
  if (parts.length > 1) {
    let acc = "";
    parts.slice(0, 6).forEach((p) => {
      acc += String(p.v);
      if (acc.length <= 6) push(parseInt(acc, 10));
    });
  }
  return out;
}

/**
 * 判断识别文本是否读对了目标数字
 * @param {string} text   识别文本
 * @param {number} target 目标数字
 * @returns {{ok:boolean, heard:number|null, candidates:number[]}}
 */
function check(text, target) {
  const t = Number(target);
  const list = candidates(text);
  if (list.indexOf(t) > -1) return { ok: true, heard: t, candidates: list };
  // 没命中时给一个「最像」的候选，用于提示「我听到的是 32」
  let near = null;
  let min = Infinity;
  list.forEach((n) => {
    const d = Math.abs(n - t);
    if (d < min) {
      min = d;
      near = n;
    }
  });
  return { ok: false, heard: near, candidates: list };
}

/** 整数 → 中文标准读法（0 ~ 9999 万位以内） */
function intToCn(n) {
  const num = Math.floor(Number(n));
  if (!isFinite(num) || num < 0) return "";
  if (num === 0) return "零";
  if (num >= 10000) {
    const high = Math.floor(num / 10000);
    const low = num % 10000;
    return intToCn(high) + "万" + (low ? (low < 1000 ? "零" : "") + intToCn(low) : "");
  }
  const D = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const U = ["", "十", "百", "千"];
  const str = String(num);
  let out = "";
  let zero = false;
  for (let i = 0; i < str.length; i++) {
    const d = Number(str[i]);
    const u = U[str.length - 1 - i];
    if (d === 0) {
      zero = true;
      continue;
    }
    if (zero && out) out += "零";
    zero = false;
    out += (d === 1 && u === "十" && !out ? "" : D[d]) + u;
  }
  return out;
}

/** 一个数字的常见读法（提示卡 & 测试用） */
function readings(n) {
  const num = Math.floor(Number(n));
  if (!isFinite(num) || num < 0) return [];
  const out = [intToCn(num)];
  const digits = String(num).split("");
  if (digits.length > 1) {
    out.push(digits.map((d) => "零一二三四五六七八九"[Number(d)]).join(""));
  }
  return out;
}

module.exports = {
  normalize,
  cnToInt,
  candidates,
  check,
  intToCn,
  readings,
};
