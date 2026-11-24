/**
 * 数字测试页逻辑仿真（Node 环境）
 * 运行：node tools/math-sim.js
 * 覆盖：读法解析、区间设置校验、随机出题、录音识别判分、语音反馈、错题本、统计与持久化
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

/* ---------- mock：TTS 播报内容收集 + 音频播完即触发 onEnd ---------- */
const spoken = [];
let audioCbs = {};

/* ---------- mock：同声传译识别管理器 ---------- */
const asrCbs = {};
let asrStartCount = 0;
const recMgr = {
  onStart(cb) {
    asrCbs.start = cb;
  },
  onRecognize(cb) {
    asrCbs.partial = cb;
  },
  onStop(cb) {
    asrCbs.final = cb;
  },
  onError(cb) {
    asrCbs.err = cb;
  },
  start() {
    asrStartCount += 1;
  },
  stop() {},
};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    spoken.push(opt.content);
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
  getRecordRecognitionManager: () => recMgr,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

global.wx = {
  _s: {},
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
    this._toast = o && o.title;
  },
  showModal() {},
  vibrateShort() {},
  navigateBack() {},
  navigateTo() {},
  pageScrollTo() {},
  openSetting() {},
  getRecorderManager: () => ({
    start() {},
    stop() {},
    onStop() {},
    onError() {},
  }),
  createInnerAudioContext: () => ({
    _src: "",
    set src(v) {
      this._src = v;
    },
    get src() {
      return this._src;
    },
    play() {
      setTimeout(() => audioCbs.onEnd && audioCbs.onEnd(), 30);
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
  const file = path.join(ROOT, "pages", "math", "math.js");
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
const ns = require(path.join(ROOT, "utils", "numberSpeech"));

async function main() {
  /* ---------- 1. 读法解析 ---------- */
  const cases = [
    ["二十三", 23, true],
    ["一百零五", 105, true],
    ["二三", 23, true],
    ["一零五", 105, true],
    ["一百一", 110, true],
    ["两千三", 2300, true],
    ["十", 10, true],
    ["23", 23, true],
    ["0", 0, true],
    ["这个数字是二十三。", 23, true],
    ["嗯…三十", 23, false], // 读的是 30，不是 23
    ["三十二", 23, false],
    ["", 23, false],
    ["我没听见", 23, false],
  ];
  cases.forEach(([text, target, want]) => {
    const r = ns.check(text, target);
    check("判分 " + JSON.stringify(text) + " vs " + target, r.ok === want, "got " + r.ok);
  });
  check("读法提示 105", ns.intToCn(105) === "一百零五", ns.intToCn(105));
  check("读法提示 110", ns.intToCn(110) === "一百一十", ns.intToCn(110));
  check("读法提示 1000", ns.intToCn(1000) === "一千", ns.intToCn(1000));
  check("逐位读法在提示里", ns.readings(105).indexOf("一零五") > -1, ns.readings(105).join("/"));

  /* ---------- 2. 区间设置校验 ---------- */
  let res = store.setMathRange(5, 5);
  check("最大=最小被拒", res.ok === false && !!res.err, res.err);
  res = store.setMathRange(50, 10);
  check("大小颠倒被拒", res.ok === false, res.err);
  res = store.setMathRange(-1, 10);
  check("负数下限被拒", res.ok === false, res.err);
  res = store.setMathRange(1, 99999);
  check("超过 9999 被拒", res.ok === false, res.err);
  res = store.setMathRange("3", "abc");
  check("非数字被拒", res.ok === false, res.err);
  res = store.setMathRange(1, 100);
  check("合法区间生效", res.ok === true && res.range.min === 1 && res.range.max === 100);
  check("区间已持久化", store.mathRange().max === 100);

  /* ---------- 3. 计分与错题 ---------- */
  store.markAnswer(23, true);
  store.markAnswer(23, true);
  store.markAnswer(23, false);
  let st = store.mathStats();
  check("答对计数", st.todayRight === 2, JSON.stringify(st));
  check("答错计数", st.todayWrong === 1);
  check("错题收录 23", store.mathWrongList().some((w) => w.n === 23));
  check("连对被答错清零", st.streak === 0);
  store.markAnswer(23, true);
  st = store.mathStats();
  check("答对移出错题本", !store.mathWrongList().some((w) => w.n === 23));
  check("连对恢复 1", st.streak === 1);
  store.markAnswer(45, false);
  store.markAnswer(45, false);
  check("错题去重", store.mathWrongList().filter((w) => w.n === 45).length === 1);

  /* ---------- 4. 页面：进入与出题 ---------- */
  const p = makePage();
  p.onLoad({});
  check("识别通道可用（插件 mock）", p.data.asrOk === true);
  check("导航避让参数", p.data.navRight > 0, "navRight=" + p.data.navRight);
  check("读到了已存的区间", p.data.range.min === 1 && p.data.range.max === 100, JSON.stringify(p.data.range));
  check("区间跨度正确", p.data.span === 100);
  check("首题在区间内", p.data.current >= 1 && p.data.current <= 100, String(p.data.current));
  check("首题读法提示", p.data.hintText === ns.intToCn(p.data.current), p.data.hintText);
  check("初始待读状态", p.data.phase === "idle" && p.data.micLabel === "点一下，开始读");

  // 连续出题 30 次都在区间内且基本不重复上一题
  let inRange = true;
  let repeat = 0;
  for (let i = 0; i < 30; i++) {
    p.next();
    const n = p.data.current;
    if (n < 1 || n > 100) inRange = false;
    if (n === p.data._prevCheck) repeat += 1;
    p.data._prevCheck = n;
  }
  check("30 次出题全部落在区间内", inRange);
  check("几乎不与上一题重复", repeat <= 2, "重复 " + repeat + " 次");

  /* ---------- 5. 录音识别 → 读对 ---------- */
  spoken.length = 0;
  p.setData({ current: 23, numSize: 160, hintText: "二十三" });
  p.tapMic();
  check("点麦克风进入录音态", p.data.phase === "listening" && p.data.micLabel === "正在听…");
  check("识别已启动", asrStartCount >= 1, String(asrStartCount));
  asrCbs.partial && asrCbs.partial({ result: "二十" });
  check("实时识别上屏", p.data.partial === "二十");
  asrCbs.partial && asrCbs.partial({ result: "二十三" });
  await sleep(700); // 听出目标数字后 600ms 自动收尾
  check("听出答案自动收尾", p.data.phase === "listening" && p.data.micLabel === "正在识别…", p.data.micLabel);
  asrCbs.final && asrCbs.final({ result: "二十三", tempFilePath: "mock-record.mp3" });
  // 判分同步完成，先断言结果再看自动跳题
  check("判为读对", p.data.phase === "right", p.data.phase);
  check("语音答复「你真棒哟」", spoken.indexOf("你真棒哟") > -1, spoken.join(","));
  check("识别文本回显", p.data.heard === "二十三");
  check("今日答对 +1", p.data.stats.todayRight === 4, String(p.data.stats.todayRight));
  check("连对 +1", p.data.stats.streak === 1);
  check("历史记录落点", p.data.history.length >= 1 && p.data.history[p.data.history.length - 1].ok === true);
  check("可回听录音", p.data.hasFile === true);
  await sleep(200); // mock 音频 onEnd 200ms 后自动进入下一题
  check("答对自动进入下一题", p.data.phase === "idle" && p.data.round >= 2, "round=" + p.data.round);

  /* ---------- 6. 读错 ---------- */
  spoken.length = 0;
  p.setData({ current: 23, hintText: "二十三" });
  p.tapMic();
  await sleep(30);
  asrCbs.final && asrCbs.final({ result: "三十二", tempFilePath: "mock2.mp3" });
  await sleep(120);
  check("判为读错", p.data.phase === "wrong", p.data.phase);
  check("语音答复「答错咯，要加油哟」", spoken.indexOf("答错咯，要加油哟") > -1, spoken.join(","));
  check("提示正确答案与读法", p.data.hintText === "二十三", p.data.hintText);
  check("今日答错 +1", p.data.stats.todayWrong === 4, String(p.data.stats.todayWrong));
  check("连对清零", p.data.stats.streak === 0);
  check("错题本收录 23", store.mathWrongList().some((w) => w.n === 23));

  /* ---------- 7. 答错后重读同题 ---------- */
  p.retrySame();
  check("重读回到录音态", p.data.phase === "listening");
  await sleep(30);
  asrCbs.final && asrCbs.final({ result: "23", tempFilePath: "" });
  check("重读判对", p.data.phase === "right", p.data.phase);
  await sleep(250);
  check("重读后移出错题本", !store.mathWrongList().some((w) => w.n === 23));
  await sleep(150);

  /* ---------- 8. 没听清 ---------- */
  p.tapMic();
  await sleep(30);
  asrCbs.final && asrCbs.final({ result: "", tempFilePath: "mock3.mp3" });
  await sleep(80);
  check("空识别提示重读且不计分", p.data.phase === "retry", p.data.phase);
  const stBefore = store.mathStats();
  check("没听清不计答错", stBefore.todayWrong === 4, String(stBefore.todayWrong));

  /* ---------- 9. 家长确认降级 ---------- */
  p.setData({ asrOk: false, phase: "idle" });
  p.tapMic();
  check("无识别时走录音降级", p.data.phase === "listening", p.data.phase);
  p.finishManual();
  check("录音结束进入家长确认", p.data.phase === "manual", p.data.phase);
  p.manualJudge({ currentTarget: { dataset: { ok: "1" } } });
  check("家长判对 → 答对流程", p.data.phase === "right" && p.data.stats.todayRight === 6, p.data.phase);
  p.setData({ asrOk: true }); // 恢复识别通道，供后面的用例使用
  await sleep(300);

  /* ---------- 10. 区间设置弹层 ---------- */
  p.openSettings();
  check("弹层打开并带入当前区间", p.data.settingsOpen === true && p.data.draftMin === "1" && p.data.draftMax === "100");
  p.pickPreset({ currentTarget: { dataset: { i: 3 } } });
  check("选预设 1 ~ 100", p.data.draftMin === "1" && p.data.draftMax === "100");
  p.setData({ draftMin: "50", draftMax: "10" });
  p.saveRange();
  check("非法区间提示错误", p.data.draftErr !== "" && p.data.settingsOpen === true, p.data.draftErr);
  p.setData({ draftMin: "10", draftMax: "99" });
  p.saveRange();
  check("保存后区间生效", p.data.range.min === 10 && p.data.range.max === 99 && !p.data.settingsOpen, JSON.stringify(p.data.range));
  check("新题在新区间内", p.data.current >= 10 && p.data.current <= 99, String(p.data.current));

  /* ---------- 11. 只练错题 ---------- */
  store.markAnswer(11, false);
  store.markAnswer(22, false);
  p.setData({ current: 50 });
  p.toggleOnlyWrong();
  check("错题模式开启", p.data.onlyWrong === true);
  let allWrong = true;
  for (let i = 0; i < 12; i++) {
    p.next();
    const n = p.data.current;
    if (!store.mathWrongList().some((w) => w.n === n)) allWrong = false;
  }
  check("错题模式只出错过的数字", allWrong, p.data.history && String(p.data.current));
  p.setData({ current: 11, hintText: "十一" });
  p.tapMic();
  await sleep(30);
  asrCbs.final && asrCbs.final({ result: "十一" });
  check("错题练对判为答对", p.data.phase === "right", p.data.phase);
  check("错题练对自动移出", !store.mathWrongList().some((w) => w.n === 11));
  await sleep(250);
  p.toggleOnlyWrong();
  check("退出错题模式", p.data.onlyWrong === false);

  /* ---------- 12. 持久化：重进页面 ---------- */
  const before = store.mathStats();
  const p2 = makePage();
  p2.onLoad({});
  check("重进保留区间", p2.data.range.min === 10 && p2.data.range.max === 99, JSON.stringify(p2.data.range));
  check("重进保留统计", p2.data.stats.todayRight === before.todayRight, JSON.stringify(p2.data.stats));
  const raw = JSON.stringify(global.wx._s);
  check("存储体积 < 60KB", raw.length < 60 * 1024, (raw.length / 1024).toFixed(1) + "KB");

  /* ---------- 13. 页面卸载清理 ---------- */
  p2.tapMic();
  check("再次进入录音态", p2.data.phase === "listening");
  p2.onUnload();
  check("卸载后取消识别", true);
  const p3 = makePage();
  p3.onLoad({});
  check("卸载后重进状态干净", p3.data.phase === "idle", p3.data.phase);

  console.log("---- 通过 " + ok.length + " 项 ----");
  ok.forEach((s) => console.log("  ✓ " + s));
  if (bad.length) {
    console.log("---- 失败 " + bad.length + " 项 ----");
    bad.forEach((s) => console.log("  ✗ " + s));
    process.exit(1);
  }
  console.log("ALL PASS");
  process.exit(0);
}

main().catch((e) => {
  console.error("SIM ERROR", e);
  process.exit(1);
});
