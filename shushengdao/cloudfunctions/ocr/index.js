/**
 * 云函数：OCR 文字识别（腾讯云文字识别 GeneralBasicOCR）
 * 部署：微信开发者工具 → cloudfunctions/ocr 右键「上传并部署：云端安装依赖」
 * 配置：云开发控制台 → 云函数 ocr → 配置 → 环境变量
 *   TENCENT_SECRET_ID / TENCENT_SECRET_KEY / TENCENT_REGION(可选，默认 ap-guangzhou)
 * 说明：密钥只存在服务端环境变量中，小程序端不接触。
 */
const cloud = require("wx-server-sdk");
const tencentcloud = require("tencentcloud-sdk-nodejs-ocr");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const OcrClient = tencentcloud.ocr.v20181119.Client;

exports.main = async (event) => {
  const fileID = event && event.fileID;
  if (!fileID) return { errMsg: "缺少 fileID", lines: [] };

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    return { errMsg: "未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY", lines: [] };
  }

  try {
    const file = await cloud.downloadFile({ fileID });
    const base64 = file.fileContent.toString("base64");

    const client = new OcrClient({
      credential: { secretId, secretKey },
      region: process.env.TENCENT_REGION || "ap-guangzhou",
      profile: {
        httpProfile: { endpoint: "ocr.tencentcloudapi.com", reqTimeout: 20 },
      },
    });

    const res = await client.GeneralBasicOCR({ ImageBase64: base64 });
    const lines = (res.TextDetections || [])
      .map((t) => t.DetectedText)
      .filter((t) => t && String(t).trim());

    return { lines, count: lines.length, mode: "cloud" };
  } catch (e) {
    return { errMsg: (e && e.message) || "OCR 调用失败", lines: [] };
  }
};
