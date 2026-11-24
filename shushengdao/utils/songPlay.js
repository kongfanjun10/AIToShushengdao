/**
 * 儿歌播放器（拼音页 / 音标页共用）
 *
 * 两首歌都是真人录音，歌词每行带录音里的真实起止时间（songs.js 的 t0/t1），
 * 所以高亮、点播、朗读全部按时间轴驱动，唱到哪一行亮哪一行，并自动滚到播放器中间。
 *
 *   sing —— 跟唱：从第一行开头播到最后一行结尾（跳过开头讲解、后面的重复段），
 *           边播边按 t0/t1 高亮当前行
 *   read —— 朗读：真人原声逐句播，每句之间留一点停顿，句间更清楚（可选慢速）
 *
 * 点某一行 = seek 到该行 t0，播到 t1 自动停。
 * 没有音频能力（异常环境/加载失败）时回退 TTS 逐句朗读，保证功能可用。
 *
 * 页面用法：
 *   data: { song, songMode:'sing', songLine:-1, songPlaying:false,
 *           songScroll:0, songPos:0, songClock:'0:00', songTotal:'0:00' }
 *   toggleSong()    { songPlay.toggle(this); }
 *   tapSongLine(e)  { songPlay.speakOne(this, Number(e.currentTarget.dataset.idx)); }
 *   stopSong()      { songPlay.stop(this); }
 *   pickSongMode(e) { songPlay.pickMode(this, e.currentTarget.dataset.mode); }
 */
const tts = require("./tts");
const store = require("./store");
const songs = require("./songs");
const view = require("./songView");

const GAP = 260; // 朗读模式：两句之间的停顿（毫秒）
const RATE_READ = 0.92; // 朗读模式默认稍慢一点，句间更清楚
const RATE_SLOW = 0.72; // 点了「慢速」

function clearTimer(page) {
  if (page._songTimer) {
    clearTimeout(page._songTimer);
    page._songTimer = null;
  }
}

function rate(page) {
  const user = store.getUser();
  const base = Number(user.speechRate) || 1;
  return page.data.slow ? Math.max(0.5, base * 0.78) : base;
}

function songOf(page) {
  return page.data.song || { lines: [] };
}

function linesOf(page) {
  const song = songOf(page);
  return (song.lines || []).filter((l) => Number(l.t1) > Number(l.t0));
}

/** 播放倍速：跟唱原速，朗读略慢，慢速档再压一档 */
function playRate(page) {
  if (page.data.slow) return RATE_SLOW;
  return page.data.songMode === "read" ? RATE_READ : 1;
}

/** 进度条 + 时间：整首歌里的位置 = 当前音频时间 - 第一行开头 */
function setPos(page, t) {
  const song = songOf(page);
  const from = Number(song.startAt) || 0;
  const to = Number(song.endAt) || 0;
  const total = Math.max(0.1, to - from);
  const elapsed = Math.min(total, Math.max(0, (Number(t) || 0) - from));
  const pos = Math.round((elapsed / total) * 100);
  const clock = view.fmt(elapsed);
  if (pos === page.data.songPos && clock === page.data.songClock) return;
  page.setData({ songPos: pos, songClock: clock });
}

function startPos(page) {
  const song = songOf(page);
  page.setData({ songPos: 0, songClock: "0:00", songTotal: view.fmt((song.endAt || 0) - (song.startAt || 0)) });
}

function endPos(page) {
  page.setData({ songPos: 0, songClock: "0:00" });
}

/* ---------------- 真人音频（innerAudioContext） ---------------- */

function makeAudio(page) {
  if (typeof wx === "undefined" || !wx.createInnerAudioContext) return null;
  try {
    const ctx = wx.createInnerAudioContext({ useWebAudioImplement: false });
    ctx.obeyMuteSwitch = false;
    page._songAudio = ctx;
    return ctx;
  } catch (e) {
    return null;
  }
}

function destroyAudio(page) {
  const ctx = page._songAudio;
  page._songAudio = null;
  if (ctx) {
    try {
      ctx.stop();
      ctx.destroy();
    } catch (e) {
      /* 已销毁就算了 */
    }
  }
}

