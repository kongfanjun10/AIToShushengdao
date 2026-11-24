/**
 * 云函数：学习记录云备份（换设备找回）
 *
 * 数据：user_backups 集合，文档 id = 手机号（11 位）
 *  { phone, pin, data, nickname, updatedAt }
 *  - data 为前端 store 全量 JSON（已剔除本机头像路径等设备相关字段）
 *  - pin 为 4 位恢复口令：新设备恢复时必须提供，防止知道号码就能拉走别人数据
 *
 * action：
 *  - peek { phone }                 查询该号码是否有备份（返回 { has, at, nickname }，不含数据与口令）
 *  - save { phone, pin, data }      覆盖式保存备份（首次备份即建档）
 *  - get  { phone, pin }            校验口令后返回备份数据
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COL = "user_backups";

function fail(code, errMsg) {
  return { ok: false, code: code, errMsg: errMsg };
}

function cleanPhone(v) {
  const s = String(v == null ? "" : v).replace(/[\s-]/g, "");
  return /^1\d{10}$/.test(s) ? s : "";
}

function cleanPin(v) {
  return /^\d{4}$/.test(String(v == null ? "" : v).trim()) ? String(v).trim() : "";
}

async function ensureCol() {
  try {
    await db.createCollection(COL);
  } catch (e) {
    /* 已存在时忽略 */
  }
}

async function peek(event) {
  const phone = cleanPhone(event.phone);
  if (!phone) return fail("BAD_PHONE", "手机号格式不对");
  try {
    const doc = await db.collection(COL).doc(phone).get();
    const d = doc && doc.data;
    if (!d) return { ok: true, has: false };
    return { ok: true, has: true, at: d.updatedAt || 0, nickname: d.nickname || "" };
  } catch (e) {
    return { ok: true, has: false };
  }
}

async function save(event) {
  const phone = cleanPhone(event.phone);
  const pin = cleanPin(event.pin);
  if (!phone) return fail("BAD_PHONE", "手机号格式不对");
  if (!pin) return fail("BAD_PIN", "恢复口令须为 4 位数字");
  const data = event.data;
  if (!data || typeof data !== "object") return fail("BAD_DATA", "备份数据缺失");
  // 防止超大 payload（正常学习数据几十 KB 以内）
  const size = JSON.stringify(data).length;
  if (size > 480 * 1024) return fail("TOO_LARGE", "备份数据过大");

  await ensureCol();
  const doc = await db.collection(COL).doc(phone).get().catch(() => null);
  // 已有备份时口令必须与原口令一致，防止换口令后旧口令设备覆盖不了 / 他人覆盖
  if (doc && doc.data && doc.data.pin && doc.data.pin !== pin) {
    return fail("BAD_PIN", "恢复口令与首次备份时不一致");
  }
  await db.collection(COL).doc(phone).set({
    data: {
      phone: phone,
      pin: pin,
      nickname: cleanText(data.user && data.user.nickname, 16),
      data: data,
      updatedAt: Date.now(),
    },
  });
  return { ok: true, at: Date.now() };
}

function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

async function get(event) {
  const phone = cleanPhone(event.phone);
  const pin = cleanPin(event.pin);
  if (!phone) return fail("BAD_PHONE", "手机号格式不对");
  if (!pin) return fail("BAD_PIN", "请输入 4 位恢复口令");
  let d = null;
  try {
    const doc = await db.collection(COL).doc(phone).get();
    d = doc && doc.data;
  } catch (e) {
    d = null;
  }
  if (!d || !d.data) return fail("NO_BACKUP", "该号码没有云备份");
  if (d.pin !== pin) return fail("BAD_PIN", "恢复口令不对");
  return { ok: true, data: d.data, updatedAt: d.updatedAt || 0, nickname: d.nickname || "" };
}

exports.main = async (event) => {
  const action = (event && event.action) || "";
  await ensureCol();
  try {
    if (action === "peek") return await peek(event);
    if (action === "save") return await save(event);
    if (action === "get") return await get(event);
    return fail("BAD_ACTION", "未知 action：" + action);
  } catch (e) {
    return fail((e && (e.errCode || e.code)) || "FAIL", (e && (e.errMsg || e.message)) || "备份服务异常");
  }
};
