# 视频小课堂 功能设计（视频上传 / 展示 / 搜索）

> 2026-11-13 设计稿。用途：教学资源 + 日常成长记录混合；仅家长上传（口令验证），孩子端只浏览播放。

## 1. 页面结构

新增页面 `pages/video/video`（主包，代码量小，视频本体走云存储不占包体积）：

- **视频墙（列表态）**
  - 顶栏：标题「小课堂」+ 返回
  - 搜索框：固定在分类条上方（与拼音/音标页 `.lv-bar` 同款固定方案，滚动不跑）
  - 分类条：全部 / 教学 / 日常（chip 带数量，点击过滤）
  - 双列卡片流：封面图 + 时长角标 + 标题 + 「分类 · 标签」；末尾「家长上传」虚线卡（仅家长可见）
  - 分页：每次 10 条，`onReachBottom` 触底加载
- **播放态**（同页切换 `mode: list | play`，避免多开页面）
  - `video` 组件原生播放，支持全屏、进度条
  - 信息卡：分类/标签 chip、标题、日期、时长、大小
  - 家长可见：删除按钮（走口令）

## 2. 数据模型（云数据库集合 `videos`）

```js
{
  _id: "",
  openid: "",            // 上传者（家长）
  title: "ABC 字母歌",   // 必填，搜索主字段
  kind: "teach",         // teach=教学 | daily=日常
  tags: ["英语", "字母歌"],   // 上传时选/填，搜索副字段
  desc: "",
  fileID: "cloud://xxx/videos/xxx.mp4",      // 云存储
  coverFileID: "cloud://xxx/covers/xxx.jpg", // chooseMedia 的缩略图直接上传当封面
  duration: 129,         // 秒，chooseMedia 返回
  size: 1753673,         // 字节
  status: "ok",          // ok=可见 | hidden=家长隐藏
  createdAt: Date
}
```

## 3. 上传流程（家长专属）

1. 入口：视频墙「家长上传」卡 或 家长页（两者都走现有 `PARENT_PASS` 口令验证）
2. `wx.chooseMedia({ count: 9, mediaType: ["video"] })` **多选**
3. 可选 `wx.compressVideo`（>50MB 先压缩）
4. 逐个上传（队列串行，UI 显示 n/9 + 进度条）：
   - `wx.cloud.uploadFile` 视频 → fileID
   - `wx.cloud.uploadFile` 缩略图 → coverFileID
5. 填标题/分类/标签（批量上传时默认用文件名做标题，可后改）
6. 云函数 `videos.create` 校验口令 → 入库

**内容安全（合规）**：视频对其他用户可见的 UGC 需内容审核。当前是单家庭自用（仅自己孩子看），方案分两档：
- v1（自用）：跳过自动审核，`status` 直接 ok，家长可自行隐藏/删除
- v2（如开放给多用户）：云函数调 `security.mediaCheckAsync`，入库时 `status: checking`，审核回调后置 ok；审核中仅家长可见

## 4. 搜索方案

- **搜索框交互**：点击聚焦即过滤（无搜索按钮），实时输入 → 防抖 300ms；支持标题 + 标签匹配；清空按钮
- **v1 本地过滤**：列表接口一次拉全部元数据（只有标题/标签/时长等小字段，单家庭量级 ≤ 数百条完全够），前端 `filter` 内存过滤，0 延迟
- **v2 云端搜索**（视频 >500 条再切）：云函数 `videos.search` 用 db.RegExp 对 title/tags 做 where 查询，分页返回；搜索框不变，只换数据源
- 搜索时自动忽略分类过滤或两者叠加（叠加：kind + 关键词）

## 5. 播放技术要点

- `video` 的 `src` **不支持 cloud:// 协议**，需 `wx.cloud.getTempFileURL` 换临时 https 地址（7 天有效，播前现取、取完缓存到页面变量）
- **域名白名单**：云存储下载域名 `*.tcb.qcloud.la` 需加进 mp 后台「downloadFile 合法域名」（上线前一步配置；开发工具可先勾「不校验合法域名」）
- 封面：`image` 用 coverFileID 的 tempURL；列表页只在滚动停止时加载可视区封面（懒加载 `lazy-load`）
- 播放页离开/切后台 `onHide` 暂停，避免压住儿歌等其他音频（与 songPlay.stop 同思路）
- 流量提示：日常视频用 WiFi 下自动高清，流量下给提示

## 6. 首页入口

首页「语文/英语」区已有拼音卡，视频入口放**快速入口条**（quick-bar）里加一个「小课堂」图标，或语文区下方加横向滚动「推荐视频」模块（取最近 3 条教学视频，点击直达播放）。建议 v1 先做快速入口，简单直接。

## 7. 云函数设计（`cloudfunctions/videos/`）

| action | 说明 |
|---|---|
| list | 分页拉列表（kind 过滤、按 createdAt 倒序）；家长身份额外返回 hidden 条目 |
| create | 口令校验 → 入库（v2 加 mediaCheckAsync） |
| update | 口令校验 → 改标题/标签/隐藏 |
| remove | 口令校验 → 删记录 + 删云存储文件（`wx.cloud.deleteFile`） |
| playUrl | 批量 fileID → tempFileURL（列表和播放共用） |

沿用 stats 云函数的口令校验模式（adminCall / PARENT_PASS）。

## 8. 实施拆步

1. **v1 最小可用**：视频页（列表 + 分类 + 本地搜索 + 播放）+ 家长上传（多选、进度、默认标题）+ videos 云函数 + 首页快速入口
2. **v1.5**：编辑标题/标签、隐藏/删除管理、WiFi 检测提示
3. **v2（按需）**：云端搜索分页、内容安全自动审核、推荐视频模块进首页
