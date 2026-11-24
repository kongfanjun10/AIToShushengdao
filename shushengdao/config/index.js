/**
 * 应用配置（前端可见，勿放密钥）
 */
module.exports = {
  appName: "书声岛",

  ocr: {
    /**
     * provider:
     *  - auto   ：优先微信服务市场 OCR → 云函数 OCR → 演示数据
     *  - market ：仅微信服务市场（腾讯云文字识别）
     *  - cloud  ：仅云开发云函数（cloudfunctions/ocr）
     *  - mock   ：本地演示数据（不联网）
     */
    provider: "auto",
    // 微信服务市场「腾讯云文字识别 OCR」服务 ID 与接口名
    marketService: "wx79ac3de8be320b71",
    marketApi: "OcrAllInOne",
    // OCR 类型：8 = 通用印刷体识别（1 身份证 / 2 银行卡 / 7 营业执照 / 10 车牌）
    marketOcrType: 8,
    // 云开发环境 ID（使用 cloud provider 时填写，如 "wj-prod-1a2b3c"）
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "ocr",
    maxImages: 9,
    timeout: 25000,
    compressWidth: 1280,
    compressQuality: 82,
  },

  tts: {
    /**
     * provider:
     *  - auto  ：优先同声传译插件 → 云函数 TTS → 都没有则提示（默认）
     *  - plugin：仅插件（需后台添加 + app.json 声明，见 README）
     *  - cloud ：仅云函数 cloudfunctions/tts（个人主体 / 插件加不了时的兜底）
     *  - off   ：关闭范读语音
     */
    provider: "auto",
    pluginName: "WechatSI", // 微信同声传译插件
    // 云函数通道：填云开发环境 ID（如 "wj-prod-1a2b3c"）即启用 cloud 兜底
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "tts",
    // 云函数 TextToBasicTTS 单次约 50 字上限，按安全值截断
    cloudMaxChars: 45,
    defaultRate: 1,
    maxChars: 200,
    // 音色清单（仅云函数通道支持切换；插件通道音色固定）
    voices: [
      { id: "female", name: "温柔女声", desc: "清晰亲切，适合跟读" },
      { id: "male", name: "沉稳男声", desc: "低沉稳重，像讲故事" },
    ],
    // 所有通道都不可用时的提示文案（各页面复用）
    missingTip:
      "范读语音未配置：企业主体可在小程序后台添加「微信同声传译」插件；个人主体请开通云开发并部署 cloudfunctions/tts（详见 README「语音范读」一节）。",
  },

  feedback: {
    /**
     * 留言板：云函数 cloudfunctions/feedback + 云开发数据库 feedback 集合
     *  - cloudEnv：云开发环境 ID（与 ocr / tts 填同一个即可，留空用默认环境）
     * 管理口令在云函数 index.js 的 ADMIN_KEY 里修改（家长中心「留言管理」用）
     */
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "feedback",
  },

  stats: {
    /**
     * 数据后台：云函数 cloudfunctions/stats + 集合 stats_users / stats_days
     *  - cloudEnv：云开发环境 ID（与 ocr / tts / feedback 填同一个即可，留空用默认环境）
     *  - app.js 每次启动静默上报 track；家长绑定手机号后同步 bindPhone
     */
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "stats",
  },

  poster: {
    /**
     * 奖状海报上的小程序码（家长保存海报到相册 → 朋友圈/群里传播，别人扫码直接打开小程序）
     *  - 云函数 cloudfunctions/qrcode 调 wxacode.getUnlimited 生成，图片缓存在云存储
     *  - cloudEnv：云开发环境 ID（与其他云函数填同一个，留空用默认环境）
     *  - page：扫码后打开的页面（不能以 / 开头，且必须是已发布版本里存在的页面）
     *  - scene：小程序码场景值（≤32 字符，仅字母数字下划线）
     * 云端不可用（未开通云开发 / 未部署 / 未发布）时海报自动退化为「微信搜索」文字块，不影响保存。
     */
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "qrcode",
    page: "pages/home/home",
    scene: "poster",
    size: 148,
  },

  record: {
    maxSeconds: 30,
    sampleRate: 16000,
  },

  account: {
    /**
     * 手机号绑定：<button open-type="getPhoneNumber"> 拿到 code 后交给云函数换取号码
     *  - cloudEnv：云开发环境 ID（与 ocr / tts 填同一个即可）
     *  - phoneFunction：云函数名（cloudfunctions/phone）
     * 拿不到（个人主体 / 接口未开通 / 用户取消）时，前端自动降级为手动填写其他号码
     */
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    phoneFunction: "phone",
  },

  backup: {
    /**
     * 学习记录云备份（换设备找回）：key = 手机号 + 4 位恢复口令
     *  - 云函数 cloudfunctions/backup + 集合 user_backups
     *  - 绑定手机号时自动备份；app 退后台时静默增量备份（5 分钟节流）
     *  - 新设备绑定同号码时校验口令后可整体恢复
     */
    cloudEnv: "cloud1-d3g4t57no3b26dca2",
    cloudFunction: "backup",
    autoMinGap: 5, // 自动备份最小间隔（分钟）
  },
};
