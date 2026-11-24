/**
 * 拼音词典（离线）
 * v2：pinyinData.js 全量字库（CJK 基本区+扩展A，约 2 万字，tools/gen-pinyin-data.js 生成）
 *     + RAW 手调常用音覆盖（多音字取小学常用读音）
 * 仍保留接口 getPinyin/isPunct/has 不变。
 */
const FULL = require("./pinyinData.js");
const RAW =
  "的de 一yī 是shì 不bù 了le 人rén 我wǒ 在zài 有yǒu 他tā 这zhè 个gè 们men 中zhōng 来lái 上shàng 大dà " +
  "为wèi 和hé 国guó 地dì 到dào 以yǐ 说shuō 时shí 要yào 就jiù 出chū 会huì 可kě 也yě 你nǐ 对duì " +
  "生shēng 能néng 而ér 子zi 那nà 得de 于yú 着zhe 下xià 自zì 之zhī 年nián 过guò 发fā 后hòu 作zuò " +
  "里lǐ 用yòng 道dào 行xíng 所suǒ 然rán 家jiā 种zhǒng 事shì 成chéng 方fāng 多duō 经jīng 么me 去qù " +
  "法fǎ 学xué 如rú 都dōu 同tóng 现xiàn 当dāng 没méi 动dòng 面miàn 起qǐ 看kàn 定dìng 天tiān 分fēn " +
  "还hái 进jìn 好hǎo 小xiǎo 部bù 其qí 些xiē 主zhǔ 样yàng 理lǐ 心xīn 她tā 本běn 前qián 开kāi 但dàn " +
  "因yīn 只zhǐ 从cóng 想xiǎng 实shí 日rì 者zhě 意yì 无wú 力lì 它tā 与yǔ 长cháng 把bǎ 机jī 十shí " +
  "民mín 第dì 公gōng 此cǐ 已yǐ 工gōng 使shǐ 情qíng 明míng 性xìng 知zhī 全quán 三sān 又yòu 关guān " +
  "点diǎn 正zhèng 业yè 外wài 将jiāng 两liǎng 高gāo 间jiān 由yóu 问wèn 很hěn 最zuì 重zhòng 并bìng " +
  "物wù 手shǒu 应yīng 向xiàng 头tóu 文wén 体tǐ 美měi 相xiāng 见jiàn 被bèi 利lì 什shén 二èr 等děng " +
  "或huò 新xīn 己jǐ 身shēn 果guǒ 加jiā 西xī 月yuè 话huà 合hé 回huí 特tè 代dài 内nèi 信xìn 表biǎo " +
  "化huà 老lǎo 给gěi 世shì 位wèi 次cì 度dù 门mén 任rèn 常cháng 先xiān 海hǎi 通tōng 教jiào 儿ér " +
  "原yuán 东dōng 声shēng 提tí 立lì 及jí 比bǐ 解jiě 水shuǐ 名míng 真zhēn 处chù 走zǒu 各gè 入rù " +
  "几jǐ 口kǒu 认rèn 条tiáo 平píng 气qì 题tí 活huó 更gèng 别bié 打dǎ 女nǚ 变biàn 四sì 神shén " +
  "总zǒng 何hé 电diàn 数shù 安ān 少shǎo 报bào 才cái 结jié 反fǎn 受shòu 目mù 太tài 再zài 感gǎn " +
  "建jiàn 做zuò 接jiē 必bì 场chǎng 件jiàn 计jì 管guǎn 期qī 市shì 直zhí 山shān 金jīn 指zhǐ 许xǔ " +
  "保bǎo 至zhì 队duì 形xíng 便biàn 空kōng 决jué 马mǎ 五wǔ 眼yǎn 书shū 非fēi 则zé 听tīng 白bái " +
  "却què 界jiè 光guāng 放fàng 强qiáng 像xiàng 难nán 权quán 思sī 王wáng 完wán 设shè 式shì 色sè " +
  "路lù 记jì 南nán 品pǐn 住zhù 告gào 类lèi 求qiú 据jù 程chéng 北běi 边biān 张zhāng 该gāi 交jiāo " +
  "规guī 万wàn 取qǔ 拉lā 格gé 望wàng 觉jué 术shù 领lǐng 共gòng 确què 传chuán 师shī 观guān 清qīng " +
  "今jīn 切qiè 院yuàn 让ràng 识shí 候hòu 带dài 导dǎo 争zhēng 运yùn 笑xiào 飞fēi 风fēng 步bù " +
  "改gǎi 收shōu 根gēn 干gān 造zào 言yán 联lián 持chí 组zǔ 每měi 车chē 亲qīn 极jí 林lín 服fú " +
  "快kuài 办bàn 议yì 往wǎng 元yuán 英yīng 士shì 证zhèng 近jìn 失shī 转zhuǎn 夫fū 令lìng 准zhǔn " +
  "布bù 始shǐ 怎zěn 呢ne 存cún 未wèi 远yuǎn 叫jiào 台tái 单dān 影yǐng 具jù 字zì 爱ài 击jī 流liú " +
  "备bèi 连lián 调diào 深shēn 商shāng 算suàn 团tuán 集jí 百bǎi 需xū 价jià 花huā 城chéng 石shí " +
  "级jí 整zhěng 离lí 请qǐng 技jì 际jì 约yuē 示shì 复fù 病bìng 息xī 究jiū 线xiàn 似sì 官guān " +
  "火huǒ 断duàn 精jīng 满mǎn 支zhī 视shì 消xiāo 越yuè 器qì 容róng 照zhào 须xū 九jiǔ 增zēng " +
  "研yán 写xiě 称chēng 八bā 功gōng 吗ma 包bāo 片piàn 查chá 轻qīng 易yì 早zǎo 曾céng 除chú " +
  "农nóng 找zhǎo 装zhuāng 广guǎng 显xiǎn 吧ba 李lǐ 标biāo 谈tán 吃chī 图tú 念niàn 六liù 引yǐn " +
  "历lì 首shǒu 医yī 局jú 突tū 专zhuān 费fèi 号hào 尽jìn 另lìng 周zhōu 较jiào 注zhù 语yǔ 仅jǐn " +
  "考kǎo 落luò 青qīng 随suí 选xuǎn 列liè 武wǔ 红hóng 响xiǎng 虽suī 推tuī 势shì 参cān 希xī 古gǔ " +
  "众zhòng 构gòu 房fáng 半bàn 节jié 土tǔ 投tóu 案àn 黑hēi 维wéi 划huà 敌dí 致zhì 律lǜ 足zú " +
  "态tài 护hù 七qī 兴xīng 派pài 孩hái 验yàn 责zé 营yíng 星xīng 够gòu 章zhāng 音yīn 跟gēn 志zhì " +
  "底dǐ 站zhàn 严yán 巴bā 例lì 防fáng 族zú 效xiào 续xù 施shī 留liú 讲jiǎng 型xíng 料liào " +
  "终zhōng 答dá 紧jǐn 黄huáng 绝jué 奇qí 察chá 母mǔ 京jīng 段duàn 依yī 批pī 群qún 项xiàng " +
  "故gù 按àn 河hé 米mǐ 围wéi 江jiāng 织zhī 害hài 斗dòu 双shuāng 境jìng 客kè 纪jì 采cǎi 举jǔ " +
  "父fù 密mì 低dī 朝cháo 友yǒu 诉sù 止zhǐ 细xì 愿yuàn 千qiān 值zhí 仍réng 男nán 钱qián 破pò " +
  "网wǎng 热rè 助zhù 倒dǎo 育yù 属shǔ 坐zuò 限xiàn 船chuán 脸liǎn 职zhí 速sù 刻kè 乐lè 否fǒu " +
  "刚gāng 威wēi 毛máo 状zhuàng 率lǜ 独dú 球qiú 般bān 普pǔ 怕pà 校xiào 苦kǔ 创chuàng 假jiǎ " +
  "久jiǔ 错cuò 承chéng 印yìn 晚wǎn 试shì 拿ná 脑nǎo 预yù 谁shéi 益yì 阳yáng 若ruò 哪nǎ 微wēi " +
  "继jì 送sòng 急jí 血xuè 惊jīng 伤shāng 素sù 药yào 适shì 波bō 夜yè 省shěng 初chū 喜xǐ 卫wèi " +
  "源yuán 食shí 险xiǎn 待dài 习xí 置zhì 居jū 劳láo 财cái 环huán 排pái 福fú 纳nà 欢huān 雷léi " +
  "警jǐng 获huò 模mó 充chōng 负fù 云yún 停tíng 木mù 游yóu 龙lóng 树shù 疑yí 层céng 冷lěng 冲chōng " +
  "射shè 略lüè 范fàn 竟jìng 句jù 室shì 异yì 激jī 汉hàn 村cūn 策cè 演yǎn 简jiǎn 卡kǎ 判pàn " +
  "担dān 州zhōu 静jìng 退tuì 既jì 衣yī 您nín 积jī 余yú 痛tòng 检jiǎn 差chà 富fù 灵líng 协xié " +
  "角jiǎo 占zhàn 配pèi 征zhēng 修xiū 皮pí 挥huī 胜shèng 降jiàng 阶jiē 沉chén 坚jiān 善shàn 妈mā " +
  "读dú 超chāo 免miǎn 压yā 银yín 买mǎi 养yǎng 怀huái 乱luàn 抗kàng 追zhuī 帮bāng 岁suì 航háng " +
  "优yōu 怪guài 香xiāng 田tián 铁tiě 控kòng 秋qiū 雨yǔ 钥yào 匙shi 温wēn 柔róu 轻qīng 意yì " +
  "留liú 大dà 门mén 打dǎ 开kāi 五wǔ 彩cǎi 缤bīn 纷fēn 颜yán 料liào 银yín 杏xìng 叶yè 扇shàn " +
  "红hóng 枫fēng 邮yóu 票piào 枚méi 仙xiān 紫zǐ 葡pú 萄táo 菠bō 萝luó 梨lí 甜tián 丰fēng 收shōu " +
  "炎yán 热rè 频pín 点diǎn 头tóu 子zi 像xiàng 扇shàn 凉liáng 爽shuǎng 田tián 野yě 金jīn 色sè " +
  "橘jú 油yóu 争zhēng 着zhe 摘zhāi 果guǒ 实shí 味wèi 道dào 非fēi 常cháng 好hǎo 闻wén 气qì " +
  "候hòu 骄jiāo 傲ào 银yín 杏xìng 树shù 黄huáng 色sè 夏xià 姑gū 娘niáng 藏cáng 在zài 树shù " +
  "枝zhī 间jiān 好hǎo 像xiàng 一yī 把bǎ 小xiǎo 扇shàn 子zi 扇shàn 走zǒu 夏xià 天tiān 的de 炎yán " +
  "热rè 红hóng 红hóng 枫fēng 叶yè 一yī 枚méi 邮yóu 票piào 飘piāo 哇wa 哇wa 凉liáng 爽shuǎng " +
  "金jīn 黄huáng 色sè 看kàn 海hǎi 洋yáng 丰fēng 收shōu 歌gē 曲qǔ 钥yào 匙shi 大dà 门mén 秋qiū " +
  "天tiān 的de 雨yǔ 是shì 一yī 把bǎ 钥yào 匙shi 它tā 带dài 着zhe 清qīng 凉liáng 和hé 温wēn 柔róu " +
  "轻qīng 轻qīng 地de 趁chèn 你nǐ 没méi 留liú 意yì 把bǎ 秋qiū 天tiān 的de 大dà 门mén 打dǎ 开kāi 了le";

const DICT = Object.create(null);
// 1) 全量字库兜底（未收录的字不注音）
FULL.split(/\s+/).forEach((token) => {
  if (!token) return;
  const ch = token[0];
  const py = token.slice(1);
  if (ch && py && DICT[ch] === undefined) DICT[ch] = py;
});
// 2) 手调常用音覆盖（多音字按课文常用读音；RAW 内首见优先）
const rawSeen = Object.create(null);
RAW.split(/\s+/).forEach((token) => {
  if (!token) return;
  const ch = token[0];
  const py = token.slice(1);
  if (ch && py && !rawSeen[ch]) {
    rawSeen[ch] = 1;
    DICT[ch] = py;
  }
});

// 标点集合（用于渲染时不显示拼音）
const PUNCT = "，。！？；：、“”‘’（）《》…—·,.!?;:\"'()[]<>-~ ";

function getPinyin(ch) {
  return DICT[ch] || "";
}

function isPunct(ch) {
  return PUNCT.indexOf(ch) > -1;
}

function has(ch) {
  return !!DICT[ch];
}

module.exports = { getPinyin, isPunct, has, DICT };
