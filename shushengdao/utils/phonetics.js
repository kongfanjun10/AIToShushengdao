/**
 * 英语国际音标库（48 个）
 *   元音 20：单元音 12（长元音 5 + 短元音 7）+ 双元音 8
 *   辅音 28：爆破音 6 + 摩擦音 10 + 破擦音 6 + 鼻音 3 + 舌侧音 1 + 半元音 2
 *
 * 每个音标：
 *   id    唯一标识（用音标本体，如 "/iː/"）
 *   ipa   音标写法
 *   say   代表词（在词里听这个音）
 *   audio 单音音频文件名（sounds/ipa/<audio>.mp3，由 tools/gen-ipa-audio.js 生成，可替换为真人录音）
 *   tip   发音要点（家长照着讲、孩子照着做）
 *   words 三个例词 [英文, 中文]，尽量选小学高频词
 */

const GROUPS = [
  { key: "v-long", kind: "vowel", name: "长元音", sub: "元音 · 声音拉长", count: 5 },
  { key: "v-short", kind: "vowel", name: "短元音", sub: "元音 · 短促有力", count: 7 },
  { key: "v-dip", kind: "vowel", name: "双元音", sub: "元音 · 两个音滑动", count: 8 },
  { key: "c-stop", kind: "consonant", name: "爆破音", sub: "辅音 · 气流爆破", count: 6 },
  { key: "c-fric", kind: "consonant", name: "摩擦音", sub: "辅音 · 气流摩擦", count: 10 },
  { key: "c-affr", kind: "consonant", name: "破擦音", sub: "辅音 · 先破后擦", count: 6 },
  { key: "c-nasal", kind: "consonant", name: "鼻音", sub: "辅音 · 气流走鼻腔", count: 3 },
  { key: "c-lat", kind: "consonant", name: "舌侧音", sub: "辅音 · 舌头抵上齿", count: 1 },
  { key: "c-semi", kind: "consonant", name: "半元音", sub: "辅音 · 一带而过", count: 2 },
];

