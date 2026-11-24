/**
 * OCR 文字识别（三种通道，自动降级）
 *  1. 微信服务市场「腾讯云文字识别 OCR」—— 无需自建后端，小程序后台开通即可用
 *  2. 云开发云函数（cloudfunctions/ocr）—— 自带腾讯云账号时使用，密钥不出服务端
 *  3. 本地演示数据 —— 未配置任何服务时保证流程可走通
 */
const config = require("../config/index");

const MOCK_PAGES = [
  [
    "秋天的雨，是一把钥匙。",
    "它带着清凉和温柔，轻轻地，轻轻地，趁你没留意，把秋天的大门打开了。",
  ],
  [
    "秋天的雨，有一盒五彩缤纷的颜料。",
    "你看，它把黄色给了银杏树，黄黄的叶子像一把把小扇子，扇走了夏天的炎热。",
    "它把红色给了枫树，红红的枫叶像一枚枚邮票，飘哇飘哇，邮来了秋天的凉爽。",
  ],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject({ errMsg: (label || "请求") + "超时", code: "TIMEOUT" });
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/* ---------------- 图片预处理 ---------------- */
function compressImage(path) {
  return new Promise((resolve) => {
    if (!wx.compressImage) {
      resolve(path);
      return;
    }
    wx.compressImage({
      src: path,
      quality: config.ocr.compressQuality,
      compressedWidth: config.ocr.compressWidth,
      success: (res) => resolve(res.tempFilePath || path),
      fail: () => resolve(path),
    });
  });
}

function readBase64(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success: (res) => resolve(res.data),
      fail: (err) => reject({ errMsg: "读取图片失败", raw: err }),
    });
  });
}

/* ---------------- 响应解析 ---------------- */
function collectText(node, out, depth) {
  if (!node || depth > 4) return;
  if (typeof node === "string") {
    if (node.trim()) out.push(node.trim());
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((it) => collectText(it, out, depth + 1));
    return;
  }
  if (typeof node !== "object") return;
  const text = node.text || node.itemstring || node.itemString || node.DetectedText || node.words;
  if (typeof text === "string" && text.trim()) {
    out.push(text.trim());
    return;
  }
  ["items", "ocr_comm_res", "text_detections", "TextDetections", "data", "result", "results", "lines"].forEach((k) => {
    if (node[k]) collectText(node[k], out, depth + 1);
  });
}

function extractLines(res) {
  const out = [];
  collectText(res && (res.data || res), out, 0);
  // 去重（同一行可能因多结构重复出现）
  const seen = {};
  return out.filter((t) => {
    if (seen[t]) return false;
    seen[t] = 1;
    return true;
  });
}

/* ---------------- 通道 1：微信服务市场 ---------------- */
/**
 * 服务市场 OCR 错误码（官方）：
 *  -1 入参错误 / -2 调用失败 / -3 逻辑失败 / -6 appid 错误 /
 *  -7,-8 api 信息错误 / -10 扣费失败（额度不足）/ -11 频率超限
 */
function describeMarketError(e) {
  const code = String((e && (e.errCode || e.errno || e.errcode)) || "");
  const map = {
    "-1": "入参错误，请检查 ocr_type / data_type",
    "-2": "服务调用失败，稍后重试",
    "-3": "服务逻辑失败，请换一张更清晰的图片",
    "-6": "服务未授权给当前小程序，请到服务市场确认绑定",
    "-7": "api 信息错误，检查 config.ocr.marketApi",
    "-8": "api 信息错误，检查 config.ocr.marketApi",
    "-10": "OCR 额度不足，请到服务市场领取免费额度",
    "-11": "调用频率超限，请稍后重试",
  };
  return map[code] || (e && (e.errMsg || e.message)) || "服务市场 OCR 调用失败";
}

/** 用 CDN 标记把本地图片换成服务端可拉取的临时 URL（基础库 2.9.0+） */
function buildCdnUrl(path) {
  try {
    if (wx.serviceMarket && typeof wx.serviceMarket.CDN === "function") {
      return new wx.serviceMarket.CDN({ type: "filePath", filePath: path });
    }
  } catch (e) {}
  return null;
}

function invokeMarket(data) {
  return new Promise((resolve, reject) => {
    let task;
    try {
      task = wx.serviceMarket.invokeService({
        service: config.ocr.marketService,
        api: config.ocr.marketApi,
        data,
      });
    } catch (e) {
      reject({ code: "MARKET_THROW", errMsg: "服务市场调用异常：" + ((e && e.message) || "") });
      return;
    }
    withTimeout(task, config.ocr.timeout, "OCR 识别").then(resolve, (e) =>
      reject({
        code: "MARKET_FAIL",
        errCode: e && (e.errCode || e.errno || e.errcode),
        errMsg: describeMarketError(e),
        raw: e,
      })
    );
  }).then((res) => {
    const lines = extractLines(res);
    if (!lines.length) throw { code: "EMPTY", errMsg: "未识别到文字，换一张更清晰的图片试试" };
    return lines;
  });
}

