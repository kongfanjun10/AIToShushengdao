/**
 * 生成 48 个国际音标的「单音」音频（构建期工具，不进小程序运行时）
 *
 * 背景：TTS 读不了 IPA 符号，原实现用代表词（see / car …）代替，
 * 听感上就是"下面第一个例词"，而不是音标本身的音。
 * 这里用 eSpeak NG（meSpeak 的 JS 构建）按**音素**合成单独的音，
 * 再用 lamejs 压成 mp3（22.05kHz 单声道 32kbps，单条 1~2KB），
 * 产物放 shushengdao/sounds/ipa/<slug>.mp3，由 utils/ipaAudio.js 播放。
 *
 * 运行：node tools/gen-ipa-audio.js
 *
 * 说明：
 *  - 浊爆破音（b/d/g）单独发只有几毫秒的"浊音横杠"，几乎听不见，
 *    所以合成 b@/d@/g@ 后切掉后面的弱元音，保留爆破 + 起音（phonics 里常教的 buh/duh/guh 短促版）。
 *  - 每条都在独立子进程里合成：eSpeak 单进程连续合成偶发崩溃，隔离后单条失败不影响整体。
 *  - 校验：代表词 vs「同一批音素拼成的词」波形相关性≈1，证明音素映射（i: / A: / 0 / V …）没写错；
 *    另输出时长/峰值，静音或异常条目标红。
 *
 * 想换成真人录音：把同名 mp3 覆盖进 sounds/ipa/ 即可，代码不用改。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { execFileSync } = require("child_process");

const OUT = path.join(__dirname, "..", "shushengdao", "sounds", "ipa");

/**
 * slug        输出文件名
 * ipa         音标（与 utils/phonetics.js 的 id 一致）
 * phone       eSpeak 音素串（单个音；浊爆破音带一个弱元音，后面会被切掉）
 * cut         只保留开头多少毫秒（浊爆破音用）
 * word/wordPh 校验用：代表词 与 它等价的音素串
 */
