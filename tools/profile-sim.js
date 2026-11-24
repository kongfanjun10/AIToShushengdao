/**
 * 孩子资料（改昵称 + 上传头像）链路仿真（Node 环境）
 * 运行：node tools/profile-sim.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "shushengdao");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    console.log("  ✗ " + name + (detail !== undefined ? " —— " + detail : ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let captured = null;
global.getApp = () => ({ globalData: { statusBarHeight: 44 } });
global.Page = (opt) => {
  captured = opt;
};

/* --- 文件系统 mock：真实记录 copy/unlink --- */
const files = new Set(["wxfile://usr/old_avatar.jpg"]);
const calls = { copy: [], unlink: [] };
const WIN = { w: 375, h: 812 };

global.wx = {
  _storage: {},
  getStorageSync(k) {
    return this._storage[k] || "";
  },
  setStorageSync(k, v) {
    this._storage[k] = v;
  },
  removeStorageSync(k) {
    delete this._storage[k];
  },
  env: { USER_DATA_PATH: "wxfile://usr" },
  getFileSystemManager: () => ({
    accessSync(p) {
      if (!files.has(p)) throw new Error("no such file");
    },
    copyFile(o) {
      calls.copy.push(o);
      files.add(o.destPath);
      if (o.success) o.success({});
    },
    unlink(o) {
      calls.unlink.push(o.filePath);
      files.delete(o.filePath);
      if (o.success) o.success({});
    },
  }),
  chooseMedia(o) {
    o.success && o.success({ tempFiles: [{ tempFilePath: "http://tmp/pic1.jpg" }] });
  },
  chooseImage(o) {
    o.success && o.success({ tempFilePaths: ["http://tmp/pic2.jpg"] });
  },
  showActionSheet(o) {
    o.success && o.success({ tapIndex: 1 }); // 相册
  },
  showToast() {},
  showModal(o) {
    // 记录弹窗参数，供断言
    calls.modal = o;
    if (o && o.success) o.success({ confirm: true, content: "" });
  },
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44, windowWidth: WIN.w, windowHeight: WIN.h, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 48, left: 281, right: 368, bottom: 80 }),
  navigateTo() {},
  navigateBack() {},
  redirectTo() {},
  pageScrollTo() {},
  vibrateShort() {},
  nextTick: (cb) => setTimeout(cb, 0),
};

function makePage(rel) {
  const f = path.join(ROOT, rel);
  delete require.cache[require.resolve(f)];
  captured = null;
  require(f);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data));
  page.setData = function (obj) {
    Object.keys(obj).forEach((k) => {
      if (k.indexOf(".") > -1) {
        const parts = k.split(".");
        let cur = page.data;
        for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = obj[k];
      } else {
        page.data[k] = obj[k];
      }
    });
  };
  return page;
}

const store = require(path.join(ROOT, "utils", "store.js"));
const profile = require(path.join(ROOT, "utils", "profile.js"));