function recognizeByMarket(path) {
  if (!wx.serviceMarket || typeof wx.serviceMarket.invokeService !== "function") {
    return Promise.reject({ errMsg: "当前基础库不支持服务市场调用", code: "NO_MARKET" });
  }
  const ocrType = Number(config.ocr.marketOcrType) || 8; // 8 = 通用印刷体识别
  const url = buildCdnUrl(path);

  const first = url
    ? invokeMarket({ img_url: url, data_type: 3, ocr_type: ocrType })
    : readBase64(path).then((b64) => invokeMarket({ img_url: b64, data_type: 2, ocr_type: ocrType }));

  return first.catch((err) => {
    // 额度不足 / 频率超限 / 已识别为空时不再重试；其余情况（CDN 拉取失败等）降级为 base64
    const fatal = ["EMPTY", "-10", "-11"].indexOf(String(err && (err.code === "EMPTY" ? "EMPTY" : err.errCode))) > -1;
    if (fatal || !url) throw err;
    return readBase64(path).then((b64) => invokeMarket({ img_url: b64, data_type: 2, ocr_type: ocrType }));
  });
}

/* ---------------- 通道 2：云开发云函数 ---------------- */
let cloudReady = false;
function ensureCloud() {
  if (cloudReady) return true;
  if (!wx.cloud) return false;
  try {
    wx.cloud.init({ env: config.ocr.cloudEnv || undefined, traceUser: true });
    cloudReady = true;
  } catch (e) {
    return false;
  }
  return true;
}

function recognizeByCloud(path, index) {
  if (!ensureCloud()) {
    return Promise.reject({ errMsg: "未开通云开发", code: "NO_CLOUD" });
  }
  const ext = (path.match(/\.(\w+)$/) || [])[1] || "jpg";
  const cloudPath = `ocr/${Date.now()}-${index}.${ext}`;
  return withTimeout(
    wx.cloud
      .uploadFile({ cloudPath, filePath: path })
      .then((up) =>
        wx.cloud.callFunction({
          name: config.ocr.cloudFunction,
          data: { fileID: up.fileID },
        })
      )
      .then((res) => {
        const result = (res && res.result) || {};
        const lines = result.lines || extractLines(result);
        if (!lines.length) throw { errMsg: result.errMsg || "未识别到文字", code: "EMPTY" };
        return lines;
      }),
    config.ocr.timeout + 10000,
    "OCR 云函数"
  );
}

/* ---------------- 通道 3：演示数据 ---------------- */
function recognizeByMock(index) {
  return sleep(500 + Math.random() * 400).then(() => MOCK_PAGES[index % MOCK_PAGES.length]);
}

/* ---------------- 主流程 ---------------- */
/**
 * @param {string[]} paths 本地图片临时路径
 * @param {function} onProgress ({index,total,status,mode,errMsg})
 * @returns {Promise<{lines:string[], rawText:string, mode:string, failed:number}>}
 */
async function recognize(paths, onProgress) {
  const list = (paths || []).slice(0, config.ocr.maxImages);
  const notify = typeof onProgress === "function" ? onProgress : function () {};
  const provider = config.ocr.provider;
  let mode = provider === "mock" ? "mock" : "";
  const lines = [];
  let failed = 0;

  for (let i = 0; i < list.length; i++) {
    notify({ index: i, total: list.length, status: "scanning", mode });
    let pageLines = null;

    if (provider !== "mock") {
      // 通道 1：服务市场
      if (!mode || mode === "market") {
        try {
          const compressed = await compressImage(list[i]);
          pageLines = await recognizeByMarket(compressed);
          mode = "market";
        } catch (e) {
          if (provider === "market") {
            failed += 1;
            notify({ index: i, total: list.length, status: "fail", mode, errMsg: e && e.errMsg });
            continue;
          }
        }
      }
      // 通道 2：云函数
      if (!pageLines && (!mode || mode === "cloud")) {
        try {
          pageLines = await recognizeByCloud(list[i], i);
          mode = "cloud";
        } catch (e) {
          if (provider === "cloud") {
            failed += 1;
            notify({ index: i, total: list.length, status: "fail", mode, errMsg: e && e.errMsg });
            continue;
          }
        }
      }
    }

    // 通道 3：演示数据兜底
    if (!pageLines) {
      if (!mode) mode = "mock";
      pageLines = await recognizeByMock(i);
    }

    pageLines.forEach((t) => lines.push(t));
    notify({ index: i, total: list.length, status: "ok", mode, count: pageLines.length });
  }

  return {
    lines,
    rawText: lines.join("\n"),
    mode: mode || "mock",
    failed,
  };
}

function isMockMode(mode) {
  return mode === "mock";
}

module.exports = { recognize, isMockMode, _extractLines: extractLines };
