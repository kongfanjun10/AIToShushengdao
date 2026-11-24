/**
 * 语音识别（微信「同声传译」插件）
 *
 * 用途：数字测试页一边录音一边识别，把小朋友读出来的数字转成文字，用于判分。
 * 插件同一个 manager 全局只创建一次，事件回调只注册一次，靠 session 转发到当前这次录音，
 * 避免反复 start 造成回调叠加。
 *
 * 插件不可用（个人主体 / 后台未添加）时 available() 返回 false，
 * 页面自动降级为「只录音 + 家长确认」，主流程不崩。
 */
const config = require("../config/index");

let manager = null;
let inited = false;
let error = null;
let session = null;
let seq = 0;
// 插件回调不带会话 id：主动 stop 旧会话后，用一个时间窗丢弃它迟到的 onStop / onRecognize
let ignoreUntil = 0;

function pluginName() {
  return (config.tts && config.tts.pluginName) || "WechatSI";
}

/** 探测并初始化识别管理器 */
function init() {
  if (inited) return !!manager;
  inited = true;
  try {
    if (typeof requirePlugin !== "function") {
      error = { code: "ASR_MISSING", errMsg: "当前环境不支持插件，语音识别不可用" };
      return false;
    }
    const p = requirePlugin(pluginName());
    if (!p || typeof p.getRecordRecognitionManager !== "function") {
      error = { code: "ASR_MISSING", errMsg: "同声传译插件未提供语音识别能力" };
      return false;
    }
    const m = p.getRecordRecognitionManager();
    m.onStart(() => {
      if (session && typeof session.onStart === "function") session.onStart();
    });
    m.onRecognize((res) => {
      if (!session || Date.now() < ignoreUntil) return;
      const text = (res && res.result) || "";
      if (typeof session.onPartial === "function") session.onPartial(text);
    });
    m.onStop((res) => {
      if (Date.now() < ignoreUntil) return;
      const s = session;
      session = null;
      if (!s || s.cancelled) return;
      s.onFinal({
        text: (res && res.result) || "",
        file: (res && res.tempFilePath) || "",
      });
    });
    m.onError((res) => {
      if (Date.now() < ignoreUntil) return;
      const s = session;
      session = null;
      if (!s || s.cancelled) return;
      s.onError({
        code: "ASR_ERROR",
        errMsg: (res && (res.msg || res.errMsg)) || "语音识别失败，再试一次吧",
        raw: res,
      });
    });
    manager = m;
    return true;
  } catch (e) {
    error = {
      code: "ASR_MISSING",
      errMsg: (e && (e.message || e.errMsg)) || "语音识别插件不可用",
    };
    return false;
  }
}

function available() {
  return init();
}

function diagnose() {
  const ok = init();
  return {
    available: ok,
    error: ok ? null : error,
    tip: ok ? "" : "语音识别未开通：可在小程序后台添加「微信同声传译」插件；未开通时会退化为「只录音 + 家长确认」。",
  };
}

/**
 * 开始一次「录音 + 识别」
 * @param {object} opt { duration, onStart, onPartial(text), onFinal({text,file}), onError(err) }
 * @returns {boolean} 是否成功启动
 */
function start(opt) {
  if (!init()) {
    if (opt && typeof opt.onError === "function") opt.onError(error || { code: "ASR_MISSING", errMsg: "语音识别不可用" });
    return false;
  }
  stopQuiet();
  seq += 1;
  const id = seq;
  session = {
    id: id,
    cancelled: false,
    onStart: opt && opt.onStart,
    onPartial: opt && opt.onPartial,
    onFinal: opt && opt.onFinal,
    onError: opt && opt.onError,
  };
  const duration = Math.max(2000, Math.min(60000, Number(opt && opt.duration) || 6000));
  try {
    manager.start({ duration: duration, lang: "zh_CN" });
    return true;
  } catch (e) {
    session = null;
    if (opt && typeof opt.onError === "function") {
      opt.onError({ code: "ASR_START_FAIL", errMsg: (e && e.message) || "录音启动失败" });
    }
    return false;
  }
}

/** 主动结束（拿到最终识别结果） */
function stop() {
  if (!manager || !session) return;
  try {
    manager.stop();
  } catch (e) {}
}

/** 静默停掉上一次残留的录音，不触发回调 */
function stopQuiet() {
  if (!manager || !session) return;
  session.cancelled = true;
  session = null;
  ignoreUntil = Date.now() + 400;
  try {
    manager.stop();
  } catch (e) {}
}

/** 取消本次（页面卸载 / 换题时不希望再判分） */
function cancel() {
  stopQuiet();
}

function isRecording() {
  return !!session;
}

module.exports = { available, diagnose, start, stop, cancel, isRecording, init };
