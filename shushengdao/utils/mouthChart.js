/**
 * 口舌图（发音侧视剖面）绘制引擎
 * - buildShapes(id)：返回 1000x800 坐标系下的图元列表（path/circle/ellipse/text）
 * - draw(ctx, w, h, id)：把图元画到 canvas 2d 上
 * 侧视剖面（面向左）：唇 → 牙 → 上颚（硬腭/软腭）→ 喉，鼻腔通道在上方。
 * 每个音标一组参数：下颌开合、唇形、舌头位置、声带振动、鼻音、送气、双元音滑动箭头。
 */

/* ---------- 每个音标的发音参数 ---------- */
// jaw: 0 闭合 ~ 1 大开；lips: spread 咧嘴 / neutral 自然 / round 圆唇 / close 闭唇 / lipTeeth 唇齿接触
// tongue: { x: 0 舌前 ~ 1 舌后, y: 0 舌高 ~ 1 舌低 }；tipOut 舌尖伸出齿间；curl 舌尖上卷
// voiced 声带振动；nasal 鼻音；puff 送气；groove 舌面缝（s/z）；lateral 舌侧漏气（l）
// slide: { x, y } 双元音滑动终点；closure: 完全阻塞位置 lip|alv|vel|pal
const T = {
  /* 元音 */
  "/iː/": { jaw: 0.22, lips: "spread", tongue: { x: 0.08, y: 0.06 }, voiced: true, hint: "舌前部顶到最高，嘴角向两边拉开，声音拉长" },
  "/ɪ/": { jaw: 0.34, lips: "neutral", tongue: { x: 0.14, y: 0.24 }, voiced: true, hint: "舌前部抬高，比 /iː/ 松一点、嘴再开一点" },
  "/e/": { jaw: 0.5, lips: "spread", tongue: { x: 0.14, y: 0.44 }, voiced: true, hint: "舌前部半高，嘴半开，嘴角向两边" },
  "/æ/": { jaw: 0.88, lips: "spread", tongue: { x: 0.18, y: 0.82 }, voiced: true, hint: "嘴张到最大，舌前部压得低低的" },
  "/ɑː/": { jaw: 1, lips: "neutral", tongue: { x: 0.88, y: 0.94 }, voiced: true, hint: "嘴全开，舌后部压低，喉咙放松" },
  "/ɒ/": { jaw: 0.78, lips: "round", tongue: { x: 0.8, y: 0.86 }, voiced: true, hint: "嘴张大再微微收圆，舌后部压低" },
  "/ɔː/": { jaw: 0.6, lips: "round", tongue: { x: 0.82, y: 0.58 }, voiced: true, hint: "双唇收圆，舌后部抬高，声音拉长" },
  "/ʊ/": { jaw: 0.36, lips: "round", tongue: { x: 0.74, y: 0.3 }, voiced: true, hint: "双唇略圆，舌后部接近高位，短促" },
  "/uː/": { jaw: 0.22, lips: "round", tongue: { x: 0.86, y: 0.08 }, voiced: true, hint: "双唇向前突出收小圆孔，舌后部最高" },
  "/ʌ/": { jaw: 0.62, lips: "neutral", tongue: { x: 0.5, y: 0.72 }, voiced: true, hint: "嘴半开，舌中部放低，短促有力" },
  "/ɜː/": { jaw: 0.48, lips: "neutral", tongue: { x: 0.5, y: 0.46 }, voiced: true, hint: "舌中部居中，嘴半开，声音拉长" },
  "/ə/": { jaw: 0.34, lips: "neutral", tongue: { x: 0.5, y: 0.5 }, voiced: true, hint: "最放松：嘴微开，舌中部自然平放" },
  /* 双元音：tongue 起点舌位，slide 终点舌位 */
  "/eɪ/": { jaw: 0.46, lips: "spread", tongue: { x: 0.14, y: 0.44 }, slide: { x: 0.14, y: 0.2 }, voiced: true, hint: "从 /e/ 滑向 /ɪ/：下巴慢慢合上" },
  "/aɪ/": { jaw: 0.84, lips: "spread", tongue: { x: 0.2, y: 0.8 }, slide: { x: 0.14, y: 0.2 }, voiced: true, hint: "从 /a/ 滑向 /ɪ/：嘴巴从大到小" },
  "/ɔɪ/": { jaw: 0.66, lips: "round", tongue: { x: 0.8, y: 0.62 }, slide: { x: 0.16, y: 0.22 }, voiced: true, hint: "从 /ɔ/ 滑向 /ɪ/：嘴唇由圆变扁" },
  "/əʊ/": { jaw: 0.38, lips: "neutral", tongue: { x: 0.5, y: 0.5 }, slide: { x: 0.84, y: 0.14 }, voiced: true, hint: "从 /ə/ 滑向 /ʊ/：嘴唇渐渐收圆" },
  "/aʊ/": { jaw: 0.86, lips: "neutral", tongue: { x: 0.24, y: 0.84 }, slide: { x: 0.8, y: 0.18 }, voiced: true, hint: "从 /a/ 滑向 /ʊ/：嘴大张再收圆" },
  "/ɪə/": { jaw: 0.36, lips: "neutral", tongue: { x: 0.14, y: 0.24 }, slide: { x: 0.5, y: 0.5 }, voiced: true, hint: "从 /ɪ/ 滑向 /ə/：舌位从前高滑到中央" },
  "/eə/": { jaw: 0.5, lips: "spread", tongue: { x: 0.14, y: 0.44 }, slide: { x: 0.5, y: 0.5 }, voiced: true, hint: "从 /e/ 滑向 /ə/：嘴巴渐渐张开" },
  "/ʊə/": { jaw: 0.38, lips: "round", tongue: { x: 0.76, y: 0.3 }, slide: { x: 0.5, y: 0.5 }, voiced: true, hint: "从 /ʊ/ 滑向 /ə/：嘴唇由圆变平" },
  /* 辅音 */
  "/p/": { jaw: 0.06, lips: "close", closure: "lip", puff: true, voiced: false, hint: "双唇闭紧憋住气，然后突然弹开送气" },
  "/b/": { jaw: 0.06, lips: "close", closure: "lip", voiced: true, hint: "和 /p/ 一样闭唇，但声带振动、不送气" },
  "/t/": { jaw: 0.16, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", puff: true, voiced: false, hint: "舌尖顶住上齿龈，弹开时送气" },
  "/d/": { jaw: 0.16, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", voiced: true, hint: "舌尖顶上齿龈，声带振动" },
  "/k/": { jaw: 0.2, lips: "neutral", tongue: { x: 0.86, y: 0.14 }, closure: "vel", puff: true, voiced: false, hint: "舌后部顶住软腭，弹开时送气" },
  "/g/": { jaw: 0.2, lips: "neutral", tongue: { x: 0.86, y: 0.14 }, closure: "vel", voiced: true, hint: "舌后部顶软腭，声带振动" },
  "/f/": { jaw: 0.14, lips: "lipTeeth", voiced: false, hint: "上齿轻轻咬住下唇，吹气摩擦" },
  "/v/": { jaw: 0.14, lips: "lipTeeth", voiced: true, hint: "和 /f/ 一样咬下唇，但声带振动" },
  "/θ/": { jaw: 0.18, lips: "neutral", tongue: { x: 0.02, y: 0.3 }, tipOut: true, voiced: false, hint: "舌尖轻轻伸到上下齿之间，吹气" },
  "/ð/": { jaw: 0.18, lips: "neutral", tongue: { x: 0.02, y: 0.3 }, tipOut: true, voiced: true, hint: "同 /θ/ 的部位，但声带振动" },
  "/s/": { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, groove: true, voiced: false, hint: "舌尖靠近齿龈留一条窄缝，气流挤出去" },
  "/z/": { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, groove: true, voiced: true, hint: "同 /s/ 的部位，但声带振动" },
  "/ʃ/": { jaw: 0.26, lips: "round", tongue: { x: 0.44, y: 0.18 }, voiced: false, hint: "舌面抬向硬腭前部，双唇略向前撅" },
  "/ʒ/": { jaw: 0.26, lips: "round", tongue: { x: 0.44, y: 0.18 }, voiced: true, hint: "同 /ʃ/ 的部位，但声带振动" },
  "/h/": { jaw: 0.5, lips: "neutral", tongue: { x: 0.5, y: 0.6 }, voiced: false, hint: "嘴自然张开，像哈气一样呼气" },
  "/r/": { jaw: 0.3, lips: "round", tongue: { x: 0.5, y: 0.26 }, curl: true, voiced: true, hint: "舌尖向上卷但不碰到上颚，双唇略圆" },
  "/tʃ/": { jaw: 0.22, lips: "round", tongue: { x: 0.44, y: 0.16 }, closure: "pal", puff: true, voiced: false, hint: "先堵住再摩擦放开，像 /t/ + /ʃ/" },
  "/dʒ/": { jaw: 0.22, lips: "round", tongue: { x: 0.44, y: 0.16 }, closure: "pal", voiced: true, hint: "同 /tʃ/ 的部位，但声带振动" },
  "/tr/": { jaw: 0.24, lips: "round", tongue: { x: 0.46, y: 0.16 }, curl: true, closure: "pal", puff: true, voiced: false, hint: "舌尖上卷堵住，快速弹开带上 /r/" },
  "/dr/": { jaw: 0.24, lips: "round", tongue: { x: 0.46, y: 0.16 }, curl: true, closure: "pal", voiced: true, hint: "同 /tr/ 的部位，但声带振动" },
  "/ts/": { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, closure: "alv", groove: true, voiced: false, hint: "先 /t/ 堵住，再放开成 /s/" },
  "/dz/": { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, closure: "alv", groove: true, voiced: true, hint: "同 /ts/ 的部位，但声带振动" },
  "/m/": { jaw: 0.05, lips: "close", closure: "lip", nasal: true, voiced: true, hint: "双唇闭紧，声音从鼻子里出来" },
  "/n/": { jaw: 0.14, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "舌尖顶上齿龈，声音从鼻子里出来" },
  "/ŋ/": { jaw: 0.22, lips: "neutral", tongue: { x: 0.86, y: 0.16 }, closure: "vel", nasal: true, voiced: true, hint: "舌后部顶软腭，声音从鼻子里出来" },
  "/l/": { jaw: 0.2, lips: "neutral", tongue: { x: 0.3, y: 0.12 }, lateral: true, voiced: true, hint: "舌尖顶上齿龈，气流从舌头两边出来" },
  "/w/": { jaw: 0.14, lips: "round", tongue: { x: 0.84, y: 0.12 }, voiced: true, hint: "双唇收得很圆很小，舌后部抬高" },
  "/j/": { jaw: 0.16, lips: "spread", tongue: { x: 0.12, y: 0.08 }, voiced: true, hint: "舌前部抬得很高，像 /iː/ 的起点" },
};

const C = {
  outline: "#94a3b8", // 头部轮廓
  bone: "#dbe4ee", // 鼻腔/小舌头
  lip: "#f472b6", // 唇
  lipDark: "#be185d",
  tooth: "#ffffff",
  cavity: "#fdf2f8", // 口腔底色
  tongue: "#fb7185", // 舌
  tongueDark: "#e11d48",
  air: "#0ea5e9", // 气流
  voice: "#38bdf8", // 声带
  label: "#64748b",
  accent: "#0369a1",
  inner: "#9f1239", // 闭唇/圆唇的口腔内部
};

/** 舌位参数 → 画布坐标（x: 250 舌前（齿龈后）→ 510 舌后；y: 348 高 → 528 低） */
function tipPos(t) {
  const p = t || { x: 0.5, y: 0.5 };
  return { x: 250 + p.x * 260, y: 348 + p.y * 180 };
}

function buildShapes(id) {
  const cfg = T[id] || T["/ə/"];
  const S = [];
  const add = (o) => S.push(o);
  const dy = Math.round(cfg.jaw * 150); // 下颌（下齿/下唇/下巴）下降量

  /* ---- 头部轮廓：额头 + 鼻子 ---- */
  add({
    t: "p",
    d: "M 330 30 L 330 118 Q 258 126 204 158 Q 156 186 150 224 L 138 254 Q 134 272 156 274 L 202 276",
    f: "none",
    s: C.outline,
    sw: 7,
  });
  /* ---- 下颌线 + 下巴（随下颌开合下降） ---- */
  add({
    t: "p",
    d: `M 202 ${556 + dy} L 198 ${612 + dy} Q 300 ${652 + dy} 430 ${646 + dy} Q 545 ${640 + dy} 598 ${606 + dy}`,
    f: "none",
    s: C.outline,
    sw: 7,
  });
  /* ---- 后脑勺 + 咽喉后壁 ---- */
  add({
    t: "p",
    d: "M 330 30 Q 648 42 660 250 L 660 462 Q 660 556 598 606",
    f: "none",
    s: C.outline,
    sw: 7,
  });
  /* ---- 喉部到声带 ---- */
  add({ t: "p", d: `M 598 ${606 + dy} Q 636 ${636 + dy} 654 ${672 + dy}`, f: "none", s: C.outline, sw: 7 });

  /* ---- 口腔底色 ---- */
  add({
    t: "p",
    d: `M 214 330 Q 430 296 600 312 Q 642 430 604 ${552 + dy} L 252 ${548 + dy} Q 206 440 214 330 Z`,
    f: C.cavity,
  });

  /* ---- 鼻腔通道 ---- */
  add({ t: "p", d: "M 196 248 Q 340 132 480 152 Q 602 172 642 260", f: "none", s: C.bone, sw: 26 });
  add({ t: "t", x: 400, y: 118, str: "鼻腔", size: 30, f: C.label });

  /* ---- 上颚：硬腭 + 软腭 + 小舌头 ---- */
  add({ t: "p", d: "M 274 316 Q 420 250 540 242 Q 590 250 596 306", f: "none", s: C.outline, sw: 8 });
  add({ t: "e", x: 594, y: 326, rx: 14, ry: 24, f: C.bone, s: C.outline, sw: 4 });
  add({ t: "t", x: 452, y: 218, str: "上颚", size: 30, f: C.label });

  /* ---- 牙齿 ---- */
  add({ t: "p", d: "M 212 322 L 268 322 L 268 380 L 212 380 Z", f: C.tooth, s: C.outline, sw: 5 });
  add({ t: "p", d: `M 216 ${440 + dy} L 272 ${440 + dy} L 272 ${496 + dy} L 216 ${496 + dy} Z`, f: C.tooth, s: C.outline, sw: 5 });
  add({ t: "t", x: 300, y: 530 + dy, str: "齿", size: 28, f: C.label });

  /* ---- 舌头 ---- */
  const tp = tipPos(cfg.tongue);
  const tx = tp.x;
  const ty = tp.y + dy * 0.3;
  if (cfg.tipOut) {
    // 舌尖伸出齿间（θ ð）
    add({
      t: "p",
      d:
        `M 612 458 Q ${tx + 170} ${ty - 88} ${tx + 36} ${ty - 10} L ${tx - 66} ${ty + 4} ` +
        `Q ${tx + 20} ${ty + 44} ${tx + 90} ${ty + 74} Q 420 ${ty + 142} 612 ${556 + dy} Z`,
      f: C.tongue,
      s: C.tongueDark,
      sw: 6,
    });
  } else {
    add({
      t: "p",
      d:
        `M 612 458 Q ${tx + 148} ${ty - 90} ${tx + 26} ${ty - 12} ` +
        `Q ${tx - 6} ${ty + 6} ${tx + 30} ${ty + 54} ` +
        `Q ${tx + 158} ${ty + 146} 612 ${556 + dy} Z`,
      f: C.tongue,
      s: C.tongueDark,
      sw: 6,
    });
  }
  if (cfg.curl) {
    // 舌尖上卷（r tr dr）
    add({
      t: "p",
      d: `M ${tx + 36} ${ty - 8} Q ${tx + 8} ${ty - 58} ${tx + 50} ${ty - 68}`,
      f: "none",
      s: C.tongueDark,
      sw: 11,
    });
  }
  if (cfg.groove) {
    // 舌面中间的送气缝（s z ts dz）
    add({ t: "p", d: `M ${tx - 14} ${ty + 4} L ${tx + 116} ${ty - 24}`, f: "none", s: "#fff", sw: 9 });
  }
  add({ t: "t", x: 530, y: 512, str: "舌", size: 32, f: "#fff" });

  /* ---- 唇 ---- */
  const midY = Math.round((326 + 496 + dy) / 2);
  if (cfg.lips === "round") {
    add({ t: "e", x: 188, y: midY, rx: 34, ry: 46, f: C.lip, s: C.lipDark, sw: 5 });
    add({ t: "e", x: 184, y: midY, rx: 12, ry: Math.max(8, 20 - cfg.jaw * 10), f: C.inner });
  } else if (cfg.lips === "close") {
    // 双唇闭拢：上唇 + 抬起的下唇贴在一起
    add({ t: "e", x: 194, y: 300, rx: 33, ry: 21, f: C.lip, s: C.lipDark, sw: 4 });
    add({ t: "e", x: 196, y: 340, rx: 33, ry: 21, f: C.lip, s: C.lipDark, sw: 4 });
  } else {
    // 上唇 + 下唇（自然位 / 唇齿位 f v：贴到上齿下面）
    const LL = cfg.lips === "lipTeeth" ? 392 : 500 + dy;
    add({ t: "e", x: 194, y: 302, rx: 33, ry: 21, f: C.lip, s: C.lipDark, sw: 4 });
    add({ t: "e", x: 196, y: LL + 16, rx: 33, ry: 21, f: C.lip, s: C.lipDark, sw: 4 });
  }
  add({ t: "t", x: 100, y: 296, str: "唇", size: 28, f: C.label });

  /* ---- 阻塞点（爆破/破擦/鼻音的完全堵塞位置） ---- */
  if (cfg.closure === "lip") {
    add({ t: "p", d: "M 142 216 L 96 216 M 142 240 L 106 240", f: "none", s: C.accent, sw: 9 });
    add({ t: "t", x: 120, y: 192, str: "憋气", size: 26, f: C.accent });
  } else if (cfg.closure === "alv") {
    add({ t: "c", x: 268, y: 322, r: 20, f: C.accent });
  } else if (cfg.closure === "vel") {
    add({ t: "c", x: 590, y: 296, r: 22, f: C.accent });
  } else if (cfg.closure === "pal") {
    add({ t: "c", x: 462, y: 258, r: 20, f: C.accent });
  }

  /* ---- 舌侧漏气（l）---- */
  if (cfg.lateral) {
    add({ t: "p", d: "M 430 500 Q 480 450 480 390", f: "none", s: C.air, sw: 8, dash: "14 12" });
    add({ t: "t", x: 496, y: 536, str: "两边漏气", size: 26, f: C.air });
  }

  /* ---- 双元音滑动箭头 ---- */
  if (cfg.slide) {
    const a = tipPos(cfg.tongue);
    const b = tipPos(cfg.slide);
    const ax = a.x;
    const ay = a.y + dy * 0.3;
    const bx = b.x;
    const by = b.y + dy * 0.3;
    add({
      t: "p",
      d: `M ${ax + 30} ${ay - 22} Q ${(ax + bx) / 2 + 70} ${(ay + by) / 2 - 62} ${bx + 30} ${by - 22}`,
      f: "none",
      s: C.accent,
      sw: 10,
      dash: "18 14",
    });
    add({ t: "p", d: `M ${bx + 30} ${by - 22} l -36 -8 l 14 32 Z`, f: C.accent });
    add({ t: "c", x: ax, y: ay, r: 15, f: "#fff", s: C.accent, sw: 8 });
  } else if (!cfg.closure && !cfg.tipOut) {
    // 舌头目标位置标记
    add({ t: "c", x: tx, y: ty - 8, r: 15, f: "#fff", s: C.tongueDark, sw: 8 });
  }

  /* ---- 气流 ---- */
  if (cfg.nasal) {
    add({
      t: "p",
      d: "M 610 420 Q 630 300 520 200 Q 420 130 250 180",
      f: "none",
      s: C.air,
      sw: 10,
      dash: "16 14",
    });
    add({ t: "p", d: "M 250 180 l 48 -18 l -6 42 Z", f: C.air });
    add({ t: "t", x: 704, y: 444, str: "鼻子出气", size: 26, f: C.air });
  } else if (cfg.jaw > 0.1 && cfg.lips !== "close") {
    // 嘴出口处的小气流（不压住舌头，只示意出气方向）
    const ey = 396 + Math.round(dy / 3);
    add({
      t: "p",
      d: `M 300 ${ey} Q 240 ${ey - 4} 178 ${ey - 8}`,
      f: "none",
      s: C.air,
      sw: 9,
      dash: "14 12",
    });
    add({ t: "p", d: `M 178 ${ey - 8} l 44 -12 l -8 38 Z`, f: C.air });
  }
  if (cfg.puff) {
    add({ t: "p", d: "M 108 404 L 54 388 M 104 432 L 42 432 M 108 460 L 54 476", f: "none", s: C.air, sw: 9 });
    add({ t: "t", x: 76, y: 512, str: "送气", size: 26, f: C.air });
  }

  /* ---- 声带 ---- */
  if (cfg.voiced) {
    add({ t: "p", d: `M 620 ${700 + dy} q 16 -14 32 0 q 16 14 32 0 q 16 -14 32 0`, f: "none", s: C.voice, sw: 9 });
    add({ t: "t", x: 700, y: 748, str: "声带振动", size: 30, f: C.voice });
  } else {
    add({ t: "p", d: `M 626 ${700 + dy} L 694 ${700 + dy} M 660 ${686 + dy} L 660 ${714 + dy}`, f: "none", s: C.label, sw: 8 });
    add({ t: "t", x: 680, y: 748, str: "声带不振动", size: 30, f: C.label });
  }

  return S;
}

/** 极简 SVG path 解释器（本引擎只用 M/m L/l Q Z）：比 Path2D 兼容性更好 */
function tracePath(ctx, d) {
  const t = String(d).match(/[MLQZmlz]|-?\d+(?:\.\d+)?/g) || [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  while (i < t.length) {
    const c = t[i++];
    if (c === "M") {
      cx = +t[i++];
      cy = +t[i++];
      ctx.moveTo(cx, cy);
    } else if (c === "m") {
      cx += +t[i++];
      cy += +t[i++];
      ctx.moveTo(cx, cy);
    } else if (c === "L") {
      cx = +t[i++];
      cy = +t[i++];
      ctx.lineTo(cx, cy);
    } else if (c === "l") {
      cx += +t[i++];
      cy += +t[i++];
      ctx.lineTo(cx, cy);
    } else if (c === "Q") {
      const x1 = +t[i++];
      const y1 = +t[i++];
      cx = +t[i++];
      cy = +t[i++];
      ctx.quadraticCurveTo(x1, y1, cx, cy);
    } else if (c === "Z" || c === "z") {
      ctx.closePath();
    }
  }
}

/**
 * 椭圆：微信 canvas 2d 没有实现 ctx.ellipse（真机上直接 TypeError，
 * 一旦抛错整张图后面的图元全画不出来），这里用 scale + arc 等价实现。
 */
function pathEllipse(ctx, x, y, rx, ry) {
  if (typeof ctx.ellipse === "function") {
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    return;
  }
  const sx = (typeof ctx.save === "function") ? (ctx.save(), true) : false;
  ctx.translate(x, y);
  ctx.scale(rx || 0.001, ry || 0.001);
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  if (sx) ctx.restore();
}

function setDash(ctx, dash) {
  if (typeof ctx.setLineDash !== "function") return;
  ctx.setLineDash(dash || []);
}

/** 把图元画到 canvas 2d（w/h 为画布 CSS 尺寸）；返回是否成功 */
function draw(ctx, w, h, id) {
  if (!ctx || !w || !h) return false;
  const shapes = buildShapes(id);
  if (!shapes || !shapes.length) return false;
  try {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(w / 1000, h / 800);
    shapes.forEach((s) => {
      if (s.t === "p") {
        ctx.beginPath();
        tracePath(ctx, s.d);
        if (s.f && s.f !== "none") {
          ctx.fillStyle = s.f;
          ctx.fill();
        }
        if (s.s) {
          ctx.strokeStyle = s.s;
          ctx.lineWidth = s.sw || 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          setDash(ctx, s.dash);
          ctx.stroke();
          setDash(ctx, []);
        }
      } else if (s.t === "c") {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        if (s.f) {
          ctx.fillStyle = s.f;
          ctx.fill();
        }
        if (s.s) {
          ctx.strokeStyle = s.s;
          ctx.lineWidth = s.sw || 4;
          ctx.stroke();
        }
      } else if (s.t === "e") {
        ctx.beginPath();
        pathEllipse(ctx, s.x, s.y, s.rx, s.ry);
        if (s.f) {
          ctx.fillStyle = s.f;
          ctx.fill();
        }
        if (s.s) {
          ctx.strokeStyle = s.s;
          ctx.lineWidth = s.sw || 4;
          ctx.stroke();
        }
      } else if (s.t === "t") {
        ctx.fillStyle = s.f || C.label;
        ctx.font = `${s.size || 28}px sans-serif`;
        ctx.textAlign = s.anchor || "middle";
        ctx.textBaseline = "middle";
        ctx.fillText(s.str, s.x, s.y);
      }
    });
    ctx.restore();
    return true;
  } catch (e) {
    try {
      ctx.restore();
    } catch (e2) {}
    return false;
  }
}

function params(id) {
  return T[id] || null;
}

/** 注册额外发音参数（拼音等复用本引擎：pinyinLib 启动时把自己的口舌表 merge 进来） */
function extend(map) {
  Object.keys(map || {}).forEach((k) => {
    T[k] = map[k];
  });
}

/* ---------------- 旧版 canvas 适配器 ---------------- */

/**
 * 把 draw() 里的「属性赋值」写法适配到旧版 CanvasContext（方法式 setter）。
 * 旧版 canvas 不走同层渲染，在真机（尤其安卓）上的兼容性远好于 canvas 2d——
 * canvas 2d 在部分机型会让整个 WebView 卡死，所以音标页改用旧版 canvas。
 * 返回的 ctx 带一个 __flush()，画完后调一次触发真正渲染（c.draw）。
 */
function legacyCtx(c) {
  const props = {};
  const ctx = {
    save: () => c.save(),
    restore: () => c.restore(),
    beginPath: () => c.beginPath(),
    closePath: () => c.closePath(),
    moveTo: (x, y) => c.moveTo(x, y),
    lineTo: (x, y) => c.lineTo(x, y),
    quadraticCurveTo: (cx, cy, x, y) => c.quadraticCurveTo(cx, cy, x, y),
    bezierCurveTo: (a, b, x, y) => c.bezierCurveTo(a, b, x, y),
    arc: (x, y, r, a0, a1) => c.arc(x, y, r, a0, a1, false),
    fill: () => c.fill(),
    stroke: () => c.stroke(),
    clearRect: (x, y, w, h) => c.clearRect(x, y, w, h),
    translate: (x, y) => c.translate(x, y),
    scale: (a, b) => c.scale(a, b),
    rotate: (a) => c.rotate(a),
    fillText: (s, x, y) => c.fillText(String(s), x, y),
    setLineDash: (d) => {
      if (typeof c.setLineDash === "function") {
        try {
          c.setLineDash(d || [], 0);
        } catch (e) {}
      }
    },
    __flush: () => {
      try {
        c.draw(true);
      } catch (e) {}
    },
  };
  const propMap = {
    fillStyle: "setFillStyle",
    strokeStyle: "setStrokeStyle",
    lineWidth: "setLineWidth",
    lineCap: "setLineCap",
    lineJoin: "setLineJoin",
    globalAlpha: "setGlobalAlpha",
  };
  Object.keys(propMap).forEach((k) => {
    Object.defineProperty(ctx, k, {
      set(v) {
        props[k] = v;
        try {
          c[propMap[k]](v);
        } catch (e) {}
      },
      get() {
        return props[k];
      },
    });
  });
  // font: "28px sans-serif" → setFontSize(28)
  Object.defineProperty(ctx, "font", {
    set(v) {
      props.font = v;
      const m = /(\d+(?:\.\d+)?)\s*px/.exec(String(v));
      if (m) {
        try {
          c.setFontSize(parseFloat(m[1]));
        } catch (e) {}
      }
    },
    get() {
      return props.font || "";
    },
  });
  Object.defineProperty(ctx, "textAlign", {
    set(v) {
      props.textAlign = v;
      try {
        c.setTextAlign(v);
      } catch (e) {}
    },
    get() {
      return props.textAlign || "center";
    },
  });
  Object.defineProperty(ctx, "textBaseline", {
    set(v) {
      props.textBaseline = v;
      try {
        c.setTextBaseline(v);
      } catch (e) {}
    },
    get() {
      return props.textBaseline || "middle";
    },
  });
  return ctx;
}

module.exports = { buildShapes, draw, params, extend, legacyCtx };