const RAW = [
  /* ---------------- 元音 · 长元音 5 ---------------- */
  {
    ipa: "/iː/",
    group: "v-long",
    say: "see",
    audio: "i-long", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴角向两边拉开像微笑，声音拉长，比 /ɪ/ 更长更紧。",
    words: [["see", "看见"], ["tea", "茶"], ["green", "绿色"]],
  },
  {
    ipa: "/ɑː/",
    group: "v-long",
    say: "car",
    audio: "a-long", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴巴张大，舌头放平，声音拖长，像看医生时发的「啊」。",
    words: [["car", "小汽车"], ["park", "公园"], ["father", "爸爸"]],
  },
  {
    ipa: "/ɔː/",
    group: "v-long",
    say: "door",
    audio: "o-long", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇收圆并向前突，声音拉长。",
    words: [["door", "门"], ["ball", "球"], ["four", "四"]],
  },
  {
    ipa: "/uː/",
    group: "v-long",
    say: "moon",
    audio: "u-long", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇收圆像吹口哨，声音拉长。",
    words: [["moon", "月亮"], ["food", "食物"], ["blue", "蓝色"]],
  },
  {
    ipa: "/ɜː/",
    group: "v-long",
    say: "bird",
    audio: "er-long", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌中部抬起，嘴唇放松，声音拉长，像拖长的「饿」。",
    words: [["bird", "小鸟"], ["girl", "女孩"], ["nurse", "护士"]],
  },

  /* ---------------- 元音 · 短元音 7 ---------------- */
  {
    ipa: "/ɪ/",
    group: "v-short",
    say: "sit",
    audio: "i-short", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "短促的「衣」，嘴角微开，不要拉长。",
    words: [["sit", "坐"], ["big", "大的"], ["fish", "鱼"]],
  },
  {
    ipa: "/e/",
    group: "v-short",
    say: "bed",
    audio: "e-short", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴角稍开，舌尖抵下齿，短而轻。",
    words: [["bed", "床"], ["pen", "钢笔"], ["red", "红色"]],
  },
  {
    ipa: "/æ/",
    group: "v-short",
    say: "cat",
    audio: "ae", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴巴张大压扁，像被吓一跳的「哎」。",
    words: [["cat", "小猫"], ["bag", "书包"], ["apple", "苹果"]],
  },
  {
    ipa: "/ʌ/",
    group: "v-short",
    say: "cup",
    audio: "ah", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴巴半开，短促的「啊」，声音靠后。",
    words: [["cup", "杯子"], ["bus", "公共汽车"], ["sun", "太阳"]],
  },
  {
    ipa: "/ɒ/",
    group: "v-short",
    say: "dog",
    audio: "o-short", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇收圆，短促的「奥」，不要拖长。",
    words: [["dog", "小狗"], ["hot", "热的"], ["box", "盒子"]],
  },
  {
    ipa: "/ʊ/",
    group: "v-short",
    say: "book",
    audio: "u-short", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇收圆，短促的「乌」。",
    words: [["book", "书"], ["good", "好的"], ["foot", "脚"]],
  },
  {
    ipa: "/ə/",
    group: "v-short",
    say: "teacher",
    audio: "schwa", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "最轻最松的「呃」，轻轻带过，常出现在词尾。",
    words: [["about", "关于"], ["teacher", "老师"], ["banana", "香蕉"]],
  },

  /* ---------------- 元音 · 双元音 8 ---------------- */
  {
    ipa: "/eɪ/",
    group: "v-dip",
    say: "day",
    audio: "ei", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「哎」滑向「衣」，前重后轻。",
    words: [["day", "白天"], ["name", "名字"], ["cake", "蛋糕"]],
  },
  {
    ipa: "/aɪ/",
    group: "v-dip",
    say: "bike",
    audio: "ai", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「啊」滑向「衣」，嘴巴由大变小。",
    words: [["bike", "自行车"], ["five", "五"], ["night", "夜晚"]],
  },
  {
    ipa: "/ɔɪ/",
    group: "v-dip",
    say: "boy",
    audio: "oi", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「奥」滑向「衣」。",
    words: [["boy", "男孩"], ["toy", "玩具"], ["oil", "油"]],
  },
  {
    ipa: "/əʊ/",
    group: "v-dip",
    say: "go",
    audio: "ou", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「呃」滑向「乌」，嘴唇由扁变圆。",
    words: [["go", "去"], ["home", "家"], ["nose", "鼻子"]],
  },
  {
    ipa: "/aʊ/",
    group: "v-dip",
    say: "cow",
    audio: "au", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「啊」滑向「乌」，像被踩了一脚。",
    words: [["cow", "奶牛"], ["house", "房子"], ["mouth", "嘴巴"]],
  },
  {
    ipa: "/ɪə/",
    group: "v-dip",
    say: "ear",
    audio: "ia", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「衣」滑向「呃」。",
    words: [["ear", "耳朵"], ["near", "附近"], ["idea", "主意"]],
  },
  {
    ipa: "/eə/",
    group: "v-dip",
    say: "air",
    audio: "ea", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「哎」滑向「呃」。",
    words: [["air", "空气"], ["hair", "头发"], ["bear", "小熊"]],
  },
  {
    ipa: "/ʊə/",
    group: "v-dip",
    say: "tour",
    audio: "ua", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "从「乌」滑向「呃」，词尾很轻。",
    words: [["tour", "旅行"], ["poor", "贫穷的"], ["sure", "当然"]],
  },

  /* ---------------- 辅音 · 爆破音 6 ---------------- */
  {
    ipa: "/p/",
    group: "c-stop",
    say: "pen",
    audio: "p", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "双唇闭紧再突然放开，只出气不出声。",
    words: [["pen", "钢笔"], ["pig", "小猪"], ["map", "地图"]],
  },
  {
    ipa: "/b/",
    group: "c-stop",
    say: "bag",
    audio: "b", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "双唇闭紧再放开，要振动声带。",
    words: [["bag", "书包"], ["book", "书"], ["ball", "球"]],
  },
  {
    ipa: "/t/",
    group: "c-stop",
    say: "tea",
    audio: "t", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖抵上齿龈，突然放开，只出气。",
    words: [["tea", "茶"], ["ten", "十"], ["cat", "小猫"]],
  },
  {
    ipa: "/d/",
    group: "c-stop",
    say: "dog",
    audio: "d", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖抵上齿龈，放开时振动声带。",
    words: [["dog", "小狗"], ["door", "门"], ["hand", "手"]],
  },
  {
    ipa: "/k/",
    group: "c-stop",
    say: "key",
    audio: "k", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌根抵软腭，突然放开，只出气。",
    words: [["key", "钥匙"], ["cat", "小猫"], ["book", "书"]],
  },
  {
    ipa: "/g/",
    group: "c-stop",
    say: "girl",
    audio: "g", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌根抵软腭，放开时振动声带。",
    words: [["girl", "女孩"], ["green", "绿色"], ["bag", "书包"]],
  },

  /* ---------------- 辅音 · 摩擦音 10 ---------------- */
  {
    ipa: "/f/",
    group: "c-fric",
    say: "fish",
    audio: "f", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "上齿轻咬下唇，气流从缝隙出来。",
    words: [["fish", "鱼"], ["five", "五"], ["coffee", "咖啡"]],
  },
  {
    ipa: "/v/",
    group: "c-fric",
    say: "very",
    audio: "v", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /f/，但要振动声带。",
    words: [["very", "非常"], ["love", "爱"], ["seven", "七"]],
  },
  {
    ipa: "/θ/",
    group: "c-fric",
    say: "three",
    audio: "th", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖轻放在上下齿之间，轻轻送气（不振动声带）。",
    words: [["think", "想"], ["three", "三"], ["mouth", "嘴巴"]],
  },
  {
    ipa: "/ð/",
    group: "c-fric",
    say: "this",
    audio: "dh", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /θ/，但要振动声带。",
    words: [["this", "这个"], ["mother", "妈妈"], ["brother", "哥哥"]],
  },
  {
    ipa: "/s/",
    group: "c-fric",
    say: "sun",
    audio: "s", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖靠近齿龈，气流从中间挤出来，像小蛇叫。",
    words: [["sun", "太阳"], ["sit", "坐"], ["bus", "公共汽车"]],
  },
  {
    ipa: "/z/",
    group: "c-fric",
    say: "zoo",
    audio: "z", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /s/，但要振动声带，像小蜜蜂叫。",
    words: [["zoo", "动物园"], ["zero", "零"], ["nose", "鼻子"]],
  },
  {
    ipa: "/ʃ/",
    group: "c-fric",
    say: "she",
    audio: "sh", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇稍圆前突，像让人安静时的「嘘」。",
    words: [["she", "她"], ["fish", "鱼"], ["shoe", "鞋子"]],
  },
  {
    ipa: "/ʒ/",
    group: "c-fric",
    say: "television",
    audio: "zh", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /ʃ/，但要振动声带。",
    words: [["usually", "通常"], ["television", "电视"], ["measure", "测量"]],
  },
  {
    ipa: "/h/",
    group: "c-fric",
    say: "hat",
    audio: "h", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "像对着玻璃哈气，喉咙不振动。",
    words: [["hat", "帽子"], ["hand", "手"], ["hot", "热的"]],
  },
  {
    ipa: "/r/",
    group: "c-fric",
    say: "red",
    audio: "r", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖卷起但不碰上腭，声音带一点摩擦。",
    words: [["red", "红色"], ["run", "跑"], ["rain", "雨"]],
  },

  /* ---------------- 辅音 · 破擦音 6 ---------------- */
  {
    ipa: "/tʃ/",
    group: "c-affr",
    say: "chair",
    audio: "ch", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "先堵住再放开摩擦，像中文的「吃」。",
    words: [["chair", "椅子"], ["teacher", "老师"], ["watch", "手表"]],
  },
  {
    ipa: "/dʒ/",
    group: "c-affr",
    say: "juice",
    audio: "jh", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /tʃ/，但要振动声带，像中文的「知」。",
    words: [["job", "工作"], ["juice", "果汁"], ["orange", "橙子"]],
  },
  {
    ipa: "/tr/",
    group: "c-affr",
    say: "tree",
    audio: "tr", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖卷起再快速弹开，像中文的「戳」。",
    words: [["tree", "树"], ["train", "火车"], ["try", "试一试"]],
  },
  {
    ipa: "/dr/",
    group: "c-affr",
    say: "draw",
    audio: "dr", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /tr/，但要振动声带，像中文的「捉」。",
    words: [["draw", "画画"], ["dress", "连衣裙"], ["dream", "梦"]],
  },
  {
    ipa: "/ts/",
    group: "c-affr",
    say: "cats",
    audio: "ts", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖抵齿龈后快速送气，像中文的「次」，常在名词复数结尾。",
    words: [["cats", "猫（复数）"], ["boats", "小船（复数）"], ["coats", "外套（复数）"]],
  },
  {
    ipa: "/dz/",
    group: "c-affr",
    say: "beds",
    audio: "dz", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "口型同 /ts/，但要振动声带，像中文的「兹」。",
    words: [["beds", "床（复数）"], ["cards", "卡片（复数）"], ["hands", "手（复数）"]],
  },

  /* ---------------- 辅音 · 鼻音 3 ---------------- */
  {
    ipa: "/m/",
    group: "c-nasal",
    say: "mum",
    audio: "m", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "双唇闭起，气流从鼻子出来。",
    words: [["mum", "妈妈"], ["moon", "月亮"], ["milk", "牛奶"]],
  },
  {
    ipa: "/n/",
    group: "c-nasal",
    say: "nose",
    audio: "n", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖抵住齿龈，气流从鼻子出来。",
    words: [["nose", "鼻子"], ["name", "名字"], ["sun", "太阳"]],
  },
  {
    ipa: "/ŋ/",
    group: "c-nasal",
    say: "sing",
    audio: "ng", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌根抵软腭，气流从鼻子出来，像拖长的「嗯」。",
    words: [["sing", "唱歌"], ["long", "长的"], ["morning", "早上"]],
  },

  /* ---------------- 辅音 · 舌侧音 1 ---------------- */
  {
    ipa: "/l/",
    group: "c-lat",
    say: "leg",
    audio: "l", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌尖抵上齿龈，气流从舌头两边出来。",
    words: [["leg", "腿"], ["lion", "狮子"], ["school", "学校"]],
  },

  /* ---------------- 辅音 · 半元音 2 ---------------- */
  {
    ipa: "/w/",
    group: "c-semi",
    say: "water",
    audio: "w", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "嘴唇收圆后快速滑开，像「我」的开头。",
    words: [["water", "水"], ["window", "窗户"], ["swim", "游泳"]],
  },
  {
    ipa: "/j/",
    group: "c-semi",
    say: "yes",
    audio: "y", // 单音音频（sounds/ipa/<slug>.mp3）
    tip: "舌面抬向硬腭后快速滑开，像「呀」的开头。",
    words: [["yes", "是的"], ["yellow", "黄色"], ["you", "你"]],
  },
];