/** 跟唱：整段连续播（第一行开头 → 最后一行结尾），按真实时间高亮 */
function playAll(page) {
  const song = songOf(page);
  const lines = linesOf(page);
  if (!song.audio || !song.audio.src || !lines.length) return false;
  const ctx = makeAudio(page);
  if (!ctx) return false;
  const token = page._songToken;
  const from = lines[0].t0;
  const to = lines[lines.length - 1].t1;
  let lastLine = -1;
  let started = false;

  const applyRate = () => {
    try {
      ctx.playbackRate = playRate(page);
    } catch (e) {
      /* 低版本基础库不支持就算了 */
    }
  };

  ctx.src = song.audio.src;
  applyRate();
  ctx.onCanplay(() => {
    applyRate();
    if (started) return;
    started = true;
    try {
      ctx.seek(Math.max(0, from - 0.05));
    } catch (e) {
      /* ignore */
    }
    ctx.play();
  });
  ctx.onTimeUpdate(() => {
    if (token !== page._songToken) return;
    const t = ctx.currentTime;
    const i = songs.lineAt(song, t);
    if (i !== lastLine && i >= 0) {
      lastLine = i;
      page.setData({ songLine: i });
      view.follow(page, i);
    }
    setPos(page, t);
    if (t >= to) {
      destroyAudio(page);
      page.setData({ songPlaying: false, songSyl: -1 });
      endPos(page);
    }
  });
  ctx.onEnded(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    page.setData({ songPlaying: false, songSyl: -1 });
    endPos(page);
  });
  ctx.onError(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    // 音频放不了：退回 TTS 逐句朗读，功能不断
    page.setData({ songMode: "read", songLine: -1, songSyl: -1 });
    readAt(page, 0);
  });
  startPos(page);
  page.setData({ songPlaying: true, songLine: -1, songSyl: -1 });
  ctx.play(); // 先 play 触发加载，onCanplay 里再 seek 到开头
  return true;
}

/** 朗读：真人原声逐句播，句间留停顿 */
function readVoice(page) {
  const song = songOf(page);
  const lines = linesOf(page);
  if (!song.audio || !song.audio.src || !lines.length) return false;
  const ctx = makeAudio(page);
  if (!ctx) return false;
  const token = page._songToken;
  let idx = 0;
  let started = false;
  let waiting = false;

  const applyRate = () => {
    try {
      ctx.playbackRate = playRate(page);
    } catch (e) {
      /* 低版本基础库不支持就算了 */
    }
  };

  const step = () => {
    if (token !== page._songToken) return;
    const line = lines[idx];
    if (!line) {
      destroyAudio(page);
      page.setData({ songPlaying: false, songSyl: -1 });
      endPos(page);
      return;
    }
    waiting = false;
    page.setData({ songLine: idx, songSyl: -1, songPlaying: true });
    view.follow(page, idx);
    try {
      ctx.seek(Math.max(0, line.t0 - 0.05));
    } catch (e) {
      /* ignore */
    }
    ctx.play();
  };

  ctx.src = song.audio.src;
  applyRate();
  ctx.onCanplay(() => {
    applyRate();
    if (started) return;
    started = true;
    step();
  });
  ctx.onTimeUpdate(() => {
    if (token !== page._songToken) return;
    if (waiting) return;
    const line = lines[idx];
    if (!line) return;
    setPos(page, ctx.currentTime);
    if (ctx.currentTime >= line.t1) {
      waiting = true;
      try {
        ctx.pause();
      } catch (e) {
        /* ignore */
      }
      clearTimer(page);
      page._songTimer = setTimeout(() => {
        if (token !== page._songToken) return;
        idx += 1;
        step();
      }, GAP);
    }
  });
  ctx.onEnded(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    page.setData({ songPlaying: false, songSyl: -1 });
    endPos(page);
  });
  ctx.onError(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    page.setData({ songPlaying: false, songSyl: -1, songMode: "read" });
    readAt(page, 0);
  });
  startPos(page);
  page.setData({ songPlaying: true, songLine: -1, songSyl: -1 });
  ctx.play(); // 触发加载，onCanplay 里从第一句开始
  return true;
}

