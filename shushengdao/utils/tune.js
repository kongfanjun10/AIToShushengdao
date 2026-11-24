/**
 * 儿歌旋律合成器（拼音页 / 音标页共用）
 *
 * 为什么用 WebAudio 现场合成：小程序里没有现成的儿歌音频文件，
 * 用振荡器把《两只老虎》《ABC 字母歌》的旋律一个音一个音弹出来，
 * 就是一个真正的「伴奏」，孩子能跟着唱——比 TTS 念句子更像儿歌。
 *
 * 兼容：小程序 wx.createWebAudioContext（基础库 2.19+）；
 * 浏览器/预览端退回 AudioContext。都没有时 available() 为 false，
 * 页面自动降级成 TTS 朗读模式。
 *
 * 用法：
 *   tune.play(seq, { bpm, volume, onNote, onEnd })
 *   // seq: [{ note: "C4", beat: 1 }]，onNote(i) 用来做逐音节高亮
 *   tune.stop()
 *   tune.available()
 */

const NOTE_HZ = {
  C3: 130.81, F3: 174.61, G3: 196.0, A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

const VOL = 0.22; // 主旋律音量（triangle 已经比较柔，不能再大）

let ac = null;

function getCtx() {
  if (ac) return ac;
  try {
    if (typeof wx !== "undefined" && wx.createWebAudioContext) {
      ac = wx.createWebAudioContext();
    } else if (typeof AudioContext !== "undefined") {
      ac = new AudioContext();
    } else if (typeof webkitAudioContext !== "undefined") {
      ac = new webkitAudioContext();
    }
  } catch (e) {
    ac = null;
  }
  return ac;
}

function available() {
  return !!getCtx();
}

const state = { timers: [], master: null };

function clearTimers() {
  state.timers.forEach((id) => clearTimeout(id));
  state.timers = [];
}

/** 一个音：triangle 波 + 起音/衰减包络（八音盒质感） */
function tone(c, out, hz, when, dur, vol) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.value = hz;
  const end = when + dur;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.02);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.32), when + Math.min(0.16, dur * 0.45));
  g.gain.exponentialRampToValueAtTime(0.0008, end);
  o.connect(g);
  g.connect(out);
  o.start(when);
  o.stop(end + 0.05);
}

/** 低八度衬底音：每个长音（beat>=2）下面垫一个，让旋律有「伴奏感」 */
function bass(c, out, hz, when, dur) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(0.1, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
  o.connect(g);
  g.connect(out);
  o.start(when);
  o.stop(when + dur + 0.05);
}

function play(seq, opts) {
  const c = getCtx();
  if (!c || !seq || !seq.length) return false;
  stop();
  if (c.resume && c.state === "suspended") {
    try { c.resume(); } catch (e) { /* 忽略 */ }
  }
  const bpm = (opts && opts.bpm) || 108;
  const spb = 60 / bpm; // 一拍的秒数
  const master = c.createGain();
  master.gain.value = (opts && opts.volume) || 1;
  master.connect(c.destination);
  state.master = master;

  let when = c.currentTime + 0.08;
  seq.forEach((n, i) => {
    const beat = n.beat || 1;
    const dur = beat * spb;
    tone(c, master, NOTE_HZ[n.note] || 440, when, Math.max(0.12, dur * 0.94), VOL);
    if (beat >= 2) bass(c, master, (NOTE_HZ[n.note] || 440) / 2, when, dur * 0.94);
    // 逐音节高亮回调（定时器跟音频时钟并行，误差可忽略）
    const delay = Math.max(0, (when - c.currentTime) * 1000);
    state.timers.push(setTimeout(() => opts && opts.onNote && opts.onNote(i), delay));
    when += dur;
  });

  const total = (when - c.currentTime) * 1000;
  state.timers.push(
    setTimeout(() => {
      opts && opts.onEnd && opts.onEnd();
    }, total + 60)
  );
  return true;
}

function stop() {
  clearTimers();
  const c = getCtx();
  if (c && state.master) {
    try {
      state.master.gain.setValueAtTime(0, c.currentTime);
      state.master.disconnect();
    } catch (e) { /* 忽略 */ }
    state.master = null;
  }
}

module.exports = { play, stop, available, NOTE_HZ };