/* ---------------- 派生数据 ---------------- */

const GROUP_MAP = {};
GROUPS.forEach((g) => {
  GROUP_MAP[g.key] = g;
});

const PHONEMES = RAW.map((p, i) => ({
  id: p.ipa,
  ipa: p.ipa,
  say: p.say,
  audio: p.audio || "",
  group: p.group,
  groupName: (GROUP_MAP[p.group] || {}).name || "",
  kind: (GROUP_MAP[p.group] || {}).kind || "consonant",
  order: i,
  tip: p.tip,
  words: p.words.map((w) => ({ en: w[0], cn: w[1] })),
}));

const BY_ID = {};
PHONEMES.forEach((p) => {
  BY_ID[p.id] = p;
});

function all() {
  return PHONEMES;
}

function getGroups() {
  return GROUPS.map((g) => ({
    key: g.key,
    kind: g.kind,
    name: g.name,
    sub: g.sub,
    count: PHONEMES.filter((p) => p.group === g.key).length,
  }));
}

function get(id) {
  return BY_ID[id] || null;
}

/** 某一类的音标（groupKey 为空则返回全部） */
function list(groupKey) {
  if (!groupKey) return PHONEMES.slice();
  return PHONEMES.filter((p) => p.group === groupKey);
}

/** 分组结构，用于「48 个音标」总览 */
function sections() {
  return getGroups().map((g) => ({
    key: g.key,
    name: g.name,
    sub: g.sub,
    count: g.count,
    items: list(g.key),
  }));
}

function stats() {
  return { total: PHONEMES.length, vowels: 20, consonants: 28 };
}

module.exports = {
  GROUPS,
  PHONEMES,
  all,
  list,
  get,
  getGroups,
  sections,
  stats,
};
