/**
 * 英语音标页逻辑仿真（Node 环境）
 * 运行：node tools/phonetics-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

const spoken = [];
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
  redirectTo() {},
  pageScrollTo() {},
  // 同声传译插件 mock
};

global.requirePlugin = () => ({
  textToSpeech(opt) {
    spoken.push(opt.content);
    if (opt && opt.success) opt.success({ filename: "mock.mp3" });
  },
});

function makePage() {
  const file = path.join(ROOT, "pkgLearn", "pages", "phonetics", "phonetics.js");
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = Object.assign({}, captured.data);
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => page.setData.shimmed || (page.data[k] = obj[k]));
    Object.keys(obj).forEach((k) => (page.data[k] = obj[k]));
  };
  return page;
}

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " -> " + extra : ""));
}

const store = require(path.join(ROOT, "utils", "store.js"));
const ph = require(path.join(ROOT, "utils", "phonetics.js"));

/* ---------- 进入页面 ---------- */
const p = makePage();
p.onLoad({});
check("默认进「全部」总览（ABC 歌播放器所在页）", p.data.groupKey === "all" && p.data.mode === "all", p.data.groupKey + "/" + p.data.mode);
check("总览 9 组 48 个", p.data.sections.length === 9 && p.data.sections.reduce((n, g) => n + g.items.length, 0) === 48);
p.loadGroup("v-long");
check("切到长元音组 5 个", p.data.groupKey === "v-long" && p.data.list.length === 5, p.data.groupKey + " " + p.data.list.length);
check("首音标 /iː/", p.data.item.ipa === "/iː/", p.data.item.ipa);
check("右上角胶囊避让参数", p.data.navRight > 0, "navRight=" + p.data.navRight);

/* ---------- 读音（代表词 + 例词 + 慢速） ---------- */
p.speakPhoneme();
check("读音播放代表词 see", spoken.indexOf("see") > -1, spoken.join(","));
p.setData({ speaking: false });
p.speakWord({ currentTarget: { dataset: { word: "green" } } });
check("例词点读 green", spoken.indexOf("green") > -1);
p.setData({ speaking: false });
p.toggleSlow();
p.setData({ speaking: false });
p.speakPhoneme();
p.setData({ speaking: false });
const slowCount = spoken.filter((s) => s === "see").length;
check("慢速再读一次", slowCount >= 2, "see 播放 " + slowCount + " 次");
p.toggleSlow();

/* ---------- 打勾 → 进度 → 自动跳下一个 ---------- */
p.markLearned();
check("markLearned 打勾", store.isPhonemeLearned("/iː/") === true);
check("进度 +1", store.phonemeStats().done === 1, String(store.phonemeStats().done));
check("当日 +1", store.todayPhonemes() === 1);
check("总览出现绿勾", p.data.sections[0].items[0].done === true);

