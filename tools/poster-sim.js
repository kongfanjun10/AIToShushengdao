/**
 * 两端小改动的仿真（Node 环境）
 *  1) 家长中心「每日完成情况」左侧由「周几」改为「月/日」
 *  2) 奖状海报底部加小程序码（推广）+ 无码时的降级文案
 *
 * 运行：node tools/poster-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    console.log("  ✗ " + name + (detail !== undefined ? " —— " + detail : ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- wx mock ---------------- */
const storage = {};
const files = new Set();
const calls = { copy: [], save: [], text: [], drawImage: [], unlink: [] };

function makeCtx() {
  const ctx = {
    font: "16px sans-serif",
    textAlign: "center",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    _dash: [],
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    setLineDash(a) {
      this._dash = a || [];
    },
    measureText(t) {
      const size = parseInt(String(this.font).replace(/[^\d]/g, ""), 10) || 16;
      return { width: String(t).length * size };
    },
    fillText(t, x, y) {
      calls.text.push({ t: String(t), x: x, y: y, font: this.font, align: this.textAlign, color: this.fillStyle });
    },
    drawImage(img, x, y, w, h) {
      calls.drawImage.push({ img: img, x: x, y: y, w: w, h: h });
    },
  };
  return ctx;
}

let imgMode = "ok"; // ok | error
function makeCanvas() {
  const ctx = makeCtx();
  return {
    width: 0,
    height: 0,
    _ctx: ctx,
    getContext: () => ctx,
    createImage() {
      const img = { _src: "", onload: null, onerror: null };
      Object.defineProperty(img, "src", {
        set(v) {
          img._src = v;
          setTimeout(() => {
            if (imgMode === "error") img.onerror && img.onerror({});
            else img.onload && img.onload({});
          }, 0);
        },
        get() {
          return img._src;
        },
      });
      return img;
    },
  };
}
const canvas = makeCanvas();

global.wx = {
  getStorageSync: (k) => storage[k] || "",
  setStorageSync: (k, v) => {
    storage[k] = v;
  },
  removeStorageSync: (k) => {
    delete storage[k];
  },
  env: { USER_DATA_PATH: "wxfile://usr" },
  getFileSystemManager: () => ({
    accessSync(p) {
      if (!files.has(p)) throw new Error("no such file");
    },
    copyFile(o) {
      calls.copy.push(o);
      files.add(o.destPath);
      o.success && o.success({});
    },
    unlinkSync(p) {
      calls.unlink.push(p);
      files.delete(p);
    },
  }),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, statusBarHeight: 44 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  createSelectorQuery: () => ({
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(cb) {
      cb([{ node: canvas, width: 600, height: 960 }]);
    },
  }),
  canvasToTempFilePath: (o) => {
    o.success && o.success({ tempFilePath: "http://tmp/poster.png" });
  },
  saveImageToPhotosAlbum: (o) => {
    calls.save.push(o.filePath);
    o.success && o.success({});
  },
  showLoading() {},
  hideLoading() {},
  showToast() {},
  showModal(o) {
    calls.modal = o;
    o && o.success && o.success({ confirm: true });
  },
  setClipboardData(o) {
    calls.clip = o.data;
    o.success && o.success({});
  },
  openSetting() {},
  navigateTo() {},
  navigateBack() {},
  redirectTo() {},
  pageScrollTo() {},
  createInnerAudioContext: () => ({
    obeyMuteSwitch: false,
    onEnded() {},
    onError() {},
    play() {},
    stop() {},
    destroy() {},
  }),
  cloud: {
    init() {},
    callFunction(o) {
      o.success && o.success({ result: { ok: true, fileID: "cloud://qr_poster.png" } });
    },
    downloadFile(o) {
      o.success && o.success({ tempFilePath: "http://tmp/dl_qr.png" });
    },
  },
};

global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.getCurrentPages = () => [{}];
let pageOpt = null;
global.Page = (o) => {
  pageOpt = o;
};

/* ---------------- A. 每日完成情况：月/日 ---------------- */
const store = require(path.join(ROOT, "utils", "store.js"));

console.log("\n[A] 家长中心「每日完成情况」日期");
const week = store.weekStats(7);
check("7 条数据", week.length === 7, week.length);
check(
  "每条都有 md（M/D 两位）",
  week.every((d) => /^\d{2}\/\d{2}$/.test(d.md || "")),
  JSON.stringify(week.map((d) => d.md))
);
check(
  "md 与 date 一致",
  week.every((d) => d.date.slice(5, 7) + "/" + d.date.slice(8, 10) === d.md),
  JSON.stringify(week.map((d) => [d.date, d.md]))
);
const now = new Date();
const todayMd =
  String(now.getMonth() + 1).padStart(2, "0") + "/" + String(now.getDate()).padStart(2, "0");
check("最后一条是今天", week[6].md === todayMd, week[6].md + " vs " + todayMd);
check(
  "柱状图短标签仍保留周几（未破坏图文周报）",
  /^周[日一二三四五六]$/.test(week[6].label),
  week[6].label
);

