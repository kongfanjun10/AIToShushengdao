/**
 * 笔顺演示绘制引擎（配合 utils/strokeData.js 使用）
 *
 * 数据是「每笔的中心线折线」（0~1000 归一化坐标），这里负责：
 *   1. 按画布尺寸换算成像素
 *   2. 按「已写到第几笔、当前笔写到几分」绘制一帧
 *      - 已写完的笔：实色
 *      - 正在写的笔：实色 + 只画到 t（笔尖有个小圆点，看得出从哪起笔、往哪走）
 *      - 还没写的笔：很浅的底色，勾出整字轮廓
 *
 * 用法（横屏「笔顺教程」）：
 *   const strokePlay = require("../../utils/strokePlay");
 *   strokePlay.draw(ctx, size, strokes, index, t);
 */

const STYLE = {
  done: "#075985",      // 已写完的笔
  active: "#0369a1",    // 正在写的笔
  guide: "rgba(3,105,161,0.14)", // 未写的笔（浅色轮廓）
  head: "#38bdf8",      // 笔尖
  widthRatio: 0.062,    // 笔宽 ≈ 画布边长 * 该比例
};

function toPoints(flat, size) {
  const pts = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pts.push({ x: (flat[i] / 1000) * size, y: (flat[i + 1] / 1000) * size });
  }
  return pts;
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lengthOf(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  return n;
}

/** 取折线前 t（0~1）比例的部分，用于「笔画写到一半」的效果 */
function prefix(pts, t) {
  if (t >= 1 || pts.length < 2) return pts.slice(0, Math.max(1, pts.length));
  const need = lengthOf(pts) * Math.max(0, t);
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= need) {
      const k = d > 0 ? (need - acc) / d : 0;
      out.push({
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
      });
      return out;
    }
    acc += d;
    out.push(pts[i]);
  }
  return out;
}

function polyline(ctx, pts, width, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/**
 * 画一帧
 * @param ctx     canvas 2d context
 * @param size    画布边长（正方形，px）
 * @param strokes 归一化笔画数组
 * @param index   当前是第几笔（0 起）
 * @param t       当前笔的进度 0~1
 * @param opts    可选覆盖样式 { done, active, guide, head, widthRatio, showHead }
 */
function draw(ctx, size, strokes, index, t, opts) {
  if (!ctx || !size) return;
  const st = Object.assign({}, STYLE, opts || {});
  const list = strokes || [];
  const cur = Math.max(0, Math.min(index || 0, list.length - 1));
  const prog = Math.max(0, Math.min(1, t || 0));
  const baseW = Math.max(5, size * st.widthRatio);

  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 先画浅色的「还没写」的笔，再覆盖已写的，避免后画的压住先画的
  list.forEach((flat, i) => {
    if (i >= cur) return;
    polyline(ctx, toPoints(flat, size), baseW, st.done);
  });
  for (let i = cur + 1; i < list.length; i++) {
    polyline(ctx, toPoints(list[i], size), baseW * 0.78, st.guide);
  }
  // 当前笔
  const curPts = toPoints(list[cur] || [], size);
  if (curPts.length) {
    const sub = prefix(curPts, prog);
    polyline(ctx, sub, baseW * 1.04, st.active);
    // 笔尖：还在写的时候给个圆点，看得出方向
    if (st.showHead !== false && prog < 1 && sub.length) {
      const head = sub[sub.length - 1];
      ctx.beginPath();
      ctx.arc(head.x, head.y, baseW * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(56,189,248,0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(head.x, head.y, baseW * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = st.head;
      ctx.fill();
    }
  }
}

/** 整字一次画完（用于缩略图 / 封面） */
function drawAll(ctx, size, strokes, opts) {
  draw(ctx, size, strokes, Math.max(0, (strokes || []).length - 1), 1, opts);
}

module.exports = { draw, drawAll, prefix, lengthOf, toPoints, STYLE };
