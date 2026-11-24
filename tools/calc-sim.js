/**
 * 口算闯关页逻辑仿真（Node 环境）
 * 运行：node tools/calc-sim.js
 * 覆盖：四档出题范围、题面还原、键盘输入、判分与语音反馈、错题本、难度、限时挑战、持久化
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

const spoken = [];
let audioCbs = {};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    spoken.push({ text: opt.content, lang: opt.lang });
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

global.wx = {
  _s: {},
  _toast: "",
  getStorageSync(k) {
    return this._s[k] || "";
  },
  setStorageSync(k, v) {
    this._s[k] = v;
  },
  removeStorageSync(k) {
    delete this._s[k];
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast(o) {
    this._toast = (o && o.title) || "";
  },
  showModal() {},
  vibrateShort() {},
  vibrateLong() {},
  navigateBack() {},
  navigateTo() {},
  createInnerAudioContext: () => ({
    _src: "",
    set src(v) {
      this._src = v;
    },
    get src() {
      return this._src;
    },
    play() {
      setTimeout(() => audioCbs.onEnd && audioCbs.onEnd(), 20);
    },
    stop() {},
    destroy() {},
    onEnded(cb) {
      audioCbs.onEnd = cb;
    },
    onError(cb) {
      audioCbs.err = cb;
    },
    set playbackRate(v) {},
  }),
};

function makePage() {
  const file = path.join(ROOT, "pages", "calc", "calc.js");
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        page.data[k] = obj[k];
      }
    });
  };
  return page;
}

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

const store = require(path.join(ROOT, "utils", "store.js"));
const calc = require(path.join(ROOT, "utils", "calc.js"));

const tap = (k) => ({ currentTarget: { dataset: { k } } });

async function main() {
  store.resetAll();
  delete wx._s[store.KEY];

  /* ---------- 1. 出题范围 ---------- */
  let rangeBad = 0;
  for (let i = 0; i < 60; i++) {
    const q = calc.gen("add10");
    const sum = q.a + q.b;
    const sub = q.a - q.b;
    if (q.op === "+") {
      if (sum > 10 || q.a < 1 || q.b < 1) rangeBad++;
      if (q.answer !== sum) rangeBad++;
    } else {
      if (sub < 1 || q.a > 10) rangeBad++;
      if (q.answer !== sub) rangeBad++;
    }
  }
  check("10 以内：加减都在范围内且答案正确", rangeBad === 0, "bad=" + rangeBad);

  rangeBad = 0;
  for (let i = 0; i < 60; i++) {
    const q = calc.gen("add20");
    if (q.op === "+") {
      if (q.a + q.b < 11 || q.a + q.b > 18) rangeBad++;
    } else {
      if (q.a < 11 || q.a > 18) rangeBad++;
      if (q.a - q.b < 1 || q.a - q.b > 9) rangeBad++;
    }
  }
  check("20 以内：加法必进位、减法必退位", rangeBad === 0, "bad=" + rangeBad);

  rangeBad = 0;
  for (let i = 0; i < 40; i++) {
    const q = calc.gen("mul");
    if (q.a < 2 || q.a > 9 || q.b < 2 || q.b > 9) rangeBad++;
    if (q.answer !== q.a * q.b) rangeBad++;
  }
  check("乘法口诀：2~9 且乘积正确", rangeBad === 0, "bad=" + rangeBad);

  rangeBad = 0;
  for (let i = 0; i < 60; i++) {
    const q = calc.gen("mix100");
    if (q.answer < 0 || q.answer > 100) rangeBad++;
    if (q.op === "+" && q.a + q.b > 100) rangeBad++;
  }
  check("100 以内：结果落在 0~100", rangeBad === 0, "bad=" + rangeBad);

  const qe = calc.gen("mix100");
  check("题面与算式一致", qe.expr === qe.a + qe.op + qe.b, qe.expr);
  const q0 = { a: 7, b: 8, op: "×", answer: 56 };
  check("判分：对", calc.check(q0, "56") === true);
  check("判分：错", calc.check(q0, "54") === false);
  check("判分：空", calc.check(q0, "") === false);
  check("读题文案", calc.speakOf(7, "+", 8) === "7 加 8 等于几", calc.speakOf(7, "+", 8));
  const back = calc.fromExpr("23+45");
  check("题面还原加法", back && back.answer === 68 && back.a === 23 && back.b === 45);
  const back2 = calc.fromExpr("8×9");
  check("题面还原乘法", back2 && back2.answer === 72);
  check("非法题面返回 null", calc.fromExpr("abc") === null);

  /* ---------- 2. 页面：初始状态 ---------- */
  let p = makePage();
  p.onLoad();
  check("默认难度 10 以内", p.data.levelKey === "add10", p.data.levelKey);
  check("开局有题面", !!p.data.q.expr, p.data.q.expr);
  check("输入框为空", p.data.input === "");
  check("状态 idle", p.data.phase === "idle");

  /* ---------- 3. 键盘输入 ---------- */
  p.setData({ q: { a: 3, b: 5, op: "+", answer: 8, expr: "3+5", speak: "3 加 5 等于几" } });
  p.press(tap("1"));
  p.press(tap("2"));
  check("连按两位组成 12", p.data.input === "12", p.data.input);
  p.press(tap("del"));
  check("退格删一位", p.data.input === "1", p.data.input);
  p.press(tap("3"));
  p.press(tap("4"));
  p.press(tap("5"));
  check("最多 3 位", p.data.input === "134", p.data.input);

  /* ---------- 4. 答错 ---------- */
  spoken.length = 0;
  p.setData({ input: "9", phase: "idle" });
  p.submit();
  check("答错进入 wrong", p.data.phase === "wrong", p.data.phase);
  check("答错语音「答错咯，要加油哟」", spoken.some((s) => s.text === "答错咯，要加油哟"), JSON.stringify(spoken));
  check("答错提示文案", p.data.tip === "答错咯，要加油哟", p.data.tip);
  check("答错计入统计", p.data.stats.todayWrong === 1, String(p.data.stats.todayWrong));
  check("答错进错题本", store.calcWrongList().some((w) => w.expr === "3+5"), JSON.stringify(store.calcWrongList()));
  check("历史点变橙", p.data.history[p.data.history.length - 1].ok === false);

  p.clearInput();
  check("再试一次清空输入", p.data.input === "" && p.data.phase === "idle");

  /* ---------- 5. 答对 ---------- */
  spoken.length = 0;
  p.press(tap("8"));
  check("重新输入正常", p.data.input === "8", p.data.input);
  p.submit();
  check("答对进入 right", p.data.phase === "right", p.data.phase);
  check("答对语音「你真棒哟」", spoken.some((s) => s.text === "你真棒哟"), JSON.stringify(spoken));
  check("答对计入统计", p.data.stats.todayRight === 1, String(p.data.stats.todayRight));
  check("连对 +1", p.data.stats.streak === 1, String(p.data.stats.streak));
  check("答对移出错题本", store.calcWrongList().length === 0);
  const roundBefore = p.data.round;
  await sleep(90);
  check("答对自动下一题", p.data.round === roundBefore + 1 && p.data.phase === "idle", "round=" + p.data.round + " phase=" + p.data.phase);

  /* ---------- 6. 读题与提示 ---------- */
  spoken.length = 0;
  p.speakQuestion();
  check("读题走 TTS", spoken.length >= 1, JSON.stringify(spoken));
  const ansNow = p.data.q.answer;
  p.showHint();
  check("提示给出答案", p.data.tip.indexOf(String(ansNow)) > -1, p.data.tip);

  /* ---------- 7. 难度切换 ---------- */
  p.pickLevel({ currentTarget: { dataset: { key: "mul" } } });
  check("难度切换生效", p.data.levelKey === "mul", p.data.levelKey);
  check("难度持久化", store.calcLevel() === "mul", store.calcLevel());
  check("切换后题目变了", p.data.q.level === "mul", String(p.data.q.level));

  /* ---------- 8. 错题模式 ---------- */
  p.setData({ q: { a: 4, b: 6, op: "×", answer: 24, expr: "4×6", speak: "" }, input: "25", phase: "idle" });
  p.submit();
  check("乘法答错入册", store.calcWrongList().some((w) => w.expr === "4×6"));
  p.toggleOnlyWrong();
  check("开启只练错题", p.data.onlyWrong === true);
  check("错题模式出的就是错题", p.data.q.expr === "4×6", p.data.q.expr);

  p.setData({ input: String(p.data.q.answer) });
  p.submit();
  check("错题答对", p.data.phase === "right");
  check("错题答对自动移出", store.calcWrongList().length === 0);
  await sleep(90);

  /* ---------- 9. 限时挑战 ---------- */
  p.toggleTimed();
  check("进入限时挑战", p.data.timed === true);
  check("倒计时从 60 开始", p.data.left === 60, String(p.data.left));
  check("限时清零本轮计数", p.data.overRight === 0 && p.data.overWrong === 0);
  p.setData({ left: 1 });
  await sleep(1150);
  check("倒计时归零结算", p.data.over === true && p.data.left === 0, "left=" + p.data.left);
  p.restartTimed();
  check("再来一局重置", p.data.over === false && p.data.left === 60);
  p.toggleTimed(); // 退出挑战
  check("退出挑战关掉计时", p.data.timed === false);

  /* ---------- 10. 持久化 ---------- */
  p.onUnload();
  const before = store.calcStats();
  p = makePage();
  p.onLoad();
  check("重进页面保留统计", p.data.stats.todayRight === before.todayRight, p.data.stats.todayRight + " vs " + before.todayRight);
  check("重进页面保留难度", p.data.levelKey === "mul", p.data.levelKey);
  check("存储体积 < 50KB", JSON.stringify(wx._s).length < 50 * 1024, (JSON.stringify(wx._s).length / 1024).toFixed(1) + "KB");

  /* ---------- 结果 ---------- */
  bad.forEach((b) => console.log("  ✗ " + b));
  ok.forEach((o) => console.log("  ✓ " + o));
  console.log("\n" + (bad.length ? "FAIL " + bad.length : "ALL PASS") + " (" + ok.length + " 项)");
  process.exit(bad.length ? 1 : 0);
}

main();