require(path.join(ROOT, "pages", "parent", "parent.js"));
const parentPage = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
parentPage.setData = function (patch) {
  Object.assign(this.data, patch);
};
parentPage.load();
check("家长中心 week 带 md", parentPage.data.week.every((d) => !!d.md), JSON.stringify(parentPage.data.week[0]));
check(
  "今天行 today=true（仅最后一条）",
  parentPage.data.week.filter((d) => d.today).length === 1 &&
    parentPage.data.week[6].today === true
);

// v1.3：列表最新日期排第一行（柱状图仍按时间从左到右）
const wl = parentPage.data.weekList;
check("weekList 7 条", wl.length === 7, wl.length);
check(
  "weekList 第一行是今天",
  wl[0].date === parentPage.data.week[6].date && wl[0].today === true,
  wl[0].date + " today=" + wl[0].today
);
check(
  "weekList 严格由新到旧",
  wl.every((d, i) => i === 0 || d.date < wl[i - 1].date),
  wl.map((d) => d.date).join(" > ")
);
check(
  "weekList 与 week 内容一致（仅顺序相反）",
  JSON.stringify(wl) === JSON.stringify(parentPage.data.week.slice().reverse()),
  JSON.stringify(wl.map((d) => d.md))
);
check(
  "柱状图数据未受影响（week 仍由旧到新）",
  parentPage.data.week[0].date < parentPage.data.week[6].date &&
    parentPage.data.week[6].md === todayMd,
  parentPage.data.week[0].md + " → " + parentPage.data.week[6].md
);

/* ---------------- B. 奖状海报 + 小程序码 ---------------- */
console.log("\n[B] 奖状海报底部小程序码");
require(path.join(ROOT, "pages", "reward", "reward.js"));
const page = Object.assign({}, pageOpt, { data: JSON.parse(JSON.stringify(pageOpt.data)) });
page.setData = function (patch) {
  Object.assign(this.data, patch);
};
page.onLoad({});
// 新默认昵称为空（由首次引导设置）；编号场景先模拟「已设置昵称的孩子」再算 uid
store.setUser({ nickname: "孔老师" });
const certUid = String(store.getUser().phone || store.getUser().nickname || "anon");
check("证书编码：当日流水号从 001 起", /^NO\.\d{8}-001$/.test(page.data.certNo), page.data.certNo);
page.onLoad({});
check("同日同内容重复生成 → 沿用上一版编号（仍 001）", /^NO\.\d{8}-001$/.test(page.data.certNo), page.data.certNo);
const cs1 = wx.getStorageSync("wb_cert_seq");
cs1.users[certUid].last = null; // 清掉查重指纹，模拟「内容变了」
wx.setStorageSync("wb_cert_seq", cs1);
page.onLoad({});
check("同日不同内容流水号递增（002）", /^NO\.\d{8}-002$/.test(page.data.certNo), page.data.certNo);
store.setUser({ nickname: "小美" });
page.onLoad({});
check("多用户隔离：另一孩子独立计数（001 起）", /^NO\.\d{8}-001$/.test(page.data.certNo), page.data.certNo);
check("多用户互不影响：原用户计数未被挤占（seq=2）", (wx.getStorageSync("wb_cert_seq").users[certUid] || {}).seq === 2, JSON.stringify(wx.getStorageSync("wb_cert_seq").users));
store.setUser({ nickname: "孔老师" });
page.onLoad({});
check("切回原用户沿用其上一版编号（002）", /^NO\.\d{8}-002$/.test(page.data.certNo), page.data.certNo);
const cs2 = wx.getStorageSync("wb_cert_seq");
cs2.date = "2026-11-15";
wx.setStorageSync("wb_cert_seq", cs2);
page.onLoad({});
check("跨天自动归零（次日从 001 重新升序）", /^NO\.\d{8}-001$/.test(page.data.certNo), page.data.certNo);

