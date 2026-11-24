/**
 * 清理数据仿真：三档清理 preview/apply + 快照备份恢复 + TTL 过期
 * 用法：node tools/clear-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let failCount = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  PASS " + name);
  } else {
    failCount++;
    console.log("  ✗ FAIL " + name + (extra !== undefined ? " => " + JSON.stringify(extra) : ""));
  }
}

/* ---- wx mock ---- */
const storage = {};
global.wx = {
  getStorageSync: (k) => (k in storage ? storage[k] : ""),
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
};
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });

const store = require(path.join(ROOT, "utils", "store.js"));

(async () => {
  console.log("== 清理数据仿真 ==");

  /* 0. 准备：铺一些学习数据 */
  store.resetAll();
  const baseGroups = store.listGroups().length; // seed 自带 1 个演示书单
  const baseWords = store.listWords().length; // seed 自带 3 个演示生词
  store.setUser({ nickname: "孔老师", phone: "13800008000", phoneSource: "manual", pinyinOn: false, speechRate: 1.2, dailyGoal: 3 });
  store.createGroup({ title: "课文一", sentences: ["春眠不觉晓", "处处闻啼鸟"] });
  store.markRead(store.DEMO_GROUP_ID, 2);
  store.addWord("秋天", "秋天的雨，是一把钥匙");

  /* 1. preview learn：5 删 3 留 */
  let pv = store.cleanupPreview("learn");
  ok("learn 清单 5 项", pv.del.length === 5, pv.del.length);
  ok("learn 保留 3 项", pv.keep.length === 3, pv.keep.length);
  ok("learn 数量文本", pv.del[0].n.indexOf("本") > -1 && pv.del[1].n.indexOf("个词") > -1, pv.del[0].n);
  ok("learn 保留资料", pv.keep[0].n.indexOf("孔老师") > -1, pv.keep[0]);

  /* 2. preview profile：6 删 2 留 */
  pv = store.cleanupPreview("profile");
  ok("profile 清单 6 项", pv.del.length === 6, pv.del.length);
  ok("profile 保留 2 项", pv.keep.length === 2 && pv.keep[0].label === "偏好设置", pv.keep);

  /* 3. preview all：8 删 0 留 */
  pv = store.cleanupPreview("all");
  ok("all 清单 8 项", pv.del.length === 8, pv.del.length);
  ok("all 无保留", pv.keep.length === 0, pv.keep.length);

  /* 4. apply learn：学习记录清零，资料/设置保留 */
  store.cleanupApply("learn");
  let u = store.getUser();
  ok("learn 书单清空（含演示书单，不重新冒出来）", store.listGroups().length === 0, store.listGroups().length);
  ok("learn 生词清空（含演示生词）", store.listWords().length === 0, store.listWords().length);
  ok("learn 近 7 天统计清零", store.weekStats(7).every((d) => d.sentences === 0), JSON.stringify(store.weekStats(7).map((d) => d.sentences)));
  ok("learn 资料保留", u.nickname === "孔老师" && u.phone === "13800008000", u.nickname);
  ok("learn 设置保留", u.pinyinOn === false && u.speechRate === 1.2 && u.dailyGoal === 3, u);

  /* 5. 快照存在且可恢复 */
  const snap = store.getSnapshot();
  ok("快照已生成", !!snap && !!snap.data, !!snap);
  ok("快照日期文案", store.snapshotAgeText() === "今天", store.snapshotAgeText());
  ok("恢复成功", store.restoreSnapshot() === true);
  ok("恢复后书单回来", store.listGroups().length === baseGroups + 1, store.listGroups().length);
  ok("恢复后快照清除", store.getSnapshot() === null);

  /* 6. apply profile：昵称复位、手机号与偏好保留 */
  store.cleanupApply("profile");
  u = store.getUser();
  ok("profile 昵称复位为空（新用户由首次引导设置）", u.nickname === "", u.nickname);
  ok("profile 手机号保留", u.phone === "13800008000", u.phone);
  ok("profile 偏好保留", u.pinyinOn === false && u.speechRate === 1.2 && u.dailyGoal === 3, u);
  ok("profile 学习记录清空", store.listGroups().length === 0, store.listGroups().length);

  /* 7. apply all：全部复位 */
  store.cleanupApply("all");
  u = store.getUser();
  ok("all 手机号清空", u.phone === "", u.phone);
  ok("all 书单清空", store.listGroups().length === 0, store.listGroups().length);
  ok("all 生词清空", store.listWords().length === 0, store.listWords().length);
  ok("all 近 7 天报告归零", store.weekStats(7).every((d) => d.sentences === 0 && d.minutes === 0), JSON.stringify(store.weekStats(7).map((d) => [d.md, d.sentences])));
  ok("all 累计统计归零", store.overview().sentences === 0 && store.overview().activeDays === 0, JSON.stringify(store.overview()));
  ok("all 每日完成情况无高亮行", store.weekStats(7).every((d) => !d.active), "active 行应全为 false");

  /* 8. TTL：8 天前的快照视为过期 */
  store.setUser({ nickname: "临时" });
  store.cleanupApply("learn");
  const stale = store.getSnapshot();
  stale.at = Date.now() - 8 * 86400e3;
  storage.wb_reset_snapshot = stale;
  ok("过期快照返回 null", store.getSnapshot() === null);
  ok("过期文案为空", store.snapshotAgeText() === "");
  ok("过期后不可恢复", store.restoreSnapshot() === false);

  /* 9. 首次安装仍是演示数据（seed 只在首装出现，清理不回带） */
  store.resetAll();
  ok("首次安装保留演示书单", store.listGroups().length === 1, store.listGroups().length);
  ok("首次安装保留演示生词", store.listWords().length === 3, store.listWords().length);
  ok("首装演示统计在近 7 天内", store.weekStats(7).some((d) => d.sentences > 0), "seed 演示统计应可见");

  console.log("\n结果：" + pass + " PASS，" + failCount + " FAIL");
  process.exit(failCount ? 1 : 0);
})();
