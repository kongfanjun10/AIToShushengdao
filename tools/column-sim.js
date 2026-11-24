/**
 * 竖式计算页逻辑仿真（Node 环境）
 * 运行：node tools/column-sim.js
 * 覆盖：三档出题位数、逐位计算过程（进位/借位）、逐位输入与自动判定、错位标记、错题本、持久化
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
  const file = path.join(ROOT, "pages", "column", "column.js");
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
const col = require(path.join(ROOT, "utils", "column.js"));

const tap = (k) => ({ currentTarget: { dataset: { k } } });
const colTap = (i) => ({ currentTarget: { dataset: { i } } });

/** 从条件反推一组固定题目，方便断言 */
function fixed(page, a, b, op) {
  const answer = op === "+" ? a + b : a - b;
  const cols = Math.max(String(a).length, String(b).length, String(answer).length);
  page.next(true);
  page.setData({
    q: {
      a,
      b,
      op,
      answer,
      cols,
      expr: a + op + b,
      steps: col.steps(a, b, op, cols),
      answerDigits: col.digits(answer, cols),
    },
    active: 0,
    phase: "idle",
  });
  page._cells = new Array(cols).fill("");
  page._bad = {};
  page.renderCells();
}

async function main() {
  store.resetAll();
  delete wx._s[store.KEY];

  /* ---------- 1. 出题与位数 ---------- */
  let badGen = 0;
  for (let i = 0; i < 40; i++) {
    const q = col.gen("add2");
    if (q.a + q.b !== q.answer) badGen++;
    if (q.a < 10 || q.a > 99 || q.b < 10 || q.b > 99) badGen++;
    if (q.answer > 99) badGen++;
    const joined = col.digits(q.answer, q.cols).reverse().join("");
    if (joined !== String(q.answer)) badGen++;
  }
  check("两位数加：答案正确且不超两位", badGen === 0, "bad=" + badGen);

  badGen = 0;
  for (let i = 0; i < 40; i++) {
    const q = col.gen("sub2");
    if (q.a - q.b !== q.answer || q.answer <= 0) badGen++;
    if (q.b >= q.a) badGen++;
  }
  check("两位数减：大减小且不为负", badGen === 0, "bad=" + badGen);

  badGen = 0;
  for (let i = 0; i < 40; i++) {
    const q = col.gen("add3");
    if (q.a + q.b !== q.answer) badGen++;
    if (q.cols !== 3) badGen++;
  }
  check("三位数加：cols=3 且答案正确", badGen === 0, "bad=" + badGen);

  /* ---------- 2. 逐位过程 ---------- */
  let s = col.steps(36, 28, "+", 2);
  check("加法个位 6+8=14 写 4 进 1", s[0].digit === 4 && s[0].out === 1, JSON.stringify(s[0]));
  check("加法十位带进位 3+2+1=6", s[1].digit === 6 && s[1].in === 1, JSON.stringify(s[1]));

  s = col.steps(52, 27, "-", 2);
  check("减法个位 2-7 借位得 5", s[0].digit === 5 && s[0].out === 1, JSON.stringify(s[0]));
  check("减法十位 5-1-2=2", s[1].digit === 2 && s[1].in === 1, JSON.stringify(s[1]));

  const q = col.fromExpr("123+45");
  check("题面还原", q && q.answer === 168 && q.cols === 3, q && q.answer + "/" + q.cols);
  check("非法题面", col.fromExpr("abc") === null);

  /* ---------- 3. 页面初始 ---------- */
  let p = makePage();
  p.onLoad();
  check("默认两位数加", p.data.levelKey === "add2", p.data.levelKey);
  check("开局有竖式", p.data.cellView.length === p.data.q.cols, String(p.data.cellView.length));
  check("从个位开始填", p.data.active === 0);
  check("位数标签从高到低", p.data.labels.join("/") === "十位/个位", p.data.labels.join("/"));
  check("初始提示讲个位", p.data.stepTip.indexOf("个位") === 0, p.data.stepTip);

  /* ---------- 4. 逐位填对 ---------- */
  fixed(p, 36, 28, "+");
  check("cells 长度 2", p.data.cellView.length === 2);
  check("个位提示含 6 + 8", p.data.stepTip.indexOf("6 + 8") > -1, p.data.stepTip);

  p.press(tap("4"));
  check("填个位后光标到十位", p.data.active === 1, String(p.data.active));
  check("个位显示 4", p.data.cellView[1].v === "4", JSON.stringify(p.data.cellView.map((c) => c.v)));
  check("十位提示带进位", p.data.stepTip.indexOf("3 + 2 + 1") > -1, p.data.stepTip);
  check("进位标记出现", p.data.cellView[0].carry === 1, JSON.stringify(p.data.cellView[0]));

  spoken.length = 0;
  p.press(tap("6"));
  check("填满自动判对", p.data.phase === "right", p.data.phase);
  check("答对语音「你真棒哟」", spoken.some((x) => x.text === "你真棒哟"), JSON.stringify(spoken));
  check("答对计入统计", p.data.stats.todayRight === 1, String(p.data.stats.todayRight));
  check("答案提示 64", p.data.stepTip.indexOf("64") > -1, p.data.stepTip);
  await sleep(90);

  /* ---------- 5. 填错 ---------- */
  fixed(p, 45, 17, "+");
  p.press(tap("2"));
  p.press(tap("5"));
  check("填错判为 wrong", p.data.phase === "wrong", p.data.phase);
  check("错位标红（十位写 5 应为 6）", p.data.cellView[0].bad === true, JSON.stringify(p.data.cellView.map((c) => c.bad)));
  check("个位写 2 是对的，不标红", p.data.cellView[1].bad === false);
  check("答错语音", spoken.some((x) => x.text === "答错咯，要加油哟"), JSON.stringify(spoken.slice(-2)));
  check("答错入错题本", store.columnWrongList().some((w) => w.expr === "45+17"), JSON.stringify(store.columnWrongList()));

  p.retry();
  check("再试一次清空", p.data.phase === "idle" && p.data.cellView.every((c) => c.v === ""));
  check("光标回到个位", p.data.active === 0);

  /* ---------- 6. 删除与选位 ---------- */
  p.press(tap("6"));
  p.press(tap("2"));
  check("填满两位", p.data.cellView.every((c) => c.v));
  p.del();
  check("退格删当前位", p.data.cellView[0].v === "" && p.data.active === 1, JSON.stringify(p.data.cellView.map((c) => c.v)) + " active=" + p.data.active);
  p.del();
  check("再退一位", p.data.cellView[1].v === "" && p.data.active === 0);
  p.pickCol(colTap(1));
  check("点某一位切换光标", p.data.active === 1 && p.data.cellView[0].active === true);
  p.press(tap("9"));
  check("在指定位填数", p.data.cellView[0].v === "9");

  /* ---------- 7. 没填完按 ✓ ---------- */
  p.retry();
  p.press(tap("2"));
  p.submit();
  check("缺位时提示还有空位", p.data.tip.indexOf("空位") > -1, p.data.tip);
  check("光标跳到空格", p.data.active === 1);
  check("缺位不判分", p.data.phase === "idle");

  /* ---------- 8. 竖式提示开关 ---------- */
  p.toggleCarry();
  check("可以关掉进位标记", p.data.showCarry === false);
  check("关掉后无标记", p.data.cellView.every((c) => !c.carry));
  p.toggleCarry();
  check("可以再打开", p.data.showCarry === true);

  /* ---------- 9. 难度与错题 ---------- */
  p.pickLevel({ currentTarget: { dataset: { key: "sub2" } } });
  check("难度切换", p.data.levelKey === "sub2", p.data.levelKey);
  check("难度持久化", store.columnLevel() === "sub2");
  check("减法题面带 -", p.data.q.op === "-", p.data.q.op);
  check("减法提示讲借位", /不够减|借/.test(p.data.stepTip) || p.data.stepTip.indexOf("−") > -1, p.data.stepTip);

  p.toggleOnlyWrong();
  check("错题模式开启", p.data.onlyWrong === true);
  check("错题模式出原题", p.data.q.expr === "45+17", p.data.q.expr);
  p.setData({ active: 0 });
  p._cells = ["2", "6"];
  p.submit();
  check("错题改对判对", p.data.phase === "right", p.data.phase);
  check("错题自动移出", store.columnWrongList().length === 0);
  await sleep(90);

  /* ---------- 10. 读题与持久化 ---------- */
  spoken.length = 0;
  p.readQuestion();
  check("读题走 TTS 且是中文", spoken.some((x) => x.lang === "zh_CN"), JSON.stringify(spoken));

  p.onUnload();
  const before = store.columnStats();
  p = makePage();
  p.onLoad();
  check("重进保留统计", p.data.stats.todayRight === before.todayRight, p.data.stats.todayRight + " vs " + before.todayRight);
  check("重进保留难度", p.data.levelKey === "sub2");
  check("存储体积 < 50KB", JSON.stringify(wx._s).length < 50 * 1024, (JSON.stringify(wx._s).length / 1024).toFixed(1) + "KB");

  bad.forEach((b) => console.log("  ✗ " + b));
  ok.forEach((o) => console.log("  ✓ " + o));
  console.log("\n" + (bad.length ? "FAIL " + bad.length : "ALL PASS") + " (" + ok.length + " 项)");
  process.exit(bad.length ? 1 : 0);
}

main();
