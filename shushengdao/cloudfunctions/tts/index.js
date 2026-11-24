/**
 * 云函数：TTS 语音合成（腾讯云基础语音合成 TextToBasicTTS）
 *
 * 用途：小程序主体为个人、无法添加「微信同声传译」插件时的范读兜底方案。
 * 部署：微信开发者工具 → cloudfunctions/tts 右键「上传并部署：云端安装依赖」
 * 配置：云开发控制台 → 云函数 tts → 配置 → 环境变量
 *   TENCENT_SECRET_ID / TENCENT_SECRET_KEY（腾讯云访问密钥，只存服务端）
 *   TENCENT_REGION（可选，默认 ap-guangzhou）
 *   TTS_VOICE_TYPE（可选，默认音色，默认 0 女声；前端传 voice 参数时优先用前端的）
 *
 * 入参：{ text, speed(0.5~2), voice(0 女声 / 1 男声，可选) }
 *
 * 免费额度：基础语音合成每月 200 万字符，逐句范读场景绰绰有余。
 * 返回：{ ok, audio(base64), truncated } 或 { ok:false, errMsg }
 */
const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-tts");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TtsClient = tencentcloud.tts.v20190823.Client;

// TextToBasicTTS 单次文本上限 150 字节（UTF-8），约 50 个汉字，按 45 保守截断
const MAX_BYTES = 150;
const SAFE_BYTES = 140;

function byteLen(str) {
  let n = 0;
  for (const ch of String(str)) n += ch.charCodeAt(0) > 127 ? 3 : 1;
  return n;
}

/** 前端 0.5~2 的语速映射为腾讯云 Speed（-2 ~ 6，0 正常） */
function mapSpeed(rate) {
  const r = Number(rate) || 1;
  if (r < 0.7) return -2;
  if (r < 0.9) return -1;
  if (r <= 1.1) return 0;
  if (r <= 1.3) return 1;
  if (r <= 1.6) return 2;
  return 3;
}

exports.main = async (event) => {
  const text = String((event && event.text) || "").trim();
  if (!text) return { ok: false, errMsg: "缺少 text 参数" };

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    return { ok: false, errMsg: "未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY" };
  }

  try {
    const client = new TtsClient({
      credential: { secretId, secretKey },
      region: process.env.TENCENT_REGION || "ap-guangzhou",
      profile: {
        httpProfile: { endpoint: "tts.tencentcloudapi.com", reqTimeout: 20 },
      },
    });

    // 超长句子安全截断（逐句朗读场景极少触发）
    let content = text;
    let truncated = false;
    if (byteLen(content) > MAX_BYTES) {
      content = Array.from(content)
        .reduce((acc, ch) => {
          if (byteLen(acc + ch) <= SAFE_BYTES) acc += ch;
          return acc;
        }, "")
        .trim();
      truncated = true;
    }

    const res = await client.TextToBasicTTS({
      Text: content,
      SessionId: "wenjuan-" + Date.now(),
      // 音色：前端传 voice(0 女声 / 1 男声) 优先；未传则用环境变量 TTS_MODEL_TYPE，再兜底 0
      ModelType: (() => {
        const v = Number(event && event.voice);
        return v === 0 || v === 1 ? v : Number(process.env.TTS_MODEL_TYPE) || 0;
      })(),
      Speed: mapSpeed(event && event.speed),
    });

    const audio = res && res.Audio;
    if (!audio) return { ok: false, errMsg: "合成成功但未返回音频" };

    return { ok: true, audio, truncated, voice: res.SessionId ? undefined : undefined };
  } catch (e) {
    return { ok: false, errMsg: (e && e.message) || "TTS 调用失败", code: (e && e.code) || "" };
  }
};
