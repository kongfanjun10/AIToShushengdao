# -*- coding: utf-8 -*-
"""粗略分析儿歌录音的节奏：谱通量起音检测 + 能量包络
用途：给 songs.js 的每句歌词找真实起止时间（人工核对用，不参与小程序运行）
"""
import sys, wave, numpy as np

def load(path):
    w = wave.open(path, 'rb')
    sr = w.getframerate()
    n = w.getnframes()
    raw = w.readframes(n)
    x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
    w.close()
    return x, sr

def frames(x, sr, hop=0.01, win=0.04):
    h = int(hop * sr); L = int(win * sr)
    m = 1 + max(0, (len(x) - L) // h)
    idx = np.arange(L)[None, :] + h * np.arange(m)[:, None]
    return x[idx]

def flux(x, sr):
    F = frames(x, sr)
    W = np.hanning(F.shape[1])[None, :]
    S = np.abs(np.fft.rfft(F * W, axis=1))
    freqs = np.fft.rfftfreq(F.shape[1], 1.0 / sr)
    band = (freqs > 250) & (freqs < 4000)
    S = S[:, band]
    d = np.diff(S, axis=0)
    d[d < 0] = 0
    o = d.sum(axis=1)
    o = o / (o.max() + 1e-9)
    # 平滑
    k = np.ones(5) / 5.0
    return np.convolve(o, k, mode='same')

def peaks(env, sr, hop=0.01, min_gap=0.14, thr=0.12):
    out = []
    n = len(env)
    gap = int(min_gap / hop)
    i = 1
    while i < n - 1:
        if env[i] > thr and env[i] >= env[i - 1] and env[i] >= env[i + 1]:
            if not out or i - out[-1] > gap:
                out.append(i)
            elif env[i] > env[out[-1]]:
                out[-1] = i
        i += 1
    return [p * hop for p in out]

def rms(x, sr, hop=0.02, win=0.05):
    F = frames(x, sr, hop, win)
    e = np.sqrt((F ** 2).mean(axis=1))
    db = 20 * np.log10(e + 1e-9)
    return e, db, hop

if __name__ == '__main__':
    path = sys.argv[1]
    a, b = float(sys.argv[2]), float(sys.argv[3])
    mode = sys.argv[4] if len(sys.argv) > 4 else 'onset'
    x, sr = load(path)
    x = x[int(a * sr):int(b * sr)]
    if mode == 'onset':
        env = flux(x, sr)
        ps = peaks(env, sr)
        ps = [round(a + p, 2) for p in ps]
        print('起音 %d 个：' % len(ps))
        print(ps)
        # 相邻间隔
        gaps = [round(ps[i + 1] - ps[i], 2) for i in range(len(ps) - 1)]
        print('间隔：', gaps)
    else:
        e, db, hop = rms(x, sr)
        step = int(0.25 / hop)
        line = []
        for i in range(0, len(db), step):
            seg = db[i:i + step]
            if len(seg) < 2:
                continue
            line.append('%5.1f:%5.1f' % (a + i * hop, seg.max()))
        for i in range(0, len(line), 6):
            print('  '.join(line[i:i + 6]))
