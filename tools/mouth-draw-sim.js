/**
 * 口舌图绘制 + 语音语种回归（Node 环境）
 * 运行：node tools/mouth-draw-sim.js
 *
 * 背景：微信 canvas 2d 没有 ctx.ellipse，之前直接调用会让整张图中断（真机白板）。
 * 本脚本用「没有 ellipse 的假 ctx」跑全部 48 个音标，确认都能画完。
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

/** 造一个假 canvas 2d 上下文；withEllipse=false 模拟微信 */
function fakeCtx(withEllipse, throwOnEllipse) {
  const calls = { fill: 0, stroke: 0, text: 0, arc: 0, ellipse: 0, dash: 0, badRestore: 0 };
  let depth = 0;
  const ctx = {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    lineJoin: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    save() {
      depth++;
    },
    restore() {
      depth--;
      if (depth < 0) calls.badRestore++;
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    translate() {},
    scale() {},
    clearRect() {},
    setLineDash() {
      calls.dash++;
    },
    fill() {
      calls.fill++;
    },
    stroke() {
      calls.stroke++;
    },
    fillText() {
      calls.text++;
    },
    arc() {
      calls.arc++;
    },
  };
  if (withEllipse) {
    ctx.ellipse = function () {
      calls.ellipse++;
      if (throwOnEllipse) throw new TypeError("ctx.ellipse is not a function");
    };
  }
  // 记录最终 save/restore 是否配平
  ctx._depth = () => depth;
  return ctx;
}

const mouth = require(path.join(ROOT, "utils", "mouthChart.js"));
const ph = require(path.join(ROOT, "utils", "phonetics.js"));

/* ---------- 1. 没有 ellipse 也要画完 ---------- */
const ids = ph.all().map((p) => p.id);
let fail = [];
ids.forEach((id) => {
  const ctx = fakeCtx(false);
  const okDraw = mouth.draw(ctx, 150, 120, id);
  if (!okDraw || ctx.calls.fill < 3 || ctx.calls.arc < 1) fail.push(id);
  if (ctx.calls.ellipse !== 0) fail.push(id + ":不该调用 ellipse");
  if (ctx._depth() !== 0) fail.push(id + ":save/restore 不配平");
});
check("48 个音标在无 ellipse 的 canvas 上都能画完", fail.length === 0, fail.join(" "));
check("音标总数 48", ids.length === 48, String(ids.length));

/* ---------- 2. ellipse 存在时优先用它 ---------- */
const ctxE = fakeCtx(true);
mouth.draw(ctxE, 150, 120, "/iː/");
check("有 ellipse 时走原生椭圆", ctxE.calls.ellipse > 0, String(ctxE.calls.ellipse));

/* ---------- 3. ellipse 抛错也不能白屏：draw 返回 false，交给降级图 ---------- */
const ctxT = fakeCtx(true, true);
let threw = false;
let ret = true;
try {
  ret = mouth.draw(ctxT, 150, 120, "/iː/");
} catch (e) {
  threw = true;
}
check("绘制异常被吞掉不外抛", threw === false);
check("绘制失败时返回 false 以触发降级", ret === false, String(ret));

/* ---------- 4. 尺寸为 0 不乱画 ---------- */
check("宽高为 0 直接返回 false", mouth.draw(fakeCtx(false), 0, 0, "/iː/") === false);
check("没有 ctx 也不崩", mouth.draw(null, 150, 120, "/iː/") === false);
const ctxU = fakeCtx(false);
let threwU = false;
try {
  mouth.draw(ctxU, 150, 120, "/nope/");
} catch (e) {
  threwU = true;
}
check("未知音标不抛错（退回默认口型）", threwU === false && ctxU.calls.fill > 0, String(ctxU.calls.fill));

/* ---------- 5. TTS 语种 ---------- */
const tts = require(path.join(ROOT, "utils", "tts.js"));
check("英文词走 en_US", tts.langOf("cat") === "en_US");
check("英文句子走 en_US", tts.langOf("This is a cat.") === "en_US");
check("中文走 zh_CN", tts.langOf("你真棒哟") === "zh_CN");
check("数字走 zh_CN", tts.langOf("23") === "zh_CN");
check("空串走 zh_CN", tts.langOf("") === "zh_CN");

/* ---------- 6. 插件真的收到 en_US ---------- */
const seen = [];
global.wx = {
  createInnerAudioContext: () => ({
    stop() {},
    play() {},
    onEnded() {},
    onError() {},
    set playbackRate(v) {},
    set src(v) {},
  }),
  getFileSystemManager: () => ({ unlink() {} }),
};
global.requirePlugin = () => ({
  textToSpeech(opt) {
    seen.push(opt.lang);
    if (opt.success) opt.success({ filename: "m.mp3" });
  },
});
// 清掉 tts 内部缓存的插件探测结果
delete require.cache[require.resolve(path.join(ROOT, "utils", "tts.js"))];
const tts2 = require(path.join(ROOT, "utils", "tts.js"));
tts2.speak("apple", {});
tts2.speak("你真棒哟", {});
check("插件按语种分别下发", seen.join(",") === "en_US,zh_CN", seen.join(","));

bad.forEach((b) => console.log("  ✗ " + b));
ok.forEach((o) => console.log("  ✓ " + o));
console.log("\n" + (bad.length ? "FAIL " + bad.length : "ALL PASS") + " (" + ok.length + " 项)");
process.exit(bad.length ? 1 : 0);