const MAP = [
  // 元音 · 长元音 / 短元音 / 双元音（音素写法均已用「代表词 vs 音素串」波形比对校准）
  { slug: "i-long", ipa: "/iː/", phone: "i:", word: "see", wordPh: "s'i:" },
  { slug: "a-long", ipa: "/ɑː/", phone: "A:", word: "car", wordPh: "k'A:" },
  { slug: "o-long", ipa: "/ɔː/", phone: "O:", word: "law", wordPh: "l'O:" },
  { slug: "u-long", ipa: "/uː/", phone: "u:", word: "moon", wordPh: "m'u:n" },
  { slug: "er-long", ipa: "/ɜː/", phone: "3:", word: "bird", wordPh: "b'3:d" },
  { slug: "i-short", ipa: "/ɪ/", phone: "I", word: "sit", wordPh: "s'It" },
  { slug: "e-short", ipa: "/e/", phone: "E", word: "bed", wordPh: "b'Ed" },
  { slug: "ae", ipa: "/æ/", phone: "a", word: "cat", wordPh: "k'at" },
  { slug: "ah", ipa: "/ʌ/", phone: "V", word: "cup", wordPh: "k'Vp" },
  { slug: "o-short", ipa: "/ɒ/", phone: "0", word: "dog", wordPh: "d'0g" },
  { slug: "u-short", ipa: "/ʊ/", phone: "U", word: "book", wordPh: "b'Uk" },
  { slug: "schwa", ipa: "/ə/", phone: "@", word: "teacher", wordPh: "t'i:tS@" },
  { slug: "ei", ipa: "/eɪ/", phone: "eI", word: "day", wordPh: "d'eI" },
  { slug: "ai", ipa: "/aɪ/", phone: "aI", word: "bike", wordPh: "b'aIk" },
  { slug: "oi", ipa: "/ɔɪ/", phone: "OI", word: "boy", wordPh: "b'OI" },
  { slug: "ou", ipa: "/əʊ/", phone: "oU", word: "go", wordPh: "g'oU" },
  { slug: "au", ipa: "/aʊ/", phone: "aU", word: "cow", wordPh: "k'aU" },
  { slug: "ia", ipa: "/ɪə/", phone: "i@", word: "beard", wordPh: "b'i@d" },
  { slug: "ea", ipa: "/eə/", phone: "e@", word: "hair", wordPh: "h'e@" },
  { slug: "ua", ipa: "/ʊə/", phone: "U@", word: "tour", wordPh: "t'U@" },
  // 辅音 · 爆破音：单独发只有几毫秒的爆破，后接弱元音再切掉，得到短促的 puh/tuh/kuh（b/d/g 加浊音横杠）
  { slug: "p", ipa: "/p/", phone: "p@", cut: 95, word: "pen", wordPh: "p'En" },
  { slug: "b", ipa: "/b/", phone: "b@", cut: 130, word: "bag", wordPh: "b'ag" },
  { slug: "t", ipa: "/t/", phone: "t@", cut: 95, word: "tea", wordPh: "t'i:" },
  { slug: "d", ipa: "/d/", phone: "d@", cut: 130, word: "dog", wordPh: "d'0g" },
  { slug: "k", ipa: "/k/", phone: "k@", cut: 95, word: "key", wordPh: "k'i:" },
  { slug: "g", ipa: "/g/", phone: "g@", cut: 130, word: "girl", wordPh: "g'3:l" },
  // 辅音 · 摩擦音（加长音符号，避免 20~60ms 的"咔哒"声）
  { slug: "f", ipa: "/f/", phone: "f:", word: "fish", wordPh: "f'IS" },
  { slug: "v", ipa: "/v/", phone: "v:", word: "very", wordPh: "v'Eri" },
  { slug: "th", ipa: "/θ/", phone: "T:", word: "three", wordPh: "Tr'i:" },
  { slug: "dh", ipa: "/ð/", phone: "D:", word: "this", wordPh: "D'Is" },
  { slug: "s", ipa: "/s/", phone: "s:", word: "sun", wordPh: "s'Vn" },
  { slug: "z", ipa: "/z/", phone: "z:", word: "zoo", wordPh: "z'u:" },
  { slug: "sh", ipa: "/ʃ/", phone: "S:", word: "she", wordPh: "Si:" },
  { slug: "zh", ipa: "/ʒ/", phone: "Z:", word: "vision", wordPh: "v'IZ@n" },
  { slug: "h", ipa: "/h/", phone: "h:", word: "hat", wordPh: "h'at" },
  { slug: "r", ipa: "/r/", phone: "r:", word: "red", wordPh: "r'Ed" },
  // 辅音 · 破擦音
  { slug: "ch", ipa: "/tʃ/", phone: "tS", word: "chair", wordPh: "tS'e@" },
  { slug: "jh", ipa: "/dʒ/", phone: "dZ@", cut: 200, word: "juice", wordPh: "dZ'u:s" },
  { slug: "tr", ipa: "/tr/", phone: "tr", word: "tree", wordPh: "tr'i:" },
  { slug: "dr", ipa: "/dr/", phone: "dr", word: "draw", wordPh: "dr'O:" },
  { slug: "ts", ipa: "/ts/", phone: "ts", word: "cats", wordPh: "k'ats" },
  { slug: "dz", ipa: "/dz/", phone: "dz", word: "beds", wordPh: "b'Edz" },
  // 辅音 · 鼻音 / 舌侧音 / 半元音
  { slug: "m", ipa: "/m/", phone: "m:", word: "mum", wordPh: "m'Vm" },
  { slug: "n", ipa: "/n/", phone: "n@", cut: 130, word: "nose", wordPh: "n'oUz" },
  { slug: "ng", ipa: "/ŋ/", phone: "N:", word: "sing", wordPh: "s'IN" },
  { slug: "l", ipa: "/l/", phone: "l:", word: "leg", wordPh: "l'Eg" },
  { slug: "w", ipa: "/w/", phone: "w:", word: "water", wordPh: "w'O:t@" },
  { slug: "y", ipa: "/j/", phone: "j:", word: "yes", wordPh: "j'Es" },
];

/* ---------------- 合成引擎 ---------------- */

function engine() {
  const meSpeak = require("mespeak");
  meSpeak.loadConfig(require("mespeak/src/mespeak_config.json"));
  meSpeak.loadVoice(require("mespeak/voices/en/en-rp.json")); // 英式发音，对应 48 音标体系
  return meSpeak;
}

function synth(meSpeak, text) {
  const arr = meSpeak.speak(text, { rawdata: "array" });
  return arr && arr.length ? Buffer.from(arr) : null;
}

function parseWav(buf) {
  const sr = buf.readUInt32LE(24);
  const data = buf.slice(44);
  const n = Math.floor(data.length / 2);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = data.readInt16LE(i * 2);
  return { sr: sr, s: s };
}

function peakOf(s) {
  let p = 0;
  for (let i = 0; i < s.length; i++) p = Math.max(p, Math.abs(s[i]));
  return p;
}

/** 去首尾静音（留 30ms 余量） */
function trim(s, sr) {
  const p = peakOf(s);
  if (!p) return s;
  const th = p * 0.04;
  let a = 0;
  let b = s.length - 1;
  while (a < s.length && Math.abs(s[a]) < th) a++;
  while (b > a && Math.abs(s[b]) < th) b--;
  const pad = Math.round(sr * 0.03);
  a = Math.max(0, a - pad);
  b = Math.min(s.length - 1, b + pad);
  const out = new Int16Array(b - a + 1);
  for (let i = a; i <= b; i++) out[i - a] = s[i];
  return out;
}

