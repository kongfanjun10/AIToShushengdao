const app = getApp();
const store = require("../../utils/store");
const nav = require("../../utils/nav");
const profile = require("../../utils/profile");
const qrcode = require("../../utils/qrcode");

const POSTER_W = 600;
const POSTER_H = 960; // 底部留出小程序码区块（原 840 只有文字落款）

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

function mmss(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

Page({
  data: {
    // 夜览模式：打开后页面盖一层暗色护眼遮罩（家长中心可开关）
    night: !!store.getUser().nightMode,
    // 顶部导航布局：app 启动时测量并缓存，页面首帧即最终位置（切页签/进页面标题栏不再跳）
    ...nav.init(),
    nickname: "", // 空昵称显示兜底「小朋友」（不再预置「孔老师」）
    avatar: "",
    dateText: "",
    groupId: "",
    lessonName: "课文朗读",
    summary: { read: 0, total: 0, percent: 100, duration: "00:00", vocab: 0 },
    certNo: "",
    badgeName: "初次开口",
    badgeDesc: "完成第 1 次整组课文跟读，声音真好听！",
  },

  onLoad(options) {
    const groupId = (options && options.groupId) || "";
    const group = (groupId && store.getGroup(groupId)) || store.activeGroup();
    const user = store.getUser();
    const p = group ? store.progressOf(group) : { read: 0, total: 0, percent: 0 };
    const seconds = group ? group.sentences.reduce((s, x) => s + (x.seconds || 0), 0) : 0;
    const vocab = group ? store.listWords({}).filter((w) => w.groupId === group.id).length : 0;
    const nextBadge = store.nextBadge();
    const d = new Date();
    // 证书编码：按用户隔离的当日流水号 + 当日查重
    //  - 多用户（同设备不同孩子：手机号/昵称区分）各自独立计数，互不挤占
    //  - 同一天同一用户、同一份证书内容（课文+进度+用时+生词）重复生成 → 沿用上一版编号
    //  - 跨天自动归零，保证按日升序
    const dayKey =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const uid = String((user && (user.phone || user.nickname)) || "anon");
    const lessonTitle = group ? group.title || "课文朗读" : "课文朗读";
    const fp = [groupId, lessonTitle, p.read, p.total, seconds, vocab].join("|");
    let certStore = wx.getStorageSync("wb_cert_seq") || {};
    let certDirty = false;
    if (!certStore.date || certStore.date !== dayKey) {
      certStore = { date: dayKey, users: {} };
      certDirty = true;
    }
    const rec = certStore.users[uid] || { seq: 0, last: null };
    let certNo;
    if (rec.last && rec.last.fp === fp) {
      certNo = rec.last.no; // 重复生成：沿用上一版，不占新号
    } else {
      rec.seq += 1;
      certNo =
        "NO." + dayKey.replace(/-/g, "") + "-" + String(rec.seq).padStart(3, "0");
      rec.last = { fp: fp, no: certNo };
      certStore.users[uid] = rec;
      certDirty = true;
    }
    if (certDirty) {
      try {
        wx.setStorageSync("wb_cert_seq", certStore);
      } catch (e) {
        /* 存储异常时编码仍可用，只是下次可能重复 */
      }
    }
    const navInfo = nav.sync();

    this.setData({
      statusBar: navInfo.statusBar,
      navH: navInfo.navH,
      navRight: navInfo.navRight,
      nickname: user.nickname || "小朋友",
      avatar: profile.avatar(),
      dateText: today(),
      groupId: group ? group.id : "",
      lessonName: lessonTitle,
      summary: {
        read: p.read,
        total: p.total,
        percent: p.total ? Math.round((p.read / p.total) * 100) : 0,
        duration: mmss(seconds),
        vocab,
      },
      certNo: certNo,
      badgeName: nextBadge ? nextBadge.name.replace(/[『』]/g, "") : "朗读达人",
      badgeDesc: nextBadge
        ? `再完成 ${Math.max(0, nextBadge.target - nextBadge.current)} 次就能点亮它！`
        : "全部勋章已点亮，太厉害了！",
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/home/home" });
  },

  goHome() {
    wx.redirectTo({ url: "/pages/home/home" });
  },

  goArchive() {
    wx.navigateTo({ url: "/pages/archive/archive" });
  },

  /* ---------------- 奖状海报 ---------------- */
  savePoster() {
    wx.showLoading({ title: "正在生成海报…", mask: true });
    // 先拿小程序码（推广用）；拿不到也能出图，只是底部换成「微信搜索」文字块
    qrcode
      .get()
      .catch(() => "")
      .then((qrPath) => this.renderPoster(qrPath));
  },

  renderPoster(qrPath) {
    wx.createSelectorQuery()
      .select("#posterCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res && res[0];
        if (!info || !info.node) {
          wx.hideLoading();
          this.copyPosterText();
          return;
        }
        const canvas = info.node;
        const ctx = canvas.getContext("2d");
        const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
        canvas.width = POSTER_W * dpr;
        canvas.height = POSTER_H * dpr;
        ctx.scale(dpr, dpr);

        this.loadImage(canvas, qrPath).then((img) => {
          try {
            this.drawPoster(ctx, POSTER_W, POSTER_H, img);
          } catch (err) {
            wx.hideLoading();
            this.copyPosterText();
            return;
          }
          this.exportPoster(canvas);
        });
      });
  },

  /** 把本地图片读进离屏 canvas（失败/超时都返回 null，海报不留空框） */
  loadImage(canvas, path) {
    return new Promise((resolve) => {
      if (!path || !canvas || !canvas.createImage) {
        resolve(null);
        return;
      }
      let done = false;
      const fin = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      try {
        const img = canvas.createImage();
        img.onload = () => fin(img);
        img.onerror = () => fin(null);
        img.src = path;
        setTimeout(() => fin(null), 3000);
      } catch (e) {
        fin(null);
      }
    });
  },

  exportPoster(canvas) {
    wx.canvasToTempFilePath({
      canvas,
      success: (r) => {
        wx.saveImageToPhotosAlbum({
          filePath: r.tempFilePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({ title: "已保存到相册 🎉", icon: "success" });
          },
          fail: (e) => {
            wx.hideLoading();
            const msg = (e && e.errMsg) || "";
            if (msg.indexOf("auth") > -1 || msg.indexOf("deny") > -1) {
              wx.showModal({
                title: "需要相册权限",
                content: "在设置里允许「保存到相册」后再试；也可以先复制文字版奖状。",
                confirmText: "复制文字",
                cancelText: "去设置",
                confirmColor: "#0ea5e9",
                success: (m) => {
                  if (m.confirm) this.copyPosterText();
                  else wx.openSetting({});
                },
              });
            } else {
              this.copyPosterText();
            }
          },
        });
      },
      fail: () => {
        wx.hideLoading();
        this.copyPosterText();
      },
    });
  },

  /** 文字版兜底：海报生成/保存失败时仍能把奖状分享出去 */
  copyPosterText() {
    const text = [
      "书声岛 · 朗读奖状",
      `${this.data.nickname} 完成了《${this.data.lessonName}》全文朗读`,
      `完成 ${this.data.summary.read}/${this.data.summary.total} 句 · 用时 ${this.data.summary.duration}`,
      this.data.dateText,
    ].join("\n");
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "奖状文字已复制", icon: "success" }),
    });
  },

  drawPoster(ctx, W, H, qrImg) {
    const d = this.data;
    const cx = W / 2;

    /* ---- 1. 金色花纹外底 + 米白内底（参考：金色欧式荣誉证书） ---- */
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#eed27f");
    bg.addColorStop(1, "#c9971b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 菱形暗纹（金底上的低调花纹）
    ctx.strokeStyle = "rgba(163, 117, 12, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -H; i < W + H; i += 26) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.moveTo(i + H, 0);
      ctx.lineTo(i, H);
    }
    ctx.stroke();

    this.rr(ctx, 26, 26, W - 52, H - 52, 8);
    ctx.fillStyle = "#fdfaf1";
    ctx.fill();

    /* ---- 2. 花纹边框：外金粗线 + 内蓝细线 + 四角扇贝花饰 ---- */
    ctx.strokeStyle = "#d4a017";
    ctx.lineWidth = 3;
    this.rr(ctx, 40, 40, W - 80, H - 80, 4);
    ctx.stroke();
    ctx.strokeStyle = "#2b5fd9";
    ctx.lineWidth = 1.5;
    this.rr(ctx, 52, 52, W - 104, H - 104, 2);
    ctx.stroke();
    this.drawCorners(ctx, W, H);

    /* ---- 3. 金色绶带 ---- */
    this.ribbon(ctx, cx, 92);

    /* ---- 4. 标题（衬线大字、宽字距、中国红；副题金色中字） ---- */
    ctx.textAlign = "center";
    ctx.fillStyle = "#cf3f35";
    ctx.font = "bold 54px serif";
    this.spaced(ctx, "荣誉证书", cx, 236, 18);
    ctx.fillStyle = "#a3821d";
    ctx.font = "16px serif";
    this.spaced(ctx, "书声岛 · 朗读荣誉证书", cx, 268, 2);

    /* ---- 5. 证书正文（姓名 → 授称号 → 鼓励语） ---- */
    ctx.fillStyle = "#1e3a8a";
    ctx.font = "bold 30px serif";
    ctx.fillText(d.nickname, cx, 334);
    ctx.strokeStyle = "#d4a017";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 96, 348);
    ctx.lineTo(cx + 96, 348);
    ctx.stroke();

    // 授称号（突出显示）
    ctx.fillStyle = "#cf3f35";
    ctx.font = "bold 25px serif";
    this.spaced(ctx, `授予「${d.badgeName}」称号`, cx, 386, 2);

    ctx.fillStyle = "#5b5648";
    ctx.font = "19px serif";
    const bodyEnd = this.wrapText(
      ctx,
      `在《${d.lessonName}》朗读练习中读音准确、声音响亮，特发此状，以资鼓励！`,
      cx,
      416,
      W - 210,
      34
    );

    /* ---- 6. 核心数据（位置随正文行数自适应，避免重叠） ---- */
    const numY = bodyEnd + 34;
    ctx.fillStyle = "#d4a017";
    ctx.font = "bold 30px serif";
    ctx.fillText(`${d.summary.read} / ${d.summary.total} 句`, cx, numY);
    ctx.fillStyle = "#8a8570";
    ctx.font = "15px serif";
    const subY = numY + 28;
    ctx.fillText(
      `用时 ${d.summary.duration} · 生词 ${d.summary.vocab} 个 · 完成度 ${d.summary.percent}%`,
      cx,
      subY
    );

    /* ---- 7. 金色奖章（与上方数据行拉开间距） ---- */
    const medalY = Math.min(subY + 84, 606);
    this.medal(ctx, cx, medalY);

    /* ---- 8. 分隔线 + 推广码区块（沿用；正文过长时整段上收，保证落款不出内框） ---- */
    const sepY = Math.min(medalY + 64, 672);
    ctx.strokeStyle = "#e3d9bd";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(88, sepY);
    ctx.lineTo(W - 88, sepY);
    ctx.stroke();

    const foot1 = this.drawQrBlock(ctx, W, qrImg, d, sepY + 10);

    /* ---- 9. 落款（动态跟随，保持在蓝色内框线之上） ---- */
    ctx.textAlign = "center";
    ctx.fillStyle = "#8a8570";
    ctx.font = "16px serif";
    ctx.fillText(`${d.certNo} · ${d.dateText}`, cx, foot1 + 24);
    ctx.fillText("保持朗读，下一段更精彩 ✨", cx, foot1 + 48);
  },

  /** 宽字距逐字绘制（标题 / 兹证明） */
  spaced(ctx, text, cx, y, gap) {
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    let x = cx - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    chars.forEach((c, i) => {
      ctx.fillText(c, x, y);
      x += widths[i] + gap;
    });
    ctx.textAlign = prev;
  },

  /** 四角扇贝花饰（金色弧线组 + 点缀珠） */
  drawCorners(ctx, W, H) {
    const cs = [
      [40, 40, 0],
      [W - 40, 40, Math.PI / 2],
      [W - 40, H - 40, Math.PI],
      [40, H - 40, Math.PI * 1.5],
    ];
    cs.forEach(([x, y, a]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.strokeStyle = "#d4a017";
      [22, 32, 42].forEach((r, i) => {
        ctx.lineWidth = i === 0 ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI / 2);
        ctx.stroke();
      });
      ctx.fillStyle = "#d4a017";
      const k = Math.SQRT1_2;
      ctx.beginPath();
      ctx.arc(50 * k, 50 * k, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(50, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 50, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  },

  /** 金色绶带：中央主体 + 两侧燕尾翼 + 折角阴影 */
  ribbon(ctx, cx, cy) {
    const halfW = 112;
    // 左右翼（画在主体后面，深一号的金）
    ctx.fillStyle = "#c9971b";
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy + 4);
    ctx.lineTo(cx - halfW - 40, cy + 4);
    ctx.lineTo(cx - halfW - 18, cy + 24);
    ctx.lineTo(cx - halfW - 40, cy + 44);
    ctx.lineTo(cx - halfW, cy + 44);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + halfW, cy + 4);
    ctx.lineTo(cx + halfW + 40, cy + 4);
    ctx.lineTo(cx + halfW + 18, cy + 24);
    ctx.lineTo(cx + halfW + 40, cy + 44);
    ctx.lineTo(cx + halfW, cy + 44);
    ctx.closePath();
    ctx.fill();
    // 主体
    const g = ctx.createLinearGradient(0, cy, 0, cy + 40);
    g.addColorStop(0, "#eecb5a");
    g.addColorStop(0.5, "#d4a017");
    g.addColorStop(1, "#b8860b");
    ctx.fillStyle = g;
    this.rr(ctx, cx - halfW, cy, halfW * 2, 40, 4);
    ctx.fill();
    ctx.strokeStyle = "#a3750c";
    ctx.lineWidth = 1.5;
    this.rr(ctx, cx - halfW, cy, halfW * 2, 40, 4);
    ctx.stroke();
    // 主体上折角（表现翼在后面）
    ctx.fillStyle = "#8f6a0c";
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy);
    ctx.lineTo(cx - halfW + 14, cy);
    ctx.lineTo(cx - halfW, cy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + halfW, cy);
    ctx.lineTo(cx + halfW - 14, cy);
    ctx.lineTo(cx + halfW, cy + 12);
    ctx.closePath();
    ctx.fill();
    // 带面小字
    ctx.textAlign = "center";
    ctx.fillStyle = "#7a5b0e";
    ctx.font = "12px serif";
    ctx.fillText("R E A D I N G   A W A R D", cx, cy + 25);
  },

  /** 金色奖章：蓝缎带 + 金花边外圈 + 红内圆 + 白星 */
  medal(ctx, cx, cy) {
    // 缎带 V 形
    ctx.fillStyle = "#2b5fd9";
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 62);
    ctx.lineTo(cx - 2, cy - 30);
    ctx.lineTo(cx - 26, cy - 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 26, cy - 62);
    ctx.lineTo(cx + 2, cy - 30);
    ctx.lineTo(cx + 26, cy - 30);
    ctx.closePath();
    ctx.fill();
    // 花边外圈（24 颗小金珠）
    ctx.fillStyle = "#d4a017";
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 主圆
    const g = ctx.createLinearGradient(cx - 44, cy - 44, cx + 44, cy + 44);
    g.addColorStop(0, "#f2cf6b");
    g.addColorStop(1, "#cf9c17");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a3750c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 45, 0, Math.PI * 2);
    ctx.stroke();
    // 红内圆
    ctx.fillStyle = "#cf3f35";
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f6e3b0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 27, 0, Math.PI * 2);
    ctx.stroke();
    // 白星 + 岛名
    this.star(ctx, cx, cy - 8, 13, "#fdf6dd");
    ctx.fillStyle = "#fdf6dd";
    ctx.font = "bold 13px serif";
    ctx.fillText("书声岛", cx, cy + 18);
  },

  /**
   * 海报底部推广区块
   * 有码：右侧 148×148 小程序码 + 左侧引导文案
   * 无码（云开发未开通/未部署/未发布）：整条换成「微信搜索」文案，绝不留空白框
   */
  drawQrBlock(ctx, W, img, d, boxY) {
    const size = qrcode.size || 148;
    const boxH = size + 24;
    const left = 88;
    const right = W - 56 - 24; // 内卡右内边距

    if (img) {
      const boxW = size + 24;
      const boxX = right - boxW;
      this.rr(ctx, boxX, boxY, boxW, boxH, 18);
      ctx.fillStyle = "#faf5e6";
      ctx.fill();
      ctx.strokeStyle = "#e3d9bd";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      try {
        ctx.drawImage(img, boxX + 12, boxY + 12, size, size);
      } catch (e) {
        /* 画图失败就当没有码，下面的文案单独看也成立 */
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#3f3a2e";
      ctx.font = "bold 22px serif";
      ctx.fillText("微信扫一扫", left, 744);
      ctx.fillStyle = "#a3821d";
      ctx.font = "20px serif";
      ctx.fillText("打开「书声岛」", left, 778);
      ctx.fillStyle = "#8a8570";
      ctx.font = "14px serif";
      ctx.fillText(`和${d.nickname || "孩子"}一起每天读一点`, left, boxY + 138);
      return boxY + boxH;
    }

    const boxW = right - left;
    this.rr(ctx, left, boxY, boxW, boxH, 18);
    ctx.fillStyle = "#faf5e6";
    ctx.fill();
    ctx.strokeStyle = "#d9cba2";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    const mid = left + boxW / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#a3821d";
    ctx.font = "bold 26px serif";
    ctx.fillText("微信搜索「书声岛」", mid, boxY + 80);
    ctx.fillStyle = "#8a8570";
    ctx.font = "16px serif";
    ctx.fillText("和小伙伴一起，每天读一点", mid, boxY + 120);
    return boxY + boxH;
  },

  /** 圆角矩形路径 */
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /** 五角星（color 可选，默认金色） */
  star(ctx, cx, cy, R, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? R : R * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color || "#fbbf24";
    ctx.fill();
  },

  /** 居中多行文本（返回最后一行的 y，供后续元素接排） */
  wrapText(ctx, text, cx, y, maxW, lineH) {
    const chars = Array.from(text);
    let line = "";
    let yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, cx, yy);
        line = ch;
        yy += lineH;
      } else {
        line += ch;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
    return yy;
  },

  review() {
    if (this.data.groupId) {
      wx.redirectTo({ url: "/pages/reader/reader?groupId=" + this.data.groupId });
      return;
    }
    wx.navigateTo({ url: "/pages/reader/reader" });
  },

  goVocab() {
    wx.navigateTo({ url: "/pages/vocab/vocab" });
  },
});
