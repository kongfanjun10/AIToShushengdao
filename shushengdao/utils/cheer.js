/**
 * 鼓励语音（固定小女声：女声 + 1.06 倍速）
 * 数学闯关、竖式、单词跟读共用；TTS 不可用时静默降级，不打断流程。
 */
const tts = require("./tts");

const PRAISE = "你真棒哟";
const COMFORT = "答错咯，要加油哟";
const RATE = 1.06;

/**
 * 播报一段话，结束后回调（无论成功失败都会回调，最多等 2.2s）
 * @param {string} text
 * @param {function} done
 */
function speak(text, done) {
  let fired = false;
  const finish = () => {
    if (fired) return;
    fired = true;
    if (typeof done === "function") done();
  };
  tts.stop();
  tts
    .speak(text, { rate: RATE, voice: "female", onEnd: finish, onError: finish })
    .catch(() => finish());
  setTimeout(finish, 2200);
}

function praise(done) {
  speak(PRAISE, done);
}

function comfort(done) {
  speak(COMFORT, done);
}

module.exports = { PRAISE, COMFORT, RATE, speak, praise, comfort };
