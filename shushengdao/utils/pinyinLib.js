/**
 * 汉语拼音卡片库（63 个）
 *   声母 23 + 单韵母 6 + 复韵母 9 + 鼻韵母 9（前鼻 5 + 后鼻 4）+ 整体认读 16
 * 注意：utils/pinyin.js 是汉字注音词典（朗读页在用），本文件是拼音教学卡片数据。
 *
 * 每个拼音：
 *   id    唯一标识（拼音本体，如 "b"、"ai"、"zhi"）
 *   py    拼音写法
 *   group 所属分组 key
 *   mouth 口舌图参数 key（缺省用 id 本身；整体认读复用声母/韵母的口型）
 *   say   代表字（点「读音」用 TTS 读这个字示范发音）
 *   tip   发音要点（家长照着讲、孩子照着做）
 *   words 三个拼音词组 [音节, 词语]，点一下听词语
 */

const mouthChart = require("./mouthChart");

const GROUPS = [
  { key: "sm", name: "声母", sub: "23 个 · 音节的开头", count: 23 },
  { key: "dy", name: "单韵母", sub: "6 个 · 一个音读到底", count: 6 },
  { key: "fy", name: "复韵母", sub: "9 个 · 两个音滑着读", count: 9 },
  { key: "bf", name: "鼻韵母", sub: "9 个 · 鼻音收尾", count: 9 },
  { key: "zt", name: "整体认读", sub: "16 个 · 不拼直接读", count: 16 },
];

/* ---------- 口舌图参数（复用 mouthChart 的侧视剖面引擎） ----------
 * jaw 下颌开合；lips 唇形；tongue {x,y} 舌位；slide 双拼音滑动终点；
 * voiced 声带振动；nasal 鼻音；puff 送气；groove 舌面缝；curl 舌尖上卷；
 * closure 阻塞点 lip|alv|vel|pal；lateral 舌侧漏气；lipTeeth 唇齿接触。
 * 拼音大多和音标共用一张剖面图，只是舌位/要点换成中文发音的讲法。 */
