/**
 * 儿歌数据：拼音页「全部」放《拼音歌》，音标页「全部」放《ABC 字母歌》
 *
 * 真人录音版：歌词按录音的真实内容逐句拆行，每行带录音里的起止时间（秒）——
 * 高亮、点播、朗读全部按时间轴驱动，一行唱完立刻切下一行。
 *
 * 每行字段：
 *   text  —— 屏幕上显示的歌词（与录音内容一致，一句一行）
 *   t0/t1 —— 该行在音频里的起止秒数
 *   say   —— 没有录音时 TTS 兜底朗读的内容（= text）
 *   start —— 该行在整首歌里的起始序号（decorate 自动算）
 *
 * 拼音歌：真人童声拼音口诀（2 分 12 秒）。
 *   时间轴用 tools/song-align.js 对录音做「人声频段能量 + 停顿块」分析后逐行校准：
 *   边界全部落在录音里的真实停顿上（首尾相接，不再有高亮空档），
 *   每行带 kind 区分：lead=首音（开场领唱）、read=读行（拼音念读串）、sing=跟唱（乐句）。
 *   120.3s~128.6s 是结尾重复句（歌词与上一句相同）。
 * 英文歌：真人童声 ABC 字母歌（老版本结尾 "X Y Z now you see, I can say my A B C"）。
 *   整首录音唱了 4 遍，跟唱取第一遍 8.33s~30.88s（开头 8 秒是讲解口播）；
 *   第一遍 6 个乐句，每句 8 拍，按拍均匀切分（22.55s / 6）。
 */

const PINYIN_SONG = {
  id: "pinyin",
  emoji: "🎵",
  title: "拼音歌",
  sub: "真人童声口诀：声母、韵母、整体认读全都有",
  audio: { src: "/pkgLearn/sounds/songs/pinyin_song.mp3" },
  tip: "点「跟唱」听整首；点「朗读」一句一句慢慢听；点歌词里任意一句，只唱（读）那一句。",
  lines: [
    /* —— 首音：开场领唱两句（慢速、拖长音）—— */
    { kind: "lead", text: "拼音家族全到齐，声母韵母别着急", t0: 1.25, t1: 11.25 },
    { kind: "lead", text: "整体认读排整齐，跟着节奏慢慢哩", t0: 11.25, t1: 15.7 },
    /* —— 读行：拼音念读段，七个真实停顿块各占一行 —— */
    { kind: "read", text: "声母 23 个：b p m f d t n l", t0: 15.7, t1: 19.1 },
    { kind: "read", text: "g k h j q x，zh ch sh r，z c s", t0: 19.1, t1: 23.45 },
    { kind: "read", text: "韵母 24 个：a o e i u ü", t0: 23.45, t1: 27.05 },
    { kind: "read", text: "ai ei ui，ao ou iu，ie üe er", t0: 27.05, t1: 34.35 },
    { kind: "read", text: "an en in un ün，ang eng ing ong", t0: 34.35, t1: 41.7 },
    { kind: "read", text: "整体认读 16 个：zhi chi shi ri zi ci si", t0: 41.7, t1: 54.15 },
    { kind: "read", text: "yi wu yu，ye yue yuan，yin yun ying", t0: 54.15, t1: 62.05 },
    /* —— 跟唱：歌唱乐句 —— */
    { kind: "sing", text: "整体认读别拆开，一个不能漏，全都念出来", t0: 62.05, t1: 67.25 },
    { kind: "sing", text: "小 ü 见了 j q x，擦掉眼泪笑嘻嘻", t0: 67.25, t1: 71.95 },
    { kind: "sing", text: "i 和 ü 来相拼，去掉两点记心里", t0: 71.95, t1: 79.9 },
    { kind: "sing", text: "一声平二声扬，三声拐弯四声降", t0: 79.9, t1: 85.7 },
    { kind: "sing", text: "标调规则别乱套：有 a 不放过，没 a 找 o e", t0: 85.7, t1: 96.25 },
    { kind: "sing", text: "拼音拼音全部都要看清，声母韵母整体认读", t0: 96.25, t1: 106.6 },
    { kind: "sing", text: "一个不能少，张嘴读、动笔写", t0: 106.6, t1: 116.1 },
    { kind: "sing", text: "我是拼音小标兵", t0: 116.1, t1: 120.25 },
    { kind: "sing", text: "我是拼音小标兵", t0: 120.25, t1: 128.6 },
  ],
};

const ENGLISH_SONG = {
  id: "abc",
  emoji: "🎶",
  title: "英文歌 · ABC 字母歌",
  sub: "真人童声跟唱，26 个字母一遍过",
  audio: { src: "/pkgLearn/sounds/songs/abc_song.mp3" },
  tip: "点「跟唱」听第一遍；点「朗读」一句一句慢慢听；点歌词里任意一句，只唱（读）那一句。",
  lines: [
    { text: "A B C D E F G", t0: 8.33, t1: 12.09 },
    { text: "H I J K L M N", t0: 12.09, t1: 15.85 },
    { text: "O P Q R S T U", t0: 15.85, t1: 19.61 },
    { text: "V W X Y Z", t0: 19.61, t1: 23.37 },
    { text: "X Y Z now you see", t0: 23.37, t1: 27.13 },
    { text: "I can say my A B C", t0: 27.13, t1: 30.88 },
  ],
};

/* 组装 say / start，页面直接可用 */
function fmt(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

function decorate(song) {
  let start = 0;
  song.lines.forEach((line) => {
    line.say = line.say || line.text;
    line.start = start;
    start += 1;
  });
  song.lineCount = start;
  song.startAt = song.lines.length ? song.lines[0].t0 : 0;
  song.endAt = song.lines.length ? song.lines[song.lines.length - 1].t1 : 0;
  song.totalText = fmt(song.endAt - song.startAt); // 播放器一打开就显示总时长
  return song;
}

decorate(PINYIN_SONG);
decorate(ENGLISH_SONG);

function lineSay(line) {
  const l = line || {};
  return l.say || l.text || "";
}

/** 按播放时间找当前行；返回行号，找不到返回 -1 */
function lineAt(song, t) {
  const lines = (song && song.lines) || [];
  let cur = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t0 <= t) cur = i;
    else break;
  }
  return cur;
}

module.exports = { pinyin: PINYIN_SONG, english: ENGLISH_SONG, lineSay, lineAt };
