/**
 * 云函数：留言板（用户留言的收集、展示、回复、删除）
 *
 * 部署：微信开发者工具 → cloudfunctions/feedback 右键「上传并部署：云端安装依赖」
 * 数据：云开发数据库 feedback 集合（首次调用自动创建）
 *   { category, content, contact, openid, createdAt, reply, repliedAt }
 *
 * action：
 *  - add    { category, content, contact }        写入一条留言（ anyone 可用）
 *  - list   {}                                    最近 50 条 + 待回复数（ anyone 可用）
 *  - reply  { id, reply, adminKey }               回复留言（需管理口令）
 *  - remove { id, adminKey }                      删除留言（需管理口令）
 *
 * 返回：{ ok, ... } 或 { ok:false, code, errMsg }
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COL = "feedback";

/**
 * 管理口令：家长中心「留言管理」/ 留言板管理员模式回复留言时需要输入。
 * ⚠️ 发布前请改成一串只有自己知道的口令（不要用下面的默认值）。
 */
const ADMIN_KEY = "Jason-ssd-admin";

const CATS = ["feature", "improve", "bug"];
const MAX_CONTENT = 500;
const MAX_CONTACT = 60;
const MAX_REPLY = 300;

function fail(code, errMsg) {
  return { ok: false, code: code, errMsg: errMsg };
}

/** 集合不存在时自动创建（已存在会抛错，忽略即可） */
async function ensureCol() {
  try {
    await db.createCollection(COL);
  } catch (e) {
    /* 已存在 / 无权限时忽略，后续查询会给出真实错误 */
  }
}

function cleanText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

exports.main = async (event) => {
  const action = (event && event.action) || "list";
  const wxContext = cloud.getWXContext();
  const openid = wxContext && wxContext.OPENID ? wxContext.OPENID : "";

  await ensureCol();

  try {
    /* ---------- 写留言 ---------- */
    if (action === "add") {
      const content = cleanText(event.content, MAX_CONTENT);
      if (content.length < 2) {
        return fail("EMPTY", "留言内容太短啦，多写几个字吧");
      }
      const category = CATS.indexOf(event.category) > -1 ? event.category : "improve";
      const contact = cleanText(event.contact, MAX_CONTACT);
      const doc = {
        category: category,
        content: content,
        contact: contact,
        openid: openid,
        createdAt: Date.now(),
        reply: "",
        repliedAt: 0,
      };
      const res = await db.collection(COL).add({ data: doc });
      return { ok: true, id: res._id };
    }

    /* ---------- 回复留言 ---------- */
    if (action === "reply") {
      if (event.adminKey !== ADMIN_KEY) return fail("BAD_KEY", "管理口令不对");
      const id = String(event.id || "");
      const reply = cleanText(event.reply, MAX_REPLY);
      if (!id) return fail("NO_ID", "缺少留言 id");
      if (!reply) return fail("EMPTY", "回复内容不能为空");
      const upd = await db
        .collection(COL)
        .doc(id)
        .update({ data: { reply: reply, repliedAt: Date.now(), replyOpenid: openid } });
      // update 对不存在的文档不抛错、只返回 updated:0 —— 必须回读确认真的写进去了，
      // 否则页面上「回复成功」了、待回复数却永远不变
      const back = await db.collection(COL).doc(id).get();
      const saved = (back && back.data && back.data.reply) || "";
      if (!saved || saved !== reply) {
        return fail("NOT_SAVED", "回复没有保存成功，请重试");
      }
      return { ok: true };
    }

    /* ---------- 删除留言 ---------- */
    if (action === "remove") {
      if (event.adminKey !== ADMIN_KEY) return fail("BAD_KEY", "管理口令不对");
      const id = String(event.id || "");
      if (!id) return fail("NO_ID", "缺少留言 id");
      await db.collection(COL).doc(id).remove();
      return { ok: true };
    }

    /* ---------- 留言列表（含待回复数） ---------- */
    const MAX = 100;
    const res = await db
      .collection(COL)
      .orderBy("createdAt", "desc")
      .limit(MAX)
      .get();
    const list = (res.data || []).map((d) => ({
      id: d._id,
      category: d.category,
      content: d.content,
      contact: d.contact || "",
      createdAt: d.createdAt,
      reply: d.reply || "",
      repliedAt: d.repliedAt || 0,
      mine: !!openid && d.openid === openid,
      // 回复人是不是当前用户自己：管理员回复自己的留言不推「留言有回复」通知
      replyMine: !!openid && d.replyOpenid === openid,
    }));
    // 待回复数直接按刚拉到的列表算：和页面显示的留言一一对应，
    // 不会再出现「明明都回复了、角标还挂着 1」的对不上
    const pending = list.filter((d) => !String(d.reply || "").trim()).length;
    return { ok: true, list: list, pending: pending };
  } catch (e) {
    return fail((e && (e.errCode || e.code)) || "FAIL", (e && (e.errMsg || e.message)) || "留言板服务异常");
  }
};