(async () => {
  page.savePoster();
  await sleep(120);

  check("canvas 尺寸随海报高度更新（600×960×dpr）", canvas.width === 1200 && canvas.height === 1920, canvas.width + "×" + canvas.height);
  check("云函数取码 → 下载 → 拷贝到本地缓存", calls.copy.length >= 1, JSON.stringify(calls.copy[0] || null));
  check("本地缓存写入 storage", !!storage["wb_qr_poster_v1"] && storage["wb_qr_poster_v1"].path === "wxfile://usr/qr_poster.png", JSON.stringify(storage["wb_qr_poster_v1"] || null));
  check("码图被画进海报（148×148，右下）", calls.drawImage.length === 1 && calls.drawImage[0].w === 148 && calls.drawImage[0].x > 300, JSON.stringify(calls.drawImage[0] || null));
  check(
    "左侧推广文案：微信扫一扫 / 打开「书声岛」",
    calls.text.some((t) => t.t === "微信扫一扫") && calls.text.some((t) => t.t === "打开「书声岛」"),
    JSON.stringify(calls.text.map((t) => t.t))
  );
  check("文案带上了孩子昵称", calls.text.some((t) => t.t.indexOf("一起每天读一点") > -1), JSON.stringify(calls.text.map((t) => t.t)));
  check("落款在码块之下（y>840，随动态布局自适应）", calls.text.some((t) => t.t.indexOf("NO.") === 0 && t.y > 840), JSON.stringify(calls.text.filter((t) => t.t.indexOf("NO.") === 0)));
  check("海报已存相册", calls.save.length === 1 && calls.save[0] === "http://tmp/poster.png", JSON.stringify(calls.save));

  /* 无码降级：云开发没开通 */
  calls.text.length = 0;
  calls.drawImage.length = 0;
  const cloud = global.wx.cloud;
  delete global.wx.cloud;
  page.savePoster();
  await sleep(120);
  check("无云开发时仍能出图", calls.save.length === 2, calls.save.length);
  check("降级为「微信搜索」文案块", calls.text.some((t) => t.t === "微信搜索「书声岛」"), JSON.stringify(calls.text.map((t) => t.t)));
  check("降级时不画任何二维码图", calls.drawImage.length === 0, calls.drawImage.length);
  global.wx.cloud = cloud;

  /* 码图加载失败：依旧不留空白框 */
  calls.text.length = 0;
  calls.drawImage.length = 0;
  imgMode = "error";
  page.renderPoster("wxfile://usr/qr_poster.png");
  await sleep(120);
  check("码图 onerror 时回落到文案块", calls.text.some((t) => t.t === "微信搜索「书声岛」"), JSON.stringify(calls.text.map((t) => t.t)));
  check("码图 onerror 时仍保存成功", calls.save.length === 3, calls.save.length);

  /* 码图读不到（空路径）也不报错 */
  calls.text.length = 0;
  page.renderPoster("");
  await sleep(60);
  check("无路径时直接画文案版", calls.text.some((t) => t.t === "微信搜索「书声岛」"));
  check(
    "证书标题「荣誉证书」逐字绘制",
    ["荣", "誉", "证", "书"].every((c) => calls.text.some((t) => t.t === c && t.font.indexOf("54px serif") > -1)),
    JSON.stringify(calls.text.filter((t) => t.font.indexOf("54px") > -1).map((t) => t.t))
  );
  check(
    "标题为中国红、副题为金色",
    ["荣", "誉", "证", "书"].every((c) => calls.text.some((t) => t.t === c && t.color === "#cf3f35")) &&
      calls.text.some((t) => t.t === "岛" && t.color === "#a3821d"),
    JSON.stringify(calls.text.filter((t) => ["荣", "岛"].indexOf(t.t) > -1).map((t) => [t.t, t.color]))
  );
  const subText = calls.text.find((t) => t.t.indexOf("用时 ") === 0);
  const medalText = calls.text.find((t) => t.t === "书声岛" && t.font.indexOf("13px") > -1);
  check(
    "正文已删「兹证明」且姓名不带「小朋友」",
    calls.text.every((t) => t.t.indexOf("兹") === -1) &&
      calls.text.every((t) => t.t.indexOf("小朋友") === -1) &&
      calls.text.some((t) => t.t === "孔老师"),
    JSON.stringify(calls.text.map((t) => t.t).filter((s) => s.indexOf("兹") > -1 || s.indexOf("小朋友") > -1))
  );
  const badgeChars = Array.from("授予「" + page.data.badgeName + "」称号").filter(
    (c) => c !== "「" && c !== "」"
  );
  check(
    "授称号独立成行且突出（红色加粗，逐字绘制）",
    badgeChars.every((c) =>
      calls.text.some((t) => t.t === c && t.color === "#cf3f35" && t.font.indexOf("bold 25px serif") === 0)
    ),
    JSON.stringify(calls.text.filter((t) => t.font.indexOf("25px") > -1).map((t) => [t.t, t.color]))
  );
  check(
    "正文不再包含「被授予」字样（称号已单独突出）",
    calls.text.every((t) => t.t.indexOf("被授予") === -1)
  );
  check(
    "奖章与上一行行距 ≥ 80px（不再紧凑）",
    subText && medalText && medalText.y - 18 - subText.y >= 80,
    subText && medalText ? "subY=" + subText.y + " medalY=" + (medalText.y - 18) : "missing"
  );
  check(
    "落款保持在蓝色内框之上（y ≤ 908）",
    calls.text.filter((t) => t.t.indexOf("NO.") === 0 || t.t.indexOf("保持朗读") === 0).every((t) => t.y <= 908),
    JSON.stringify(calls.text.filter((t) => t.y > 890).map((t) => [t.t, t.y]))
  );
  check(
    "证书正文齐全（昵称/授予称号/鼓励语/落款）",
    calls.text.some((t) => t.t === "孔老师") &&
      ["授", "予", "称", "号"].every((c) => calls.text.some((t) => t.t === c)) &&
      calls.text.some((t) => t.t.indexOf("特发此状") > -1) &&
      calls.text.some((t) => t.t === "保持朗读，下一段更精彩 ✨")
  );

  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
