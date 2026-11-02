#!/usr/bin/env python3
"""Offline renderer for Idle Cash & Cartel audio. Run: python3 tools/gen_audio.py
Writes mono OGG files into assets/audio/ (numpy/scipy + ffmpeg)."""
import numpy as np, subprocess, os, wave as wavmod
from scipy import signal
SR = 32000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def T(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.uniform(-1, 1, int(d * SR))
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, min(f, SR * .49), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return signal.sosfilt(signal.butter(o, [a, min(b, SR * .49)], 'band', fs=SR, output='sos'), x)
def env(d, a=0.001, k=20):
    t = T(d); e = np.exp(-k * t); n = max(1, int(a * SR)); e[:n] *= np.linspace(0, 1, n); return e
def sweep_lp(x, f0, f1):
    """time-varying one-pole lowpass (2 cascaded)"""
    n = len(x); fc = np.geomspace(f0, f1, n); a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.zeros(n); z1 = z2 = 0.0
    for i in range(n):
        z1 += a[i] * (x[i] - z1); z2 += a[i] * (z1 - z2); y[i] = z2
    return y
def pad(x, n):
    o = np.zeros(n); m = min(n, len(x)); o[:m] = x[:m]; return o
def mix(n, *parts):
    o = np.zeros(n)
    for off, p in parts:
        i = int(off * SR)
        if i >= n: continue
        m = min(len(p), n - i); o[i:i + m] += p[:m]
    return o
def ir(d, damp=3500, k=None):
    t = T(d); k = k or 6.9 / d
    x = noise(d) * np.exp(-k * t); x = lp(x, damp, 1)
    x[:int(.012 * SR)] *= np.linspace(0, 1, int(.012 * SR)); return x / np.sqrt(np.sum(x ** 2))
def reverb(x, wet=.3, d=1.2, damp=3500, tail=None):
    r = ir(d, damp); y = signal.fftconvolve(x, r)[:len(x) + int(d * SR)] 
    x = pad(x, len(y)); return x * (1 - wet * .5) + y * wet * 2.2
def norm(x, peak=.9): m = np.max(np.abs(x)) or 1; return x / m * peak
def fade(x, ms=8):
    n = int(ms / 1000 * SR); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def trim(x, thr=.002):
    idx = np.where(np.abs(x) > thr)[0]; return x[:idx[-1] + 1] if len(idx) else x
def softclip(x, g=1.0): return np.tanh(x * g)

def save(name, x, peak=.9, q=3):
    x = norm(trim(x), peak); x = fade(x, 12)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    wav = os.path.join(OUT, name + '.wav')
    with wavmod.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    ogg = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', str(q), ogg], check=True)
    os.remove(wav); print(name, os.path.getsize(ogg) // 1024, 'KB', round(len(x) / SR, 2), 's')

# ---------- gunshots ----------
def gunshot(v):
    d = 1.1; n = int(d * SR)
    crack = hp(noise(.02), 1500) * env(.02, .0003, 150) * 1.2
    body = sweep_lp(noise(.25), 7000 - v * 800, 400) * env(.25, .0005, 14 + v * 3)
    t = T(.12); f = 130 - v * 12; thump = np.sin(2 * np.pi * np.cumsum(f * np.exp(-t * 18) + 45) / SR) * env(.12, .001, 22)
    mech = bp(noise(.03), 2500, 6000) * env(.03, .001, 90) * .15  # metallic slide
    dry = mix(n, (0, crack * 1.1), (0, body * 1.0), (0, thump * .9), (.012, mech))
    dry = softclip(dry, 1.6)
    return reverb(dry, .35, .9, 2800)
for i in range(3): save('shoot%d' % i, gunshot(i), .85)

def hit(v):
    d = .22; b = lp(noise(d), 1200 + v * 300) * env(d, .001, 28)
    t = T(d); th = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 20) + 55 - v * 6) / SR) * env(d, .001, 24)
    x = softclip(b * .8 + th * 1.0, 1.4)
    return reverb(x, .15, .35, 2000)
for i in range(2): save('hit%d' % i, hit(i), .8)