setTimeout(() => {
  check("自动跳到下一个 /ɑː/", p.data.item.ipa === "/ɑː/", p.data.item.ipa);

  /* ---------- 切分类 ---------- */
  p.pickGroup({ currentTarget: { dataset: { key: "c-nasal" } } });
  check("切到鼻音组 3 个", p.data.groupKey === "c-nasal" && p.data.list.length === 3, p.data.groupKey);
  check("鼻音组首音 /m/", p.data.item.ipa === "/m/", p.data.item.ipa);

  /* ---------- 组内边界 ---------- */
  p.prevItem();
  check("第一个再往上是边界提示", p.data.item.ipa === "/m/");
  p.nextItem();
  p.nextItem();
  check("走到 /ŋ/", p.data.item.ipa === "/ŋ/", p.data.item.ipa);
  p.nextItem();
  check("末尾再往后是边界提示", p.data.item.ipa === "/ŋ/");

  /* ---------- 从总览点选（跨组自动带过去） ---------- */
  p.pickItem({ currentTarget: { dataset: { id: "/ʃ/" } } });
  check("总览点选跨组自动切换", p.data.groupKey === "c-fric" && p.data.item.ipa === "/ʃ/", p.data.groupKey + " " + p.data.item.ipa);

  /* ---------- 「全部」纯展示总览 ---------- */
  check("分类条第一个是「全部」", p.data.groups.length >= 2 && p.data.groups[0].key === "all", String(p.data.groups.length));
  p.pickGroup({ currentTarget: { dataset: { key: "all" } } });
  check("全部 chip 进入总览模式", p.data.mode === "all" && p.data.groupKey === "all", p.data.groupKey);
  check("总览收录全部 48 个", p.data.list.length === 48, String(p.data.list.length));
  check("总览分组带代表词", !!p.data.sections[0].items[0].say, p.data.sections[0].items[0] && p.data.sections[0].items[0].say);
  check("总览不写入分组记忆", store.getUser().phonicsGroup !== "all", store.getUser().phonicsGroup);
  p.pickItem({ currentTarget: { dataset: { id: "/ʃ/" } } });
  check("总览点 /ʃ/ 回到跟读卡", p.data.mode === "item" && p.data.groupKey === "c-fric" && p.data.item.ipa === "/ʃ/", p.data.groupKey);

  /* ---------- 英文歌（「全部」总览页） ---------- */
  check("英文歌 6 行且句句可念", p.data.song.lines.length === 6 && p.data.song.lines.every((l) => l.text && l.say), String(p.data.song.lines.length));
  check("英文歌是 ABC 歌词（老版本结尾）", p.data.song.lines[0].text.indexOf("A B C") > -1 && p.data.song.lines[5].text.indexOf("say my A B C") > -1, p.data.song.lines[5].text);
  check("26 个字母都在歌词里", "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").every((x) => p.data.song.lines.slice(0, 4).some((l) => l.text.indexOf(x) > -1)), "letters");
  check("每行带录音真实时间轴（t0<t1）", p.data.song.lines.every((l) => typeof l.t0 === "number" && l.t1 > l.t0), "timeline");
  check("歌曲指向分包内真人录音", !!(p.data.song.audio && p.data.song.audio.src.indexOf("pinyin") === -1 && p.data.song.audio.src.indexOf("abc_song.mp3") > -1), p.data.song.audio && p.data.song.audio.src);
  p.toggleSong();
  check("跟唱无 WebAudio 自动降级朗读", p.data.songPlaying === true && p.data.songMode === "read" && p.data.songLine === 0, p.data.songMode + "/" + p.data.songLine);
  check("TTS 念的是字母行", spoken.indexOf("A B C D E F G") > -1, spoken[spoken.length - 1]);
  p.stopSong();
  check("停止后取消高亮", p.data.songPlaying === false && p.data.songLine === -1);
  p.tapSongLine({ currentTarget: { dataset: { idx: "4" } } });
  check("点第 5 行只念那一句", p.data.songLine === 4, String(p.data.songLine));
  check("点句念收尾句", spoken.indexOf("X Y Z now you see") > -1);
  p.stopSong();
  p.pickSongMode({ currentTarget: { dataset: { mode: "sing" } } });
  check("切到跟唱模式", p.data.songMode === "sing", p.data.songMode);
  p.pickGroup({ currentTarget: { dataset: { key: "all" } } });
  p.pickItem({ currentTarget: { dataset: { id: "/ʃ/" } } });

  /* ---------- 持久化：重进页面 ---------- */
  const p2 = makePage();
  p2.onLoad({});
  check("重进固定进「全部」总览（不再记忆分组）", p2.data.groupKey === "all", p2.data.groupKey);
  check("重进后切分组仍可用", (p2.loadGroup("c-fric"), p2.data.groupKey === "c-fric" && p2.data.list.length > 0), p2.data.groupKey);
  check("重进进度保留", store.phonemeStats().done === 1, String(store.phonemeStats().done));

  const raw = JSON.stringify(global.wx._s);
  check("存储体积 < 50KB", raw.length < 50 * 1024, (raw.length / 1024).toFixed(1) + "KB");

  console.log("---- 通过 " + ok.length + " 项 ----");
  ok.forEach((s) => console.log("  ✓ " + s));
  if (bad.length) {
    console.log("---- 失败 " + bad.length + " 项 ----");
    bad.forEach((s) => console.log("  ✗ " + s));
    process.exit(1);
  }
  console.log("ALL PASS");
  process.exit(0);
}, 700);
