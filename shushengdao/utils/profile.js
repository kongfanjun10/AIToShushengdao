/**
 * 孩子资料：昵称校验 + 头像选择/持久化
 *
 * 头像为什么不能直接用 chooseMedia 的临时路径：
 * 临时路径（http://tmp/... 或 wxfile://tmp_...）只在当前会话有效，小程序重启后失效，
 * 所以选完要复制到 USER_DATA_PATH（wxfile://usr/...）这份「用户目录」里，重启后仍然能读到。
 */
const store = require("./store");

const DEFAULT_NICKNAME = "小朋友"; // 空昵称时的显示兜底（不再用「孔老师」冒充真实昵称）
const NICK_MIN = 1;
const NICK_MAX = 8;
const NICK_RE = /^[\u4e00-\u9fa5a-zA-Z0-9·\-_ ]+$/;

let seq = 0;

function userDataPath() {
  try {
    return (wx.env && wx.env.USER_DATA_PATH) || "";
  } catch (e) {
    return "";
  }
}

function fileSystem() {
  try {
    return wx.getFileSystemManager ? wx.getFileSystemManager() : null;
  } catch (e) {
    return null;
  }
}

function isUserFile(p) {
  const dir = userDataPath();
  return !!(p && dir && String(p).indexOf(dir) === 0);
}

function exists(p) {
  if (!p) return false;
  const fs = fileSystem();
  if (!fs || !fs.accessSync) return true; // 没有 API 时不误删
  try {
    fs.accessSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function removeFile(p) {
  // 只删用户目录里的头像文件，绝不碰临时文件或系统文件
  if (!isUserFile(p)) return;
  const fs = fileSystem();
  if (!fs || !fs.unlink) return;
  try {
    fs.unlink({ filePath: p, fail: () => {} });
  } catch (e) {
    // 文件已经不存在，忽略
  }
}

function extOf(p) {
  const m = /\.([a-zA-Z0-9]{1,5})(?:\?|$)/.exec(String(p || ""));
  return m ? m[1].toLowerCase() : "jpg";
}

function nextFileName(p) {
  seq += 1;
  return "avatar_" + Date.now().toString(36) + "_" + seq + "." + extOf(p);
}

/* ---------------- 昵称 ---------------- */

/**
 * 校验昵称
 * @returns {{ok:boolean, value:string, msg:string, length:number}}
 */
function validateNickname(raw) {
  const v = String(raw == null ? "" : raw)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const len = Array.from(v).length;
  if (!v) return { ok: false, value: "", msg: "昵称不能为空", length: 0 };
  if (len < NICK_MIN) return { ok: false, value: v, msg: "至少 " + NICK_MIN + " 个字", length: len };
  if (len > NICK_MAX) return { ok: false, value: v, msg: "最多 " + NICK_MAX + " 个字", length: len };
  if (!NICK_RE.test(v)) return { ok: false, value: v, msg: "只能用中文、字母、数字", length: len };
  return { ok: true, value: v, msg: "", length: len };
}

/** 保存昵称（校验不过返回 false，不写库） */
function saveNickname(raw) {
  const r = validateNickname(raw);
  if (!r.ok) return r;
  store.setUser({ nickname: r.value });
  return r;
}

function nickname() {
  const u = store.getUser();
  return (u && u.nickname) || DEFAULT_NICKNAME;
}

/* ---------------- 头像 ---------------- */

/** 选图：from = "camera" | "album"；回调拿到临时路径（取消为空串） */
function choosePhoto(from, cb) {
  const done = (p) => {
    if (typeof cb === "function") cb(p || "");
  };
  const sourceType = from === "camera" ? ["camera"] : ["album"];
  const fail = (err) => {
    const msg = String((err && err.errMsg) || "");
    if (msg.indexOf("cancel") > -1) {
      done("");
      return;
    }
    // 相机不可用时退回相册，避免直接失败
    if (from === "camera" && wx.chooseMedia) {
      choosePhoto("album", cb);
      return;
    }
    done("");
  };

  if (wx.chooseMedia) {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType,
      sizeType: ["compressed"],
      success: (res) => {
        const f = res && res.tempFiles && res.tempFiles[0];
        done(f && (f.tempFilePath || f.path));
      },
      fail,
    });
    return;
  }
  if (wx.chooseImage) {
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType,
      success: (res) => {
        const list = (res && res.tempFilePaths) || [];
        done(list[0]);
      },
      fail,
    });
    return;
  }
  done("");
}

/**
 * 把选中的图片存进用户目录并写库
 * @param {string} tempPath choosePhoto 拿到的临时路径
 * @param {(path:string, persisted:boolean)=>void} cb persisted=false 表示只用了临时路径（重启会失效）
 */
function saveAvatar(tempPath, cb) {
  const done = (p) => {
    if (typeof cb === "function") cb(p || "");
  };
  if (!tempPath) {
    done("");
    return;
  }
  const dir = userDataPath();
  const fs = fileSystem();
  const old = store.getUser().avatar || "";

  const commit = (path) => {
    store.setUser({ avatar: path, avatarAt: Date.now() });
    if (old && old !== path) removeFile(old);
    done(path);
  };

  if (!dir || !fs || !fs.copyFile) {
    // 没有文件系统能力时（低版本/预览环境）先存临时路径，至少本次可用
    commit(tempPath);
    return;
  }
  const dest = dir + "/" + nextFileName(tempPath);
  try {
    fs.copyFile({
      srcPath: tempPath,
      destPath: dest,
      success: () => commit(dest),
      fail: () => commit(tempPath),
    });
  } catch (e) {
    commit(tempPath);
  }
}

/** 恢复默认头像（删除本地文件） */
function clearAvatar() {
  const old = store.getUser().avatar || "";
  removeFile(old);
  store.setUser({ avatar: "", avatarAt: 0 });
  return "";
}

/** 当前头像路径；文件被系统清理过就自动回落到默认图标 */
function avatar() {
  const u = store.getUser();
  const p = (u && u.avatar) || "";
  if (!p) return "";
  if (!exists(p)) {
    store.setUser({ avatar: "", avatarAt: 0 });
    return "";
  }
  return p;
}

/** 对外别名，便于页面直接调 */
function pickAvatar(from, cb) {
  choosePhoto(from, (tmp) => {
    if (!tmp) {
      if (typeof cb === "function") cb("");
      return;
    }
    saveAvatar(tmp, cb);
  });
}

module.exports = {
  DEFAULT_NICKNAME,
  NICK_MIN,
  NICK_MAX,
  validateNickname,
  saveNickname,
  nickname,
  choosePhoto,
  saveAvatar,
  pickAvatar,
  clearAvatar,
  avatar,
  removeFile,
  userDataPath,
};