async function main() {
  console.log("== 1. 昵称校验 ==");
  let r = profile.validateNickname("   ");
  check("纯空格拒绝", !r.ok && r.msg, r.msg);
  r = profile.validateNickname("");
  check("空昵称拒绝", !r.ok);
  r = profile.validateNickname("一二三四五六七八九");
  check("9 个字超长拒绝", !r.ok && r.msg.indexOf("8") > -1, r.msg);
  r = profile.validateNickname("孔老师<script>");
  check("特殊符号拒绝", !r.ok, r.msg);
  r = profile.validateNickname("小星⭐");
  check("emoji 拒绝", !r.ok, r.msg);
  r = profile.validateNickname("  朵朵  ");
  check("首尾空格自动去除", r.ok && r.value === "朵朵", r.value);
  r = profile.validateNickname("Mumu 05");
  check("字母数字与中间空格允许", r.ok && r.value === "Mumu 05", r.value);
  r = profile.validateNickname("一二三四五六七八");
  check("8 个字边界通过", r.ok, r.msg);
  r = profile.validateNickname("沐");
  check("单字允许", r.ok, r.msg);

  console.log("== 2. 保存昵称 ==");
  r = profile.saveNickname("朵朵");
  check("合法昵称写入", r.ok && store.getUser().nickname === "朵朵", store.getUser().nickname);
  r = profile.saveNickname("太长了太长了太长了太长");
  check("非法昵称不写库", !r.ok && store.getUser().nickname === "朵朵", store.getUser().nickname);
  check("默认昵称兜底", profile.nickname() === "朵朵");

  console.log("== 3. 头像上传与持久化 ==");
  // 先造一个「旧头像」，验证换新时旧文件被清理
  files.add("wxfile://usr/old_avatar.jpg");
  store.setUser({ avatar: "wxfile://usr/old_avatar.jpg" });
  let saved = null;
  profile.pickAvatar("album", (p) => {
    saved = p;
  });
  await sleep(20);
  check("拿到持久化路径", !!saved && saved.indexOf("wxfile://usr/") === 0 && /\.jpg$/.test(saved), saved);
  check("copyFile 被调用", calls.copy.length === 1);
  check("库里的头像已更新", store.getUser().avatar === saved, store.getUser().avatar);
  check("旧头像文件被清理", calls.unlink.indexOf("wxfile://usr/old_avatar.jpg") > -1);
  check("旧文件确实删掉了", !files.has("wxfile://usr/old_avatar.jpg"));

  // 再换一次头像：新文件存入，旧的（上一次的）删除
  const first = saved;
  saved = null;
  profile.pickAvatar("camera", (p) => {
    saved = p;
  });
  await sleep(20);
  check("第二次上传成功", !!saved && saved !== first, saved);
  check("上一张头像被清理", calls.unlink.indexOf(first) > -1);

  console.log("== 4. 恢复默认 / 失效清理 ==");
  profile.clearAvatar();
  check("恢复默认后头像为空", store.getUser().avatar === "");
  check("头像文件被删除", !files.has(saved));
  // 文件被系统清理：库里还留着路径，但文件不存在 → 自动回落默认
  store.setUser({ avatar: "wxfile://usr/gone.jpg" });
  check("失效头像自动清空", profile.avatar() === "");
  check("库里同步清理", store.getUser().avatar === "");
  // 非用户目录的路径（如网络图）不会被误删
  store.setUser({ avatar: "http://tmp/x.jpg" });
  profile.clearAvatar();
  check("非用户目录路径不触发删除", calls.unlink.indexOf("http://tmp/x.jpg") === -1);

  console.log("== 5. 家长中心页链路 ==");
  const pp = makePage("pages/parent/parent.js");
  pp.onLoad({ pass: "1", focus: "profile" });
  await sleep(10);
  check("门禁直通", pp.data.verified === true);
  check("focus 参数点亮资料卡", pp.data.focusProfile === true);
  check("昵称同步到页面", pp.data.user.nickname === "朵朵", pp.data.user.nickname);
  check("默认无头像", pp.data.avatar === "");

  // 改昵称
  pp.openNick();
  check("半屏打开且带当前昵称", pp.data.nickEditing === true && pp.data.nickDraft === "朵朵", pp.data.nickDraft);
  check("字数计数正确", pp.data.nickCount === 2, pp.data.nickCount);
  pp.onNickInput({ detail: { value: "小星星朵朵酱是快乐小朋友" } });
  check("输入同步 + 超长计数", pp.data.nickCount > 8, pp.data.nickCount);
  pp.saveNick();
  check("超长保存报错且半屏不关", pp.data.nickError.indexOf("8") > -1 && pp.data.nickEditing === true, pp.data.nickError);
  pp.onNickInput({ detail: { value: "乐乐" } });
  pp.saveNick();
  check("合法保存并关半屏", pp.data.nickEditing === false && pp.data.user.nickname === "乐乐", pp.data.user.nickname);

  // 换头像（actionSheet → 相册 → chooseMedia → copyFile）
  files.add("wxfile://usr/seed.jpg");
  store.setUser({ avatar: "wxfile://usr/seed.jpg" });
  pp.load();
  check("页面头像来自库", pp.data.avatar === "wxfile://usr/seed.jpg", pp.data.avatar);
  pp.onAvatarTap(); // showActionSheet 固定选相册
  await sleep(20);
  check("点相机角标完成换头像", pp.data.avatar.indexOf("wxfile://usr/avatar_") === 0, pp.data.avatar);
  check("旧头像文件已清理", !files.has("wxfile://usr/seed.jpg"));

  // 恢复默认
  calls.unlink = [];
  pp.resetAvatar();
  check("恢复默认清空页面头像", pp.data.avatar === "");
  check("恢复默认清空库", store.getUser().avatar === "");

  console.log("== 6. 其他页面同步 ==");
  const hm = makePage("pages/home/home.js");
  hm.onLoad();
  check("首页读到改后的昵称", hm.data.nickname === "乐乐", hm.data.nickname);
  check("首页头像为空时回默认", hm.data.avatar === "");

  profile.saveNickname("孔老师");
  files.add("wxfile://usr/final.jpg"); // 真实时序：文件先存在，再写入库并广播
  store.setUser({ avatar: "wxfile://usr/final.jpg" });
  const ar = makePage("pages/archive/archive.js");
  ar.onLoad({});
  ar.onShow();
  check("成长档案头像/昵称同步", ar.data.avatar === "wxfile://usr/final.jpg" && ar.data.nickname === "孔老师", ar.data.nickname);

  const rd = makePage("pages/reader/reader.js");
  rd.onLoad({});
  await sleep(10);
  check("朗读页头像同步", rd.data.avatar === "wxfile://usr/final.jpg", rd.data.avatar);

  console.log("");
  console.log("共 " + (pass + fail) + " 项断言，通过 " + pass + "，失败 " + fail);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("仿真异常：", e);
  process.exit(1);
});
