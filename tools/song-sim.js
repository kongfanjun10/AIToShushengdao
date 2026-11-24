/**
 * songPlay 真人录音播放链路仿真
 * 运行：node tools/song-sim.js
 *
 * 覆盖：歌词时间轴数据、跟唱整段（seek 开头/到尾巴自动停）、朗读逐句（句间停顿）、
 * 慢速倍率、点单行、无音频能力降级 TTS、stop 清理。
 * 注意：朗读模式 TTS 也用 createInnerAudioContext 播 mp3，断言要盯 songPlay 自己的 ctx。
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let captured = null;
global.Page = (opt) => (captured = opt);
const stor = {};
const spoken = [];
global.wx = {
  getStorageSync: (k) => stor[k] || "",
  setStorageSync: (k, v) => (stor[k] = v),
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: 375, windowHeight: 812, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  showToast() {},
  vibrateShort() {},
  navigateBack() {},
  pageScrollTo() {},
};
global.requirePlugin = () => ({
  textToSpeech(o) {
    spoken.push(o && o.content);
    if (o && o.success) o.success({ filename: "m.mp3" });
  },
});

function makeCtx() {
  return {
    src: "", currentTime: 0, duration: 0, playbackRate: 1, obeyMuteSwitch: true,
    _h: {}, _playing: false, _dead: false,
    onCanplay(f) { this._h.can = f; },
    onTimeUpdate(f) { this._h.time = f; },
    onEnded(f) { this._h.end = f; },
    onError(f) { this._h.err = f; },
    play() { this._playing = true; },
    pause() { this._playing = false; },
    stop() { this._playing = false; },
    destroy() { this._dead = true; },
    seek(t) { this.currentTime = t; },
  };
}
const ctxs = [];
global.wx.createInnerAudioContext = () => {
  const c = makeCtx();
  ctxs.push(c);
  return c;
};

const songs = require(path.join(ROOT, "utils", "songs.js"));
const songPlay = require(path.join(ROOT, "utils", "songPlay.js"));

const ok = [];
const bad = [];
const check = (n, c, e) => (c ? ok : bad).push(n + (e ? " -> " + e : ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  /* ---------- 1. 歌词时间轴数据 ---------- */
  const py = songs.pinyin;
  const abc = songs.english;
  check("拼音歌 18 句（一句一行，含结尾重复句）", py.lines.length === 18, String(py.lines.length));
  check("英文歌 6 行", abc.lines.length === 6, String(abc.lines.length));
  check("拼音歌时间轴递增且首尾相接（无高亮空档）", py.lines.every((l, i) => l.t1 > l.t0 && (i === 0 || Math.abs(l.t0 - py.lines[i - 1].t1) < 0.01)));
  check("首音/读行/跟唱 kind 全标注", py.lines.filter((l) => l.kind === "lead").length === 2 && py.lines.filter((l) => l.kind === "read").length === 7 && py.lines.filter((l) => l.kind === "sing").length === 9);
  check("英文歌时间轴递增", abc.lines.every((l, i) => l.t1 > l.t0 && (i === 0 || l.t0 >= abc.lines[i - 1].t1 - 0.01)));
  check("跟唱区间 = 首行起 ~ 末行止", py.startAt === py.lines[0].t0 && py.endAt === py.lines[17].t1, py.startAt + "~" + py.endAt);
  check("每句时长都不超过 13 秒（不会一行亮很久）", py.lines.every((l) => l.t1 - l.t0 <= 13), String(Math.max.apply(null, py.lines.map((l) => Math.round((l.t1 - l.t0) * 10) / 10))));
  check("歌词不含《两只老虎》", py.sub.indexOf("两只老虎") === -1 && py.tip.indexOf("两只老虎") === -1);
  check("歌词不含《小星星》", abc.sub.indexOf("小星星") === -1 && abc.tip.indexOf("小星星") === -1);
  check("ABC 老版本结尾", abc.lines[5].text.indexOf("say my A B C") > -1, abc.lines[5].text);

  /* ---------- 1b. songView 工具 ---------- */
  const songView = require(path.join(ROOT, "utils", "songView.js"));
  check("songView.fmt 秒转分秒", songView.fmt(115.27) === "1:55" && songView.fmt(0.4) === "0:00" && songView.fmt(63) === "1:03", songView.fmt(115.27));
  const fakePage = { data: { songScroll: 0 }, setData(o) { Object.assign(this.data, o); } };
  songView.follow(fakePage, 3); // 无 createSelectorQuery 的环境直接跳过，不崩
  songView.follow(fakePage, -1);
  check("songView.follow 无选择器环境不崩", fakePage.data.songScroll === 0, String(fakePage.data.songScroll));

  /* ---------- 2. 跟唱整段 ---------- */
  require(path.join(ROOT, "pkgLearn", "pages", "pinyin", "pinyin.js"));
  const page = Object.assign({}, captured);
  page.data = Object.assign({}, captured.data);
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => (page.data[k] = obj[k]));
  };
  page.onLoad({});
  page.pickGroup({ currentTarget: { dataset: { key: "all" } } });
  page.toggleSong();
  const ctxSing = ctxs[ctxs.length - 1];
  check("跟唱：建音频并 play 触发加载", !!ctxSing && ctxSing._playing === true);
  check("跟唱：src 指向分包 mp3", ctxSing.src === "/pkgLearn/sounds/songs/pinyin_song.mp3", ctxSing.src);
  check("跟唱：原速 1.0", ctxSing.playbackRate === 1, String(ctxSing.playbackRate));
  ctxSing.duration = 132;
  ctxSing._h.can();
  check("跟唱：onCanplay 从首行开头起播（seek 到 1.2s）", Math.abs(ctxSing.currentTime - 1.2) < 0.2, String(ctxSing.currentTime));
  ctxSing.currentTime = 20;
  ctxSing._h.time();
  check("跟唱：20s 落在第 4 句（g k h j q x…）", page.data.songLine === 3, "line=" + page.data.songLine);
  check("跟唱：进度条随时长推进", page.data.songPos > 10 && page.data.songPos < 25, "pos=" + page.data.songPos);
  check("跟唱：时间显示 0:19", page.data.songClock === "0:19", page.data.songClock);
  check("跟唱：总时长 2:07", page.data.songTotal === "2:07", page.data.songTotal);
  ctxSing.currentTime = 95;
  ctxSing._h.time();
  check("跟唱：95s 落在第 14 句（标调规则…）", page.data.songLine === 13, "line=" + page.data.songLine);
  ctxSing.currentTime = 128.8;
  ctxSing._h.time();
  check("跟唱：到结尾自动停", page.data.songPlaying === false && ctxSing._dead === true, "playing=" + page.data.songPlaying);
  check("跟唱：结束进度归零", page.data.songPos === 0 && page.data.songClock === "0:00", page.data.songPos + "/" + page.data.songClock);

  /* ---------- 3. 慢速档 ---------- */
  page.setData({ slow: true });
  page.toggleSong();
  const ctxSlow = ctxs[ctxs.length - 1];
  check("慢速档 0.72x", ctxSlow.playbackRate === 0.72, String(ctxSlow.playbackRate));
  page.stopSong();
  page.setData({ slow: false });

  /* ---------- 4. 朗读逐句（真人原声 + 句间停顿） ---------- */
  page.pickSongMode({ currentTarget: { dataset: { mode: "read" } } });
  page.toggleSong();
  const ctxRead = ctxs[ctxs.length - 1];
  check("朗读：默认 0.92x 稍慢", ctxRead.playbackRate === 0.92, String(ctxRead.playbackRate));
  ctxRead.duration = 132;
  ctxRead._h.can();
  check("朗读：从第 1 句开头起播", Math.abs(ctxRead.currentTime - 1.2) < 0.2, String(ctxRead.currentTime));
  check("朗读：第 1 句高亮", page.data.songLine === 0, "line=" + page.data.songLine);
  ctxRead.currentTime = 11.3;
  ctxRead._h.time();
  check("朗读：念完第 1 句即暂停", ctxRead._playing === false);
  await sleep(320);
  check("朗读：停顿后自动接第 2 句", page.data.songLine === 1 && Math.abs(ctxRead.currentTime - 11.2) < 0.3, "line=" + page.data.songLine + " t=" + ctxRead.currentTime.toFixed(2));
  page.stopSong();
  check("朗读：stop 后销毁音频", ctxRead._dead === true);

  /* ---------- 5. 点单行（seek 播到行尾停） ---------- */
  page.pickSongMode({ currentTarget: { dataset: { mode: "sing" } } });
  page.tapSongLine({ currentTarget: { dataset: { idx: "10" } } });
  const ctxOne = ctxs[ctxs.length - 1];
  check("点行：立即高亮该行", page.data.songLine === 10, String(page.data.songLine));
  ctxOne.duration = 132;
  ctxOne._h.can();
  check("点行：seek 到该行开头（67.2s）", Math.abs(ctxOne.currentTime - 67.2) < 0.2, String(ctxOne.currentTime));
  ctxOne.currentTime = 72.0;
  ctxOne._h.time();
  check("点行：行尾自动停且保留行高亮", page.data.songPlaying === false && page.data.songLine === 10, page.data.songPlaying + "/" + page.data.songLine);

  /* ---------- 6. 无音频能力 → TTS 兜底 ---------- */
  const savedCtx = global.wx.createInnerAudioContext;
  delete global.wx.createInnerAudioContext;
  page.setData({ songMode: "sing" });
  page.toggleSong();
  check("无音频能力：降级朗读模式", page.data.songMode === "read" && page.data.songPlaying === true, page.data.songMode + "/" + page.data.songPlaying);
  check("无音频能力：TTS 念首句口诀", spoken.indexOf("拼音家族全到齐，声母韵母别着急") > -1, spoken[spoken.length - 1]);
  page.stopSong();
  global.wx.createInnerAudioContext = savedCtx;

  /* ---------- 7. 音频报错 → 降级 TTS ---------- */
  page.setData({ songMode: "sing" });
  page.toggleSong();
  const ctxErr = ctxs[ctxs.length - 1];
  ctxErr._h.err();
  check("加载失败：降级朗读", page.data.songMode === "read" && ctxErr._dead === true, page.data.songMode);
  page.stopSong();

  /* ---------- 输出 ---------- */
  console.log("songPlay 真人录音仿真：");
  ok.forEach((n) => console.log("  ✓ " + n));
  if (bad.length) {
    bad.forEach((n) => console.log("  ✗ " + n));
    console.log("\n结果：" + ok.length + " 通过, " + bad.length + " 失败");
    process.exit(1);
  }
  console.log("\n结果：" + ok.length + " 通过, 0 失败");
}

main();