const MOUTH = {
  /* 声母 */
  b: { jaw: 0.06, lips: "close", closure: "lip", puff: true, voiced: false, hint: "双唇闭紧憋一下，突然打开轻轻送气，读「波」" },
  p: { jaw: 0.06, lips: "close", closure: "lip", puff: true, voiced: false, hint: "和 b 一样闭唇，但气流更强，手掌放嘴前能感觉到气，读「坡」" },
  m: { jaw: 0.05, lips: "close", closure: "lip", nasal: true, voiced: true, hint: "双唇闭紧，声音全从鼻子里出来，读「摸」" },
  f: { jaw: 0.14, lips: "lipTeeth", voiced: false, hint: "上齿轻轻咬住下唇，吹气摩擦，读「佛」" },
  d: { jaw: 0.16, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", voiced: false, hint: "舌尖顶住上牙床，弹开时读「得」，气流弱" },
  t: { jaw: 0.16, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", puff: true, voiced: false, hint: "和 d 部位一样，但气流更强，读「特」" },
  n: { jaw: 0.14, lips: "neutral", tongue: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "舌尖顶上牙床，声音从鼻子里出来，读「讷」" },
  l: { jaw: 0.2, lips: "neutral", tongue: { x: 0.3, y: 0.12 }, lateral: true, voiced: true, hint: "舌尖顶上牙床，气流从舌头两边出来，读「勒」" },
  g: { jaw: 0.2, lips: "neutral", tongue: { x: 0.86, y: 0.14 }, closure: "vel", voiced: false, hint: "舌根顶住软腭，弹开时读「哥」" },
  k: { jaw: 0.2, lips: "neutral", tongue: { x: 0.86, y: 0.14 }, closure: "vel", puff: true, voiced: false, hint: "和 g 部位一样，但气流更强，读「科」" },
  h: { jaw: 0.5, lips: "neutral", tongue: { x: 0.6, y: 0.5 }, voiced: false, hint: "嘴自然张开，舌根靠近软腭，像轻轻哈气，读「喝」" },
  j: { jaw: 0.16, lips: "spread", tongue: { x: 0.12, y: 0.1 }, closure: "pal", voiced: false, hint: "舌前部抬到硬腭前，先堵后擦，嘴角拉开，读「基」" },
  q: { jaw: 0.16, lips: "spread", tongue: { x: 0.12, y: 0.1 }, closure: "pal", puff: true, voiced: false, hint: "和 j 部位一样，但气流更强，读「欺」" },
  x: { jaw: 0.16, lips: "spread", tongue: { x: 0.12, y: 0.1 }, groove: true, voiced: false, hint: "舌面靠近硬腭留一条窄缝，气流挤出，读「希」" },
  zh: { jaw: 0.2, lips: "neutral", tongue: { x: 0.5, y: 0.3 }, curl: true, closure: "pal", voiced: false, hint: "舌尖翘起顶住硬腭前部，先堵后擦，读「知」" },
  ch: { jaw: 0.2, lips: "neutral", tongue: { x: 0.5, y: 0.3 }, curl: true, closure: "pal", puff: true, voiced: false, hint: "和 zh 部位一样，但气流更强，读「吃」" },
  sh: { jaw: 0.2, lips: "neutral", tongue: { x: 0.5, y: 0.3 }, curl: true, groove: true, voiced: false, hint: "舌尖翘起靠近硬腭留缝，气流挤出，读「诗」" },
  r: { jaw: 0.2, lips: "neutral", tongue: { x: 0.5, y: 0.3 }, curl: true, voiced: true, hint: "和 sh 部位一样，但声带振动，读「日」" },
  z: { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, closure: "alv", groove: true, voiced: false, hint: "舌尖平伸顶住上牙床，先堵后擦，读「资」" },
  c: { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, closure: "alv", groove: true, puff: true, voiced: false, hint: "和 z 部位一样，但气流更强，读「雌」" },
  s: { jaw: 0.14, lips: "spread", tongue: { x: 0.3, y: 0.14 }, groove: true, voiced: false, hint: "舌尖靠近上牙床留窄缝，气流挤出像吹口哨，读「思」" },
  y: { jaw: 0.16, lips: "spread", tongue: { x: 0.12, y: 0.08 }, voiced: true, hint: "口型和 i 一样，读得轻而短，像一层薄薄的「衣」" },
  w: { jaw: 0.14, lips: "round", tongue: { x: 0.84, y: 0.12 }, voiced: true, hint: "口型和 u 一样，嘴唇收圆，读得轻而短" },
  /* 单韵母 */
  a: { jaw: 1, lips: "neutral", tongue: { x: 0.6, y: 0.9 }, voiced: true, hint: "嘴巴张到最大，舌头放平不动，声音响亮，读「啊」" },
  o: { jaw: 0.6, lips: "round", tongue: { x: 0.8, y: 0.6 }, voiced: true, hint: "嘴唇收圆向前突，圆圆的一个洞，别读成 e，读「喔」" },
  e: { jaw: 0.5, lips: "neutral", tongue: { x: 0.7, y: 0.5 }, voiced: true, hint: "半开口，舌后部抬起来，嘴角向两边，读「鹅」" },
  i: { jaw: 0.22, lips: "spread", tongue: { x: 0.08, y: 0.06 }, voiced: true, hint: "嘴角向两边拉开像微笑，舌前部顶到最高，读「衣」" },
  u: { jaw: 0.22, lips: "round", tongue: { x: 0.86, y: 0.08 }, voiced: true, hint: "嘴唇收圆只留一个小孔，像吹口哨，读「乌」" },
  ü: { jaw: 0.22, lips: "round", tongue: { x: 0.08, y: 0.06 }, voiced: true, hint: "先摆好 i 的口型，再把嘴唇慢慢收圆，读「鱼」" },
  /* 复韵母：舌位从起点滑到终点 */
  ai: { jaw: 0.7, lips: "neutral", tongue: { x: 0.4, y: 0.8 }, slide: { x: 0.14, y: 0.2 }, voiced: true, hint: "从 a 滑到 i，嘴巴从大到小，两个音连成一个，读「哀」" },
  ei: { jaw: 0.5, lips: "spread", tongue: { x: 0.14, y: 0.44 }, slide: { x: 0.1, y: 0.1 }, voiced: true, hint: "从 e 滑到 i，嘴角越拉越开，像答应别人「欸」" },
  ui: { jaw: 0.3, lips: "round", tongue: { x: 0.8, y: 0.2 }, slide: { x: 0.1, y: 0.1 }, voiced: true, hint: "是 uei 的简写：先 u 再滑到 ei，嘴唇由圆变扁，读「威」" },
  ao: { jaw: 0.8, lips: "neutral", tongue: { x: 0.5, y: 0.8 }, slide: { x: 0.8, y: 0.2 }, voiced: true, hint: "从 a 滑到 o，嘴巴从大到小，嘴唇渐渐收圆，读「熬」" },
  ou: { jaw: 0.5, lips: "neutral", tongue: { x: 0.7, y: 0.5 }, slide: { x: 0.85, y: 0.15 }, voiced: true, hint: "从 o 滑到 u，嘴唇越收越圆，声音越靠后，读「欧」" },
  iu: { jaw: 0.3, lips: "round", tongue: { x: 0.12, y: 0.1 }, slide: { x: 0.84, y: 0.14 }, voiced: true, hint: "是 iou 的简写：先 i 再滑到 ou，读「优」" },
  ie: { jaw: 0.4, lips: "spread", tongue: { x: 0.12, y: 0.15 }, slide: { x: 0.6, y: 0.5 }, voiced: true, hint: "先 i 后 ê，嘴巴渐渐张开，最后一个音不是 i，读「耶」" },
  üe: { jaw: 0.4, lips: "round", tongue: { x: 0.08, y: 0.15 }, slide: { x: 0.6, y: 0.5 }, voiced: true, hint: "先 ü 后 ê，嘴唇由圆变扁，读「约」" },
  er: { jaw: 0.5, lips: "neutral", tongue: { x: 0.5, y: 0.5 }, curl: true, voiced: true, hint: "先读 e，舌尖向上一卷，自己就是音节不用拼，读「儿」" },
  /* 鼻韵母：先滑到主要元音，再用鼻音收尾 */
  an: { jaw: 0.7, lips: "neutral", tongue: { x: 0.4, y: 0.85 }, slide: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "前鼻音：先读 a，舌尖顶上牙床，鼻音收尾，读「安」" },
  en: { jaw: 0.5, lips: "neutral", tongue: { x: 0.6, y: 0.5 }, slide: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "前鼻音：先读 e，舌尖顶上牙床收尾，读「恩」" },
  in: { jaw: 0.25, lips: "spread", tongue: { x: 0.1, y: 0.1 }, slide: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "前鼻音：先读 i，舌尖顶上牙床收尾，读「因」" },
  un: { jaw: 0.3, lips: "round", tongue: { x: 0.7, y: 0.3 }, slide: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "是 uen 的简写：先 u 再滑到 en，读「温」" },
  ün: { jaw: 0.25, lips: "round", tongue: { x: 0.08, y: 0.1 }, slide: { x: 0.3, y: 0.1 }, closure: "alv", nasal: true, voiced: true, hint: "先读 ü，保持圆唇，再鼻音收尾，读「晕」" },
  ang: { jaw: 0.7, lips: "neutral", tongue: { x: 0.5, y: 0.85 }, slide: { x: 0.84, y: 0.16 }, closure: "vel", nasal: true, voiced: true, hint: "后鼻音：先读 a，舌根抬起顶软腭，嘴巴张得大大的，读「昂」" },
  eng: { jaw: 0.5, lips: "neutral", tongue: { x: 0.6, y: 0.5 }, slide: { x: 0.84, y: 0.16 }, closure: "vel", nasal: true, voiced: true, hint: "后鼻音：先读 e，舌根抬起，鼻音收尾，「灯」的韵母" },
  ing: { jaw: 0.25, lips: "spread", tongue: { x: 0.1, y: 0.1 }, slide: { x: 0.84, y: 0.16 }, closure: "vel", nasal: true, voiced: true, hint: "后鼻音：先读 i，舌根抬起，鼻音收尾，读「英」" },
  ong: { jaw: 0.4, lips: "round", tongue: { x: 0.8, y: 0.5 }, closure: "vel", nasal: true, voiced: true, hint: "嘴唇收圆不变，舌根抬起，声音在鼻腔里嗡嗡响，读「翁」" },
};

/* 整体认读的口型复用声母/韵母的参数 */
[
  ["zhi", "zh"], ["chi", "ch"], ["shi", "sh"], ["ri", "r"],
  ["zi", "z"], ["ci", "c"], ["si", "s"],
  ["yi", "i"], ["wu", "u"], ["yu", "ü"],
  ["ye", "ie"], ["yue", "üe"], ["yuan", "an"], ["yin", "in"], ["yun", "ün"], ["ying", "ing"],
].forEach((pair) => {
  MOUTH[pair[0]] = Object.assign({}, MOUTH[pair[1]]);
});

/* 注册进 mouthChart：draw(ctx, w, h, "b") 即可画拼音的口舌图 */
mouthChart.extend(MOUTH);

const RAW = [
  /* ---------------- 声母 23 ---------------- */
  { id: "b", py: "b", group: "sm", say: "波", tip: "双唇音，轻轻弹开就好，气流比 p 弱得多。", words: [["bà ba", "爸爸"], ["bái yún", "白云"], ["qiān bǐ", "铅笔"]] },
  { id: "p", py: "p", group: "sm", say: "坡", tip: "和 b 同一个部位，但一股强气冲出来，手能感觉到。", words: [["pí qiú", "皮球"], ["píng guǒ", "苹果"], ["pào pao", "泡泡"]] },
  { id: "m", py: "m", group: "sm", say: "摸", tip: "闭着嘴唇也能出声，因为声音全从鼻子走。", words: [["mā ma", "妈妈"], ["mù tou", "木头"], ["xiǎo mǎ", "小马"]] },
  { id: "f", py: "f", group: "sm", say: "佛", tip: "上齿咬下唇，像把气「挤」出来。", words: [["fēi jī", "飞机"], ["fáng zi", "房子"], ["mǐ fàn", "米饭"]] },
  { id: "d", py: "d", group: "sm", say: "得", tip: "舌尖顶上牙床再弹开，气流弱，别读成 t。", words: [["dà xiàng", "大象"], ["dù zi", "肚子"], ["dàn gāo", "蛋糕"]] },
  { id: "t", py: "t", group: "sm", say: "特", tip: "和 d 同一个部位，气流强，像轻轻吐一口气。", words: [["tài yáng", "太阳"], ["tù zi", "兔子"], ["táo zi", "桃子"]] },
  { id: "n", py: "n", group: "sm", say: "讷", tip: "捏住鼻子就读不出来了——它走鼻子的通道。", words: [["niú nǎi", "牛奶"], ["xiǎo niǎo", "小鸟"], ["nán guā", "南瓜"]] },
  { id: "l", py: "l", group: "sm", say: "勒", tip: "舌尖顶住上牙床，气从舌头两边漏出来。", words: [["lǎo hǔ", "老虎"], ["lí zi", "梨子"], ["là bǐ", "蜡笔"]] },
  { id: "g", py: "g", group: "sm", say: "哥", tip: "舌根顶住软腭再弹开，声音靠喉咙那里。", words: [["gē ge", "哥哥"], ["xī guā", "西瓜"], ["gāo xìng", "高兴"]] },
  { id: "k", py: "k", group: "sm", say: "科", tip: "和 g 同一个部位，气流更强，像咳嗽前那一口气。", words: [["kě ài", "可爱"], ["dà kū", "大哭"], ["kuài lè", "快乐"]] },
  { id: "h", py: "h", group: "sm", say: "喝", tip: "像冬天哈气取暖，舌根靠近软腭但不顶住。", words: [["huā duǒ", "花朵"], ["huǒ chē", "火车"], ["hóu zi", "猴子"]] },
  { id: "j", py: "j", group: "sm", say: "基", tip: "嘴角向两边拉开，舌面抬到硬腭前，先堵后擦。", words: [["jī dàn", "鸡蛋"], ["quán jiā", "全家"], ["jīn yú", "金鱼"]] },
  { id: "q", py: "q", group: "sm", say: "欺", tip: "和 j 同一个部位，气流更强，纸片放嘴前会被吹动。", words: [["qì qiú", "气球"], ["qiū tiān", "秋天"], ["qīng wā", "青蛙"]] },
  { id: "x", py: "x", group: "sm", say: "希", tip: "舌面靠近硬腭留条窄缝，像小蛇吐气一样挤出来。", words: [["xī guā", "西瓜"], ["xiǎo māo", "小猫"], ["xīng xing", "星星"]] },
  { id: "zh", py: "zh", group: "sm", say: "知", tip: "舌尖翘起来顶住硬腭前部，先堵后擦，舌头是卷着的。", words: [["zhī zhū", "蜘蛛"], ["zhēn zhū", "珍珠"], ["zhǎng dà", "长大"]] },
  { id: "ch", py: "ch", group: "sm", say: "吃", tip: "和 zh 同一个部位，气流更强，像轻轻打喷嚏。", words: [["chī fàn", "吃饭"], ["qì chē", "汽车"], ["chūn tiān", "春天"]] },
  { id: "sh", py: "sh", group: "sm", say: "诗", tip: "舌尖翘起靠近硬腭留条缝，气从缝里挤出去。", words: [["shī zi", "狮子"], ["shān yáng", "山羊"], ["xiǎo shǒu", "小手"]] },
  { id: "r", py: "r", group: "sm", say: "日", tip: "和 sh 同一个部位，但喉咙要出声，像 sh 的「有声音版」。", words: [["rì chū", "日出"], ["rè nao", "热闹"], ["niú ròu", "牛肉"]] },
  { id: "z", py: "z", group: "sm", say: "资", tip: "舌尖平平地顶住上牙床，先堵后擦，不翘舌。", words: [["zì jǐ", "自己"], ["zòng zi", "粽子"], ["xiě zì", "写字"]] },
  { id: "c", py: "c", group: "sm", say: "雌", tip: "和 z 同一个部位，气流更强，像用力吐瓜子皮。", words: [["cì wei", "刺猬"], ["cǎi hóng", "彩虹"], ["cǎo dì", "草地"]] },
  { id: "s", py: "s", group: "sm", say: "思", tip: "舌尖靠近上牙床留条缝，像吹口哨一样漏气。", words: [["yǔ sǎn", "雨伞"], ["sì gè", "四个"], ["sōng shù", "松树"]] },
  { id: "y", py: "y", group: "sm", say: "医", tip: "口型和 i 一样，读得轻而短，像一层薄薄的「衣」。", words: [["yī shēng", "医生"], ["yī qǐ", "一起"], ["yáng guāng", "阳光"]] },
  { id: "w", py: "w", group: "sm", say: "乌", tip: "口型和 u 一样，嘴唇收圆，读得轻而短。", words: [["wū zi", "屋子"], ["wǔ gè", "五个"], ["wō niú", "蜗牛"]] },

  /* ---------------- 单韵母 6 ---------------- */
  { id: "a", py: "a", group: "dy", say: "啊", tip: "嘴张到最大，医生看嗓子时就是发的这个音。", words: [["ā yí", "阿姨"], ["dà shān", "大山"], ["lǎ ba", "喇叭"]] },
  { id: "o", py: "o", group: "dy", say: "喔", tip: "嘴唇收圆向前突，圆圆的一个洞，别读成 e。", words: [["bó bo", "伯伯"], ["shàng pō", "上坡"], ["mó gu", "蘑菇"]] },
  { id: "e", py: "e", group: "dy", say: "鹅", tip: "半开口，舌后部抬起来，嘴角向两边，和白鹅一个音。", words: [["bái é", "白鹅"], ["chàng gē", "唱歌"], ["kuài lè", "快乐"]] },
  { id: "i", py: "i", group: "dy", say: "衣", tip: "嘴角向两边拉开像微笑，舌前部顶到最高。", words: [["yī fu", "衣服"], ["dà mǐ", "大米"], ["qī zhī", "七只"]] },
  { id: "u", py: "u", group: "dy", say: "乌", tip: "嘴唇收圆只留一个小孔，像吹口哨。", words: [["wū zi", "屋子"], ["wǔ gè", "五个"], ["wū guī", "乌龟"]] },
  { id: "ü", py: "ü", group: "dy", say: "鱼", tip: "先摆好 i 的口型，再把嘴唇慢慢收圆，就是 ü。", words: [["xiǎo yú", "小鱼"], ["xià yǔ", "下雨"], ["yù mǐ", "玉米"]] },

  /* ---------------- 复韵母 9 ---------------- */
  { id: "ai", py: "ai", group: "fy", say: "哀", tip: "从 a 滑到 i，嘴巴从大到小，两个音连成一个。", words: [["bái cài", "白菜"], ["kě ài", "可爱"], ["pái duì", "排队"]] },
  { id: "ei", py: "ei", group: "fy", say: "欸", tip: "从 e 滑到 i，嘴角越拉越开，像答应别人「欸」。", words: [["bēi zi", "杯子"], ["fēi jī", "飞机"], ["měi lì", "美丽"]] },
  { id: "ui", py: "ui", group: "fy", say: "威", tip: "是 uei 的简写：先 u 再滑到 ei，嘴唇由圆变扁。", words: [["hē shuǐ", "喝水"], ["wū guī", "乌龟"], ["shuì jiào", "睡觉"]] },
  { id: "ao", py: "ao", group: "fy", say: "熬", tip: "从 a 滑到 o，嘴巴从大到小，嘴唇渐渐收圆。", words: [["xiǎo māo", "小猫"], ["sài pǎo", "赛跑"], ["dàn gāo", "蛋糕"]] },
  { id: "ou", py: "ou", group: "fy", say: "欧", tip: "从 o 滑到 u，嘴唇越收越圆，声音越靠后。", words: [["lián ǒu", "莲藕"], ["xiǎo gǒu", "小狗"], ["shí tou", "石头"]] },
  { id: "iu", py: "iu", group: "fy", say: "优", tip: "是 iou 的简写：先 i 再滑到 ou，读起来像「优」。", words: [["pí qiú", "皮球"], ["xiǎo niú", "小牛"], ["liù gè", "六个"]] },
  { id: "ie", py: "ie", group: "fy", say: "耶", tip: "先 i 后 ê，嘴巴渐渐张开，最后一个音不是 i。", words: [["yè zi", "叶子"], ["jiě jie", "姐姐"], ["xiě zì", "写字"]] },
  { id: "üe", py: "üe", group: "fy", say: "约", tip: "先 ü 后 ê，嘴唇由圆变扁，读「约」。", words: [["yuè liang", "月亮"], ["xià xuě", "下雪"], ["yīn yuè", "音乐"]] },
  { id: "er", py: "er", group: "fy", say: "儿", tip: "先读 e，舌尖向上一卷，自己就是音节不用拼。", words: [["ér zi", "儿子"], ["ěr duo", "耳朵"], ["èr shí", "二十"]] },

  /* ---------------- 鼻韵母 9 ---------------- */
  { id: "an", py: "an", group: "bf", say: "安", tip: "前鼻音：先读 a，舌尖顶上牙床，鼻音收尾。", words: [["dà shān", "大山"], ["lán tiān", "蓝天"], ["lán qiú", "篮球"]] },
  { id: "en", py: "en", group: "bf", say: "恩", tip: "前鼻音：先读 e，舌尖顶上牙床收尾。", words: [["mén kǒu", "门口"], ["sēn lín", "森林"], ["huā pén", "花盆"]] },
  { id: "in", py: "in", group: "bf", say: "因", tip: "前鼻音：先读 i，舌尖顶上牙床收尾。", words: [["pīn yīn", "拼音"], ["shù lín", "树林"], ["tán qín", "弹琴"]] },
  { id: "un", py: "un", group: "bf", say: "温", tip: "是 uen 的简写：先 u 再滑到 en，读「温」。", words: [["kūn chóng", "昆虫"], ["chē lún", "车轮"], ["chūn tiān", "春天"]] },
  { id: "ün", py: "ün", group: "bf", say: "晕", tip: "先读 ü，保持圆唇，再鼻音收尾。", words: [["jūn rén", "军人"], ["yáng qún", "羊群"], ["qún zi", "裙子"]] },
  { id: "ang", py: "ang", group: "bf", say: "昂", tip: "后鼻音：先读 a，舌根抬起顶软腭，嘴巴张得大大的。", words: [["shān yáng", "山羊"], ["tài yáng", "太阳"], ["fáng zi", "房子"]] },
  { id: "eng", py: "eng", group: "bf", say: "灯", tip: "后鼻音：先读 e，舌根抬起，鼻音收尾，「灯」的韵母。", words: [["kāi dēng", "开灯"], ["dà fēng", "大风"], ["cháng dèng", "长凳"]] },
  { id: "ing", py: "ing", group: "bf", say: "英", tip: "后鼻音：先读 i，舌根抬起，鼻音收尾。", words: [["lǎo yīng", "老鹰"], ["xīng xing", "星星"], ["píng zi", "瓶子"]] },
  { id: "ong", py: "ong", group: "bf", say: "翁", tip: "嘴唇收圆不变，舌根抬起，声音在鼻腔里嗡嗡响。", words: [["cǎi hóng", "彩虹"], ["chóng zi", "虫子"], ["nào zhōng", "闹钟"]] },

  /* ---------------- 整体认读 16 ---------------- */
  { id: "zhi", py: "zhi", mouth: "zh", group: "zt", say: "知", tip: "不用拼，整个读出来；舌尖翘起，i 读得长长的。", words: [["zhī zhū", "蜘蛛"], ["zhī dao", "知道"], ["bǐ zhí", "笔直"]] },
  { id: "chi", py: "chi", mouth: "ch", group: "zt", say: "吃", tip: "不用拼，整个读出来，气流强。", words: [["chī fàn", "吃饭"], ["chí dào", "迟到"], ["chì bǎng", "翅膀"]] },
  { id: "shi", py: "shi", mouth: "sh", group: "zt", say: "诗", tip: "不用拼，整个读出来；别读成「西」。", words: [["shī zi", "狮子"], ["shí gè", "十个"], ["shí tou", "石头"]] },
  { id: "ri", py: "ri", mouth: "r", group: "zt", say: "日", tip: "不用拼，整个读出来，喉咙要出声。", words: [["rì chū", "日出"], ["rì zi", "日子"], ["hóng rì", "红日"]] },
  { id: "zi", py: "zi", mouth: "z", group: "zt", say: "字", tip: "不用拼，整个读出来；舌尖平伸，i 是长长的「资」。", words: [["xiě zì", "写字"], ["zì jǐ", "自己"], ["zhǒng zi", "种子"]] },
  { id: "ci", py: "ci", mouth: "c", group: "zt", say: "刺", tip: "不用拼，整个读出来，气流强。", words: [["cì wei", "刺猬"], ["yī cì", "一次"], ["cí tiě", "磁铁"]] },
  { id: "si", py: "si", mouth: "s", group: "zt", say: "四", tip: "不用拼，整个读出来，像吹口哨一样细细的。", words: [["sì gè", "四个"], ["sī kǎo", "思考"], ["sī chóu", "丝绸"]] },
  { id: "yi", py: "yi", mouth: "i", group: "zt", say: "一", tip: "不用拼，整个读出来，和单韵母 i 同音。", words: [["yī shēng", "医生"], ["yī qǐ", "一起"], ["yī fu", "衣服"]] },
  { id: "wu", py: "wu", mouth: "u", group: "zt", say: "五", tip: "不用拼，整个读出来，和单韵母 u 同音。", words: [["wū zi", "屋子"], ["wū guī", "乌龟"], ["wǔ gè", "五个"]] },
  { id: "yu", py: "yu", mouth: "ü", group: "zt", say: "鱼", tip: "不用拼，整个读出来，就是 ü 的读音。", words: [["xiǎo yú", "小鱼"], ["xià yǔ", "下雨"], ["yù mǐ", "玉米"]] },
  { id: "ye", py: "ye", mouth: "ie", group: "zt", say: "夜", tip: "不用拼，整个读出来，读音和复韵母 ie 相同。", words: [["yè zi", "叶子"], ["yè wǎn", "夜晚"], ["yé ye", "爷爷"]] },
  { id: "yue", py: "yue", mouth: "üe", group: "zt", say: "月", tip: "不用拼，整个读出来，读音和复韵母 üe 相同。", words: [["yuè liang", "月亮"], ["yīn yuè", "音乐"], ["tiào yuè", "跳跃"]] },
  { id: "yuan", py: "yuan", mouth: "an", group: "zt", say: "圆", tip: "不用拼，整个读出来，是 üan 的整体认读。", words: [["yuán xíng", "圆形"], ["gōng yuán", "公园"], ["yuǎn fāng", "远方"]] },
  { id: "yin", py: "yin", mouth: "in", group: "zt", say: "音", tip: "不用拼，整个读出来，读音和鼻韵母 in 相同。", words: [["pīn yīn", "拼音"], ["yín sè", "银色"], ["shù yīn", "树荫"]] },
  { id: "yun", py: "yun", mouth: "ün", group: "zt", say: "云", tip: "不用拼，整个读出来，读音和鼻韵母 ün 相同。", words: [["bái yún", "白云"], ["yún duǒ", "云朵"], ["yùn dòng", "运动"]] },
  { id: "ying", py: "ying", mouth: "ing", group: "zt", say: "鹰", tip: "不用拼，整个读出来，读音和鼻韵母 ing 相同。", words: [["lǎo yīng", "老鹰"], ["diàn yǐng", "电影"], ["shū yíng", "输赢"]] },
];

/* 建索引 + 规整词组 */
const BY_ID = {};
RAW.forEach((p) => {
  p.mouth = p.mouth || p.id;
  p.words = p.words.map((w) => ({ sy: w[0], word: w[1] }));
  BY_ID[p.id] = p;
});

function all() {
  return RAW;
}

function list(groupKey) {
  return RAW.filter((p) => p.group === groupKey);
}

function getGroups() {
  return GROUPS.map((g) => Object.assign({}, g));
}

function get(id) {
  return BY_ID[id] || null;
}

/** 分组总览（音标页的 sections 同款结构） */
function sections() {
  return GROUPS.map((g) => ({ key: g.key, name: g.name, sub: g.sub, count: g.count, items: list(g.key) }));
}

/** 当前拼音的口舌图提示语 */
function mouthHint(id) {
  return (MOUTH[id] || {}).hint || "";
}

module.exports = { all, list, getGroups, get, sections, mouthHint };