def explode():
    d = 2.6; n = int(d * SR)
    blast = sweep_lp(noise(1.5), 6000, 90) * env(1.5, .002, 3.2)
    t = T(1.6); sub = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 2.5) + 28) / SR) * env(1.6, .003, 2.2)
    crack = hp(noise(.05), 800) * env(.05, .0005, 60)
    rumble = lp(noise(2.2), 180) * env(2.2, .1, 1.7) * 2.5
    dry = softclip(mix(n, (0, blast * 1.1), (0, sub * 1.4), (0, crack * .8), (.03, rumble)), 1.4)
    return reverb(dry, .4, 1.8, 2200)
save('explode', explode(), .95)

def hurt():
    d = .6; n = int(d * SR)
    t = T(d); th = np.sin(2 * np.pi * np.cumsum(95 * np.exp(-t * 9) + 48) / SR) * env(d, .001, 8)
    b = lp(noise(d), 900) * env(d, .001, 14)
    # muffled thud + dull 'ring'
    ring = np.sin(2 * np.pi * 410 * t) * env(d, .01, 10) * .08 + np.sin(2 * np.pi * 620 * t) * env(d, .01, 12) * .05
    return reverb(softclip(th * 1.1 + b * .6 + ring, 1.3), .2, .5, 1800)
save('hurt', hurt(), .9)

# ---------- UI ----------
def click():
    d = .09; t = T(d)
    th = np.sin(2 * np.pi * np.cumsum(260 * np.exp(-t * 60) + 150) / SR) * env(d, .0005, 55)
    tick = bp(noise(d), 1800, 5000) * env(d, .0002, 220) * .25
    return th * .9 + tick
save('click', click(), .55)

def clink(f, d=.5, a=1.0, k=9):
    t = T(d); x = np.zeros(len(t))
    for r, g in ((1, 1), (2.76, .6), (5.4, .35), (8.93, .2)):
        x += g * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6)) * np.exp(-t * k * (1 + .35 * r))
    x += pad(hp(noise(.02), 4000) * env(.02, .0002, 150), len(t))
    return x * a
def coin():
    n = int(.9 * SR)
    x = mix(n, (0, clink(2350, .5, 1, 8)), (.055, clink(3120, .7, .8, 7)), (.11, clink(2700, .6, .45, 8)))
    return reverb(x, .12, .35, 6000)
save('coin', coin(), .7)

def buy():
    n = int(1.6 * SR)
    # drawer thud + latch click + bell ding (cash register)
    t = T(.15); thud = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 30) + 70) / SR) * env(.15, .001, 28)
    latch = hp(noise(.03), 2000) * env(.03, .0002, 150)
    ding = mix(int(1.3*SR), (0, clink(2093, 1.3, .9, 3.2)), (0, clink(3136, 1.0, .5, 4)))
    x = mix(n, (0, thud * .9), (0, latch * .8), (.07, clink(1500, .3, .4, 14)), (.14, ding * .8), (.17, clink(2900, .4, .3, 10)))
    return reverb(x, .2, .6, 5000)
save('buy', buy(), .8)

# ---------- melodic ----------
def mf(m): return 440 * 2 ** ((m - 69) / 12)
def piano(m, d=2.5, vel=1.0, bright=1.0):
    f = mf(m); t = T(d); x = np.zeros(len(t))
    for h in range(1, 9):
        fh = f * h * np.sqrt(1 + 0.0004 * h * h)
        if fh > 9000: break
        x += (1 / h ** (1.1 / bright)) * np.sin(2 * np.pi * fh * t + rng.uniform(0, 1)) * np.exp(-t * (1.1 + .55 * h) * (1.6 if m > 72 else 1))
    x *= (1 - np.exp(-t * 900))
    ham = lp(noise(.03), 2200) * env(.03, .0005, 110) * .25 * vel
    return mix(len(t), (0, x * vel), (0, ham)) 
def pluck(m, d=1.6, vel=1.0):
    f = mf(m); t = T(d); x = np.zeros(len(t))
    for h in range(1, 7):
        x += (1 / h) * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (3 + 5 * h))
    return x * vel * 1.2

def levelup():
    n = int(3.2 * SR)  # A minor add9 rising, restrained piano
    notes = [57, 64, 69, 72, 76, 83]
    parts = [(i * .09, piano(m, 2.6, .9 - i * .04, 1.2)) for i, m in enumerate(notes)]
    sub = np.sin(2 * np.pi * mf(45) * T(2.4)) * env(2.4, .01, 1.8) * .5
    x = mix(n, *parts, (0, sub)); return reverb(x, .35, 1.8, 4500)
