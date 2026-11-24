/**
 * 底部任务栏跳转（页签式切换）
 *
 * 页签之间用 redirectTo「替换」当前页，而不是往页面栈里叠一层：
 *  - 任务栏点来点去永远是「切换页面」，栈深保持 1，不会 10 层爆栈
 *  - 目标页因此不需要左上角返回按钮（从深层页面 navigateTo 进入时仍有返回，
 *    由页面 onLoad 里 getCurrentPages().length > 1 自行判断）
 */
const ROUTES = {
  home: "/pages/home/home",
  vocab: "/pages/vocab/vocab",
  capture: "/pages/capture/capture",
  archive: "/pages/archive/archive",
  parent: "/pages/parent/parent",
};

function isActive(key, active) {
  return key === active;
}

/** 直接切页签（供页面方法内部调用）：go("capture", "home", this) */
function go(key, active, page) {
  if (!ROUTES[key]) return;
  if (isActive(key, active)) {
    if (page && typeof page.onSameTab === "function") page.onSameTab(key);
    return;
  }
  wx.redirectTo({
    url: ROUTES[key],
    fail: () => wx.reLaunch({ url: ROUTES[key] }),
  });
}

/** 页面 goTab(e) 统一入口：active 传当前页签 key */
function goTab(page, e, active) {
  const key = (e && e.currentTarget && e.currentTarget.dataset.key) || "";
  go(key, active, page);
}

/** 页面是否该显示返回按钮：从任务栏进入（栈深 1）时不显示 */
function showBack() {
  try {
    return (getCurrentPages() || []).length > 1;
  } catch (e) {
    return false;
  }
}

module.exports = { ROUTES: ROUTES, go: go, goTab: goTab, showBack: showBack };
