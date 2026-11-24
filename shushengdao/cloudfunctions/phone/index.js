/**
 * 云函数：手机号绑定（用 getPhoneNumber 的 code 换手机号）
 *
 * 部署：微信开发者工具 → cloudfunctions/phone 右键「上传并部署：云端安装依赖」
 * 入参：{ code } —— <button open-type="getPhoneNumber"> 回调里的 detail.code（基础库 2.21.2+）
 * 返回：{ ok, phone, purePhone, countryCode } 或 { ok:false, code, errMsg }
 *
 * 说明：
 *  - 只有「已认证的非个人主体」小程序能调用 phonenumber.getPhoneNumber；
 *    个人主体或未开通时会报无权限，前端会自动降级为「手动填写其他号码」。
 *  - 手机号本机存 store.user.phone；家长中心 savePhone 会再经 stats.bindPhone
 *    落库到云数据库 stats_users 集合（id=openid，phone 为完整号码）。
 */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const code = event && event.code;
  if (!code) {
    return { ok: false, code: "NO_CODE", errMsg: "缺少手机号凭证 code" };
  }
  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    const info = (res && res.phoneInfo) || {};
    if (!info.phoneNumber) {
      return { ok: false, code: "EMPTY", errMsg: "未取到手机号，请重试" };
    }
    return {
      ok: true,
      phone: info.phoneNumber,
      purePhone: info.purePhoneNumber,
      countryCode: info.countryCode,
    };
  } catch (e) {
    return {
      ok: false,
      code: (e && (e.errCode || e.code)) || "FAIL",
      errMsg: (e && (e.errMsg || e.message)) || "换取手机号失败",
    };
  }
};