save('levelup', levelup(), .85)

def boss():
    n = int(3.6 * SR)
    t = T(3.4)
    sub = np.sin(2 * np.pi * np.cumsum(46 + 14 * np.exp(-t * 2.0)) / SR) * env(3.4, .02, 1.0)
    g = softclip(sub * 2.2, 1.0)
    hitn = lp(noise(.8), 400) * env(.8, .001, 6) * 1.6
    bell = mix(int(3*SR), (0, clink(110, 3, .5, 1.2)), (0, clink(165, 3, .18, 1.4)))   # dark metallic toll
    swell = sweep_lp(noise(1.6), 120, 1100) * np.linspace(0, 1, int(1.6 * SR)) ** 2 * np.linspace(1, .2, int(1.6 * SR)) * .5
    x = mix(n, (0, swell), (1.4, g * .9), (1.4, hitn), (1.42, bell))
    return reverb(softclip(x, 1.2), .4, 2.2, 2500)
save('boss', boss(), .95)

def pickup():
    n = int(1.0 * SR); return reverb(mix(n, (0, pluck(81, .8)), (.07, pluck(88, .9, .8))), .25, .7, 5000)
save('pickup', pickup(), .6)
def wave():
    n = int(2.0 * SR); t = T(1.8)
    drone = (np.sin(2 * np.pi * mf(33) * t) + .5 * np.sin(2 * np.pi * mf(40) * t)) * env(1.8, .3, 1.8)
    return reverb(mix(n, (0, drone * .6), (0, hp(lp(noise(.3), 600), 100) * env(.3, .001, 15) * .6)), .35, 1.4, 2500)
save('wave', wave(), .7)
def lose():
    n = int(3.5 * SR)
    parts = [(0, piano(57, 3.4, .9)), (.35, piano(53, 3.1, .8)), (.7, piano(48, 2.8, .8))]
    return reverb(mix(n, *parts, (0, np.sin(2 * np.pi * mf(33) * T(3)) * env(3, .1, 1) * .5)), .4, 2.2, 3000)
save('lose', lose(), .8)
def win():
    n = int(3.5 * SR)
    parts = [(0, piano(57, 3, .9)), (.18, piano(60, 3, .8)), (.36, piano(64, 3, .8)), (.54, piano(69, 3, .8)), (.54, piano(76, 3, .5))]
    return reverb(mix(n, *parts), .4, 2.0, 4000)
save('win', win(), .8)
def error():
    d = .3; t = T(d); th = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-t * 14) + 70) / SR) * env(d, .001, 14)
    return reverb(mix(int(.5 * SR), (0, th), (.09, th * .7)), .1, .25, 1500)
save('error', error(), .55)

# ---------- ambience (seamless loops) ----------
def loopify(x, xf=1.0):
    n = int(xf * SR); body = x[:-n].copy(); tail = x[-n:]
    body[:n] = body[:n] * np.linspace(0, 1, n) + tail * np.linspace(1, 0, n); return body
def rain():
    d = 9; base = noise(d)
    a = bp(base, 1500, 9000, 1) * .5 + lp(noise(d), 700) * .35
    drops = np.zeros(len(a))
    for _ in range(int(d * 40)):
        i = rng.integers(0, len(a) - 600); drops[i:i + 400] += hp(noise(400 / SR), 3000) * np.exp(-np.arange(400) / 60) * rng.uniform(.05, .3)
    x = a + drops; x = x * (1 + .12 * np.sin(2 * np.pi * .13 * T(d)))
    return loopify(x)
save('rain', rain(), .6, 2)
def city():
    d = 12; t = T(d)
    drone = lp(noise(d), 260, 3) * 2.2 + .25 * np.sin(2 * np.pi * 55 * t) + .12 * np.sin(2 * np.pi * 110.4 * t)
    x = drone * (1 + .2 * np.sin(2 * np.pi * .09 * t))
    far = np.zeros(len(t))
    for _ in range(5):  # distant traffic whooshes
        c = rng.uniform(1, d - 3); w = bp(noise(3), 200, 900) * np.sin(np.linspace(0, np.pi, int(3 * SR))) ** 2
        far[int(c * SR):int(c * SR) + len(w)] += w[:len(far) - int(c * SR)] * .35
    return loopify(x + far)
save('city', city(), .5, 2)

