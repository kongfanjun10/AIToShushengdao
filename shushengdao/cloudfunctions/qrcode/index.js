/**
 * 云函数：奖状海报上的小程序码（推广用）
 *
 * 部署：微信开发者工具 → cloudfunctions/qrcode 右键「上传并部署：云端安装依赖」
 * 依赖：wxacode.getUnlimited（已在 config.json 声明 openapi 权限）
 *
 * 为什么放在云函数：小程序码只能用服务端接口生成，前端拿不到；
 * 生成后存进云存储，把 fileID 缓存到 stats_meta 集合，避免重复调用（接口有频次限制）。
 *
 * 入参：{ page?, scene?, envVersion? }
 * 返回：{ ok:true, fileID, cached } / { ok:false, code, errMsg }
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COL_META = "stats_meta"; // 元数据/缓存：文档 _id = "qrcode_poster"
const HOME_PAGE = "pages/home/home";

function fail(code, errMsg) {
  return { ok: false, code: code, errMsg: errMsg || code };
}

/** page 不能以 / 开头，且必须是已发布版本里存在的页面 */
function safePage(p) {
  const s = String(p || HOME_PAGE).replace(/^\/+/, "");
  return /^pages\/[\w-]+\/[\w-]+$/.test(s) ? s : HOME_PAGE;
}

/** scene 上限 32 字符，只允许常见可见字符 */
function safeScene(v) {
  const s = String(v || "p").replace(/[^\w\-]/g, "").slice(0, 32);
  return s || "p";
}

async function readCache(id) {
  try {
    const r = await db.collection(COL_META).doc(id).get();
    return (r && r.data && r.data.fileID) || "";
  } catch (e) {
    return "";
  }
}

async function writeCache(id, data) {
  try {
    await db.collection(COL_META).add({ data: Object.assign({ _id: id }, data) });
  } catch (e) {
    try {
      await db
        .collection(COL_META)
        .doc(id)
        .update({ data: data });
    } catch (e2) {
      /* 缓存写失败不影响返回，只是下次会重新生成 */
    }
  }
}

exports.main = async (event) => {
  const e = event || {};
  const page = safePage(e.page);
  const scene = safeScene(e.scene);
  const envVersion = e.envVersion === "trial" || e.envVersion === "develop" ? e.envVersion : "release";
  const id = "qrcode_poster";
  const refresh = !!e.refresh;

  if (!refresh) {
    const hit = await readCache(id);
    if (hit) return { ok: true, fileID: hit, cached: true };
  }

  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene: scene,
      page: page,
      width: 430,
      autoColor: false,
      isHyaline: false,
      checkPath: false,
      envVersion: envVersion,
    });
    if (!res || !res.buffer) return fail("EMPTY", "接口没有返回图片");
    const up = await cloud.uploadFile({
      cloudPath: "qrcode/poster_" + envVersion + ".png",
      fileContent: res.buffer,
    });
    await writeCache(id, {
      fileID: up.fileID,
      page: page,
      scene: scene,
      envVersion: envVersion,
      at: Date.now(),
    });
    return { ok: true, fileID: up.fileID, cached: false };
  } catch (err) {
    const msg = (err && (err.errMsg || err.message)) || "生成失败";
    // 未发布 / 页面不存在 / 权限未声明时，前端会退回「微信搜索」文案版海报
    return fail("WXACODE_FAIL", msg);
  }
};
