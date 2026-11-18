# Code-animated cartoon short from a JSON shot plan: every frame is a pure function of time.
#
#   render.py PLAN --check               validate the plan and list the media it needs
#   render.py PLAN --sheet SHEET.jpg     contact sheet (the plan's "sheet" times, or --times 0.3,1.0,...)
#   render.py PLAN --out VIDEO.mp4       silent H.264 render, plus VIDEO.sound.json for sound.py
#
# The plan format is in the kit README. Paths in the plan are relative to the plan file; --words,
# --cut and --font override them. Exit codes: 2 plan error, 3 FFmpeg missing, 4 media missing.
import argparse, json, math, os, random, re, shutil, subprocess, sys
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_FONT = os.path.join(KIT, "fonts", "Nunito-Black.ttf")
INK = (31, 20, 24)
COLORS = {"ink": INK, "red": (255, 59, 48), "white": (255, 255, 255), "yellow": (255, 210, 31), "pink": (255, 122, 184)}
PAIRS = {"yellow": ((255, 210, 31), (194, 122, 16)), "red": ((255, 74, 61), (142, 26, 20)),
         "pink": ((255, 122, 184), (168, 51, 109)), "white": ((255, 255, 255), (154, 166, 180))}
# Keep in step with SOUNDS in sound.py and the kit README.
SOUNDS = ("whoosh", "swish", "pop", "pop2", "boing", "impact", "sparkle", "buzzer", "chomp", "zip",
          "ticks", "burst", "flip", "trombone", "kiss", "chime", "bubbles")
TAG_TEXT = "made with Vixel"

# Set by setup() from the plan.
W, H, FPS, CW, CH, MX, MY = 1080, 1920, 30, 1210, 2150, 65, 115
FONT, CUT = DEFAULT_FONT, "."