/** 点单行：seek 到行首，播到行尾自动停（两种模式都是真人原声） */
function playOne(page, idx) {
  const song = songOf(page);
  const lines = linesOf(page);
  const line = lines[idx];
  if (!line || !song.audio || !song.audio.src) return false;
  const ctx = makeAudio(page);
  if (!ctx) return false;
  const token = page._songToken;
  let started = false;

  ctx.src = song.audio.src;
  try {
    ctx.playbackRate = playRate(page);
  } catch (e) {
    /* ignore */
  }
  startPos(page);
  page.setData({ songPlaying: true, songLine: idx, songSyl: -1 });
  view.follow(page, idx);
  ctx.onCanplay(() => {
    if (started) return;
    started = true;
    try {
      ctx.playbackRate = playRate(page);
      ctx.seek(Math.max(0, line.t0 - 0.05));
    } catch (e) {
      /* ignore */
    }
    ctx.play();
  });
  ctx.onTimeUpdate(() => {
    if (token !== page._songToken) return;
    setPos(page, ctx.currentTime);
    if (ctx.currentTime >= line.t1) {
      destroyAudio(page);
      page.setData({ songPlaying: false, songSyl: -1 });
      endPos(page);
    }
  });
  ctx.onEnded(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    page.setData({ songPlaying: false, songSyl: -1 });
    endPos(page);
  });
  ctx.onError(() => {
    if (token !== page._songToken) return;
    destroyAudio(page);
    speakOneTTS(page, idx);
  });
  ctx.play();
  return true;
}

/* ---------------- TTS 兜底（无音频能力时） ---------------- */

function readAt(page, i) {
  const token = page._songToken;
  const lines = songOf(page).lines || [];
  if (token !== page._songToken || !lines[i]) {
    finish(page);
    return;
  }
  page.setData({ songLine: i, songSyl: -1, songPlaying: true });
  view.follow(page, i);
  const user = store.getUser();
  tts.stop();
  Promise.resolve(
    tts.speak(songs.lineSay(lines[i]), {
      rate: rate(page),
      voice: user.ttsVoice,
      onEnd: () => {
        if (token !== page._songToken) return;
        clearTimer(page);
        page._songTimer = setTimeout(() => readAt(page, i + 1), 420);
      },
      onError: () => {
        if (token !== page._songToken) return;
        stop(page);
      },
    })
  ).catch(() => {
    if (token !== page._songToken) return;
    stop(page);
  });
}

function speakOneTTS(page, idx) {
  const token = page._songToken;
  const lines = songOf(page).lines || [];
  if (!lines[idx]) return;
  const user = store.getUser();
  page.setData({ songLine: idx, songSyl: -1, songPlaying: true });
  view.follow(page, idx);
  tts.stop();
  Promise.resolve(
    tts.speak(songs.lineSay(lines[idx]), {
      rate: rate(page),
      voice: user.ttsVoice,
      onEnd: () => {
        if (token !== page._songToken) return;
        page.setData({ songPlaying: false });
      },
      onError: () => {
        if (token !== page._songToken) return;
        page.setData({ songPlaying: false });
      },
    })
  ).catch(() => page.setData({ songPlaying: false }));
}

/* ---------------- 对外接口 ---------------- */

function finish(page) {
  clearTimer(page);
  page.setData({ songPlaying: false });
  endPos(page);
}

function stop(page) {
  page._songToken = (page._songToken || 0) + 1; // 让挂起的回调失效
  clearTimer(page);
  destroyAudio(page);
  tts.stop();
  if (page.data.songPlaying || page.data.songLine !== -1 || page.data.songSyl !== -1) {
    page.setData({ songPlaying: false, songLine: -1, songSyl: -1 });
  }
  endPos(page);
}

function toggle(page) {
  if (page.data.songPlaying) {
    stop(page);
    return;
  }
  const lines = linesOf(page);
  if (!lines.length) return;
  stop(page);
  page._songToken = (page._songToken || 0) + 1;
  if (page.data.songMode === "sing") {
    if (!playAll(page)) {
      // 没有音频能力：降级为 TTS 朗读，功能不丢
      page.setData({ songMode: "read" });
      readAt(page, 0);
    }
  } else if (!readVoice(page)) {
    readAt(page, 0);
  }
}

/** 点单行：真人原声播这一句；无音频能力时 TTS 念这一句 */
function speakOne(page, idx) {
  const lines = songOf(page).lines || [];
  if (!lines[idx]) return;
  stop(page);
  page._songToken = (page._songToken || 0) + 1;
  if (!playOne(page, idx)) speakOneTTS(page, idx);
}

/** 切换 跟唱/朗读：切的时候把正在播的停掉 */
function pickMode(page, mode) {
  if (mode !== "sing" && mode !== "read") return;
  if (mode === page.data.songMode) return;
  stop(page);
  page.setData({ songMode: mode });
}

module.exports = { toggle, speakOne, stop, pickMode, GAP };