/** 音量归一 + 首尾 4ms 淡入淡出（短促爆破音也能听清，不炸耳） */
function polish(s, sr, level) {
  const p = peakOf(s);
  if (!p) return s;
  const gain = (level * 32767) / p;
  const out = new Int16Array(s.length);
  const fade = Math.max(1, Math.round(sr * 0.004));
  for (let i = 0; i < s.length; i++) {
    let g = gain;
    if (i < fade) g *= i / fade;
    const tail = s.length - 1 - i;
    if (tail < fade) g *= tail / fade;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(s[i] * g)));
  }
  return out;
}

function corr(x, y) {
  let best = -1;
  for (let lag = -2000; lag <= 2000; lag += 4) {
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < x.length; i += 7) {
      const j = i + lag;
      if (j < 0 || j >= y.length) continue;
      num += x[i] * y[j];
      dx += x[i] * x[i];
      dy += y[j] * y[j];
    }
    const c = num / Math.sqrt(dx * dy || 1);
    if (c > best) best = c;
  }
  return best;
}

function loadLame() {
  const file = path.join(
    __dirname,
    "node_modules",
    "@breezystack",
    "lamejs",
    "dist",
    "lamejs.iife.js"
  );
  const sb = { console: console };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(file, "utf8"), sb);
  return sb.lamejs;
}

function toMp3(lame, samples, sr, kbps) {
  const enc = new lame.Mp3Encoder(1, sr, kbps);
  const chunks = [];
  const block = 1152;
  for (let i = 0; i < samples.length; i += block) {
    const slice = samples.subarray(i, Math.min(samples.length, i + block));
    const buf = enc.encodeBuffer(slice);
    if (buf.length) chunks.push(Buffer.from(buf));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

/* ---------------- 单条合成（子进程模式） ---------------- */

function buildOne(slug) {
  const it = MAP.filter((x) => x.slug === slug)[0];
  if (!it) return null;
  const meSpeak = engine();

  // 先做映射校验（eSpeak 连续合成不同文本会改内部状态，校验必须在单音合成之前）
  let c = 1;
  const wb = synth(meSpeak, it.word);
  const pb = synth(meSpeak, "[[" + it.wordPh + "]]");
  if (wb && pb) {
    const a = parseWav(wb);
    const b = parseWav(pb);
    if (a.sr === b.sr) c = corr(trim(a.s, a.sr), trim(b.s, b.sr));
    else c = 0;
  }

  const raw = synth(meSpeak, "[[" + it.phone + "]]");
  if (!raw) return { slug: slug, ipa: it.ipa, err: "SYNTH_NULL" };
  const wav = parseWav(raw);
  let s = trim(wav.s, wav.sr);
  if (it.cut) {
    const n = Math.min(s.length, Math.round((wav.sr * it.cut) / 1000));
    s = s.slice(0, n);
  }
  s = polish(s, wav.sr, 0.78);

  const lame = loadLame();
  const mp3 = toMp3(lame, s, wav.sr, 32);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, slug + ".mp3"), mp3);
  return {
    slug: slug,
    ipa: it.ipa,
    ms: Math.round((s.length / wav.sr) * 1000),
    peak: peakOf(s),
    bytes: mp3.length,
    corr: Number(c.toFixed(3)),
  };
}

/* ---------------- 主流程 ---------------- */

if (process.argv[2] === "--one") {
  const r = buildOne(process.argv[3]);
  process.stdout.write("@@JSON@@" + JSON.stringify(r));
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });

const report = [];
let bad = 0;

MAP.forEach((it) => {
  let r = null;
  try {
    const out = execFileSync(process.execPath, [__filename, "--one", it.slug], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const mark = out.indexOf("@@JSON@@");
    r = mark >= 0 ? JSON.parse(out.slice(mark + 8)) : null;
  } catch (e) {
    r = null;
  }
  if (!r || r.err) {
    bad += 1;
    console.log("✗ " + it.ipa.padEnd(5) + " " + it.slug.padEnd(8) + " 合成失败");
    return;
  }
  report.push(r);
  const odd = r.peak < 3000 || r.ms < 60 || r.corr < 0.9;
  if (odd) bad += 1;
  console.log(
    (odd ? "!" : "✓") +
      " " +
      r.ipa.padEnd(5) +
      " " +
      r.slug.padEnd(8) +
      String(r.ms).padStart(4) +
      "ms  " +
      String(r.bytes).padStart(4) +
      "B  corr " +
      r.corr.toFixed(2)
  );
});

const total = report.reduce((n, r) => n + r.bytes, 0);
const durs = report.map((r) => r.ms).sort((a, b) => a - b);
console.log(
  "\n共 " +
    report.length +
    " 条，合计 " +
    (total / 1024).toFixed(1) +
    " KB，时长 " +
    durs[0] +
    "~" +
    durs[durs.length - 1] +
    "ms"
);
console.log(bad ? "需要复看 " + bad + " 条" : "全部正常");

fs.writeFileSync(path.join(__dirname, "ipa-audio-report.json"), JSON.stringify(report, null, 1));