# ---------- music ----------
def kick(vol=1.0):
    d = .4; t = T(d); return np.sin(2 * np.pi * np.cumsum(42 + 90 * np.exp(-t * 28)) / SR) * env(d, .001, 8) * vol
def snare_soft(vol=1.0):
    d = .3; return (bp(noise(d), 600, 5000) * env(d, .001, 18) * .6 + np.sin(2 * np.pi * 190 * T(d)) * env(d, .001, 30) * .3) * vol
def hat(vol=1.0):
    d = .06; return hp(noise(d), 7000) * env(d, .0005, 70) * vol
def subnote(m, d):
    t = T(d); return np.sin(2 * np.pi * mf(m) * t) * np.minimum(1, t * 60) * np.exp(-t * .6) * 1.0 + .2 * np.sin(2 * np.pi * mf(m) * 2 * t) * np.exp(-t * 2)
def music(bpm, bars, prog, bass_pat, drums, seed, pl_density, name, melody_oct=0):
    r = np.random.default_rng(seed)
    beat = 60 / bpm; bar = beat * 4; d = bar * bars; n = int(d * SR); tail = 4
    N = n + int(tail * SR); out = np.zeros(N)
    # pad (soft low strings-ish, filtered saw detune)
    pad_l = np.zeros(N)
    for b in range(bars):
        chord = prog[b % len(prog)]
        for m in chord['pad']:
            t = T(bar + .8); x = np.zeros(len(t))
            for det in (-.07, 0, .07):
                f = mf(m) * 2 ** (det / 12); x += signal.sawtooth(2 * np.pi * f * t)
            x = lp(x, 700, 2) * np.minimum(1, t / 1.0) * np.minimum(1, (t[-1] - t) / .8) * .05
            i = int(b * bar * SR); pad_l[i:i + len(x)] += x[:N - i]
    out += pad_l
    for b in range(bars):
        chord = prog[b % len(prog)]; t0 = b * bar
        # sub bass pattern: list of (beatpos, dur_beats)
        for bp_, db in bass_pat:
            s = subnote(chord['root'], db * beat); i = int((t0 + bp_ * beat) * SR); out[i:i + len(s)] += (s * .55)[:N - i]
        # sparse piano/pluck from chord scale
        for k in range(16):
            if r.random() < pl_density:
                m = int(r.choice(chord['mel'])) + melody_oct
                p = piano(m, 2.6, r.uniform(.35, .6), .9); i = int((t0 + k * beat / 4) * SR); out[i:i + len(p)] += (p * .5)[:N - i]
        for kind, pos, vol in drums:
            fn = {'k': kick, 's': snare_soft, 'h': hat}[kind]
            s = fn(vol); i = int((t0 + pos * beat) * SR); out[i:i + len(s)] += (s * .6)[:N - i]
    # reverb with long tail then wrap tail over start for seamless loop
    out = reverb(out, .3, 2.5, 3000)[:N]
    body = out[:n].copy(); wr = out[n:n + int(tail * SR)]; body[:len(wr)] += wr
    body = softclip(body * 1.1, 1.0)
    return body
Am = dict(root=33, pad=[57, 60, 64], mel=[69, 72, 76, 79, 81, 64, 67])
F = dict(root=29, pad=[53, 57, 60], mel=[65, 69, 72, 76, 60, 64])
C = dict(root=36, pad=[55, 60, 64], mel=[67, 72, 76, 79, 64])
Em = dict(root=28, pad=[55, 59, 64], mel=[64, 67, 71, 76, 79, 59])
G_ = dict(root=31, pad=[55, 59, 62], mel=[67, 71, 74, 62, 59])
menu = music(66, 8, [Am, F, C, Em], [(0, 3.6)], [('h', 2, .15), ('h', 6, .15)], 3, .12, 'menu')
save('music_menu', menu, .7, 2)
bass_raid = [(0, .75), (1.5, .5), (2, .75), (3.25, .5)]
dr = []
for b in range(2):
    pass
drums = [('k', 0, 1), ('k', 2.5, .8), ('s', 1, .5), ('s', 3, .55), ('h', .5, .25), ('h', 1.5, .25), ('h', 2.5, .25), ('h', 3.5, .25)]
raid = music(88, 8, [Am, Am, F, Em], bass_raid, drums, 11, .07, 'raid')
save('music_raid', raid, .7, 2)
