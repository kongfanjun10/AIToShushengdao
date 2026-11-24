/**
 * 英语单词库（小学低中段常用词，按主题分组）
 * 每个词：id(=单词) / en / ipa / cn / sentence / sentenceCn / theme
 * 发音统一走 TTS 英文通道（en_US），点词即读。
 */

/* 主题顺序即页面 chips 顺序 */
const THEMES = [
  { key: "animals", name: "动物", sub: "Animals", icon: "🐾" },
  { key: "food", name: "食物", sub: "Food", icon: "🍎" },
  { key: "colors", name: "颜色", sub: "Colors", icon: "🎨" },
  { key: "numbers", name: "数字", sub: "Numbers", icon: "🔢" },
  { key: "family", name: "家人", sub: "Family", icon: "👨‍👩‍👧" },
  { key: "school", name: "学校", sub: "School", icon: "🎒" },
  { key: "body", name: "身体", sub: "Body", icon: "🙂" },
  { key: "action", name: "动作", sub: "Actions", icon: "🏃" },
];

/* [单词, 音标, 中文, 例句, 例句中文] */
const RAW = {
  animals: [
    ["cat", "/kæt/", "猫", "This is a cat.", "这是一只猫。"],
    ["dog", "/dɒɡ/", "狗", "The dog can run.", "这只狗会跑。"],
    ["bird", "/bɜːd/", "鸟", "A bird is in the tree.", "一只鸟在树上。"],
    ["fish", "/fɪʃ/", "鱼", "Fish live in water.", "鱼生活在水里。"],
    ["duck", "/dʌk/", "鸭子", "The duck likes water.", "鸭子喜欢水。"],
    ["pig", "/pɪɡ/", "猪", "The pig is pink.", "这头猪是粉色的。"],
    ["rabbit", "/ˈræbɪt/", "兔子", "My rabbit is white.", "我的兔子是白色的。"],
    ["tiger", "/ˈtaɪɡə/", "老虎", "A tiger is very big.", "老虎很大。"],
  ],
  food: [
    ["rice", "/raɪs/", "米饭", "I eat rice every day.", "我每天吃米饭。"],
    ["bread", "/bred/", "面包", "She likes bread.", "她喜欢面包。"],
    ["milk", "/mɪlk/", "牛奶", "Drink some milk.", "喝点牛奶吧。"],
    ["egg", "/eɡ/", "鸡蛋", "I have one egg.", "我有一个鸡蛋。"],
    ["apple", "/ˈæpl/", "苹果", "This apple is sweet.", "这个苹果很甜。"],
    ["cake", "/keɪk/", "蛋糕", "We eat cake today.", "我们今天吃蛋糕。"],
    ["water", "/ˈwɔːtə/", "水", "Can I have water?", "我可以喝水吗？"],
    ["banana", "/bəˈnɑːnə/", "香蕉", "The banana is yellow.", "香蕉是黄色的。"],
  ],
  colors: [
    ["red", "/red/", "红色", "The flower is red.", "这朵花是红色的。"],
    ["blue", "/bluː/", "蓝色", "The sky is blue.", "天空是蓝色的。"],
    ["green", "/ɡriːn/", "绿色", "Leaves are green.", "叶子是绿色的。"],
    ["yellow", "/ˈjeləʊ/", "黄色", "My bag is yellow.", "我的书包是黄色的。"],
    ["black", "/blæk/", "黑色", "The cat is black.", "这只猫是黑色的。"],
    ["white", "/waɪt/", "白色", "Snow is white.", "雪是白色的。"],
    ["pink", "/pɪŋk/", "粉色", "She likes pink.", "她喜欢粉色。"],
    ["orange", "/ˈɒrɪndʒ/", "橙色", "The orange is orange.", "橙子是橙色的。"],
  ],
  numbers: [
    ["one", "/wʌn/", "一", "I have one pen.", "我有一支笔。"],
    ["two", "/tuː/", "二", "Two cats are here.", "这里有两只猫。"],
    ["three", "/θriː/", "三", "I see three birds.", "我看见三只鸟。"],
    ["four", "/fɔː/", "四", "Four chairs in the room.", "房间里有四把椅子。"],
    ["five", "/faɪv/", "五", "Give me five!", "给我五个！"],
    ["six", "/sɪks/", "六", "Six eggs, please.", "请给我六个鸡蛋。"],
    ["seven", "/ˈsevn/", "七", "There are seven days.", "一周有七天。"],
    ["eight", "/eɪt/", "八", "I am eight years old.", "我八岁了。"],
  ],
  family: [
    ["father", "/ˈfɑːðə/", "爸爸", "My father is tall.", "我的爸爸很高。"],
    ["mother", "/ˈmʌðə/", "妈妈", "My mother is kind.", "我的妈妈很温柔。"],
    ["sister", "/ˈsɪstə/", "姐妹", "My sister can sing.", "我的姐姐会唱歌。"],
    ["brother", "/ˈbrʌðə/", "兄弟", "My brother likes football.", "我的哥哥喜欢足球。"],
    ["baby", "/ˈbeɪbi/", "宝宝", "The baby is sleeping.", "宝宝在睡觉。"],
    ["grandma", "/ˈɡrænmɑː/", "奶奶", "Grandma tells stories.", "奶奶会讲故事。"],
    ["grandpa", "/ˈɡrænpɑː/", "爷爷", "Grandpa likes tea.", "爷爷喜欢喝茶。"],
    ["friend", "/frend/", "朋友", "She is my friend.", "她是我的朋友。"],
  ],
  school: [
    ["book", "/bʊk/", "书", "This book is fun.", "这本书很有趣。"],
    ["pen", "/pen/", "笔", "May I use your pen?", "我可以用你的笔吗？"],
    ["desk", "/desk/", "课桌", "My desk is clean.", "我的课桌很干净。"],
    ["chair", "/tʃeə/", "椅子", "Sit on the chair.", "坐在椅子上。"],
    ["bag", "/bæɡ/", "书包", "My bag is heavy.", "我的书包很重。"],
    ["teacher", "/ˈtiːtʃə/", "老师", "Our teacher is nice.", "我们的老师很好。"],
    ["class", "/klɑːs/", "班级", "I am in Class Two.", "我在二班。"],
    ["ruler", "/ˈruːlə/", "尺子", "Where is my ruler?", "我的尺子在哪里？"],
  ],
  body: [
    ["head", "/hed/", "头", "Touch your head.", "摸摸你的头。"],
    ["hand", "/hænd/", "手", "Wash your hands.", "洗洗手。"],
    ["eye", "/aɪ/", "眼睛", "I have two eyes.", "我有两只眼睛。"],
    ["ear", "/ɪə/", "耳朵", "My ears are small.", "我的耳朵很小。"],
    ["nose", "/nəʊz/", "鼻子", "The dog has a big nose.", "这只狗鼻子很大。"],
    ["mouth", "/maʊθ/", "嘴", "Open your mouth.", "张开嘴。"],
    ["foot", "/fʊt/", "脚", "My foot hurts.", "我的脚疼。"],
    ["hair", "/heə/", "头发", "Her hair is long.", "她的头发很长。"],
  ],
  action: [
    ["run", "/rʌn/", "跑", "Let us run!", "我们跑吧！"],
    ["jump", "/dʒʌmp/", "跳", "The frog can jump.", "青蛙会跳。"],
    ["swim", "/swɪm/", "游泳", "I can swim.", "我会游泳。"],
    ["sing", "/sɪŋ/", "唱歌", "She can sing well.", "她唱歌很好听。"],
    ["read", "/riːd/", "读", "I read every night.", "我每天晚上读书。"],
    ["write", "/raɪt/", "写", "Write your name.", "写下你的名字。"],
    ["draw", "/drɔː/", "画", "I like to draw.", "我喜欢画画。"],
    ["play", "/pleɪ/", "玩", "We play after class.", "我们下课后玩。"],
  ],
};

const LIST = [];
Object.keys(RAW).forEach((theme) => {
  RAW[theme].forEach((row) => {
    LIST.push({
      id: row[0],
      en: row[0],
      ipa: row[1],
      cn: row[2],
      sentence: row[3],
      sentenceCn: row[4],
      theme,
    });
  });
});

const INDEX = {};
LIST.forEach((w) => {
  INDEX[w.id] = w;
});

function getGroups() {
  return THEMES.map((t) => ({
    key: t.key,
    name: t.name,
    sub: t.sub,
    icon: t.icon,
    count: LIST.filter((w) => w.theme === t.key).length,
  }));
}

function getTheme(key) {
  return THEMES.filter((t) => t.key === key)[0] || THEMES[0];
}

function list(theme) {
  return LIST.filter((w) => w.theme === theme);
}

function get(id) {
  return INDEX[id] || null;
}

function all() {
  return LIST.slice();
}

module.exports = { THEMES, getGroups, getTheme, list, get, all };
