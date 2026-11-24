#!/usr/bin/env node
/**
 * 同声传译插件（WechatSI）开关
 *
 * 用法：
 *   node tools/switch-tts-plugin.js status   查看当前状态
 *   node tools/switch-tts-plugin.js on       在 app.json 声明插件（需后台已添加插件）
 *   node tools/switch-tts-plugin.js off      移除声明（后台未授权时用于应急，避免编译报错）
 *   node tools/switch-tts-plugin.js on 0.3.4 指定插件版本号
 *
 * 说明：小程序规定 requirePlugin 的插件必须在 app.json 的 plugins 中声明；
 * 一旦声明但后台未添加/未授权，整个项目编译阶段就会报
 * “插件 wx069ba97219f66d99 未授权” 之类错误，因此提供 off 兜底。
 */
const fs = require("fs");
const path = require("path");

// 小程序工程根目录（支持目录改名：wenjuanbandu / miniprogram）
const CANDIDATES = [
  path.resolve(__dirname, "..", "shushengdao"),
  path.resolve(__dirname, "..", "wenjuanbandu"),
  path.resolve(__dirname, "..", "miniprogram"),
  path.resolve(__dirname, ".."),
];
const ROOT = CANDIDATES.find((p) => fs.existsSync(path.join(p, "app.json")));
if (!ROOT) {
  console.error("找不到小程序工程（未找到 app.json）");
  process.exit(1);
}
const APP_JSON = path.join(ROOT, "app.json");
const SNIPPET = path.join(ROOT, "config", "app.plugins.snippet.json");

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeApp(data) {
  // 保持 key 顺序：pages → window → plugins → 其余
  const ordered = {};
  ["pages", "window", "plugins", "permission", "style", "sitemapLocation", "lazyCodeLoading", "subpackages", "tabBar"].forEach(
    (k) => {
      if (data[k] !== undefined) ordered[k] = data[k];
    }
  );
  Object.keys(data).forEach((k) => {
    if (ordered[k] === undefined) ordered[k] = data[k];
  });
  fs.writeFileSync(APP_JSON, JSON.stringify(ordered, null, 2) + "\n", "utf8");
}

function status() {
  const app = readJSON(APP_JSON);
  const p = app.plugins && app.plugins.WechatSI;
  if (!p) {
    console.log("✗ app.json 未声明 WechatSI 插件");
    console.log("  → 需要范读语音时执行：node tools/switch-tts-plugin.js on");
    return;
  }
  console.log("✓ app.json 已声明 WechatSI 插件");
  console.log("  provider: " + p.provider + "  version: " + p.version);
  console.log("  → 仍需在小程序后台「插件管理」添加该插件，否则编译会报未授权");
}

function on(version) {
  const app = readJSON(APP_JSON);
  const snippet = readJSON(SNIPPET);
  const entry = Object.assign({}, snippet.plugins, app.plugins || {});
  if (version) {
    entry.WechatSI.version = version;
  }
  app.plugins = entry;
  writeApp(app);
  console.log("✓ 已在 app.json 声明 WechatSI 插件（version " + entry.WechatSI.version + "）");
  console.log("  下一步：微信开发者工具 → 重新编译；若仍报未授权，请到公众平台添加插件");
}

function off() {
  const app = readJSON(APP_JSON);
  if (!app.plugins) {
    console.log("· app.json 本来就没有 plugins 段，无需处理");
    return;
  }
  delete app.plugins;
  writeApp(app);
  console.log("✓ 已从 app.json 移除 plugins 段");
  console.log("  范读会降级为轻提示，拍照朗读 / 录音回听等主流程不受影响");
}

const cmd = (process.argv[2] || "status").toLowerCase();
const arg = process.argv[3];
try {
  if (cmd === "on") on(arg);
  else if (cmd === "off") off();
  else status();
} catch (e) {
  console.error("执行失败：" + e.message);
  process.exit(1);
}
