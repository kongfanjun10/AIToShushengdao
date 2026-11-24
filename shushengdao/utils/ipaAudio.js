/**
 * 音标「单音」播放器
 *
 * 为什么不用语音合成：TTS 读不出 IPA 符号（/iː/ /θ/ …），
 * 之前只能拿代表词顶替，听起来就是"下面第一个例词"，不是音标本身的音。
 * 现在 48 个单音都是预生成的小音频（sounds/ipa/<slug>.mp3，单条 1~2KB，
 * 由 tools/gen-ipa-audio.js 生成；想换成真人录音，同名覆盖即可），
 * 播放走 InnerAudioContext，稳定、离线、不带口音。
 *
 * 拿不到音频（文件被删/路径不兼容）时抛 onError，页面退回代表词 TTS，绝不卡住。
 */
let inst = null;
let seq = 0;

function cleanup(audio) {
  try {
    audio.stop();
  } catch (e) {}
  try {
    audio.destroy();
  } catch (e) {}
  if (inst === audio) inst = null;
}

/** 停止当前单音 */
function stop() {
  if (!inst) return;
  const a = inst;
  inst = null;
  cleanup(a);
}

/**
 * 播放一个音标单音
 * @param {string} slug 音频名（utils/phonetics.js 里的 audio 字段）
 * @param {{rate?:number,onEnd?:Function,onError?:Function}} opts
 */
function play(slug, opts) {
  const o = opts || {};
  stop();
  if (!slug || typeof wx === "undefined" || !wx.createInnerAudioContext) {
    if (o.onError) o.onError({ code: "NO_AUDIO", errMsg: "没有单音音频" });
    return;
  }

  // 代码包内路径两种写法都试一遍（不同基础库/平台对相对路径处理不一致）
  const paths = ["/sounds/ipa/" + slug + ".mp3", "sounds/ipa/" + slug + ".mp3"];
  const my = ++seq;
  let tryIndex = 0;
  let done = false;
  let audio = null;

  const finish = (ok, err) => {
    if (done) return;
    done = true;
    if (ok) {
      if (o.onEnd) o.onEnd();
    } else if (o.onError) {
      o.onError(err || { code: "AUDIO_FAIL", errMsg: "音频播放失败" });
    }
  };

  audio = wx.createInnerAudioContext();
  inst = audio;
  audio.obeyMuteSwitch = false;
  if (o.rate && o.rate > 0) {
    try {
      audio.playbackRate = o.rate;
    } catch (e) {}
  }

  audio.onEnded(() => {
    if (my !== seq) return;
    cleanup(audio);
    finish(true);
  });

  audio.onError((e) => {
    if (my !== seq) return;
    tryIndex += 1;
    if (tryIndex < paths.length) {
      audio.src = paths[tryIndex];
      audio.play();
      return;
    }
    cleanup(audio);
    finish(false, { code: "AUDIO_FAIL", errMsg: (e && e.errMsg) || "音频播放失败" });
  });

  audio.src = paths[0];
  audio.play();
}

module.exports = {
  play: play,
  stop: stop,
};