# ---------- easing & helpers ----------
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out_cubic(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_back(x, s=1.7): x = clamp(x); x -= 1; return x * x * ((s + 1) * x + s) + 1
def ease_in_out(x): x = clamp(x); return x * x * (3 - 2 * x)
def spring(t): return 1 - 0.6 * math.exp(-9 * t) * math.cos(20 * t) if t >= 0 else 0.0
def squash(t): return 1 + 0.18 * math.exp(-10 * t) * math.cos(22 * t) if t >= 0 else 1.0
def env(t, k=7.0): return math.exp(-k * t) if t >= 0 else 0.0
EASES = {"linear": clamp, "out_cubic": ease_out_cubic, "back": ease_back, "in_out": ease_in_out}

@lru_cache(maxsize=None)
def font(size): return ImageFont.truetype(FONT, size)

_img = {}
def img(name, h=None, tint=None):
    key = (name, h, tint)
    if key not in _img:
        if tint:
            a = np.array(img(name, h)).astype(float)
            for i in range(3): a[..., i] = a[..., i] * 0.55 + tint[i] * 0.45
            _img[key] = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        else:
            base = Image.open(image_path(name)).convert("RGBA")
            if h: base = base.resize((round(base.width * h / base.height), h), Image.LANCZOS)
            _img[key] = base
    return _img[key]

def image_path(name): return os.path.join(CUT, name if os.path.splitext(name)[1] else f"{name}.png")
def plate_path(name): return os.path.join(CUT, name if os.path.splitext(name)[1] else f"bg_{name}.jpg")

def paste(canvas, src, x, y):
    """alpha_composite src with its top-left at (x, y), clipping at canvas edges."""
    x, y = int(round(x)), int(round(y))
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(src.width, canvas.width - x), min(src.height, canvas.height - y)
    if sx1 <= sx0 or sy1 <= sy0: return
    canvas.alpha_composite(src, (x + sx0, y + sy0), (sx0, sy0, sx1, sy1))

def wave(im, t, amp=9.0, speed=6.0, k=4.5, bands=28):
    """Sway the lower body/tail: horizontal slices offset by a travelling sine, weighted toward the bottom."""
    a = np.array(im); h = a.shape[0]; pad = int(amp * 2) + 2
    a = np.pad(a, ((0, 0), (pad, pad), (0, 0)))
    out = np.zeros_like(a); edges = np.linspace(0, h, bands + 1).astype(int)
    for i in range(bands):
        u = (edges[i] + edges[i + 1]) / 2 / h
        wgt = clamp((u - 0.4) / 0.6) ** 1.5
        dx = int(round(math.sin(speed * t - k * u) * amp * wgt))
        out[edges[i]:edges[i + 1]] = np.roll(a[edges[i]:edges[i + 1]], dx, axis=1)
    return Image.fromarray(out)

def sprite(canvas, name, h, cx, cy, t, scale=1.0, rot=0.0, flip=False, sx=1.0, sy=1.0, bob=True, amp=9.0, alpha=1.0):
    """Draw a cutout centred at (cx, cy) in view coordinates, with idle bob, tilt and tail sway."""
    im = img(name, h)
    if amp > 0: im = wave(im, t, amp=amp)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if bob:
        cy += 10 * math.sin(2.7 * t); rot += math.degrees(0.035 * math.sin(1.9 * t + 0.7))
    nw, nh = max(1, round(im.width * scale * sx)), max(1, round(im.height * scale * sy))
    im = im.resize((nw, nh), Image.BILINEAR)
    if abs(rot) > 0.05: im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        a = np.array(im); a[..., 3] = (a[..., 3] * alpha).astype(np.uint8); im = Image.fromarray(a)
    # squash keeps the bottom planted: anchor offset by the height change
    paste(canvas, im, MX + cx - im.width / 2, MY + cy - im.height / 2 + (h * scale * (sy - 1)) * -0.5)

def picture(canvas, name, h, cx, cy, w=None, tint=None, scale=1.0, rot=0.0):
    """A plain cutout (no bob or sway) centred at (cx, cy), optionally tinted and resized to width w."""
    im = img(name, h, tint)
    if w: im = im.resize((int(w), max(1, int(w * im.height / im.width))), Image.BILINEAR)
    if scale != 1: im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if abs(rot) > 0.05: im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    paste(canvas, im, MX + cx - im.width / 2, MY + cy - im.height / 2)

# ---------- drawn props (scene space, view coords) ----------
def lines_to(draw, pts, width, fill):
    draw.line([(MX + x, MY + y) for x, y in pts], fill=fill, width=width, joint="curve")

def ring(canvas, cx, cy, rx, ry, p, tilt=-7):
    """Red marker ring that draws on as p goes 0..1."""
    if p <= 0: return
    n = max(2, int(80 * clamp(p)))
    th0 = math.radians(-100)
    pts = []
    for i in range(n + 1):
        th = th0 + 2 * math.pi * 1.06 * clamp(p) * i / n
        x, y = rx * math.cos(th), ry * math.sin(th)
        c, s = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    d = ImageDraw.Draw(canvas)
    lines_to(d, pts, 20, INK + (255,)); lines_to(d, pts, 11, (255, 59, 48, 255))

def arrow(canvas, p0, p1, bend, p):
    """Curved red arrow from p0 to p1, drawing on with p."""
    if p <= 0: return
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2 - (y1 - y0) * bend, (y0 + y1) / 2 + (x1 - x0) * bend
    n = 40; pts = []
    for i in range(int(n * clamp(p)) + 1):
        u = i / n
        pts.append(((1 - u) ** 2 * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * my + u * u * y1))
    d = ImageDraw.Draw(canvas)
    lines_to(d, pts, 26, INK + (255,)); lines_to(d, pts, 13, (255, 59, 48, 255))
    if p >= 0.98 and len(pts) > 2:
        (ax, ay), (bx, by) = pts[-3], pts[-1]
        ang = math.atan2(by - ay, bx - ax)
        for col, wid in ((INK + (255,), 26), ((255, 59, 48, 255), 13)):
            for da in (2.5, -2.5):
                lines_to(d, [(bx, by), (bx - 48 * math.cos(ang + da / 3), by - 48 * math.sin(ang + da / 3))], wid, col)

def starburst(canvas, cx, cy, t, r=105):
    """Yellow and white starburst with 10 flying lines over 0.45 s (t = time since hit)."""
    if t < 0 or t > 0.45: return
    k = ease_out_cubic(t / 0.18); fade = 1 - clamp((t - 0.25) / 0.2)
    d = ImageDraw.Draw(canvas)
    for rad, col in ((r, (255, 210, 31)), (r * 0.62, (255, 255, 255))):
        pts = []
        for i in range(48):
            rr = rad * k * (1.0 if i % 2 == 0 else 0.55)
            th = 2 * math.pi * i / 48 + 0.2
            pts.append((MX + cx + rr * math.cos(th), MY + cy + rr * math.sin(th)))
        d.polygon(pts, fill=col + (int(255 * fade),), outline=INK + (int(255 * fade),), width=5)
    for i in range(10):
        th = 2 * math.pi * i / 10 + 0.3
        r0, r1 = r * (1.0 + 1.6 * k), r * (1.3 + 2.4 * k)
        lines_to(d, [(cx + r0 * math.cos(th), cy + r0 * math.sin(th)), (cx + r1 * math.cos(th), cy + r1 * math.sin(th))], 9, (255, 255, 255, int(255 * fade)))

def speed_lines(canvas, x, y, h, direction, alpha=1.0):
    """5 white speed lines trailing a moving character (direction +1 = moving right)."""
    d = ImageDraw.Draw(canvas)
    for i in range(5):
        yy = y - h * 0.3 + i * 34 * 2.2
        L = 140 + (i % 2) * 70
        x0 = x - direction * 60; x1 = x0 - direction * L
        lines_to(d, [(x0, yy), (x1, yy)], 9, (255, 255, 255, int(220 * alpha)))

def heart(canvas, cx, cy, size, col=(255, 74, 120), alpha=1.0, outline=True):
    d = ImageDraw.Draw(canvas); pts = []
    for i in range(60):
        th = 2 * math.pi * i / 60
        x = 16 * math.sin(th) ** 3
        y = -(13 * math.cos(th) - 5 * math.cos(2 * th) - 2 * math.cos(3 * th) - math.cos(4 * th))
        pts.append((MX + cx + x * size / 32, MY + cy + y * size / 32))
    d.polygon(pts, fill=col + (int(255 * alpha),), outline=(INK + (int(255 * alpha),)) if outline else None, width=max(2, int(size / 14)))

def snail(canvas, cx, cy, s=1.0, rot=0):
    d = ImageDraw.Draw(canvas)
    X, Y = MX + cx, MY + cy
    d.rounded_rectangle((X - 110 * s, Y + 10 * s, X + 120 * s, Y + 55 * s), radius=int(24 * s), fill=(186, 214, 92), outline=INK, width=7)
    d.line((X + 95 * s, Y + 15 * s, X + 120 * s, Y - 50 * s), fill=INK, width=7); d.line((X + 75 * s, Y + 15 * s, X + 88 * s, Y - 46 * s), fill=INK, width=7)
    d.ellipse((X + 110 * s, Y - 64 * s, X + 132 * s, Y - 42 * s), fill=INK); d.ellipse((X + 78 * s, Y - 60 * s, X + 98 * s, Y - 40 * s), fill=INK)
    d.ellipse((X - 95 * s, Y - 85 * s, X + 55 * s, Y + 45 * s), fill=(226, 140, 64), outline=INK, width=8)
    for r in (52, 32, 14):
        d.arc((X - 20 * s - r * s, Y - 20 * s - r * s, X - 20 * s + r * s, Y - 20 * s + r * s), 200, 520, fill=INK, width=6)

def shrimp(canvas, cx, cy, s=1.0, rot=0):
    lay = Image.new("RGBA", (int(120 * s), int(90 * s)), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.arc((8 * s, 6 * s, 108 * s, 96 * s), 190, 350, fill=INK, width=int(30 * s)); d.arc((8 * s, 6 * s, 108 * s, 96 * s), 192, 348, fill=(255, 140, 150), width=int(20 * s))
    d.ellipse((86 * s, 24 * s, 96 * s, 34 * s), fill=INK)
    lay = lay.rotate(rot, expand=True, resample=Image.BICUBIC)
    paste(canvas, lay, MX + cx - lay.width / 2, MY + cy - lay.height / 2)

def sparkle(canvas, cx, cy, size, alpha):
    d = ImageDraw.Draw(canvas); X, Y = MX + cx, MY + cy; s = size
    d.polygon([(X, Y - s), (X + s * 0.25, Y - s * 0.25), (X + s, Y), (X + s * 0.25, Y + s * 0.25), (X, Y + s), (X - s * 0.25, Y + s * 0.25), (X - s, Y), (X - s * 0.25, Y - s * 0.25)], fill=(255, 255, 255, int(255 * alpha)))

DRAWN = {"snail": snail, "shrimp": shrimp}

# ---------- text (screen space) ----------
_txt = {}
def title_img(text, size, pair):
    key = (text, size, pair)
    if key in _txt: return _txt[key]
    f = font(size); col, dark = PAIRS[pair]
    stroke = round(0.11 * size); off = round(0.09 * size)
    lines = text.split("\n"); lh = int(size * 1.02)
    widths = [f.getlength(l) for l in lines]
    Wt, Ht = int(max(widths) + 2 * stroke + 20), int(lh * len(lines) + 2 * stroke + off + 20)
    im = Image.new("RGBA", (Wt, Ht), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        x = (Wt - widths[i]) / 2; y = 10 + stroke + i * lh
        d.text((x, y + off), l, font=f, fill=dark, stroke_width=stroke, stroke_fill=INK)
        d.text((x, y), l, font=f, fill=col, stroke_width=stroke, stroke_fill=INK)
    _txt[key] = im; return im

def draw_title(frame, text, size, pair, t, y=430):
    if t < 0: return
    im = title_img(text, size, pair)
    s = spring(t); rot = 1.4 * math.sin(5.5 * t)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR).rotate(rot, expand=True, resample=Image.BICUBIC)
    paste(frame, im, W / 2 - im.width / 2, y - im.height / 2)

def caption_img(tokens, key, size=66):
    k = (tuple(tokens), key, size)
    if k in _txt: return _txt[k]
    f = font(size); space = f.getlength(" ")
    ws = [f.getlength(t) for t in tokens]; tw = sum(ws) + space * (len(tokens) - 1)
    ph = int(size * 1.55); pw = int(tw + size * 1.1)
    im = Image.new("RGBA", (pw + 20, ph + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((10, 10, 10 + pw, 10 + ph), radius=ph // 2, fill=(255, 255, 255), outline=INK, width=7)
    # centre the capitals in the pill, whatever the font's ascent
    top, bottom = f.getbbox("H")[1], f.getbbox("H")[3]
    x = 10 + (pw - tw) / 2; y = 10 + ph / 2 - (top + bottom) / 2
    for t, wd in zip(tokens, ws):
        if t == key: d.text((x, y), t, font=f, fill=(255, 210, 31), stroke_width=round(0.07 * size), stroke_fill=INK)
        else: d.text((x, y), t, font=f, fill=INK)
        x += wd + space
    _txt[k] = im; return im

def draw_counter(frame, text, pulse, x, y, size, pair):
    im = title_img(text, size, pair)
    s = 1 + 0.08 * pulse
    im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
    paste(frame, im, x - im.width / 2, y - im.height / 2)

def card(canvas, x, y, lines, stamps, t, width=430):
    """Checklist / calendar style white card with ink outline; stamps = list of (line index, progress)."""
    f = font(50); d = ImageDraw.Draw(canvas)
    s = ease_back(t / 0.25)
    if s <= 0.01: return
    wcard, hcard = width * s, (90 + 80 * (len(lines) - 1)) * s
    X, Y = MX + x, MY + y
    d.rounded_rectangle((X, Y, X + wcard, Y + hcard), radius=int(22 * s), fill=(255, 255, 255), outline=INK, width=7)
    if s < 0.95: return
    for i, (txt, col) in enumerate(lines):
        d.text((X + 30, Y + 22 + i * 80), txt, font=f, fill=col)
    for i, p in stamps:
        if p <= 0: continue
        yy = Y + 22 + i * 80 + 28
        L = (width - 130) * clamp(p)
        d.line((X + 26, yy, X + 26 + L, yy), fill=(255, 59, 48), width=10)
        if p >= 1:
            bx = X + wcard - 90
            d.rectangle((bx, yy - 32, bx + 60, yy + 28), outline=INK, width=6)
            d.line((bx + 8, yy - 24, bx + 52, yy + 20), fill=(255, 59, 48), width=11); d.line((bx + 52, yy - 24, bx + 8, yy + 20), fill=(255, 59, 48), width=11)

# ---------- backgrounds, specks, vignette, camera ----------
_bg = {}
def bg(name, flip=False):
    k = (name, flip)
    if k not in _bg:
        im = Image.open(plate_path(name)).convert("RGBA")
        if im.size != (CW, CH): im = im.resize((CW, CH), Image.LANCZOS)
        _bg[k] = im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
    return _bg[k].copy()

SPECKS, VIG = [], None
def specks(frame, t):
    d = ImageDraw.Draw(frame)
    for x, y, r, v, ph in SPECKS:
        yy = (y - v * t) % (H + 40) - 20; xx = x + 8 * math.sin(t * 1.3 + ph)
        d.ellipse((xx - r, yy - r, xx + r, yy + r), fill=(255, 255, 255, 115))

def vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    return Image.fromarray(np.dstack([np.zeros((H, W, 3), np.uint8), (np.clip((dist - 0.55) / 0.6, 0, 1) ** 1.6 * 255 * 0.45).astype(np.uint8)]), "RGBA")

def camera(canvas, z=1.0, fx=None, fy=None, shake=(0, 0)):
    fx = W / 2 if fx is None else fx; fy = H / 2 if fy is None else fy
    z = max(z, 1.0)
    cw, ch = W / z, H / z
    x0 = MX + fx - fx / z + shake[0]; y0 = MY + fy - fy / z + shake[1]
    x0 = clamp(x0, 0, CW - cw); y0 = clamp(y0, 0, CH - ch)
    return canvas.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)

def shake_at(t, shakes):
    dx = dy = 0.0
    for te, amp in shakes:
        e = env(t - te, 7)
        if e > 0.01: dx += amp * e * math.sin(53 * (t - te) + te); dy += amp * e * math.cos(47 * (t - te) + 2 * te)
    return dx, dy

def punch(t, te, amount=0.1):
    """Zoom punch: snaps in over 0.08 s with a small overshoot and holds."""
    if t < te: return 1.0
    x = (t - te) / 0.08
    return 1 + amount * (ease_back(x, 2.2) if x < 1 else 1)

# ---------- plan: times, motions, points ----------
class PlanError(Exception):
    pass

TIME_RE = re.compile(r"^(?:w(\d+)|(shot)|(end))\s*(?:([+-])\s*(\d+(?:\.\d*)?|\.\d+))?$")

def keys(spec, allowed, where, required=()):
    if not isinstance(spec, dict): raise PlanError(f"{where}: expected an object, got {json.dumps(spec)[:60]}")
    extra = sorted(set(spec) - set(allowed) - {"note"})
    if extra: raise PlanError(f"{where}: unknown key {extra[0]!r}; allowed: {', '.join(sorted(allowed))}")
    for k in required:
        if k not in spec: raise PlanError(f"{where}: missing {k!r}")

def num(v, where):
    if isinstance(v, bool) or not isinstance(v, (int, float)): raise PlanError(f"{where}: expected a number, got {json.dumps(v)}")
    return float(v)

def pick(v, options, where):
    if v not in options: raise PlanError(f"{where}: {json.dumps(v)} is not one of {', '.join(options)}")
    return v

def color(v, where, default):
    if v is None: return default
    if isinstance(v, str): return COLORS[pick(v, list(COLORS), where)]
    if isinstance(v, list) and len(v) == 3 and all(isinstance(c, int) and 0 <= c <= 255 for c in v): return tuple(v)
    raise PlanError(f"{where}: a colour is one of {', '.join(COLORS)} or [r, g, b]")

class Film:
    """The compiled plan: shots with their layers, word timings and every sound cue."""
    def __init__(self, plan, words, anchors):
        self.words, self.anchors, self.media = words, anchors, set()
        self.end = None
        self.end = self.time(plan["duration"], "duration")
        self.shakes, self.events = [], []
        for i, ev in enumerate(plan.get("sounds", [])): self.add_sound(ev, f"sounds[{i}]", None)
        raw = plan["shots"]
        if not isinstance(raw, list) or not raw: raise PlanError("shots: give at least one shot")
        starts = [self.time(s.get("at") if isinstance(s, dict) else None, f"shots[{i}].at") for i, s in enumerate(raw)]
        if starts[0] != 0: raise PlanError("shots[0].at: the first shot starts at 0")
        for i in range(1, len(starts)):
            if starts[i] <= starts[i - 1]: raise PlanError(f"shots[{i}].at: {starts[i]:.2f} s is not after the previous shot ({starts[i - 1]:.2f} s)")
        if starts[-1] >= self.end: raise PlanError(f"shots[{len(raw) - 1}].at: starts after the duration ({self.end:.2f} s)")
        self.shots = [Shot(self, s, f"shots[{i}]", starts[i], starts[i + 1] if i + 1 < len(raw) else self.end) for i, s in enumerate(raw)]

    def time(self, ref, where, shot=None):
        if isinstance(ref, (int, float)) and not isinstance(ref, bool): return float(ref)
        m = TIME_RE.match(ref.strip()) if isinstance(ref, str) else None
        if not m: raise PlanError(f"{where}: {json.dumps(ref)} is not a time: seconds, \"w12\", \"w12+0.3\", \"shot\" or \"end-1.7\"")
        if m.group(1) is not None:
            i = int(m.group(1))
            if i >= len(self.words): raise PlanError(f"{where}: word w{i} does not exist; the words file has w0-w{len(self.words) - 1}")
            base = self.words[i]["s"]
        elif m.group(2):
            if shot is None: raise PlanError(f"{where}: \"shot\" only works inside a shot")
            base = shot
        else:
            if self.end is None: raise PlanError(f"{where}: \"end\" cannot define the duration")
            base = self.end
        return base + (float(m.group(5)) * (-1 if m.group(4) == "-" else 1) if m.group(4) else 0.0)

    def add_sound(self, ev, where, shot):
        if not isinstance(ev, list) or len(ev) not in (2, 3): raise PlanError(f"{where}: a sound is [time, name] or [\"w71\", \"ticks\", until]")
        t = self.time(ev[0], where, shot)
        name = pick(ev[1], SOUNDS, where)
        if len(ev) == 3:
            until = self.time(ev[2], where, shot)
            if until <= t: raise PlanError(f"{where}: the sound ends before it starts")
            self.events.append([t, name, until - t])
        else:
            self.events.append([t, name])

    def shot_at(self, t):
        cur = self.shots[0]
        for s in self.shots:
            if t >= s.start: cur = s
        return cur

class Shot:
    def __init__(self, film, spec, where, start, end):
        keys(spec, {"id", "at", "bg", "flip", "camera", "layers", "sounds", "shakes"}, where, required=("at", "bg"))
        self.film, self.where, self.start, self.end = film, where, start, end
        self.id = spec.get("id", where)
        self.bg, self.flip = spec["bg"], bool(spec.get("flip", False))
        if not isinstance(self.bg, str): raise PlanError(f"{where}.bg: the name of a background plate")
        film.media.add(plate_path(self.bg))
        self.specs = spec.get("layers", [])
        if not isinstance(self.specs, list): raise PlanError(f"{where}.layers: a list of layers")
        self.layers, self._compiling = [None] * len(self.specs), set()
        for i in range(len(self.specs)): self.layer(i, f"{where}.layers[{i}]")
        cam = spec.get("camera", {})
        keys(cam, {"zoom", "fx", "fy", "punch"}, where + ".camera")
        self.zoom = self.motion(cam.get("zoom", 1.04), where + ".camera.zoom", 0)
        self.fx = self.motion(cam["fx"], where + ".camera.fx", 0) if "fx" in cam else None
        self.fy = self.motion(cam["fy"], where + ".camera.fy", 1) if "fy" in cam else None
        self.punches = []
        for i, p in enumerate(cam.get("punch", [])):
            keys(p, {"at", "amount"}, f"{where}.camera.punch[{i}]", required=("at",))
            self.punches.append((self.time(p["at"], f"{where}.camera.punch[{i}].at"), num(p.get("amount", 0.1), f"{where}.camera.punch[{i}].amount")))
        for i, ev in enumerate(spec.get("sounds", [])): film.add_sound(ev, f"{where}.sounds[{i}]", start)
        for i, sh in enumerate(spec.get("shakes", [])):
            if not isinstance(sh, list) or len(sh) != 2: raise PlanError(f"{where}.shakes[{i}]: a shake is [time, pixels]")
            film.shakes.append((self.time(sh[0], f"{where}.shakes[{i}]"), num(sh[1], f"{where}.shakes[{i}]")))
        self.scene = [l for l in self.layers if l.space == "scene"]
        self.screen = [l for l in self.layers if l.space == "screen"]

    def time(self, ref, where): return self.film.time(ref, where, self.start)

    def layer(self, i, where):
        """Compile layer i on first use, so a point can refer to a sprite listed later."""
        if not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(self.specs): raise PlanError(f"{where}: no layer {json.dumps(i)} in this shot")
        if self.layers[i] is None:
            if i in self._compiling: raise PlanError(f"{where}: layer {i} refers back to itself")
            self._compiling.add(i)
            spec, lw = self.specs[i], f"{self.where}.layers[{i}]"
            kind = spec.get("type") if isinstance(spec, dict) else None
            cls = LAYERS.get(kind)
            if cls is None: raise PlanError(f"{lw}.type: {json.dumps(kind)} is not one of {', '.join(LAYERS)}")
            keys(spec, LAYER_KEYS[kind] | {"type", "at", "until"}, lw, required=REQUIRED.get(kind, ()))
            layer = cls.__new__(cls)
            layer.at = self.time(spec.get("at", "shot"), lw + ".at")
            layer.until = self.time(spec.get("until", self.end), lw + ".until")
            layer.__init__(spec, self, lw)
            self.layers[i] = layer
        return self.layers[i]

    def sprite(self, i, where):
        layer = self.layer(i, where)
        if not isinstance(layer, Sprite): raise PlanError(f"{where}: layer {i} is a {type(layer).__name__.lower()}, not a sprite")
        return layer

    def motion(self, spec, where, axis):
        """A number or {"value", "ref", "drift", "tween", "wave", "set"} -> f(t)."""
        if isinstance(spec, (int, float)) and not isinstance(spec, bool):
            v = float(spec); f = lambda t: v; f.tweens = []; return f
        keys(spec, {"value", "ref", "drift", "tween", "wave", "set"}, where)
        value = num(spec.get("value", 0), where + ".value")
        ref = self.point(spec["ref"], where + ".ref") if "ref" in spec else None
        drift = spec.get("drift", 0)
        if isinstance(drift, dict):
            keys(drift, {"rate", "at"}, where + ".drift", required=("rate",))
            rate, d_at = num(drift["rate"], where + ".drift.rate"), self.time(drift.get("at", "shot"), where + ".drift.at")
        else:
            rate, d_at = num(drift, where + ".drift"), self.start
        tweens = []
        for j, tw in enumerate(spec.get("tween", []) if isinstance(spec.get("tween", []), list) else [spec["tween"]]):
            tw_where = f"{where}.tween[{j}]"
            keys(tw, {"by", "at", "dur", "ease"}, tw_where, required=("by", "dur"))
            dur = num(tw["dur"], tw_where + ".dur")
            if dur <= 0: raise PlanError(f"{tw_where}.dur: must be above 0")
            tweens.append((num(tw["by"], tw_where + ".by"), self.time(tw.get("at", "shot"), tw_where + ".at"), dur, EASES[pick(tw.get("ease", "out_cubic"), list(EASES), tw_where + ".ease")]))
        waves = []
        for j, wv in enumerate(spec.get("wave", []) if isinstance(spec.get("wave", []), list) else [spec["wave"]]):
            wv_where = f"{where}.wave[{j}]"
            keys(wv, {"amp", "freq", "phase", "at", "ramp"}, wv_where, required=("amp", "freq"))
            waves.append((num(wv["amp"], wv_where + ".amp"), num(wv["freq"], wv_where + ".freq"), num(wv.get("phase", 0), wv_where + ".phase"),
                          self.time(wv.get("at", "shot"), wv_where + ".at"), num(wv.get("ramp", 0), wv_where + ".ramp")))
        sets = []
        for j, st in enumerate(spec.get("set", [])):
            if not isinstance(st, list) or len(st) != 2: raise PlanError(f"{where}.set[{j}]: a step is [time, value]")
            sets.append((self.time(st[0], f"{where}.set[{j}]"), num(st[1], f"{where}.set[{j}]")))
        sets.sort()
        def f(t):
            v = value
            for at, sv in sets:
                if t >= at: v = sv
            if ref: v += ref(t)[axis]
            if rate: v += rate * max(0.0, t - d_at)
            for by, at, dur, ease in tweens: v += by * ease((t - at) / dur)
            for amp, freq, phase, at, ramp in waves:
                tt = t - at; v += amp * math.sin(freq * tt + phase) * (clamp(tt / ramp) if ramp else 1.0)
            return v
        f.tweens = tweens
        return f

    def point(self, spec, where):
        """[x, y] (numbers or motions) or {"layer", "anchor", "dx", "dy", "bob"} -> f(t) = (x, y) in view coords."""
        if isinstance(spec, list):
            if len(spec) != 2: raise PlanError(f"{where}: a point is [x, y] or {{\"layer\": 0, \"anchor\": \"belly\"}}")
            fx, fy = self.motion(spec[0], where + "[0]", 0), self.motion(spec[1], where + "[1]", 1)
            return lambda t: (fx(t), fy(t))
        keys(spec, {"layer", "anchor", "dx", "dy", "bob"}, where, required=("layer",))
        s = self.sprite(spec["layer"], where + ".layer")
        anchor = spec.get("anchor")
        if anchor is not None: s.check_anchor(anchor, where + ".anchor")
        dx, dy, bob = num(spec.get("dx", 0), where + ".dx"), num(spec.get("dy", 0), where + ".dy"), bool(spec.get("bob", False))
        def p(t):
            x, y = s.anchor_point(t, anchor) if anchor else s.pos(t)
            return x + dx, y + dy + (s.bob_offset(t) if bob else 0.0)
        return p

# ---------- layers ----------
class Sprite:
    """A cutout with idle bob, tilt, tail sway and squash on hits; other layers can point at it."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.film, self.image, self.h = shot.film, spec["image"], int(num(spec["h"], where + ".h"))
        shot.film.media.add(image_path(self.image))
        self.x, self.y = shot.motion(spec["x"], where + ".x", 0), shot.motion(spec["y"], where + ".y", 1)
        self.rot, self.scale = shot.motion(spec.get("rot", 0), where + ".rot", 0), shot.motion(spec.get("scale", 1), where + ".scale", 0)
        self.sway = shot.motion(spec.get("sway", 9), where + ".sway", 0)
        self.flip, self.bob, self.alpha = bool(spec.get("flip", False)), bool(spec.get("bob", True)), num(spec.get("alpha", 1), where + ".alpha")
        self.squash = sorted(shot.time(r, f"{where}.squash[{j}]") for j, r in enumerate(spec.get("squash", [])))
        self.trail = Trail(spec["trail"], self.h, where + ".trail") if "trail" in spec else None
    def pos(self, t): return self.x(t), self.y(t)
    def bob_offset(self, t): return 10 * math.sin(2.7 * t) if self.bob else 0.0
    def check_anchor(self, key, where):
        if key == "center": return
        a = self.film.anchors
        if a is None: return  # no anchors.json yet; --check reports it as missing media
        if self.image not in a or key not in a[self.image]:
            have = sorted(k for k in a.get(self.image, {}) if k not in ("w", "h"))
            raise PlanError(f"{where}: {self.image} has no {key!r} anchor in anchors.json (has: {', '.join(have) or 'none'}); run prep.py anchors")
    def anchor_point(self, t, key):
        """Point in view coords for a fractional anchor of this cutout (before bob and squash)."""
        cx, cy = self.pos(t)
        a = self.film.anchors.get(self.image) if self.film.anchors else None
        if a is None: a = {"w": img(self.image).width, "h": img(self.image).height}
        s = self.h / a["h"]; wpx = a["w"] * s
        fx, fy = (0.5, 0.5) if key == "center" else a[key][:2]
        if self.flip: fx = 1 - fx
        return cx - wpx / 2 + fx * wpx, cy - self.h / 2 + fy * self.h
    def draw(self, c, t, lt):
        last = max((s for s in self.squash if s <= t), default=None)
        sq = squash(t - last) if last is not None else 1.0
        x, y = self.pos(t)
        sprite(c, self.image, self.h, x, y, t, scale=self.scale(t), rot=self.rot(t), flip=self.flip, sx=1 / sq, sy=sq,
               bob=self.bob, amp=self.sway(t), alpha=self.alpha)
        if self.trail: self.trail.draw(c, t, x, y, self.x)

class Trail:
    """Speed lines behind a layer while its x tween runs, fading out as it lands."""
    def __init__(self, spec, h, where):
        keys(spec, {"dx", "dy", "h", "dir", "fade"}, where)
        self.dx, self.dy = num(spec.get("dx", 0), where + ".dx"), num(spec.get("dy", 0), where + ".dy")
        self.h, self.dir, self.fade = num(spec.get("h", h), where + ".h"), num(spec.get("dir", -1), where + ".dir"), bool(spec.get("fade", True))
    def draw(self, c, t, x, y, xmotion):
        p = 0.0
        if xmotion.tweens:
            _, at, dur, ease = xmotion.tweens[0]
            if t < at: return
            p = ease((t - at) / dur)
            if p >= 1: return
        speed_lines(c, x + self.dx, y + self.dy, self.h, self.dir, 1 - p if self.fade else 1.0)

class Prop:
    """A code-drawn prop (snail, shrimp) or a plain cutout image moving on its own path."""
    space = "scene"
    def __init__(self, spec, shot, where):
        if ("draw" in spec) == ("image" in spec): raise PlanError(f"{where}: give either draw ({', '.join(DRAWN)}) or image")
        self.draw_fn = DRAWN[pick(spec["draw"], list(DRAWN), where + ".draw")] if "draw" in spec else None
        self.image = spec.get("image")
        if self.image:
            shot.film.media.add(image_path(self.image))
            self.h = int(num(spec.get("h", 120), where + ".h"))
            self.w = num(spec["w"], where + ".w") if "w" in spec else None
            self.tint = color(spec.get("tint"), where + ".tint", None)
        self.scale = num(spec.get("scale", 1), where + ".scale")
        self.x, self.y = shot.motion(spec["x"], where + ".x", 0), shot.motion(spec["y"], where + ".y", 1)
        self.rot = shot.motion(spec.get("rot", 0), where + ".rot", 0)
        self.trail = Trail(spec["trail"], 120, where + ".trail") if "trail" in spec else None
    def draw(self, c, t, lt):
        x, y = self.x(t), self.y(t)
        if self.draw_fn: self.draw_fn(c, x, y, self.scale, rot=self.rot(t))
        else: picture(c, self.image, self.h, x, y, w=self.w, tint=self.tint, scale=self.scale, rot=self.rot(t))
        if self.trail: self.trail.draw(c, t, x, y, self.x)

class Throw:
    """A prop thrown again and again along an arc into a point (food into a mouth); each landing can squash a sprite and play a sound."""
    space = "scene"
    def __init__(self, spec, shot, where):
        if ("draw" in spec) == ("image" in spec): raise PlanError(f"{where}: give either draw ({', '.join(DRAWN)}) or image")
        self.prop = Prop({k: spec[k] for k in ("draw", "image", "h", "w", "tint", "scale") if k in spec} | {"x": 0, "y": 0}, shot, where)
        self.to = shot.point(spec["to"], where + ".to")
        src = spec["from"]
        if not isinstance(src, list) or len(src) != 2: raise PlanError(f"{where}.from: [x, y]; y may be null to start level with the target")
        self.from_x = num(src[0], where + ".from[0]"); self.from_y = None if src[1] is None else num(src[1], where + ".from[1]")
        start, every, count = shot.time(spec["start"], where + ".start"), num(spec.get("every", 0.32), where + ".every"), int(num(spec.get("count", 1), where + ".count"))
        self.dur, self.arc, self.spin = num(spec.get("dur", 0.28), where + ".dur"), num(spec.get("arc", 160), where + ".arc"), num(spec.get("spin", 360), where + ".spin")
        self.times = [start + every * i for i in range(count)]
        self.arrivals = [s + self.dur for s in self.times]
        if "sound" in spec:
            for i, s in enumerate(self.arrivals): shot.film.add_sound([s, spec["sound"]], f"{where}.sound", shot.start)
        if "squash" in spec:
            target = shot.sprite(spec["squash"], where + ".squash")
            target.squash = sorted(target.squash + self.arrivals)
    def landed(self, t): return sum(1 for s in self.arrivals if t >= s)
    def draw(self, c, t, lt):
        tx, ty = self.to(t); fy = ty if self.from_y is None else self.from_y
        for s in self.times:
            p = (t - s) / self.dur
            if 0 <= p < 1:
                x = self.from_x + (tx - self.from_x) * p; y = fy + (ty - fy) * p - self.arc * math.sin(math.pi * p)
                if self.prop.draw_fn: self.prop.draw_fn(c, x, y, self.prop.scale, rot=self.spin * p)
                else: picture(c, self.prop.image, self.prop.h, x, y, w=self.prop.w, tint=self.prop.tint, scale=self.prop.scale, rot=self.spin * p)

class Swarm:
    """A burst of tiny copies of a cutout flying out of a point (babies, eggs, seeds), with drag and a slow rise."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.image, self.h = spec["image"], int(num(spec.get("h", 78), where + ".h"))
        shot.film.media.add(image_path(self.image))
        tints = spec.get("tints", [[255, 190, 120], [255, 214, 150], [255, 160, 110]])
        if not isinstance(tints, list) or not tints: raise PlanError(f"{where}.tints: a list of [r, g, b] tints")
        self.tints = [color(c, f"{where}.tints[{i}]", None) for i, c in enumerate(tints)]
        self.src = shot.point(spec["from"], where + ".from")
        def pair(name, default):
            v = spec.get(name, default)
            if not isinstance(v, list) or len(v) != 2: raise PlanError(f"{where}.{name}: [low, high]")
            return num(v[0], f"{where}.{name}[0]"), num(v[1], f"{where}.{name}[1]")
        speed, angle, scale = pair("speed", [750, 1600]), pair("angle", [58, 88]), pair("scale", [0.75, 1.25])
        window, spin = num(spec.get("window", 0.9), where + ".window"), num(spec.get("spin", 400), where + ".spin")
        rng = random.Random(int(num(spec.get("seed", 3), where + ".seed")))
        self.items = []
        for i in range(int(num(spec.get("count", 190), where + ".count"))):
            tb = self.at - 0.05 + rng.random() ** 1.6 * window
            ang = math.radians(-90 + (1 if i % 2 else -1) * rng.uniform(*angle)); sp = rng.uniform(*speed)
            self.items.append((tb, math.cos(ang) * sp, math.sin(ang) * sp, rng.uniform(-spin, spin), rng.randrange(len(self.tints)), rng.uniform(*scale)))
        self.at -= 0.05  # the first ones leave just before the hit
    def draw(self, c, t, lt):
        px, py = self.src(t)
        for tb, vx, vy, spin, k, sc in self.items:
            tt = t - tb
            if tt < 0: continue
            drag = (1 - math.exp(-2.2 * tt)) / 2.2
            x = px + (110 if vx > 0 else -110) + vx * drag; y = py + 60 + vy * drag - 30 * tt
            if y < -200 or x < -200 or x > W + 200: continue
            b = img(self.image, self.h, self.tints[k])
            b2 = b.resize((max(1, int(b.width * sc)), max(1, int(b.height * sc))), Image.BILINEAR).rotate(spin * tt, expand=True)
            paste(c, b2, MX + x - b2.width / 2, MY + y - b2.height / 2)

class Ring:
    """Red marker ring that draws on around a point."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.pos = shot.point(spec["pos"], where + ".pos")
        self.rx, self.ry = num(spec.get("rx", 240), where + ".rx"), num(spec.get("ry", 240), where + ".ry")
        self.dur, self.tilt = num(spec.get("dur", 0.28), where + ".dur"), num(spec.get("tilt", -7), where + ".tilt")
    def draw(self, c, t, lt):
        x, y = self.pos(t); ring(c, x, y, self.rx, self.ry, (t - self.at) / self.dur, self.tilt)

class Arrow:
    """Curved red arrow that draws on from one point to another."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.p0, self.p1 = shot.point(spec["from"], where + ".from"), shot.point(spec["to"], where + ".to")
        self.bend, self.dur = num(spec.get("bend", 0.35), where + ".bend"), num(spec.get("dur", 0.3), where + ".dur")
    def draw(self, c, t, lt): arrow(c, self.p0(t), self.p1(t), self.bend, (t - self.at) / self.dur)

class Starburst:
    """Yellow and white hit burst for 0.45 s. Keep it off faces."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.pos, self.r = shot.point(spec["pos"], where + ".pos"), num(spec.get("r", 105), where + ".r")
    def draw(self, c, t, lt):
        x, y = self.pos(t); starburst(c, x, y, t - self.at, self.r)

class Hearts:
    """Hearts: a staggered "burst" rising from a point, or a looping "rise" across the frame."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.mode = pick(spec.get("mode", "rise"), ["burst", "rise"], where + ".mode")
        self.col = color(spec.get("color"), where + ".color", (255, 74, 120))
        sizes = spec.get("sizes", [34, 40, 46] if self.mode == "burst" else [30, 39, 48, 57])
        if not isinstance(sizes, list) or not sizes: raise PlanError(f"{where}.sizes: a list of sizes, used in turn")
        self.sizes = [num(s, f"{where}.sizes[{i}]") for i, s in enumerate(sizes)]
        n = lambda k, d: num(spec.get(k, d), f"{where}.{k}")
        if self.mode == "burst":
            if "pos" not in spec: raise PlanError(f"{where}: a burst needs pos")
            self.pos = shot.point(spec["pos"], where + ".pos")
            self.count, self.stagger, self.life, self.rise, self.spread = int(n("count", 7)), n("stagger", 0.09), n("life", 1.4), n("rise", 260), n("spread", 45)
        else:
            self.count, self.left, self.span, self.step = int(n("count", 10)), n("left", 160), n("span", 760), n("step", 97)
            self.y0, self.rise, self.life, self.rate, self.stagger = n("y", 1250), n("rise", 520), n("life", 2.0), n("rate", 0.9), n("stagger", 0.27)
            self.wiggle, self.fade_in = n("wiggle", 20), n("fadeIn", 0.3)
    def draw(self, c, t, lt):
        if self.mode == "burst":
            x0, y0 = self.pos(t)
            for i in range(self.count):
                tt = t - self.at - i * self.stagger
                if 0 <= tt < self.life:
                    heart(c, x0 + i * self.spread, y0 - self.rise * tt, self.sizes[i % len(self.sizes)], col=self.col, alpha=1 - tt / self.life)
            return
        for i in range(self.count):
            tt = (lt * self.rate + i * self.stagger) % self.life
            x = self.left + (i * self.step) % self.span + self.wiggle * math.sin(lt * 2 + i)
            a = clamp(1 - tt / self.life) * (clamp(lt / self.fade_in) if self.fade_in else 1.0)
            heart(c, x, self.y0 - self.rise * tt, self.sizes[i % len(self.sizes)], col=self.col, alpha=a)

class Heart:
    """One big heart that springs open (the final move)."""
    space = "scene"
    def __init__(self, spec, shot, where):
        self.pos, self.size = shot.point(spec["pos"], where + ".pos"), num(spec["size"], where + ".size")
        self.col, self.alpha = color(spec.get("color"), where + ".color", (255, 74, 120)), num(spec.get("alpha", 1), where + ".alpha")
        self.outline = bool(spec.get("outline", True))
    def draw(self, c, t, lt):
        x, y = self.pos(t); heart(c, x, y, self.size * spring(t - self.at), col=self.col, alpha=self.alpha, outline=self.outline)

class Sparkles:
    """White four-point sparkles that twinkle at fixed points."""
    space = "scene"
    def __init__(self, spec, shot, where):
        pts = spec["points"]
        if not isinstance(pts, list) or not pts: raise PlanError(f"{where}.points: a list of [x, y]")
        self.points = []
        for i, p in enumerate(pts):
            if not isinstance(p, list) or len(p) != 2: raise PlanError(f"{where}.points[{i}]: [x, y]")
            self.points.append((num(p[0], f"{where}.points[{i}][0]"), num(p[1], f"{where}.points[{i}][1]")))
        self.size, self.pulse = num(spec.get("size", 22), where + ".size"), num(spec.get("pulse", 10), where + ".pulse")
    def draw(self, c, t, lt):
        for i, (x, y) in enumerate(self.points):
            a = 0.5 + 0.5 * math.sin(lt * 7 + i * 1.7)
            sparkle(c, x, y, self.size + self.pulse * a, a)

class Card:
    """A white checklist or calendar card; a line can be struck through with an X stamp, or change text on a word."""
    space = "scene"
    def __init__(self, spec, shot, where):
        p = spec["pos"]
        if not isinstance(p, list) or len(p) != 2: raise PlanError(f"{where}.pos: [x, y] of the top-left corner")
        self.x, self.y, self.width = num(p[0], where + ".pos[0]"), num(p[1], where + ".pos[1]"), num(spec.get("width", 430), where + ".width")
        self.lines = []
        for i, line in enumerate(spec["lines"]):
            lw = f"{where}.lines[{i}]"
            keys(line, {"text", "color", "strike", "then"}, lw, required=("text",))
            then = [(shot.time(s[0], f"{lw}.then[{j}]"), str(s[1])) for j, s in enumerate(line.get("then", []))]
            strike = shot.time(line["strike"], lw + ".strike") if "strike" in line else None
            self.lines.append((str(line["text"]), color(line.get("color"), lw + ".color", INK), strike, sorted(then)))
    def draw(self, c, t, lt):
        rows, stamps = [], []
        for i, (text, col, strike, then) in enumerate(self.lines):
            for at, txt in then:
                if t >= at: text = txt
            rows.append((text, col))
            if strike is not None: stamps.append((i, (t - strike) / 0.25))
        card(c, self.x, self.y, rows, stamps, t - self.at, self.width)

class Title:
    """Big title words that spring in and wobble (screen space)."""
    space = "screen"
    def __init__(self, spec, shot, where):
        self.text, self.size = str(spec["text"]), int(num(spec["size"], where + ".size"))
        self.pair, self.y = pick(spec.get("color", "yellow"), list(PAIRS), where + ".color"), num(spec.get("y", 430), where + ".y")
    def draw(self, frame, t, lt): draw_title(frame, self.text, self.size, self.pair, t - self.at, self.y)

class Counter:
    """A number that counts up to a total, or counts the landings of a throw layer (screen space)."""
    space = "screen"
    def __init__(self, spec, shot, where):
        p = spec["pos"]
        if not isinstance(p, list) or len(p) != 2: raise PlanError(f"{where}.pos: [x, y] on screen")
        self.x, self.y = num(p[0], where + ".pos[0]"), num(p[1], where + ".pos[1]")
        self.size, self.pair = int(num(spec.get("size", 170), where + ".size")), pick(spec.get("color", "red"), list(PAIRS), where + ".color")
        self.prefix, self.suffix = str(spec.get("prefix", "")), str(spec.get("suffix", ""))
        if ("count" in spec) == ("countOf" in spec): raise PlanError(f"{where}: give either count or countOf")
        if "count" in spec:
            cnt = spec["count"]; cw = where + ".count"
            keys(cnt, {"from", "to", "start", "end", "curve"}, cw, required=("to", "start", "end"))
            self.lo, self.hi = num(cnt.get("from", 1), cw + ".from"), num(cnt["to"], cw + ".to")
            self.t0, self.t1, self.curve = shot.time(cnt["start"], cw + ".start"), shot.time(cnt["end"], cw + ".end"), num(cnt.get("curve", 2), cw + ".curve")
            if self.t1 <= self.t0: raise PlanError(f"{cw}: end is not after start")
            self.throw = None
        else:
            self.throw = shot.layer(spec["countOf"], where + ".countOf")
            if not isinstance(self.throw, Throw): raise PlanError(f"{where}.countOf: layer {spec['countOf']} is not a throw")
    def draw(self, frame, t, lt):
        if self.throw:
            n = self.throw.landed(t)
            if n == 0: return
            last = max(s for s in self.throw.arrivals if t >= s)
            pulse = env(t - last, 30)
        else:
            n = int(self.lo + (self.hi - self.lo) * clamp((t - self.t0) / (self.t1 - self.t0)) ** self.curve)
            ts = t - self.t0
            pulse = env(ts % 0.08, 30) if 0 <= ts < 0.7 else 0.0
        draw_counter(frame, f"{self.prefix}{n:,}{self.suffix}", pulse, self.x, self.y, self.size, self.pair)

LAYERS = {"sprite": Sprite, "prop": Prop, "throw": Throw, "swarm": Swarm, "ring": Ring, "arrow": Arrow, "starburst": Starburst,
          "hearts": Hearts, "heart": Heart, "sparkles": Sparkles, "card": Card, "title": Title, "counter": Counter}
# Keys each layer type takes besides type, at and until. The kit README documents every one.
LAYER_KEYS = {
    "sprite": {"image", "h", "x", "y", "rot", "scale", "flip", "bob", "sway", "alpha", "squash", "trail"},
    "prop": {"draw", "image", "h", "w", "tint", "scale", "x", "y", "rot", "trail"},
    "throw": {"draw", "image", "h", "w", "tint", "scale", "from", "to", "start", "every", "count", "dur", "arc", "spin", "sound", "squash"},
    "swarm": {"image", "h", "tints", "from", "count", "seed", "speed", "angle", "spin", "scale", "window"},
    "ring": {"pos", "rx", "ry", "dur", "tilt"},
    "arrow": {"from", "to", "bend", "dur"},
    "starburst": {"pos", "r"},
    "hearts": {"mode", "pos", "count", "sizes", "color", "stagger", "life", "rise", "spread", "left", "span", "step", "y", "rate", "wiggle", "fadeIn"},
    "heart": {"pos", "size", "color", "alpha", "outline"},
    "sparkles": {"points", "size", "pulse"},
    "card": {"pos", "lines", "width"},
    "title": {"text", "size", "color", "y"},
    "counter": {"pos", "size", "color", "prefix", "suffix", "count", "countOf"},
}
REQUIRED = {"sprite": ("image", "h", "x", "y"), "prop": ("x", "y"), "throw": ("from", "to", "start"), "swarm": ("image", "from"),
            "ring": ("pos",), "arrow": ("from", "to"), "starburst": ("pos",), "heart": ("pos", "size"), "sparkles": ("points",),
            "card": ("pos", "lines"), "title": ("text", "size"), "counter": ("pos",)}

# ---------- captions ----------
STOP = {"a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at", "is", "are", "was", "his", "her", "he", "she", "it",
        "its", "this", "that", "with", "so", "not", "very", "they", "their", "for", "by", "be", "has", "have", "up", "all"}

def caption_chunks(words, spec):
    """(first word, last word, key word or None) by word index; explicit in the plan, or 2-3 words per chunk broken at punctuation."""
    if "chunks" in spec:
        out = []
        for i, ch in enumerate(spec["chunks"]):
            where = f"captions.chunks[{i}]"
            if not isinstance(ch, list) or len(ch) != 3: raise PlanError(f"{where}: a chunk is [first, last, key or null]")
            a, b, k = ch
            for v in (a, b) + ((k,) if k is not None else ()):
                if not isinstance(v, int) or not 0 <= v < len(words): raise PlanError(f"{where}: {json.dumps(v)} is not a word index (0-{len(words) - 1})")
            if b < a or (k is not None and not a <= k <= b): raise PlanError(f"{where}: needs first <= key <= last")
            if out and a <= out[-1][1]: raise PlanError(f"{where}: overlaps the previous chunk")
            out.append((a, b, k))
        return out
    out, i = [], 0
    while i < len(words):
        j = i
        while j + 1 < len(words) and j - i < 2 and not re.search(r"[,.?!…;:]$", words[j]["w"]):
            j += 1
        while j + 1 < len(words) and words[j + 1]["w"].startswith(","): j += 1   # "2" ",000"
        cands = [k for k in range(i, j + 1) if re.sub(r"\W", "", words[k]["w"]).lower() not in STOP and not words[k]["w"].startswith(",")]
        key = max(cands, key=lambda k: len(re.sub(r"\W", "", words[k]["w"]))) if cands else None
        out.append((i, j, key)); i = j + 1
    return out

def chunk_tokens(words, a, b, key):
    toks, keytok = [], None
    i = a
    while i <= b:
        t = words[i]["w"].upper()
        if i + 1 <= b and words[i + 1]["w"].startswith(","): t += words[i + 1]["w"]; i += 1   # "2" ",000"
        t = t.replace("...", "")
        if i == key or (key is not None and i - 1 == key and t[0].isdigit()): keytok = t
        toks.append(t); i += 1
    return toks, keytok

# ---------- frames ----------
def setup(plan, plan_dir, args):
    global W, H, FPS, CW, CH, MX, MY, FONT, CUT, SPECKS, VIG
    keys(plan, {"$schema", "version", "title", "size", "fps", "duration", "font", "words", "cut", "captions", "specks", "tag",
                "music", "ambience", "sounds", "sheet", "shots"}, "plan", required=("duration", "shots"))
    if plan.get("version", 1) != 1: raise PlanError("version: this renderer reads version 1 plans")
    size = plan.get("size", [1080, 1920])
    if not isinstance(size, list) or len(size) != 2: raise PlanError("size: [width, height]")
    W, H = int(num(size[0], "size[0]")), int(num(size[1], "size[1]")); FPS = int(num(plan.get("fps", 30), "fps"))
    CW, CH = round(W * 1.12), round(H * 1.12)          # scene canvas = view + 12% margin
    MX, MY = (CW - W) // 2, (CH - H) // 2
    rel = lambda p: p if os.path.isabs(p) else os.path.join(plan_dir, p)
    FONT = args.font or (rel(plan["font"]) if plan.get("font") else DEFAULT_FONT)
    CUT = args.cut or rel(plan.get("cut", "cut"))
    words_path = args.words or rel(plan.get("words", "audio/words.json"))
    if not os.path.exists(words_path): raise FileNotFoundError(f"words file {words_path} (make it with words.py)")
    words = json.load(open(words_path))
    if not isinstance(words, list) or not all(isinstance(w, dict) and {"w", "s", "e"} <= set(w) for w in words):
        raise PlanError(f"{words_path}: expected the words.py output, a list of {{\"w\", \"s\", \"e\"}}")
    anchors_path = os.path.join(CUT, "anchors.json")
    anchors = json.load(open(anchors_path)) if os.path.exists(anchors_path) else None
    film = Film(plan, words, anchors)
    if anchors is None: film.media.add(anchors_path)
    film.media.add(FONT)
    cap = plan.get("captions", {})
    keys(cap, {"y", "size", "chunks"}, "captions")
    film.cap_y, film.cap_size = num(cap.get("y", 1470), "captions.y"), int(num(cap.get("size", 66), "captions.size"))
    film.chunks = caption_chunks(words, cap)
    tag = plan.get("tag", {})
    keys(tag, {"at", "y", "size"}, "tag")
    film.tag_at, film.tag_y, film.tag_size = film.time(tag.get("at", "end-1.7"), "tag.at"), num(tag.get("y", 1720), "tag.y"), int(num(tag.get("size", 40), "tag.size"))
    sp = plan.get("specks", True)
    if sp is not False:
        sp = {} if sp is True else sp
        keys(sp, {"count", "seed"}, "specks")
        rng = random.Random(int(num(sp.get("seed", 7), "specks.seed")))
        SPECKS = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(2, 6.5), rng.uniform(14, 50), rng.uniform(0, 6.28)) for _ in range(int(num(sp.get("count", 40), "specks.count")))]
    film.sheet = [film.time(x, f"sheet[{i}]") for i, x in enumerate(plan.get("sheet", []))]
    music = plan.get("music", {"bpm": 120})
    if music != "none":
        keys(music, {"bpm", "file"}, "music")
        if "bpm" in music and not 60 <= num(music["bpm"], "music.bpm") <= 180: raise PlanError("music.bpm: 60-180")
        if "file" in music: music = {**music, "file": rel(music["file"])}
    film.sound = {"duration": film.end, "music": music, "ambience": pick(plan.get("ambience", "none"), ["none", "bubbles"], "ambience")}
    VIG = vignette()
    return film

def draw_caption(film, frame, t):
    for j, (a, b, key) in enumerate(film.chunks):
        t0 = film.words[a]["s"]; t1 = film.words[film.chunks[j + 1][0]]["s"] if j + 1 < len(film.chunks) else film.end
        if t0 <= t < t1:
            toks, keytok = chunk_tokens(film.words, a, b, key)
            im = caption_img(toks, keytok, film.cap_size)
            s = 0.82 + 0.18 * ease_back((t - t0) / 0.13)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR)
            paste(frame, im, W / 2 - im.width / 2, film.cap_y - im.height / 2)

def render_frame(film, t):
    shot = film.shot_at(t); lt = t - shot.start
    c = bg(shot.bg, shot.flip)
    for layer in shot.scene:
        if layer.at <= t < layer.until: layer.draw(c, t, lt)
    z = shot.zoom(t)
    for te, amount in shot.punches: z *= punch(t, te, amount)
    frame = camera(c, z, shot.fx(t) if shot.fx else None, shot.fy(t) if shot.fy else None, shake_at(t, film.shakes))
    specks(frame, t)
    frame.alpha_composite(VIG)
    for layer in shot.screen:
        if layer.at <= t < layer.until: layer.draw(frame, t, lt)
    if t >= film.tag_at:
        a = clamp((t - film.tag_at) / 0.4); d = ImageDraw.Draw(frame)
        d.text((W / 2, film.tag_y), TAG_TEXT, font=font(film.tag_size), anchor="mm", fill=(255, 255, 255, int(255 * a)), stroke_width=4, stroke_fill=INK + (int(255 * a),))
    draw_caption(film, frame, t)
    return frame.convert("RGB")

def contact_sheet(film, times, out):
    th, tw = H // 4, W // 4; cols = 8; rows = math.ceil(len(times) / cols)
    sheet = Image.new("RGB", (tw * min(cols, len(times)), th * rows), "black")
    for i, tm in enumerate(times):
        fr = render_frame(film, tm).resize((tw, th), Image.BILINEAR)
        ImageDraw.Draw(fr).text((6, 4), f"{tm:.1f}", fill=(255, 255, 0))
        sheet.paste(fr, ((i % cols) * tw, (i // cols) * th))
    sheet.save(out, quality=88); print("sheet", out, f"({len(times)} frames)")

def default_times(film):
    """Two frames per shot (just after the cut and two thirds in), at most 24."""
    times = []
    for s in film.shots:
        times += [round(s.start + min(0.3, (s.end - s.start) / 3), 2), round(s.start + (s.end - s.start) * 0.66, 2)]
    return times[:24]

def main():
    ap = argparse.ArgumentParser(description="Render an animal-facts short from a JSON shot plan.")
    ap.add_argument("plan")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="validate the plan and list the media it needs")
    mode.add_argument("--sheet", metavar="SHEET.jpg", help="write a contact sheet")
    mode.add_argument("--out", metavar="VIDEO.mp4", help="render the silent video and VIDEO.sound.json")
    ap.add_argument("--times", help="contact sheet times in seconds, comma separated")
    ap.add_argument("--words"); ap.add_argument("--cut"); ap.add_argument("--font")
    args = ap.parse_args()
    try:
        plan = json.load(open(args.plan))
        film = setup(plan, os.path.dirname(os.path.abspath(args.plan)), args)
    except PlanError as e:
        print(f"plan error: {e}", file=sys.stderr); sys.exit(2)
    except FileNotFoundError as e:
        print(f"missing: {e}", file=sys.stderr); sys.exit(4)
    except json.JSONDecodeError as e:
        print(f"plan error: {args.plan} is not valid JSON: {e}", file=sys.stderr); sys.exit(2)
    missing = sorted(p for p in film.media if not os.path.exists(p))
    if args.check:
        for i, s in enumerate(film.shots):
            print(f"{i:>2} {s.start:6.2f}-{s.end:6.2f}  {s.id:<14} bg {s.bg}{' (flipped)' if s.flip else ''}: {', '.join(type(l).__name__.lower() for l in s.layers) or 'no layers'}")
        print(f"{len(film.shots)} shots, {film.end:.2f} s, {len(film.chunks)} caption chunks, {len(film.events)} sounds")
    if missing:
        print("missing media:\n  " + "\n  ".join(missing), file=sys.stderr); sys.exit(4)
    if args.check:
        print("plan ok"); return
    os.makedirs(os.path.dirname(os.path.abspath(args.sheet or args.out)), exist_ok=True)
    if args.sheet:
        times = [float(x) for x in args.times.split(",")] if args.times else film.sheet or default_times(film)
        contact_sheet(film, times, args.sheet); return
    if not shutil.which("ffmpeg"):
        print("ffmpeg is not on PATH; install FFmpeg (see the kit README)", file=sys.stderr); sys.exit(3)
    n = int(film.end * FPS)
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", args.out], stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(render_frame(film, i / FPS).tobytes())
        if i % 150 == 0: print("frame", i, "/", n, flush=True)
    p.stdin.close()
    if p.wait() != 0: print("ffmpeg failed", file=sys.stderr); sys.exit(1)
    cues = os.path.splitext(args.out)[0] + ".sound.json"
    json.dump({**film.sound, "events": sorted(film.events)}, open(cues, "w"), indent=1)
    print("done", args.out, "and", cues)

if __name__ == "__main__":
    main()
