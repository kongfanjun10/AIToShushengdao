/**
 * 底部任务栏（页签式切换）逻辑仿真（Node 环境）
 * 运行：node tools/tab-sim.js
 * 覆盖：redirectTo 切换、同页签不跳转只回调 onSameTab、未知页签忽略、
 *       redirectTo 失败回落 reLaunch、showBack 按栈深判断
 */
let captured = null;
global.Page = (opt) => {
  captured = opt;
};

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    fail++;
    console.log("  FAIL " + name);
  }
}

const calls = { redirect: [], relaunch: [] };
let failRedirect = false;
let stackDepth = 1;
global.getCurrentPages = () => new Array(stackDepth);

global.wx = {
  redirectTo(o) {
    if (failRedirect) {
      o.fail && o.fail({ errMsg: "redirectTo:fail" });
      return;
    }
    calls.redirect.push(o.url);
  },
  reLaunch(o) {
    calls.relaunch.push(o.url);
  },
};

const tab = require(pathOf("utils/tab.js"));
function pathOf(rel) {
  return require("path").join(__dirname, "..", "shushengdao", rel);
}

/* 模拟一个页面实例：goTab 由页面方法转发 */
const page = {
  onSameTabCount: 0,
  onSameTab() {
    this.onSameTabCount++;
  },
  goTab(e) {
    tab.goTab(this, e, "home");
  },
};

const ev = (key) => ({ currentTarget: { dataset: { key } } });

/* 1. 页签切换走 redirectTo（替换当前页，不叠栈） */
page.goTab(ev("vocab"));
ok("切页签用 redirectTo", calls.redirect.length === 1 && calls.redirect[0] === "/pages/vocab/vocab");

/* 2. 同一个页签再点：不跳转，回调 onSameTab */
page.goTab(ev("home"));
ok("同页签不跳转只回调", calls.redirect.length === 1 && page.onSameTabCount === 1);

/* 3. 未知页签忽略 */
page.goTab(ev("hacker"));
ok("未知页签忽略", calls.redirect.length === 1 && calls.relaunch.length === 0);

/* 4. redirectTo 失败回落 reLaunch */
failRedirect = true;
page.goTab(ev("archive"));
ok("redirect 失败回落 reLaunch", calls.relaunch.length === 1 && calls.relaunch[0] === "/pages/archive/archive");
failRedirect = false;

/* 5. showBack：栈深 1 不显示返回，>1 显示 */
stackDepth = 1;
ok("栈底无返回按钮", tab.showBack() === false);
stackDepth = 3;
ok("深层有返回按钮", tab.showBack() === true);

/* 6. 五个页签路由齐全 */
ok(
  "路由表齐全",
  ["home", "vocab", "capture", "archive", "parent"].every((k) => /^\/pages\//.test(tab.ROUTES[k]))
);

console.log("\n结果：" + pass + " PASS，" + fail + " FAIL");
process.exit(fail ? 1 : 0);
