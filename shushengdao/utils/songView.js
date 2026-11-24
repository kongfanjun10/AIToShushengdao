/**
 * 歌词滚动视图辅助（拼音页 / 音标页共用）
 *
 * 播放器里的歌词是一个固定高度的 scroll-view，唱到哪一句就把它滚到中间：
 * 量一次每行的位置，再算出让当前行居中的 scrollTop，交给 scroll-top 平滑滚过去。
 *
 * 小程序里拿不到「元素相对滚动容器」的直接值，所以用
 *   容器视口位置 + 容器已滚动距离 + 行视口位置 换算出内容坐标：
 *     行内容坐标 = 行视口 top - 容器视口 top + 容器 scrollTop
 *     目标 scrollTop = 行内容坐标 + 行高/2 - 容器高/2
 *
 * 环境不支持选择器（预览器 / 单测）时静默跳过，不影响播放。
 */

/** 秒 → "2:12" */
function fmt(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

function canQuery() {
  return typeof wx !== "undefined" && !!wx.createSelectorQuery;
}

/** 换分组 / 重渲染后清缓存（下次 follow 重新量） */
function reset(page) {
  page._lineTops = null;
  page._lineHs = null;
  page._viewH = 0;
}

function apply(page, idx) {
  if (!canQuery()) return;
  const q = wx.createSelectorQuery().in(page);
  q.select(".sp-lyrics").boundingClientRect();
  q.select(".sp-lyrics").scrollOffset();
  q.selectAll(".sp-line").boundingClientRect();
  q.exec((res) => {
    const box = res && res[0];
    const off = (res && res[1]) || {};
    const lines = (res && res[2]) || [];
    if (!box || !box.height || !lines.length) return;
    const idxInView = Math.min(Math.max(0, idx), lines.length - 1);
    const scrollTop = Number(off.scrollTop) || 0;
    const line = lines[idxInView];
    const contentTop = line.top - box.top + scrollTop;
    let target = contentTop + line.height / 2 - box.height / 2;
    if (target < 0) target = 0;
    target = Math.round(target);
    if (Math.abs(target - (Number(page.data.songScroll) || 0)) < 3) return;
    page.setData({ songScroll: target });
  });
}

/**
 * 把第 idx 行滚到播放器中间
 * @param {object} page 页面实例（data 里有 songScroll）
 * @param {number} idx  行号，-1 = 回到顶部
 */
function follow(page, idx) {
  if (!page || !page.setData) return;
  if (idx < 0) {
    if (Number(page.data.songScroll) !== 0) page.setData({ songScroll: 0 });
    return;
  }
  const run = () => apply(page, idx);
  if (typeof wx !== "undefined" && wx.nextTick) wx.nextTick(run);
  else setTimeout(run, 20);
}

module.exports = { fmt, follow, reset };
