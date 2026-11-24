/**
 * 拼音歌时间轴对齐分析（人工核对用，不参与小程序运行）
 * 解码 mp3 → 单声道能量包络（20ms 步长）→ 按静音段切出「语音块」，
 * 用于核对/修正 songs.js 里每行歌词的 t0/t1（对不上、漏歌词就靠它找真界）。
 * 运行：node tools/song-align.js [mp3路径] [起始秒] [结束秒]
 */
const fs = require("fs");
const path = require("path");
const { MPEGDecoder } = require(path.join(__dirname, "node_modules", "mpg123-decoder"));

async function loadPcm(file) {
  const dec = new MPEGDecoder();
  await dec.ready;
  const buf = fs.readFileSync(file);
  const res = dec.decode(new Uint8Array(buf));
  dec.free();
  const chs = res.channelData || [];
  const sr = res.sampleRate;
  const n = chs[0].length;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < chs.length; c++) s += chs[c][i];
    mono[i] = s / chs.length;
  }
  return { mono, sr };
}

function speechBlocks(x, sr, opts) {
  const o = opts || {};
  const hop = 0.02;
  const win = 0.05;
  const h = Math.round(hop * sr);
  const L = Math.round(win * sr);
  const m = Math.max(1, Math.floor((x.length - L) / h));
  const energy = [];
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < L; j++) {
      const v = x[i * h + j];
      s += v * v;
    }
    energy.push(Math.sqrt(s / L));
  }
  const maxE = Math.max.apply(null, energy);
  const thr = (o.rel || 0.12) * maxE; // 相对门限：低于峰值 12% 视为静音
  const minSil = Math.round((o.minSil || 0.22) / hop); // 静音至少 0.22s 才算块间停顿
  const minSpk = Math.round((o.minSpk || 0.25) / hop); // 语音块至少 0.25s
  const blocks = [];
  let inSpk = false;
  let start = 0;
  let sil = 0;
  for (let i = 0; i < energy.length; i++) {
    const spk = energy[i] >= thr;
    if (spk) {
      if (!inSpk) {
        inSpk = true;
        start = i;
      }
      sil = 0;
    } else if (inSpk) {
      sil += 1;
      if (sil >= minSil) {
        const end = i - sil;
        if (end - start >= minSpk) blocks.push([start, end]);
        inSpk = false;
        sil = 0;
      }
    }
  }
  if (inSpk && energy.length - start >= minSpk) blocks.push([start, energy.length - 1]);
  return blocks.map(([a, b]) => [a * hop, b * hop + win]);
}

function fftMag(re, im) {
  const n = re.length;
  // 迭代式 radix-2 FFT
  const j = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 1; b < n; b <<= 1) {
      r = (r << 1) | ((i & b) ? 1 : 0);
    }
    j[i] = r;
  }
  for (let i = 0; i < n; i++) {
    if (j[i] > i) {
      let t = re[i]; re[i] = re[j[i]]; re[j[i]] = t;
      t = im[i]; im[i] = im[j[i]]; im[j[i]] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** 人声频段（300~3400Hz）能量：伴奏的低音/高频打击被滤掉，口播停顿更容易露出来 */
function voiceEnergy(x, sr) {
  const N = 2048;
  const hop = Math.round(0.02 * sr);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const bins = N / 2;
  const freqPerBin = sr / N;
  const lo = Math.max(1, Math.floor(300 / freqPerBin));
  const hi = Math.min(bins - 1, Math.ceil(3400 / freqPerBin));
  const out = [];
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * hann[i];
      im[i] = 0;
    }
    fftMag(re, im);
    let e = 0;
    for (let b = lo; b <= hi; b++) e += re[b] * re[b] + im[b] * im[b];
    out.push(Math.sqrt(e / (hi - lo + 1)));
  }
  return { energy: out, hopSec: hop / sr };
}

function speechBlocksV(x, sr, opts) {
  const o = opts || {};
  const { energy, hopSec } = voiceEnergy(x, sr);
  const maxE = Math.max.apply(null, energy);
  const thr = (o.rel || 0.3) * maxE;
  const minSil = (o.minSil || 0.22) / hopSec;
  const minSpk = (o.minSpk || 0.25) / hopSec;
  const blocks = [];
  let inSpk = false;
  let start = 0;
  let sil = 0;
  for (let i = 0; i < energy.length; i++) {
    const spk = energy[i] >= thr;
    if (spk) {
      if (!inSpk) {
        inSpk = true;
        start = i;
      }
      sil = 0;
    } else if (inSpk) {
      sil += 1;
      if (sil >= minSil) {
        const end = i - sil;
        if (end - start >= minSpk) blocks.push([start, end]);
        inSpk = false;
        sil = 0;
      }
    }
  }
  if (inSpk && energy.length - start >= minSpk) blocks.push([start, energy.length - 1]);
  return blocks.map(([a, b]) => [a * hopSec, b * hopSec + 2048 / sr]);
}

/** 谱通量起音检测：数一个块里实际念了几个音节 */
function onsets(x, sr, opts) {
  const o = opts || {};
  const { energy, hopSec } = voiceEnergy(x, sr);
  // 谱通量：能量上升沿
  const flux = new Float32Array(energy.length);
  for (let i = 1; i < energy.length; i++) {
    const d = energy[i] - energy[i - 1];
    flux[i] = d > 0 ? d : 0;
  }
  let maxF = 0;
  for (let i = 0; i < flux.length; i++) maxF = Math.max(maxF, flux[i]);
  const thr = (o.rel || 0.12) * maxF;
  const minGap = (o.minGap || 0.14) / hopSec;
  const peaks = [];
  let i = 1;
  while (i < flux.length - 1) {
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] > minGap) peaks.push(i);
      else if (flux[i] > flux[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
    }
    i += 1;
  }
  return peaks.map((p) => p * hopSec);
}

async function main() {
  const file = process.argv[2] || path.join(__dirname, "..", "shushengdao", "pkgLearn", "sounds", "songs", "pinyin_song.mp3");
  const from = Number(process.argv[3]) || 0;
  const to = Number(process.argv[4]) || 0;
  const { mono, sr } = await loadPcm(file);
  const dur = mono.length / sr;
  console.log("时长 " + dur.toFixed(2) + "s  采样率 " + sr);
  const seg = to > from ? mono.subarray(Math.floor(from * sr), Math.floor(to * sr)) : mono;
  const off = to > from ? from : 0;
  const mode = process.argv[5] || "blocks";
  if (mode === "onset") {
    const on = onsets(seg, sr, { minGap: Number(process.argv[6]) || 0.14 });
    console.log("起音（音节）" + on.length + " 个：");
    console.log(on.map((t) => (off + t).toFixed(2)).join("  "));
    return;
  }

  for (const rel of [0.2, 0.3, 0.4]) {
    const blocks = speechBlocksV(seg, sr, { rel });
    console.log("\n人声频段 语音块 " + blocks.length + " 个（阈值=峰值" + Math.round(rel * 100) + "%，停顿≥0.22s）：");
    blocks.forEach(([a, b], i) => {
      console.log(
        "  #" + String(i + 1).padStart(2, " ") + "  " +
        (off + a).toFixed(2).padStart(7) + " ~ " + (off + b).toFixed(2).padStart(7) +
        "  (" + (b - a).toFixed(2) + "s)"
      );
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
