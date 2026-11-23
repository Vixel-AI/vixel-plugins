# Turn downloaded Vixel pictures into render inputs: character-sheet views and pose frames become cropped
# RGBA cutouts, backgrounds become cover-fit plates, and anchors.json records points other layers aim at.
#
#   prep.py look SHEET.png --out cut --views dad_closeup,dad_front,dad_side,dad_back   (_ skips a view; a grid reads row by row)
#   prep.py cutout FRAME.png ... --out cut [--names pose_b01,...]
#   prep.py plate BG.png ... --out cut [--size 1080x1920] [--margin 1.12]
#   prep.py anchors cut [--region belly=235-255,205-240,160-215 ...]
#
# A picture whose border is opaque gets its flat background keyed out first (--key auto|always|never).
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def crop_alpha(im, pad=6, thr=8):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > thr)
    if not len(xs): raise SystemExit("nothing opaque left after keying; check the picture or use --key never")
    y0, y1, x0, x1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0] - 1), max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1] - 1)
    return im.crop((x0, y0, x1 + 1, y1 + 1))

def key_background(im, tol=14):
    """Flood the flat background from the border and turn it transparent, with a soft 2px edge."""
    rgb = np.array(im.convert("RGB")).astype(np.int16)
    corners = np.concatenate([rgb[:4, :4].reshape(-1, 3), rgb[:4, -4:].reshape(-1, 3), rgb[-4:, :4].reshape(-1, 3), rgb[-4:, -4:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    near = np.abs(rgb - bg).max(axis=2) <= tol
    lab, _ = ndimage.label(near)                                   # 4-connected
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    alpha = np.where(np.isin(lab, list(border)), 0, 255).astype(np.uint8)
    alpha = ndimage.grey_erosion(alpha, size=(3, 3), mode="mirror")
    alpha = ndimage.gaussian_filter(alpha.astype(np.float32), 1.1, truncate=2 / 1.1, mode="mirror").round().astype(np.uint8)
    return Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), "RGBA")

def needs_key(im):
    """True when the picture has no transparent border, i.e. it came back on a flat colour."""
    a = np.array(im.convert("RGBA"))[:, :, 3]
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    return (edge > 250).mean() > 0.9

def load(path, key):
    im = Image.open(path).convert("RGBA")
    if key == "always" or (key == "auto" and needs_key(im)):
        print(f"{os.path.basename(path)}: keying out the flat background")
        im = key_background(im)
    return im

def spans(occupied, min_size):
    """Runs of occupied rows or columns longer than min_size, as (start, end) pairs."""
    out, start = [], None
    for i, occ in enumerate(np.append(occupied, False)):
        if occ and start is None: start = i
        if not occ and start is not None:
            if i - start > min_size: out.append((start, i))
            start = None
    return out

def split_views(im, min_width=60):
    """Split a character sheet into views on fully transparent rows, then columns: a single row or a grid,
    read left to right, top to bottom."""
    a = np.array(im)[:, :, 3] > 8
    rows = spans(a.any(axis=1), min_width)
    views = []
    for i, (y0, y1) in enumerate(rows):
        # Each row of views reaches halfway into the empty gaps around it, so a single row keeps the full height.
        top = 0 if i == 0 else (rows[i - 1][1] + y0) // 2
        bottom = im.height if i == len(rows) - 1 else (y1 + rows[i + 1][0]) // 2
        views += [crop_alpha(im.crop((x0, top, x1, bottom))) for x0, x1 in spans(a[y0:y1].any(axis=0), min_width)]
    return views

def cmd_look(args):
    names = args.views.split(",")
    views = split_views(load(args.sheet, args.key))
    print(f"{os.path.basename(args.sheet)}: {len(views)} views", [v.size for v in views])
    if len(views) != len(names):
        raise SystemExit(f"found {len(views)} views but --views names {len(names)}; look at the sheet and name each view left to right, top to bottom (_ to skip)")
    for name, v in zip(names, views):
        if name != "_": v.save(os.path.join(args.out, f"{name}.png")); print(" ", f"{name}.png", v.size)

def cmd_cutout(args):
    names = args.names.split(",") if args.names else [os.path.splitext(os.path.basename(f))[0] for f in args.frames]
    if len(names) != len(args.frames): raise SystemExit("--names needs one name per frame")
    for f, name in zip(args.frames, names):
        im = crop_alpha(load(f, args.key))
        im.save(os.path.join(args.out, f"{name}.png")); print(f"{name}.png", im.size)

def cmd_plate(args):
    W, H = (int(v) for v in args.size.lower().split("x"))
    PW, PH = round(W * args.margin), round(H * args.margin)        # margin for drift, punch-ins and shake
    for f in args.backgrounds:
        im = Image.open(f).convert("RGB")
        s = max(W * args.margin / im.width, H * args.margin / im.height)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        x0, y0 = (im.width - PW) // 2, (im.height - PH) // 2
        im = im.crop((x0, y0, x0 + PW, y0 + PH)).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
        name = os.path.splitext(os.path.basename(f))[0]
        name = name if name.startswith("bg_") else f"bg_{name}"
        im.save(os.path.join(args.out, f"{name}.jpg"), quality=93); print(f"{name}.jpg", im.size)

def parse_region(text):
    name, _, ranges = text.partition("=")
    try:
        lo_hi = [tuple(int(v) for v in r.split("-")) for r in ranges.split(",")]
        assert name and len(lo_hi) == 3 and all(len(r) == 2 for r in lo_hi)
    except (ValueError, AssertionError):
        raise SystemExit(f"--region {text!r}: use name=R0-R1,G0-G1,B0-B1, e.g. belly=235-255,205-240,160-215")
    return name, lo_hi

def cmd_anchors(args):
    """Fractional points for each cutout: left_tip/right_tip (outermost opaque column), top, bottom, and colour regions."""
    regions = [parse_region(r) for r in args.region or []]
    out = {}
    for f in sorted(os.listdir(args.cut)):
        if not f.endswith(".png"): continue
        a = np.array(Image.open(os.path.join(args.cut, f)).convert("RGBA")).astype(int)
        h, w = a.shape[:2]
        info = {"w": w, "h": h}
        al = a[..., 3]; occ = al > 128
        if not occ.any(): continue
        cols, rows = np.where(occ.any(0))[0], np.where(occ.any(1))[0]
        lx, rx, ty, by = cols.min(), cols.max(), rows.min(), rows.max()
        info["left_tip"] = [round(lx / w, 3), round(np.where(occ[:, lx])[0].mean() / h, 3)]
        info["right_tip"] = [round(rx / w, 3), round(np.where(occ[:, rx])[0].mean() / h, 3)]
        info["top"] = [round(np.where(occ[ty])[0].mean() / w, 3), round(ty / h, 3)]
        info["bottom"] = [round(np.where(occ[by])[0].mean() / w, 3), round(by / h, 3)]
        for name, ((r0, r1), (g0, g1), (b0, b1)) in regions:
            m = (al > 200) & (a[..., 0] >= r0) & (a[..., 0] <= r1) & (a[..., 1] >= g0) & (a[..., 1] <= g1) & (a[..., 2] >= b0) & (a[..., 2] <= b1)
            ys, xs = np.where(m)
            if len(xs) > 500:   # [centre x, centre y, width, height, top], fractions of the cutout
                info[name] = [round(xs.mean() / w, 3), round(ys.mean() / h, 3), round((xs.max() - xs.min()) / w, 3), round((ys.max() - ys.min()) / h, 3), round(ys.min() / h, 3)]
        out[os.path.splitext(f)[0]] = info
        print(os.path.splitext(f)[0], {k: v for k, v in info.items() if k not in ("w", "h")})
    json.dump(out, open(os.path.join(args.cut, "anchors.json"), "w"), indent=1)
    print("anchors.json:", len(out), "cutouts")

def main():
    ap = argparse.ArgumentParser(description="Prepare Vixel pictures for render.py.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("look", help="split a character sheet (one row or a grid) into named views")
    p.add_argument("sheet"); p.add_argument("--views", required=True, help="one name per view, left to right, top to bottom; _ skips one")
    p = sub.add_parser("cutout", help="crop pose frames to their opaque pixels")
    p.add_argument("frames", nargs="+"); p.add_argument("--names", help="output names, one per frame")
    for name in ("look", "cutout"):
        sub.choices[name].add_argument("--out", required=True); sub.choices[name].add_argument("--key", choices=["auto", "always", "never"], default="auto")
    p = sub.add_parser("plate", help="cover-fit backgrounds with a margin for camera moves")
    p.add_argument("backgrounds", nargs="+"); p.add_argument("--out", required=True)
    p.add_argument("--size", default="1080x1920"); p.add_argument("--margin", type=float, default=1.12)
    p = sub.add_parser("anchors", help="write anchors.json for every cutout in a folder")
    p.add_argument("cut"); p.add_argument("--region", action="append", help="name=R0-R1,G0-G1,B0-B1 colour box, e.g. a belly")
    args = ap.parse_args()
    if hasattr(args, "out"): os.makedirs(args.out, exist_ok=True)
    {"look": cmd_look, "cutout": cmd_cutout, "plate": cmd_plate, "anchors": cmd_anchors}[args.cmd](args)

if __name__ == "__main__":
    main()
