/**
 * TTS 语音合成（三通道，自动降级）
 *  1. plugin：微信「同声传译」插件 WechatSI（需后台添加插件 + app.json 声明）
 *  2. cloud ：云函数 cloudfunctions/tts（腾讯云语音合成，个人主体 / 插件不可用时的兜底）
 *  3. off   ：关闭范读
 *
 * provider 配置见 config/index.js（auto = 先插件后云函数）。
 * 任何通道不可用都只返回错误码，页面轻提示，主流程不崩。
 */
const config = require("../config/index");

let plugin; // undefined = 未探测 / null = 不可用
let pluginError = null;
let cloudInited = false;
let audio = null;
const cache = {}; // key -> 音频文件路径
const CACHE_LIMIT = 60;

/* ---------------- 语种判定 ---------------- */

/**
 * 合成语种：含拉丁字母就按英文合成，否则中文。
 * 插件通道 lang 只认 zh_CN / en_US，用错会合成不出音频（英文单词读不出来就是这个原因）。
 */
function langOf(text) {
  return /[A-Za-z]/.test(String(text || "")) ? "en_US" : "zh_CN";
}

/* ---------------- 通道探测 ---------------- */

function providerMode() {
  return String((config.tts && config.tts.provider) || "auto").toLowerCase();
}

function getPlugin() {
  if (plugin !== undefined) return plugin;
  const mode = providerMode();
  if (mode === "off") {
    pluginError = { code: "PLUGIN_OFF", errMsg: "范读语音已在配置中关闭" };
    plugin = null;
    return plugin;
  }
  if (mode === "cloud") {
    plugin = null;
    return plugin;
  }
  try {
    if (typeof requirePlugin === "function") {
      const p = requirePlugin(config.tts.pluginName);
      if (p && typeof p.textToSpeech === "function") {
        plugin = p;
        pluginError = null;
        return plugin;
      }
      pluginError = { code: "PLUGIN_MISSING", errMsg: "插件已加载但未提供 textToSpeech 能力" };
      plugin = null;
      return plugin;
    }
    pluginError = { code: "PLUGIN_MISSING", errMsg: "当前环境不支持 requirePlugin" };
    plugin = null;
  } catch (e) {
    // 未在 app.json 声明 / 后台未授权，都会走到这里
    pluginError = {
      code: "PLUGIN_MISSING",
      errMsg: (e && (e.message || e.errMsg)) || "同声传译插件不可用",
    };
    plugin = null;
  }
  return plugin;
}

function cloudConfigured() {
  const mode = providerMode();
  if (mode === "off") return false;
  if (mode === "plugin") return false;
  const env = (config.tts && config.tts.cloudEnv) || "";
  return !!env && typeof wx !== "undefined" && !!wx.cloud;
}

function ensureCloud() {
  if (cloudInited) return true;
  try {
    wx.cloud.init({ env: config.tts.cloudEnv, traceUser: false });
    cloudInited = true;
  } catch (e) {
    cloudInited = false;
  }
  return cloudInited;
}

/* ---------------- 诊断 ---------------- */

function diagnose() {
  const mode = providerMode();
  const p = getPlugin();
  const pluginOk = !!(p && typeof p.textToSpeech === "function");
  const cloudOk = cloudConfigured() && ensureCloud();
  return {
    provider: mode,
    pluginAvailable: pluginOk,
    cloudAvailable: cloudOk,
    available: pluginOk || cloudOk,
    error: pluginOk || cloudOk ? null : pluginError || { code: "NO_CHANNEL", errMsg: "未配置任何语音通道" },
    tip: pluginOk || cloudOk ? "" : config.tts.missingTip,
  };
}

function isAvailable() {
  return diagnose().available;
}

/* ---------------- 播放器 ---------------- */

function getAudio() {
  if (audio) return audio;
  audio = wx.createInnerAudioContext();
  audio.obeyMuteSwitch = false;
  audio.onEnded(() => {
    if (typeof currentOnEnd === "function") currentOnEnd();
  });
  audio.onError(() => {
    if (typeof currentOnError === "function") currentOnError({ errMsg: "音频播放失败" });
  });
  return audio;
}

let currentOnEnd = null;
let currentOnError = null;

function playFile(src, options) {
  const opt = options || {};
  const ctx = getAudio();
  currentOnEnd = opt.onEnd;
  currentOnError = opt.onError;
  try {
    ctx.stop();
  } catch (e) {}
  ctx.src = src;
  const rate = Math.max(0.5, Math.min(2, Number(opt.rate) || 1));
  try {
    ctx.playbackRate = rate;
  } catch (e) {}
  ctx.play();
  if (typeof opt.onStart === "function") opt.onStart();
}

/* ---------------- 缓存 ---------------- */

function cachePut(key, filePath) {
  const keys = Object.keys(cache);
  if (keys.length >= CACHE_LIMIT) {
    const oldest = cache[keys[0]];
    try {
      wx.getFileSystemManager().unlink({ filePath: oldest, fail: () => {} });
    } catch (e) {}
    delete cache[keys[0]];
  }
  cache[key] = filePath;
}

