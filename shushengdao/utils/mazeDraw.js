/**
 * 迷宫绘制（练习册风格）：粗圆头墙条 + 果点 + 入口红箭头 / 出口蓝箭头 + 死胡同小装饰。
 * paintOps 输出一组与平台无关的图形指令（ops），页面端用 exec 画到 canvas 2d，
 * 预览端用 opsToSvg 转成 SVG —— 两端共用同一套几何，保证"所见即所得"。
 *
 * 指令集：
 *   {t:'meta',w,h}                   画布尺寸
 *   {t:'rr',x,y,w,h,r,fill}          圆角矩形
 *   {t:'rect',x,y,w,h,fill,r?}       矩形
 *   {t:'line',x1,y1,x2,y2,w,color}   圆头线段
 *   {t:'circle',x,y,r,fill}          圆
 *   {t:'tri',pts,fill}               三角形
 *   {t:'text',x,y,s,size}            居中 emoji / 文字
 */

// 三套配色（参考练习册：绿篱花园 / 雪花木桥 / 草地公园），每换一局轮换一次
const PALS = [
  { key: "hedge", name: "绿篱花园", bg: "#fdf1ec", path: "#ffffff", wall: "#8fc255", edge: "#67a33a", dot: "#ef8757" },
  { key: "wood", name: "雪花木桥", bg: "#e3eefa", path: "#fffdf6", wall: "#efc98d", edge: "#d3a35f", dot: "#e8524a" },
  { key: "park", name: "草地公园", bg: "#eef7e4", path: "#ffffff", wall: "#83c46b", edge: "#5f9f49", dot: "#f2b53c" },
];

const ARROW_IN = "#e8524a"; // 入口红箭头
const ARROW_OUT = "#3a5fa8"; // 出口蓝箭头

// 死胡同小装饰（参考图：路上有房子、摩天轮、小花、小车）
const DECOR = ["🌷", "🌳", "🏠", "🚗", "🎪", "🎠", "⛲", "🍄", "🎈", "⛱"];

function palOf(i) {
  return PALS[((i % PALS.length) + PALS.length) % PALS.length];
}

/** 墙条：把每行/每列的连续墙格合并成一条线段（单位格坐标，取格心；单格墙加极小长度保证圆头成珠） */
function wallRuns(g) {
  const n = g.length;
  const runs = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (g[r][c] === 1) {
        let e = c;
        while (e + 1 < n && g[r][e + 1] === 1) e++;
        const y = r + 0.5;
        runs.push({ x1: c + 0.5, y1: y, x2: e + 0.5 + (e === c ? 0.02 : 0), y2: y });
        c = e + 1;
      } else c++;
    }
  }
  for (let c = 0; c < n; c++) {
    let r = 0;
    while (r < n) {
      if (g[r][c] === 1) {
        let e = r;
        while (e + 1 < n && g[e + 1][c] === 1) e++;
        const x = c + 0.5;
        runs.push({ x1: x, y1: r + 0.5, x2: x, y2: e + 0.5 + (e === r ? 0.02 : 0) });
        r = e + 1;
      } else r++;
    }
  }
  return runs;
}

/** 死胡同：恰好只有一个开口的通道格（参考图里放小装饰的位置），可传排除名单 */
function deadEnds(g, exclude) {
  const n = g.length;
  const ex = exclude || [];
  const out = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (g[r][c] === 1) continue;
      if (ex.some((p) => p.r === r && p.c === c)) continue;
      let open = 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && g[nr][nc] === 0) open++;
      });
      if (open === 1) out.push({ r: r, c: c });
    }
  }
  return out;
}

/** 给死胡同分配装饰 emoji（确定性，重绘不变） */
function decorate(spots) {
  return spots.map((p) => ({
    r: p.r,
    c: p.c,
    e: DECOR[(p.r * 7 + p.c * 13) % DECOR.length],
  }));
}

/**
 * 生成绘制指令
 * @param {number[][]} g 迷宫（1=墙 0=路）
 * @param {object} opts { cell, pal, entrance:{r,c}, exit:{r,c}, player:{r,c}|null, goal:{r,c}, decor:[{r,c,e}] }
 */
