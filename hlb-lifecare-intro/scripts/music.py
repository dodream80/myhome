"""HLB라이프케어 소개 영상용 배경음악을 numpy로 직접 합성한다 (샘플·AI 생성 없음).

96 BPM, 한 마디 2.5초. 장면 경계(7.5, 17.5, 27.5, 40, 50, 57.5초)는 src/main.js의 SCENES와 같다.

    python3 scripts/music.py build/music.wav
"""
import sys
import wave

import numpy as np

SR = 48000
DURATION = 65.0
N = int(SR * DURATION)
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
TAU = 2 * np.pi
SCENE_CUTS = [7.5, 17.5, 27.5, 40.0, 50.0, 57.5]

rng = np.random.default_rng(20240709)

# 마디별 코드 (IV - V - vi - I 진행, 마지막은 F - G - C로 종지)
CHORDS = {
    'F': (41, [57, 60, 64, 67]),
    'G': (43, [59, 62, 64, 67]),
    'Am': (45, [60, 64, 67, 71]),
    'C': (36, [64, 67, 71, 74]),
}
PROG = ['F', 'G', 'Am', 'C']
NBARS = int(round(DURATION / BAR))  # 26
BAR_CHORDS = [PROG[b % 4] for b in range(NBARS)]
BAR_CHORDS[23:26] = ['F', 'G', 'C']


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def fft_band(x, lo=None, hi=None, slope=1.4):
    """주파수 영역의 부드러운 대역 필터 (zero-phase)."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (2 * slope))
    if hi:
        g *= 1 / (1 + (f / hi) ** (2 * slope))
    return np.fft.irfft(X * g, n)


def env(n, a=0.01, r=0.3, hold=None):
    """attack → hold → release 선형/지수 엔벌로프."""
    t = tt(n)
    e = np.minimum(1, t / max(a, 1e-4))
    if hold is not None:
        rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
        e *= (1 - rel) ** 2
    return e


class Bus:
    def __init__(self):
        self.L = np.zeros(N + SR * 4)
        self.R = np.zeros(N + SR * 4)

    def add(self, y, t0, pan=0.0, gain=1.0):
        i = int(round(t0 * SR))
        if i >= N:
            return
        y = y * gain
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        j = min(len(self.L), i + len(y))
        self.L[i:j] += y[: j - i] * gl * np.sqrt(2)
        self.R[i:j] += y[: j - i] * gr * np.sqrt(2)


# ───────────────────────── instruments ─────────────────────────
def pad_voice(freq, dur, bright=1.0):
    n = int(dur * SR)
    t = tt(n)
    out = np.zeros(n)
    ph = rng.random() * TAU
    for k in range(1, 16):
        if freq * k > 8000:
            break
        amp = (1 / k) * np.exp(-(k - 1) / (2.6 * bright))
        vib = 1 + 0.0015 * np.sin(TAU * 0.3 * t + k)
        out += amp * np.sin(TAU * freq * k * t * vib + ph * k)
    return out


def pluck(freq, dur=0.9, ratio=2.0, index=1.4, decay=0.32):
    n = int(dur * SR)
    t = tt(n)
    idx = index * np.exp(-t / 0.08)
    y = np.sin(TAU * freq * t + idx * np.sin(TAU * freq * ratio * t))
    y += 0.3 * np.sin(TAU * freq * 2 * t) * np.exp(-t / 0.12)
    return y * np.exp(-t / decay) * np.minimum(1, t / 0.003)


def bell(freq, dur=2.4, decay=0.9):
    n = int(dur * SR)
    t = tt(n)
    idx = 2.2 * np.exp(-t / 0.25)
    y = np.sin(TAU * freq * t + idx * np.sin(TAU * freq * 3.5 * t))
    y += 0.25 * np.sin(TAU * freq * 4.01 * t) * np.exp(-t / 0.3)
    return fft_band(y * np.exp(-t / decay) * np.minimum(1, t / 0.004), hi=9000)


def bass_note(freq, dur):
    n = int(dur * SR)
    t = tt(n)
    y = np.sin(TAU * freq * t) + 0.35 * np.sin(TAU * freq * 2 * t) + 0.12 * np.sin(TAU * freq * 3 * t)
    return y * np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.9))


def kick():
    n = int(0.5 * SR)
    t = tt(n)
    f = 44 + 90 * np.exp(-t / 0.035)
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = fft_band(rng.standard_normal(n), lo=1500) * np.exp(-t / 0.004) * 0.15
    return np.tanh(1.4 * (y + click))


def hat(open_=False):
    n = int((0.25 if open_ else 0.08) * SR)
    t = tt(n)
    y = fft_band(rng.standard_normal(n), lo=7000, hi=16000)
    return y / np.max(np.abs(y)) * np.exp(-t / (0.08 if open_ else 0.022))


def clap():
    n = int(0.35 * SR)
    t = tt(n)
    y = fft_band(rng.standard_normal(n), lo=900, hi=4500)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        e += np.where(t >= d, np.exp(-(t - d) / 0.012), 0) * 0.6
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.09), 0)
    return y / np.max(np.abs(y)) * e


def riser(dur):
    n = int(dur * SR)
    t = tt(n)
    noise = rng.standard_normal(n)
    bands = [fft_band(noise, lo, hi) for lo, hi in ((250, 700), (700, 1800), (1800, 4500), (4500, 11000))]
    x = t / dur
    out = np.zeros(n)
    for i, b in enumerate(bands):
        c = i / 3
        out += b * np.exp(-((x - c) / 0.33) ** 2)
    sweep = np.sin(TAU * np.cumsum(220 + 900 * x ** 2) / SR) * 0.08
    return (out / np.max(np.abs(out)) + sweep) * x ** 2.2


def impact():
    n = int(2.0 * SR)
    t = tt(n)
    f = 32 + 60 * np.exp(-t / 0.12)
    boom = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    air = fft_band(rng.standard_normal(n), hi=2500) * np.exp(-t / 0.25) * 0.25
    return np.tanh(1.2 * (boom + air))


def blip(freq=1760, dur=0.25):
    n = int(dur * SR)
    t = tt(n)
    return (np.sin(TAU * freq * t) + 0.3 * np.sin(TAU * freq * 2 * t)) * np.exp(-t / 0.05) * np.minimum(1, t / 0.002)


def shimmer(dur=3.0):
    """로고 등장 때 반짝이는 상행 벨 글리산도."""
    n = int(dur * SR)
    y = np.zeros(n)
    notes = [72, 76, 79, 83, 84, 88, 91, 95]
    for i, m in enumerate(notes):
        s = int(i * 0.06 * SR)
        b = bell(mtof(m), dur=dur - i * 0.06, decay=0.7) * (0.9 - i * 0.07)
        y[s:s + len(b)] += b[: n - s]
    return y


# ───────────────────────── arrangement ─────────────────────────
pad, arp, lead, bass, drums, sfx = (Bus() for _ in range(6))
bar_t = lambda b: b * BAR

# 패드: 처음 3마디는 어둡게 시작해 점점 밝아짐
for b in range(NBARS):
    root, notes = CHORDS[BAR_CHORDS[b]]
    last = b == NBARS - 1
    dur = BAR + (2.5 if last else 1.2)
    bright = 0.55 + 0.45 * min(1, b / 3)
    lvl = 0.5 if b < 23 else 0.62
    for i, m in enumerate(notes):
        for det, pan in ((-0.07, -0.55), (0.0, 0.0), (0.06, 0.55)):
            v = pad_voice(mtof(m) * 2 ** (det / 12), dur, bright)
            v *= env(len(v), a=0.6 if b else 1.8, r=1.2, hold=dur - 1.2)
            pad.add(v, bar_t(b), pan=pan + (i - 1.5) * 0.05, gain=0.045 * lvl)
    # 서브 저음 패드
    sub = np.sin(TAU * mtof(root - 12 if root > 40 else root) * tt(int(dur * SR)))
    sub *= env(len(sub), a=0.5, r=1.0, hold=dur - 1.0)
    if b >= 1:
        pad.add(sub, bar_t(b), gain=0.06)

# 아르페지오
ARP_ORDER = [0, 1, 2, 3, 4, 3, 2, 1]
for b in range(1, NBARS):
    _, notes = CHORDS[BAR_CHORDS[b]]
    tones = [m + 12 for m in notes] + [notes[0] + 24]
    if b < 3 or b >= 23:
        step, vel = BEAT, 0.55
    elif b < 7:
        step, vel = BEAT / 2, 0.5
    else:
        step, vel = BEAT / 4, 0.38
    k = 0
    tb = 0.0
    while tb < BAR - 1e-6:
        m = tones[ARP_ORDER[k % len(ARP_ORDER)]]
        accent = 1.0 if (tb % BEAT) < 1e-6 else 0.72
        if b >= 23 and b == NBARS - 1 and tb > BEAT * 1.5:
            break
        arp.add(pluck(mtof(m)), bar_t(b) + tb, pan=0.35 if k % 2 else -0.35, gain=0.11 * vel * accent)
        k += 1
        tb += step

# 리드 멜로디 (제품·핵심사업 구간)
MELODY = [
    (0, 0, 72, 1.5), (0, 1.5, 74, 0.5), (0, 2, 76, 2),
    (1, 0, 74, 1.5), (1, 1.5, 71, 0.5), (1, 2, 67, 2),
    (2, 0, 72, 1), (2, 1, 76, 1), (2, 2, 79, 1.5), (2, 3.5, 76, 0.5),
    (3, 0, 74, 2), (3, 2, 72, 2),
]
for start_bar, octave, gain in ((11, 12, 0.10), (16, 12, 0.09), (20, 24, 0.06)):
    for bo, beat, m, d in MELODY:
        b = start_bar + bo
        if b >= 23:
            continue
        t0 = bar_t(b) + beat * BEAT
        note = bell(mtof(m + octave - 12), dur=max(1.2, d * BEAT + 1.0), decay=0.6 + 0.25 * d)
        lead.add(note, t0, pan=-0.1, gain=gain)
        lead.add(note * 0.35, t0 + 0.75 * BEAT, pan=0.6, gain=gain)       # 점8분 딜레이
        lead.add(note * 0.15, t0 + 1.5 * BEAT, pan=-0.6, gain=gain)

# 베이스 + 드럼 + 사이드체인
kick_times = []
K, CL = kick(), clap()
for b in range(3, 23):
    root, _ = CHORDS[BAR_CHORDS[b]]
    for e8 in range(8):
        t0 = bar_t(b) + e8 * BEAT / 2
        if b == 22 and e8 >= 6:
            continue
        m = root + (12 if e8 in (3, 7) and b >= 7 else 0)
        bass.add(bass_note(mtof(m), BEAT / 2 * 0.95), t0, gain=0.16 if b >= 7 else 0.12)
    for beat in range(4):
        t0 = bar_t(b) + beat * BEAT
        if b < 7 and beat % 2 == 1:
            continue
        if b == 22 and beat >= 2:
            continue
        drums.add(K, t0, gain=0.42 if b >= 7 else 0.32)
        kick_times.append(t0)
        if b >= 7:
            drums.add(hat(), t0 + BEAT / 2, pan=0.25, gain=0.09)
        if b >= 11:
            drums.add(hat(), t0 + BEAT / 4, pan=-0.2, gain=0.035)
            drums.add(hat(), t0 + 3 * BEAT / 4, pan=-0.2, gain=0.035)
            if beat % 2 == 1:
                drums.add(CL, t0, pan=0.05, gain=0.16)
    if b in (10, 15, 19):  # 구간 마지막 마디 오픈 하이햇
        drums.add(hat(True), bar_t(b) + 3.5 * BEAT, pan=0.3, gain=0.07)

# 효과음: 장면 전환 라이저/임팩트, 로고 반짝임, 타임라인·스펙 카드 등장음
for c in SCENE_CUTS:
    d = 1.6 if c in (27.5, 57.5) else 1.0
    sfx.add(riser(d), c - d, gain=0.10 if d > 1 else 0.06)
for c in (27.5, 57.5):
    sfx.add(impact(), c, gain=0.32)
sfx.add(impact(), 0.15, gain=0.2)
sfx.add(shimmer(3.5), 3.0, gain=0.07)
sfx.add(shimmer(3.5), 57.5 + 0.7, gain=0.06)
for i in range(4):                       # 타임라인 노드
    sfx.add(blip(1568 * 2 ** (i * 2 / 12)), 7.5 + 1.3 + i * 1.6, pan=-0.4 + i * 0.27, gain=0.05)
for i in range(4):                       # 피코링 스펙 카드
    sfx.add(blip(2093 * 2 ** (i * 2 / 12), 0.2), 27.5 + 7.0 + i * 0.3, pan=-0.3 + i * 0.2, gain=0.04)
sfx.add(blip(1318, 0.4), 27.5 + 1.9, gain=0.06)  # 허가 배지

# 사이드체인 (킥에 맞춰 패드·베이스를 살짝 눌러 펌핑감)
sc = np.ones(len(pad.L))
tt_all = tt(len(sc))
for k in kick_times:
    i = int(k * SR)
    j = min(len(sc), i + int(0.4 * SR))
    sc[i:j] = np.minimum(sc[i:j], 1 - 0.55 * np.exp(-tt_all[: j - i] / 0.11))
for bus in (pad, bass, arp):
    bus.L *= sc
    bus.R *= sc


# ───────────────────────── reverb & master ─────────────────────────
def reverb_ir(seconds=2.8, tau=0.55):
    n = int(seconds * SR)
    t = tt(n)
    irs = []
    for _ in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / tau)
        ir = fft_band(ir, lo=180, hi=6500)
        ir[: int(0.018 * SR)] = 0
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    nf = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(ir, nf), nf)[: len(x)]


irL, irR = reverb_ir()
send = {pad: 0.35, arp: 0.4, lead: 0.55, sfx: 0.5, drums: 0.08, bass: 0.0}
dryL = sum(b.L for b in send)
dryR = sum(b.R for b in send)
wetInL = sum(b.L * s for b, s in send.items())
wetInR = sum(b.R * s for b, s in send.items())
L = dryL + 0.9 * convolve(wetInL, irL)
R = dryR + 0.9 * convolve(wetInR, irR)
L, R = L[:N], R[:N]

# 버스 컴프 느낌의 소프트 클립 + 정규화 + 페이드
mix = np.stack([L, R], axis=1)
mix /= np.percentile(np.abs(mix), 99.95)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix /= np.max(np.abs(mix)) / 0.6   # 약 -15 LUFS, 피크 -4.4 dBFS
t = tt(N)
fade = np.minimum(1, t / 0.4) * np.clip((DURATION - t) / 1.4, 0, 1) ** 1.5
mix *= fade[:, None]

out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'music → {out}  ({DURATION:.1f}s, {SR} Hz stereo)')