function hashKey(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------------- 云函数通道 ---------------- */

function speakViaCloud(content, opt, key) {
  const maxChars = Number(config.tts.cloudMaxChars) || 45;
  const clipped = content.length > maxChars ? content.slice(0, maxChars) : content;

  if (cache[key]) {
    playFile(cache[key], opt);
    return Promise.resolve(cache[key]);
  }
  if (!ensureCloud()) {
    const err = { code: "CLOUD_UNAVAILABLE", errMsg: "云开发未初始化（检查 tts.cloudEnv）" };
    if (typeof opt.onError === "function") opt.onError(err);
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: config.tts.cloudFunction || "tts",
      // voice: 0 女声 / 1 男声（云函数 TextToBasicTTS ModelType）
      data: { text: clipped, speed: Number(opt.rate) || 1, voice: opt.voice === "male" ? 1 : 0 },
      success: (res) => {
        const r = (res && res.result) || {};
        if (!r.ok || !r.audio) {
          const err = { code: "SYNTH_FAIL", errMsg: r.errMsg || "云合成失败" };
          if (typeof opt.onError === "function") opt.onError(err);
          reject(err);
          return;
        }
        const filePath = wx.env.USER_DATA_PATH + "/tts_" + hashKey(key) + ".mp3";
        wx.getFileSystemManager().writeFile({
          filePath,
          data: r.audio,
          encoding: "binary",
          success: () => {
            cachePut(key, filePath);
            playFile(filePath, opt);
            resolve(filePath);
          },
          fail: () => {
            const err = { code: "SYNTH_FAIL", errMsg: "音频写入失败" };
            if (typeof opt.onError === "function") opt.onError(err);
            reject(err);
          },
        });
      },
      fail: (e) => {
        const err = {
          code: "CLOUD_FAIL",
          errMsg: (e && e.errMsg) || "云函数调用失败（检查云函数 tts 是否已部署）",
        };
        if (typeof opt.onError === "function") opt.onError(err);
        reject(err);
      },
    });
  });
}

/* ---------------- 插件通道 ---------------- */

function speakViaPlugin(content, opt, key) {
  const p = getPlugin();
  if (!p || typeof p.textToSpeech !== "function") {
    const err = pluginError || { code: "PLUGIN_MISSING", errMsg: "TTS 插件不可用" };
    if (typeof opt.onError === "function") opt.onError(err);
    return Promise.reject(err);
  }
  if (cache[key]) {
    playFile(cache[key], opt);
    return Promise.resolve(cache[key]);
  }
  return new Promise((resolve, reject) => {
    p.textToSpeech({
      lang: langOf(content),
      tts: true,
      content,
      success: (res) => {
        const filename = res && (res.filename || res.voicePath);
        if (!filename) {
          const err = { code: "SYNTH_FAIL", errMsg: "合成失败：无音频地址" };
          if (typeof opt.onError === "function") opt.onError(err);
          reject(err);
          return;
        }
        cachePut(key, filename);
        playFile(filename, opt);
        resolve(filename);
      },
      fail: (err) => {
        const e = {
          code: "SYNTH_FAIL",
          errMsg: (err && (err.msg || err.errMsg)) || "语音合成失败",
          raw: err,
        };
        if (typeof opt.onError === "function") opt.onError(e);
        reject(e);
      },
    });
  });
}

/* ---------------- 超时保护 ---------------- */

const TIMEOUT_MS = 9000;

/** 插件/云端偶发不回调时兜底，避免按钮一直停在「正在读…」 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject({ code: "TTS_TIMEOUT", errMsg: "语音合成超时，请检查网络后重试" });
    }, ms || TIMEOUT_MS);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/* ---------------- 对外入口 ---------------- */

/**
 * 朗读一段文字
 * @param {string} text
 * @param {object} options { rate, voice("female"|"male"，仅云函数通道生效), onStart, onEnd, onError }
 * @returns {Promise<string>} 音频地址
 */
function speak(text, options) {
  const opt = options || {};
  const content = String(text || "").trim();
  if (!content) return Promise.resolve("");

  const maxChars = providerMode() === "cloud" ? Number(config.tts.cloudMaxChars) || 45 : config.tts.maxChars;
  if (content.length > maxChars) {
    return speak(content.slice(0, maxChars), opt);
  }

  const rateKey = Math.round((Number(opt.rate) || 1) * 10);
  // 音色参与缓存 key：同句不同音色分别缓存（云函数通道）
  const voiceKey = opt.voice === "male" ? "m" : "f";
  const langKey = langOf(content);
  const key = rateKey + "|" + voiceKey + "|" + langKey + "|" + content;
  const mode = providerMode();

  if (mode === "off") {
    const err = { code: "PLUGIN_OFF", errMsg: "范读语音已在配置中关闭" };
    if (typeof opt.onError === "function") opt.onError(err);
    return Promise.reject(err);
  }
  if (mode === "cloud") return withTimeout(speakViaCloud(content, opt, key));
  if (mode === "plugin") return withTimeout(speakViaPlugin(content, opt, key));

  // auto：先插件，插件不可用且有云开发环境则走云函数
  const d = diagnose();
  if (d.pluginAvailable) return withTimeout(speakViaPlugin(content, opt, key));
  if (d.cloudAvailable) return withTimeout(speakViaCloud(content, opt, key));

  const err = d.error || { code: "NO_CHANNEL", errMsg: "范读语音未配置" };
  if (typeof opt.onError === "function") opt.onError(err);
  return Promise.reject(err);
}

function stop() {
  if (!audio) return;
  try {
    audio.stop();
  } catch (e) {}
}

function destroy() {
  if (!audio) return;
  try {
    audio.destroy();
  } catch (e) {}
  audio = null;
}

module.exports = { speak, stop, destroy, isAvailable, diagnose, getPlugin, langOf };