function paintOps(g, opts) {
  const pal = opts.pal;
  const cell = opts.cell;
  const n = g.length;
  const M = cell * 0.8; // 四周留白：放进出箭头
  const S = cell * n;
  const W = S + M * 2;
  const ox = M;
  const oy = M;
  const px = (u) => ox + u * cell;
  const py = (u) => oy + u * cell;
  const ops = [{ t: "meta", w: W, h: W }];

  // 1. 页底 + 走廊白底
  ops.push({ t: "rr", x: 0, y: 0, w: W, h: W, r: cell * 0.45, fill: pal.bg });
  ops.push({ t: "rr", x: ox - cell * 0.06, y: oy - cell * 0.06, w: S + cell * 0.12, h: S + cell * 0.12, r: cell * 0.3, fill: pal.path });

  // 2. 墙条：深色描边一遍 + 主色一遍 → 练习册的立体粗条
  const runs = wallRuns(g);
  [
    [pal.edge, cell * 0.62],
    [pal.wall, cell * 0.48],
  ].forEach((p) => {
    runs.forEach((r) =>
      ops.push({ t: "line", x1: px(r.x1), y1: py(r.y1), x2: px(r.x2), y2: py(r.y2), w: p[1], color: p[0] })
    );
  });

  // 3. 果点（长在墙上，确定性分布，约 1/3 的墙格）
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (g[r][c] !== 1) continue;
      if ((r * 31 + c * 17) % 3 !== 0) continue;
      ops.push({ t: "circle", x: px(c + 0.5), y: py(r + 0.5), r: cell * 0.09, fill: pal.dot });
    }
  }

  // 4. 入口 / 出口豁口：把边框墙格盖成走廊色
  const en = opts.entrance || { r: 0, c: 1 };
  const ex = opts.exit || { r: n - 1, c: n - 2 };
  ops.push({ t: "rect", x: px(en.c), y: py(en.r), w: cell, h: cell, fill: pal.path });
  ops.push({ t: "rect", x: px(ex.c), y: py(ex.r), w: cell, h: cell, fill: pal.path });

  // 5. 箭头：入口红（上方，指向迷宫）/ 出口蓝（下方，指向外 = 走出）
  const AW = cell * 0.36; // 头宽
  const AH = cell * 0.3; // 头高
  const SW = cell * 0.16; // 杆宽
  const SH = cell * 0.26; // 杆高
  function arrow(cx, tipY, color) {
    ops.push({ t: "tri", pts: [[cx - AW / 2, tipY - AH], [cx + AW / 2, tipY - AH], [cx, tipY]], fill: color });
    ops.push({ t: "rect", x: cx - SW / 2, y: tipY - AH - SH, w: SW, h: SH, r: SW / 2, fill: color });
  }
  arrow(px(en.c + 0.5), oy - M * 0.25, ARROW_IN);
  arrow(px(ex.c + 0.5), oy + S + M * 0.75, ARROW_OUT);

  // 6. 死胡同小装饰
  (opts.decor || []).forEach((d) => {
    ops.push({ t: "text", x: px(d.c + 0.5), y: py(d.r + 0.55), s: d.e, size: cell * 0.56 });
  });

  // 7. 终点 + 小人（过关后小人隐藏，只剩 🎯）
  const goal = opts.goal;
  if (goal) ops.push({ t: "text", x: px(goal.c + 0.5), y: py(goal.r + 0.56), s: "🎯", size: cell * 0.6 });
  if (opts.player) {
    ops.push({ t: "text", x: px(opts.player.c + 0.5), y: py(opts.player.r + 0.56), s: "🧒", size: cell * 0.66 });
  }
  return ops;
}

/** 页面端：把 ops 画到 canvas 2d（坐标已是 css px，调用前自行 scale dpr） */
function exec(ctx, ops) {
  (ops || []).forEach((o) => {
    if (o.t === "meta") return;
    if (o.t === "rr") {
      ctx.fillStyle = o.fill;
      roundPath(ctx, o.x, o.y, o.w, o.h, o.r);
      ctx.fill();
    } else if (o.t === "rect") {
      ctx.fillStyle = o.fill;
      if (o.r) {
        roundPath(ctx, o.x, o.y, o.w, o.h, o.r);
        ctx.fill();
      } else {
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    } else if (o.t === "line") {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.w;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
    } else if (o.t === "circle") {
      ctx.fillStyle = o.fill;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.t === "tri") {
      ctx.fillStyle = o.fill;
      ctx.beginPath();
      ctx.moveTo(o.pts[0][0], o.pts[0][1]);
      ctx.lineTo(o.pts[1][0], o.pts[1][1]);
      ctx.lineTo(o.pts[2][0], o.pts[2][1]);
      ctx.closePath();
      ctx.fill();
    } else if (o.t === "text") {
      ctx.fillStyle = "#4a4a4a";
      ctx.font = o.size + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.s, o.x, o.y);
    }
  });
}

function roundPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

/** 预览/测试端：把 ops 转成 SVG（几何与 canvas 完全一致） */
function opsToSvg(ops) {
  const meta = (ops || []).find((o) => o.t === "meta") || { w: 100, h: 100 };
  const parts = [];
  (ops || []).forEach((o) => {
    if (o.t === "rr") {
      parts.push('<rect x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" width="' + fmt(o.w) + '" height="' + fmt(o.h) + '" rx="' + fmt(o.r) + '" fill="' + o.fill + '"/>');
    } else if (o.t === "rect") {
      parts.push('<rect x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" width="' + fmt(o.w) + '" height="' + fmt(o.h) + '"' + (o.r ? ' rx="' + fmt(o.r) + '"' : "") + ' fill="' + o.fill + '"/>');
    } else if (o.t === "line") {
      parts.push('<line x1="' + fmt(o.x1) + '" y1="' + fmt(o.y1) + '" x2="' + fmt(o.x2) + '" y2="' + fmt(o.y2) + '" stroke="' + o.color + '" stroke-width="' + fmt(o.w) + '" stroke-linecap="round"/>');
    } else if (o.t === "circle") {
      parts.push('<circle cx="' + fmt(o.x) + '" cy="' + fmt(o.y) + '" r="' + fmt(o.r) + '" fill="' + o.fill + '"/>');
    } else if (o.t === "tri") {
      parts.push('<polygon points="' + o.pts.map((p) => fmt(p[0]) + "," + fmt(p[1])).join(" ") + '" fill="' + o.fill + '"/>');
    } else if (o.t === "text") {
      parts.push('<text x="' + fmt(o.x) + '" y="' + fmt(o.y) + '" font-size="' + fmt(o.size) + '" text-anchor="middle" dominant-baseline="central">' + o.s + "</text>");
    }
  });
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + meta.w + '" height="' + meta.h + '" viewBox="0 0 ' + meta.w + " " + meta.h + '">' +
    parts.join("") +
    "</svg>"
  );
}

module.exports = { PALS, palOf, wallRuns, deadEnds, decorate, paintOps, exec, opsToSvg };
