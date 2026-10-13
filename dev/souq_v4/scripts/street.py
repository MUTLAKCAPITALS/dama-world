# DAMA WORLD — souq v4 — STREET TEST: one short Mubarakiya alley joining three different buildings.
#   North side: the approved hero building (unchanged) + Building B, a single-storey arcade (riwaq) of
#               pointed arches with a covered walkway and glazed shopfronts behind it.
#   South side: Building C, a two-storey merchant house with a projecting timber balcony (roshan) and
#               ground-floor shops, joined to a single-storey row of small folding-door shops.
#   Over the alley: a timber pergola anchored to the north facades and carried on posts on the south
#   side, with hanging lanterns (from the user's Mubarakiya photo).
#   Ground: a designed pattern, not random: grey square field on one grid, beige facade bands, beige
#   cross bands every 4.5 m that line up with the pergola posts, circular medallions on the centreline,
#   slot drains along both facades.
# Alley: x -8..16, north facade line y = 0, south facade line y = -7 (7 m wide; 5+ m clear walking lane).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
import lib, hero, details, materials as MT
from lib import R

def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
def RZ(a): return Matrix.Rotation(math.radians(a), 4, 'Z')
def RX(a): return Matrix.Rotation(math.radians(a), 4, 'X')
def RY(a): return Matrix.Rotation(math.radians(a), 4, 'Y')

YN, YS = 0.0, -7.0
X0, X1 = -8.5, 16.5
BAND = 4.5                      # cross-band / pergola-post spacing, centred on the hero gate (x = 0)
POSTS_X = [-5.5, -2.25, 2.25, 6.75, 11.25, 14.9]
POST_Y = -5.9

# ------------------------------------------------------------------ Arabic signs (shaped to presentation forms)
_FORMS = {  # isolated, final, initial, medial
 'ا': ('\uFE8D', '\uFE8E', None, None), 'أ': ('\uFE83', '\uFE84', None, None), 'ب': ('\uFE8F', '\uFE90', '\uFE91', '\uFE92'),
 'ت': ('\uFE95', '\uFE96', '\uFE97', '\uFE98'), 'ة': ('\uFE93', '\uFE94', None, None), 'ث': ('\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'),
 'ج': ('\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'), 'ح': ('\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'), 'خ': ('\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'),
 'د': ('\uFEA9', '\uFEAA', None, None), 'ذ': ('\uFEAB', '\uFEAC', None, None), 'ر': ('\uFEAD', '\uFEAE', None, None),
 'ز': ('\uFEAF', '\uFEB0', None, None), 'س': ('\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'), 'ش': ('\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'),
 'ص': ('\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'), 'ط': ('\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'), 'ع': ('\uFEC9', '\uFECA', '\uFECB', '\uFECC'),
 'غ': ('\uFECD', '\uFECE', '\uFECF', '\uFED0'), 'ف': ('\uFED1', '\uFED2', '\uFED3', '\uFED4'), 'ق': ('\uFED5', '\uFED6', '\uFED7', '\uFED8'),
 'ك': ('\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'), 'ل': ('\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'), 'م': ('\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'),
 'ن': ('\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'), 'ه': ('\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'), 'و': ('\uFEED', '\uFEEE', None, None),
 'ي': ('\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'), 'ى': ('\uFEEF', '\uFEF0', None, None),
}
def shape_ar(text):
    """Minimal Arabic shaper (contextual forms + lam-alef), output in visual (left-to-right) order."""
    out = []
    for word in text.split(' '):
        w = word.replace('لا', '\uFEFB')
        chars = list(w); res = []
        for i, ch in enumerate(chars):
            if ch == '\uFEFB':
                prev = chars[i - 1] if i else None
                joins_prev = prev in _FORMS and _FORMS[prev][2] is not None
                res.append('\uFEFC' if joins_prev else '\uFEFB'); continue
            f = _FORMS.get(ch)
            if not f: res.append(ch); continue
            prev = chars[i - 1] if i else None
            nxt = chars[i + 1] if i + 1 < len(chars) else None
            jp = prev in _FORMS and _FORMS[prev][2] is not None
            jn = f[2] is not None and nxt is not None and (nxt in _FORMS or nxt == '\uFEFB')
            if jp and jn: res.append(f[3])
            elif jp: res.append(f[1])
            elif jn: res.append(f[2])
            else: res.append(f[0])
        out.append(''.join(reversed(res)))
    return ' '.join(reversed(out))

def _font():
    for p in (r'C:\Windows\Fonts\tahomabd.ttf', r'C:\Windows\Fonts\tahoma.ttf', r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\arial.ttf'):
        if os.path.exists(p):
            f = bpy.data.fonts.get(os.path.basename(p)) or bpy.data.fonts.load(p, check_existing=True)
            return f
    return None

def sign(c, M, text, cx, z, w, h, y=-0.01, paint='signboard'):
    """Painted timber signboard with raised Arabic lettering, facing -y, front face at y."""
    bm = bmesh.new()
    vs, _ = lib.bm_box(bm, cx - w / 2, cx + w / 2, y - .035, y, z, z + h); lib.set_rand_attr(bm, vs, R.random())
    for zz in (z - .02, z + h):
        vs, _ = lib.bm_box(bm, cx - w / 2 - .03, cx + w / 2 + .03, y - .05, y, zz, zz + .02); lib.set_rand_attr(bm, vs, R.random())
    b = lib.from_bm('Sign_' + text[:6], bm, c, M[paint]); lib.uv_box(b); lib.bevel(b, .004, 2)
    cu = bpy.data.curves.new('SignText', 'FONT'); cu.body = shape_ar(text)
    f = _font()
    if f: cu.font = f
    cu.size = h * .62; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = .004
    t = bpy.data.objects.new('SignText_' + text[:6], cu); c.objects.link(t)
    t.location = (cx, y - .036, z + h / 2); t.rotation_euler = (math.radians(90), 0, 0)
    cu.materials.append(M['signtext'])
    return b, t

def transform_collection(c, m):
    bpy.context.view_layer.update()            # matrix_world of freshly created objects is stale until this
    for o in c.all_objects:
        if o.parent is None: o.matrix_world = m @ o.matrix_world

# ------------------------------------------------------------------ materials for the street test
def street_materials(M):
    M = dict(M)
    M['plaster_w'] = MT.M_plaster('M_LimePlasterWhite', '#d4c3a0', .65, .74)
    M['plaster_o'] = MT.M_plaster('M_LimePlasterOchre', '#c2a072', .75, .71)
    M['shopgreen'] = MT.M_wood_painted('M_ShopfrontGreen', '#2f4a36', .74)
    M['shopblue'] = MT.M_wood_painted('M_ShutterBlue', '#3b5f7a', .69)
    M['signboard'] = MT.M_wood_painted('M_SignBoard', '#3a2a1c', .78)
    b = MT.NB('M_SignText'); b.bsdf(MT.lin('#e8dcc0'), .45); M['signtext'] = b.m
    b = MT.NB('M_ShopGlass')
    b.bsdf(MT.lin('#c9d2cc'), .05, extra={'Transmission Weight': .92, 'IOR': 1.5}); M['shopglass'] = b.m
    # fabric bolts / rugs: hue from object colour
    b = MT.NB('M_Fabric'); P = b.pos(); w = b.wave(P, 120, .2, 1, 'BANDS', 'Z', 'SIN'); n = b.noise(P, 5, 3, .5)
    b.bsdf(b.hsv(b.objcolor(), .5, 1.0, b.math('ADD', .8, b.math('MULTIPLY', n, .3))), .9, b.bump(w, .3, .002), extra={'Sheen Weight': .6}); M['fabric'] = b.m
    # palm: fronds green-olive drying to straw at the tips, trunk of overlapping leaf bases
    b = MT.NB('M_PalmFrond'); uv = b.uv(); u = b.sep(uv)[0]; n = b.noise(b.pos(), 3, 3, .5)
    col = b.ramp(n, [(0, MT.lin('#3f4f22')), (.6, MT.lin('#5a6a2c')), (1, MT.lin('#7a7a3a'))])
    col = b.mix(col, MT.lin('#a08a50'), b.math('MULTIPLY', b.band(u, .75, 1.0), .7))
    b.bsdf(col, .6, extra={'Subsurface Weight': .0}); M['frond'] = b.m
    M['trunk'] = MT.M_wood_weathered('M_PalmTrunk', '#6a5a44', '#2a2016')
    b = MT.NB('M_Dates'); P = b.pos(); n = b.noise(P, 40, 3, .5)
    b.bsdf(b.ramp(n, [(0, MT.lin('#3a1a0c')), (1, MT.lin('#6a3418'))]), .35, b.bump(b.noise(P, 120, 3, .6), .5, .001)); M['dates'] = b.m
    return M

# ------------------------------------------------------------------ small reusable builders
def corbel(bm, x, y, z, depth=.35, h=.28, w=.16, m=None):
    """Timber corbel: stepped brackets under a beam or balcony."""
    for k in range(3):
        d = depth * (k + 1) / 3; hh = h * (3 - k) / 3
        vs, _ = lib.bm_box(bm, x - w / 2, x + w / 2, y - d, y, z - hh, z - hh + h / 3, m=m); lib.set_rand_attr(bm, vs, R.random())

def pole_row(bm, x0, x1, z, y_out=0.0, y_in=6.0, spacing=.42, ends=None):
    n = max(1, int((x1 - x0) / spacing))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n + R.uniform(-.03, .03); r = R.uniform(.055, .072)
        r0, r1 = lib.bm_cyl(bm, (x, y_out - R.uniform(.14, .28), z + R.uniform(-.01, .01)), (x, y_in, z), r, 16, r1=r * .9)
        lib.set_rand_attr(bm, r0 + r1, R.random())
        if ends is not None: ends.append((x, z))

def glazed_shopfront(c, M, name, x0, x1, z0, z1, y, paint='shopgreen', open_doors=True):
    """Old-style timber shopfront: frame, transom, mullions, pair of glazed doors with kick panels, glass.
    The doors stand open (hinged inward) so players can walk into the shop."""
    fr = bmesh.new(); gl = bmesh.new(); br = bmesh.new()
    t0, t1 = y, y + .12
    def piece(a, b, c0, c1, ya=t0, yb=t1):
        vs, _ = lib.bm_box(fr, a, b, ya, yb, c0, c1); lib.set_rand_attr(fr, vs, R.random())
    piece(x0, x0 + .09, z0, z1); piece(x1 - .09, x1, z0, z1); piece(x0, x1, z1 - .09, z1)
    zt = z1 - .62                                     # transom
    piece(x0, x1, zt - .07, zt)
    w = x1 - x0; mid = (x0 + x1) / 2
    for k in (1, 2):                                  # transom bars
        xx = x0 + w * k / 3; piece(xx - .02, xx + .02, zt, z1 - .09)
    # doors: two leaves, each with a kick panel and glass above; hinged at the jambs, opened inward
    ang = 82 if open_doors else 0
    for (a, b), left in (((x0 + .09, mid - .004), True), ((mid + .004, x1 - .09), False)):
        lw = b - a
        m = (T(a, 0, 0) @ RZ(ang)) if left else (T(b, 0, 0) @ RZ(-ang) @ T(-lw, 0, 0))
        def lp(u0, u1, c0, c1, ya, yb, bmx=fr, glass=False):
            vs, _ = lib.bm_box(bmx, u0, u1, ya, yb, c0, c1, m=m)
            if not glass: lib.set_rand_attr(bmx, vs, R.random())
        lp(0, .07, z0, zt - .07, t0 + .02, t0 + .07); lp(lw - .07, lw, z0, zt - .07, t0 + .02, t0 + .07)
        lp(0, lw, z0, z0 + .55, t0 + .02, t0 + .07); lp(0, lw, z0 + .55, z0 + .62, t0 + .015, t0 + .075)
        lp(0, lw, zt - .14, zt - .07, t0 + .02, t0 + .07)
        lp(.07, lw - .07, z0 + .08, z0 + .47, t0 + .03, t0 + .06)              # raised kick panel
        lp(lw / 2 - .015, lw / 2 + .015, z0 + .62, zt - .14, t0 + .03, t0 + .06)
        lp(.07, lw - .07, z0 + .62, zt - .14, t0 + .044, t0 + .048, gl, True)
        hx = lw - .06 if left else .06                                            # brass pull on each leaf
        lp(hx - .012, hx + .012, z0 + .95, z0 + 1.25, t0 - .02, t0 + .0, br)
    # brass handles
    br = bmesh.new()
    for xx in (mid - .06, mid + .06):
        lib.bm_cyl(br, (xx, t0 - .03, z0 + .95), (xx, t0 - .03, z0 + 1.25), .012, 8)
    bo = lib.from_bm(name + '_Handles', br, c, M['brass'], smooth=True); lib.uv_box(bo)

def shop_room(c, M, name, x0, x1, y0, y1, kind, light=True):
    """Simple furnished interior seen through a shopfront (walls are part of the building shell)."""
    wood = bmesh.new(); props = bmesh.new(); mat2 = None
    d = 1 if y1 > y0 else -1
    yb = y1 - d * .02                                # back wall face
    for zz in (.6, 1.15, 1.7, 2.25):
        vs, _ = lib.bm_box(wood, x0 + .1, x1 - .1, min(yb, yb - d * .38), max(yb, yb - d * .38), zz, zz + .03); lib.set_rand_attr(wood, vs, R.random())
    ymid = (y0 + y1) / 2
    vs, _ = lib.bm_box(wood, x0 + .3, x1 - .3, min(ymid, ymid + d * .5), max(ymid, ymid + d * .5), 0, .85); lib.set_rand_attr(wood, vs, R.random())
    if kind == 'textile':
        for zz in (.63, 1.18, 1.73):
            x = x0 + .2
            while x < x1 - .25:
                bm = bmesh.new()
                lib.bm_cyl(bm, (x, yb - d * .02, zz + .075), (x, yb - d * .36, zz + .075), .07, 14)
                o = lib.from_bm(name + '_Bolt', bm, c, M['fabric'], smooth=True); lib.uv_box(o)
                o.color = (R.uniform(.2, .8), R.uniform(.1, .5), R.uniform(.1, .4), 1)
                x += .16
    elif kind == 'dates':
        for zz in (.63, 1.18, 1.73):
            x = x0 + .25
            while x < x1 - .3:
                lib.bm_box(props, x - .14, x + .14, min(yb - d * .05, yb - d * .3), max(yb - d * .05, yb - d * .3), zz + .03, zz + .14)
                x += .34
        for k in range(3):
            xx = x0 + .5 + k * .45
            details.balls(c, M, xx, ymid + d * .25, .86, .18, 40, (.25, .12, .05), name + '_DatesHeap', .016)
        mat2 = 'basket'
    elif kind == 'perfume':
        for zz in (.63, 1.18, 1.73, 2.28):
            x = x0 + .2
            while x < x1 - .2:
                h = R.uniform(.12, .24); r = R.uniform(.03, .05)
                lib.bm_lathe(props, (x, yb - d * .18, zz + .03), [(0, 0), (r, 0), (r, h * .7), (r * .4, h * .8), (r * .35, h), (0, h)], 12)
                x += r * 2 + .05
        mat2 = 'glassjar'
    elif kind == 'gold':
        for zz in (.63, 1.18, 1.73):
            x = x0 + .2
            while x < x1 - .2:
                lib.bm_torus(props, (x, yb - d * .15, zz + .12), .06, .008, (0, 1, 0), 18, 6); x += .17
        mat2 = 'brass'
    elif kind == 'brass':
        for zz in (.63, 1.18, 1.73):
            x = x0 + .25
            while x < x1 - .25:
                r = R.uniform(.08, .14)
                lib.bm_lathe(props, (x, yb - d * .19, zz + .03), [(0, 0), (r * .6, 0), (r, r * .5), (r * .5, r * 1.3), (r * .45, r * 1.6), (0, r * 1.6)], 16)
                x += r * 2 + .06
        mat2 = 'brass'
    wo = lib.from_bm(name + '_Shelves', wood, c, M['beam']); lib.uv_box(wo); lib.bevel(wo, .004, 2)
    if mat2 and len(props.verts):
        po = lib.from_bm(name + '_Props', props, c, M[mat2], smooth=True); lib.uv_box(po)
    else: props.free()
    if light:
        L = bpy.data.lights.new(name + '_Lamp', 'POINT'); L.color = (1, .78, .5); L.shadow_soft_size = .15
        lo = bpy.data.objects.new(name + '_Lamp', L); lo.location = ((x0 + x1) / 2, ymid, 2.6); c.objects.link(lo)
        lo['day_energy'] = 40.0; lo['night_energy'] = 80.0

def window(c, M, cx, z0, z1, w, paint='shutter', open_deg=(0, 0), tag='W'):
    """Same construction language as the hero windows: casing, stop bead, sill board, forged bars, panelled leaves."""
    fr = bmesh.new(); lv = bmesh.new(); br = bmesh.new()
    a, b = cx - w / 2, cx + w / 2
    for vs in (lib.bm_box(fr, a, a + .07, .30, .44, z0, z1)[0], lib.bm_box(fr, b - .07, b, .30, .44, z0, z1)[0],
               lib.bm_box(fr, a, b, .30, .44, z1 - .07, z1)[0], lib.bm_box(fr, a - .015, b + .015, .27, .46, z0, z0 + .055)[0]):
        lib.set_rand_attr(fr, vs, R.random())
    for i in range(4):
        x = a + (b - a) * (i + 1) / 5
        lib.bm_box(br, x - .011, x + .011, .109, .131, z0 - .04, z1 + .04, m=None)
    lw = (b - a - .14) / 2; h = z1 - z0 - .13
    hero.panel_leaf(lv, lw, h, m=T(a + .07, .42, z0 + .06) @ RZ(open_deg[0]))
    hero.panel_leaf(lv, lw, h, m=T(b - .07, .42, z0 + .06) @ RZ(-open_deg[1]) @ T(-lw, 0, 0))
    f = lib.from_bm(tag + '_Frame', fr, c, M['frame']); lib.uv_box(f); lib.bevel(f, .005, 2)
    l = lib.from_bm(tag + '_Leaves', lv, c, M[paint]); lib.uv_box(l); lib.bevel(l, .004, 2)
    bo = lib.from_bm(tag + '_Bars', br, c, M['iron']); lib.uv_box(bo); lib.bevel(bo, .003, 2)

def lintel(bm, a, b, z0, z1, t=.55):
    vs, _ = lib.bm_box(bm, a, b, -.012, t - .01, z0, z1); lib.set_rand_attr(bm, vs, R.random())

def spout(wood, iron, x, z):
    m = T(x, 0, z) @ RX(7)
    lib.bm_box(wood, -.08, .08, -.8, .35, 0, .025, m=m); lib.bm_box(wood, -.08, -.055, -.8, .35, .025, .13, m=m)
    lib.bm_box(wood, .055, .08, -.8, .35, .025, .13, m=m); lib.bm_box(iron, -.085, .085, -.6, -.55, -.004, .002, m=m)

def decal_set(c, M, name, quads):
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    for (x0, x1, z0, z1) in quads: details._decal_quad(bm, uv, x0, x1, z0, z1, -.032)
    d = lib.from_bm(name, bm, c, M['drip']); d.visible_shadow = False
    return d

# ------------------------------------------------------------------ Building B: arcade of pointed arches (north side, east of hero)
B_X0, B_X1 = 5.75, 15.05
def building_B(c, M):
    x0, x1 = B_X0, B_X1; D = 6.5; H = 4.4; PAR = 5.1
    span, pier, endp = 2.2, .6, .75
    arch_x = [x0 + endp + span / 2 + k * (span + pier) for k in range(3)]
    shop_x = [(ax - .95, ax + .95) for ax in arch_x]
    solids = [(x0, x1, 0, .5, 0, H), (x0, x1, D - .5, D, 0, H), (x0 + .02, x0 + .45, 0, D, 0, H), (x1 - .45, x1, 0, D, 0, H),
              (x0, x1, 2.5, 3.0, 0, H),                                                   # shopfront wall behind the walkway
              (x0, x1, 0, .35, H, PAR), (x0, x1, D - .35, D, H, PAR), (x0, x0 + .35, .35, D - .35, H, PAR), (x1 - .35, x1, .35, D - .35, H, PAR)]
    for k in range(2):                                                                     # party walls between the shop rooms
        mx = (arch_x[k] + arch_x[k + 1]) / 2
        solids.append((mx - .15, mx + .15, 3.0, D - .5, 0, H))
    holes = [(a, b, 2.4, 3.1, 0, 3.0) for a, b in shop_x]
    sh = bmesh.new()
    lib.shell(sh, solids, holes)
    so = lib.from_bm('B_Shell', sh, c, [M['plaster_w']]); lib.uv_box(so, arch=True)
    # pointed arches: two-centred, centres 0.2 x span inside the springing points; cut with a boolean
    zs = 2.2; e = .2 * span; r = span / 2 + e
    cut = bmesh.new()
    def arch_pts(cx, rad, steps=14):
        """Two-centred pointed arch curve (left springing -> apex -> right springing)."""
        ta = math.acos(-e / rad)
        left = [(cx + e + rad * math.cos(math.pi - (math.pi - ta) * i / steps), zs + rad * math.sin(math.pi - (math.pi - ta) * i / steps)) for i in range(steps + 1)]
        right = [(2 * cx - px, pz) for (px, pz) in reversed(left[:-1])]
        return left + right
    SWAP = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for ax in arch_x:
        pts = arch_pts(ax, r)
        pts = [(ax - span / 2, -1.0)] + pts + [(ax + span / 2, -1.0)]
        lib.bm_prism(cut, pts, -.3, .8, m=SWAP)
    bmesh.ops.recalc_face_normals(cut, faces=cut.faces)
    co = lib.from_bm('B_ArchCutter', cut, c); co.hide_render = True; co.hide_viewport = True; co.display_type = 'WIRE'
    bo = so.modifiers.new('Arches', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = co; bo.solver = 'EXACT'
    lib.plaster_mods(so, .035, 2, .008)
    # archivolt bands (proud plaster rings) and impost blocks
    rings = bmesh.new()
    for ax in arch_x:
        inner = arch_pts(ax, r); outer = arch_pts(ax, r + .14)
        for i in range(len(inner) - 1):
            lib.bm_prism(rings, [inner[i], inner[i + 1], outer[i + 1], outer[i]], -.035, 0.0, m=SWAP)
        for sx in (-1, 1):
            lib.bm_box(rings, ax + sx * span / 2 - .1, ax + sx * span / 2 + .1, -.05, .0, zs - .12, zs)
    bmesh.ops.remove_doubles(rings, verts=rings.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(rings, faces=rings.faces)
    ro = lib.from_bm('B_Archivolts', rings, c, M['plaster_w']); lib.uv_box(ro, arch=True); lib.bevel(ro, .01, 2)
    # coping, string at roof level
    cp = bmesh.new()
    lib.bm_box(cp, x0 - .02, x1 + .03, -.03, .38, PAR, PAR + .08)
    lib.bm_box(cp, x0, x1 + .03, -.04, 0, H - .1, H)
    cpo = lib.from_bm('B_Coping', cp, c, M['plaster_w']); lib.uv_box(cpo, arch=True); lib.plaster_mods(cpo, .02, 2, .004)
    # walkway ceiling: poles + mat + slab; roof poles show at the facade above the arches
    poles = bmesh.new(); mats = bmesh.new(); mud = bmesh.new(); ends = []
    pole_row(poles, x0 + .6, x1 - .6, H - .3, 0.0, D, .42, ends)
    lib.bm_box(mats, x0 + .45, x1 - .45, .5, D - .5, H - .23, H - .215)
    lib.bm_box(mud, x0 + .35, x1 - .35, .35, D - .35, H - .215, H + .03)
    lib.bm_box(mud, x0 + .45, x1 - .45, .5, 2.5, -.01, .05)                               # walkway floor (beaten)
    lib.bm_box(mud, x0 + .45, x1 - .45, 3.0, D - .5, -.01, .05)
    po = lib.from_bm('B_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .01, 2, 50)
    mo = lib.from_bm('B_Mat', mats, c, M['reed']); lib.uv_box(mo)
    mu = lib.from_bm('B_Mud', mud, c, M['mud']); lib.uv_box(mu)
    # shopfronts, signboards, interiors
    names = (('تمور', 'dates'), ('أقمشة', 'textile'), ('عطور وبخور', 'perfume'))
    for (a, b), (label, kind) in zip(shop_x, names):
        glazed_shopfront(c, M, 'B_Shop_%s' % kind, a, b, 0.05, 3.0, 2.38, 'shopgreen')
        sign(c, M, label, (a + b) / 2, 3.15, 1.5, .38, 2.48)
        shop_room(c, M, 'B_' + kind, a, b, 3.0, D - .5, kind)
    # rain spouts
    wd = bmesh.new(); ir = bmesh.new()
    for sx in (x0 + 2.4, x1 - 2.4): spout(wd, ir, sx, H + .02)
    w = lib.from_bm('B_Spouts', wd, c, M['beam']); lib.uv_box(w); lib.bevel(w, .005, 2)
    i_ = lib.from_bm('B_SpoutStraps', ir, c, M['iron']); lib.uv_box(i_)
    # stains: under spouts and pole ends
    q = [(sx - .3, sx + .3, H - 2.2, H) for sx in (x0 + 2.4, x1 - 2.4)]
    q += [(x - .07, x + .07, z - R.uniform(.2, .3), z - .02) for (x, z) in ends]
    decal_set(c, M, 'Decal_B_Drips', q)
    # goods outside the dates shop, a bench in the walkway
    sk = bmesh.new()
    for k, (xx, yy) in enumerate(((arch_x[0] - .6, 1.9), (arch_x[0] - .15, 1.95))):
        details.sack(sk, xx, yy, .05, .18, .38, 0, True)
        details.heap(c, M, xx, yy, .05, .18, .38, (.32, .16, .07), 0, 'B_DatesSack%d' % k)
    sko = lib.from_bm('B_Sacks', sk, c, M['burlap'], smooth=True); lib.uv_box(sko)
    sd = sko.modifiers.new('Soft', 'SUBSURF'); sd.levels = sd.render_levels = 2
    return arch_x

# ------------------------------------------------------------------ Building C (south side, built facing -y in local space then turned)
C_TX = 14.0          # local x 0 -> world x 14, local x 20 -> world x -6
def building_C(c, M):
    # ---- C2: single-storey shop row, local x 0..10
    D = 6.5
    s2 = bmesh.new()
    H2, P2 = 4.3, 4.95
    solids = [(0, 10, 0, .5, 0, H2), (0, 10, D - .5, D, 0, H2), (0, .45, 0, D, 0, H2),
              (0, 10, 0, .35, H2, P2), (0, 10, D - .35, D, H2, P2), (0, .35, .35, D - .35, H2, P2)]
    shops2 = [(.9, 2.7), (3.3, 5.1), (5.7, 7.5), (8.1, 9.6)]
    for a, b in shops2[:-1]:
        solids.append((b + .1, b + .4, .5, D - .5, 0, H2))
    holes = [(a, b, -1, 1, .2, 2.75) for a, b in shops2] + [(a - .22, b + .22, -1, 1, 2.75, 2.95) for a, b in shops2]
    lib.shell(s2, solids, holes)
    # ---- C1: two-storey merchant house, local x 10..20
    H1, P1, F1 = 7.6, 8.4, 3.95
    s1 = bmesh.new()
    sol1 = [(10, 20, 0, .55, 0, H1), (10, 20, D - .55, D, 0, H1), (19.5, 20, 0, D, 0, H1), (9.98, 10.45, 0, D, 0, H1),
            (10, 20, 0, .4, H1, P1), (10, 20, D - .4, D, H1, P1), (19.6, 20, .4, D - .4, H1, P1), (10, 10.4, .4, D - .4, H1, P1),
            (13.05, 13.35, .55, D - .55, 0, F1), (15.65, 15.95, .55, D - .55, 0, F1)]
    open1 = [(10.75, 12.75, .2, 2.85, 'shop'), (13.65, 15.45, .2, 2.85, 'shop'), (16.4, 17.6, 0, 2.6, 'door')]
    win1 = [(11.6, 4.75, 6.05, .9), (18.4, 4.75, 6.05, .9)]
    roshan = (13.0, 16.4, 4.35, 6.9)          # x0, x1, z0, z1 of the projecting balcony
    holes1 = [(a, b, -1, 1, z0, z1) for a, b, z0, z1, _ in open1] + [(a - .25, b + .25, -1, 1, z1, z1 + .22) for a, b, z0, z1, _ in open1]
    holes1 += [(cx - w / 2, cx + w / 2, -1, 1, z0, z1) for cx, z0, z1, w in win1] + [(cx - w / 2 - .25, cx + w / 2 + .25, -1, 1, z1, z1 + .2) for cx, z0, z1, w in win1]
    holes1 += [(roshan[0] + .25, roshan[1] - .25, -1, 1, 4.45, 6.6)]          # the balcony's opening into the room
    holes1 += [(18.95, 19.25, -1, .3, 1.6, 2.4)]                              # small ventilation slit on the pier
    lib.shell(s1, sol1, holes1)
    o2 = lib.from_bm('C2_Shell', s2, c, [M['plaster_w']]); lib.uv_box(o2, arch=True); lib.plaster_mods(o2, .035, 2, .009)
    o1 = lib.from_bm('C1_Shell', s1, c, [M['plaster_o']]); lib.uv_box(o1, arch=True); lib.plaster_mods(o1, .035, 2, .01)
    # trims: string course, sills, coping, plinth
    tr = bmesh.new(); tr2 = bmesh.new()
    lib.bm_box(tr, 10, 20.05, -.05, 0, 3.98, 4.12)
    for cx, z0, z1, w in win1:
        lib.bm_box(tr, cx - w / 2 - .12, cx + w / 2 + .12, -.07, .05, z0 - .1, z0)
    lib.bm_box(tr, 9.97, 20.03, -.03, .43, P1, P1 + .09)
    lib.bm_box(tr2, -.03, 9.98, -.03, .38, P2, P2 + .08)
    t1 = lib.from_bm('C1_Trims', tr, c, M['plaster_o']); lib.uv_box(t1, arch=True); lib.plaster_mods(t1, .02, 2, .005)
    t2 = lib.from_bm('C2_Trims', tr2, c, M['plaster_w']); lib.uv_box(t2, arch=True); lib.plaster_mods(t2, .02, 2, .005)
    # lintels
    ln = bmesh.new()
    for a, b in shops2: lintel(ln, a - .22, b + .22, 2.75, 2.95, .5)
    for a, b, z0, z1, _ in open1: lintel(ln, a - .25, b + .25, z1, z1 + .22)
    for cx, z0, z1, w in win1: lintel(ln, cx - w / 2 - .25, cx + w / 2 + .25, z1, z1 + .2)
    lo = lib.from_bm('C_Lintels', ln, c, M['beam']); lib.uv_box(lo); lib.bevel(lo, .012, 3, 30)
    # poles (floor + roof rows), mats, mud
    poles = bmesh.new(); mats = bmesh.new(); mud = bmesh.new(); ends = []
    pole_row(poles, .5, 9.6, H2 - .3, 0, D, .42, ends)
    pole_row(poles, 10.6, 19.4, F1 - .08, 0, D, .42, ends)
    pole_row(poles, 10.6, 19.4, H1 - .3, 0, D, .42, ends)
    lib.bm_box(mats, .45, 10, .5, D - .5, H2 - .23, H2 - .215); lib.bm_box(mud, .35, 10, .35, D - .35, H2 - .215, H2 + .03)
    lib.bm_box(mats, 10.45, 19.5, .55, D - .55, F1 - .005, F1 + .012); lib.bm_box(mud, 10.45, 19.5, .55, D - .55, F1 + .012, F1 + .22)
    lib.bm_box(mats, 10.4, 19.6, .4, D - .4, H1 - .23, H1 - .215); lib.bm_box(mud, 10.4, 19.6, .4, D - .4, H1 - .215, H1 + .03)
    for a, b, z0, z1, k in open1:
        if k == 'shop': lib.bm_box(mud, a - .1, b + .1, .55, 3.6, 0, .2)
    for a, b in shops2: lib.bm_box(mud, a - .1, b + .1, .5, 3.6, 0, .2)
    po = lib.from_bm('C_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .01, 2, 50)
    mo = lib.from_bm('C_Mats', mats, c, M['reed']); lib.uv_box(mo)
    mu = lib.from_bm('C_Mud', mud, c, M['mud']); lib.uv_box(mu)
    # ---- C2 shopfronts: folding plank doors in different paints; two open, two closed
    paints = ('shopblue', 'shutter', 'shopblue', 'shutter2')
    for i, (a, b) in enumerate(shops2):
        lv = bmesh.new(); fr = bmesh.new()
        for vs in (lib.bm_box(fr, a, a + .08, .30, .44, .2, 2.75)[0], lib.bm_box(fr, b - .08, b, .30, .44, .2, 2.75)[0], lib.bm_box(fr, a, b, .30, .44, 2.67, 2.75)[0]):
            lib.set_rand_attr(fr, vs, R.random())
        n = 4 if b - a > 1.6 else 2; lw = (b - a - .16) / n
        if i in (0, 2):
            for k in range(n // 2):
                hero.shutter_leaf(lv, 0, lw, .23, 2.65, n=2, m=T(a + .08 + .04 * k, .47 + .04 * k, 0) @ RZ(90 - 3 * k))
                hero.shutter_leaf(lv, 0, lw, .23, 2.65, n=2, m=T(b - .08 + .035 - .04 * k, .47 + .04 * k, 0) @ RZ(90 + 3 * k))
            shop_room(c, M, 'C2_%d' % i, a, b, .5, 3.6, 'brass' if i == 0 else 'textile')
        else:
            for k in range(n):
                hero.shutter_leaf(lv, a + .08 + k * lw, a + .08 + (k + 1) * lw, .23, 2.65, n=2, m=T(0, .26, 0))
        lo_ = lib.from_bm('C2_Leaves_%d' % i, lv, c, M[paints[i]]); lib.uv_box(lo_); lib.bevel(lo_, .003, 2)
        fo = lib.from_bm('C2_Frame_%d' % i, fr, c, M['beam']); lib.uv_box(fo); lib.bevel(fo, .005, 2)
    for (a, b), label in zip(shops2, ('نحاسيات', 'خياط', 'أقمشة', 'حبال')):
        sign(c, M, label, (a + b) / 2, 3.08, min(1.5, b - a), .34)
    # ---- C1 ground floor: two glazed shops + the house door (panelled, studded lightly)
    glazed_shopfront(c, M, 'C1_Gold', 10.75, 12.75, .2, 2.85, .3, 'shopgreen')
    glazed_shopfront(c, M, 'C1_Perfume', 13.65, 15.45, .2, 2.85, .3, 'signboard')
    shop_room(c, M, 'C1_gold', 10.75, 12.75, .55, 3.6, 'gold')
    shop_room(c, M, 'C1_perf', 13.65, 15.45, .55, 3.6, 'perfume')
    sign(c, M, 'ذهب ومجوهرات', 11.75, 3.12, 1.9, .38)
    sign(c, M, 'دهن العود', 14.55, 3.12, 1.7, .38)
    dr = bmesh.new(); st = bmesh.new()
    a, b = 16.4, 17.6
    for vs in (lib.bm_box(dr, a, a + .1, .2, .4, 0, 2.6)[0], lib.bm_box(dr, b - .1, b, .2, .4, 0, 2.6)[0], lib.bm_box(dr, a, b, .2, .4, 2.5, 2.6)[0]):
        lib.set_rand_attr(dr, vs, R.random())
    hero.panel_leaf(dr, (b - a - .2) / 2, 2.48, t=.05, m=T(a + .1, .26, .02))
    hero.panel_leaf(dr, (b - a - .2) / 2, 2.48, t=.05, m=T((a + b) / 2, .26, .02))
    for zz in (.5, 1.25, 2.0):
        for xx in (a + .2, a + .4, (a + b) / 2 - .1, (a + b) / 2 + .1, b - .4, b - .2):
            lib.bm_dome(st, (xx, .259, zz), .014, .01, (0, -1, 0), 8, 3)
    lib.bm_torus(st, ((a + b) / 2 - .12, .2, 1.3), .05, .008, (0, 1, 0), 18, 6)
    do = lib.from_bm('C1_HouseDoor', dr, c, M['teak']); lib.uv_box(do); lib.bevel(do, .004, 2)
    so = lib.from_bm('C1_HouseDoorStuds', st, c, M['iron'], smooth=True); lib.uv_box(so)
    # stone surround to the house door
    sr = bmesh.new()
    lib.wall_with_openings(sr, a - .32, b + .32, 0, 2.6 + .22 + .25, -.05, 0, [(a - .02, b + .02, -1, 2.82)])
    sro = lib.from_bm('C1_DoorSurround', sr, c, M['plaster_w']); lib.uv_box(sro, arch=True); lib.plaster_mods(sro, .02, 2, .004)
    # ---- C1 first floor: windows + the roshan
    window(c, M, 11.6, 4.75, 6.05, .9, 'shutter2', (0, 80), 'C1_W1')
    window(c, M, 18.4, 4.75, 6.05, .9, 'shutter2', (10, 0), 'C1_W2')
    rs = bmesh.new(); rsl = bmesh.new(); cb = bmesh.new()
    rx0, rx1, rz0, rz1 = roshan; dep = .75
    # floor, roof and frame
    def rp(a_, b_, ya, yb, za, zb, bmx=rs):
        vs, _ = lib.bm_box(bmx, a_, b_, ya, yb, za, zb); lib.set_rand_attr(bmx, vs, R.random())
    rp(rx0, rx1, -dep, .02, rz0, rz0 + .12)                       # floor beam frame
    rp(rx0 - .08, rx1 + .08, -dep - .08, .02, rz1, rz1 + .1)      # roof board
    rp(rx0 - .12, rx1 + .12, -dep - .14, -dep - .06, rz1 + .1, rz1 + .24)   # cornice
    rp(rx0, rx1, -dep - .02, -dep + .03, rz0 + .12, rz0 + .75)    # front bottom panel
    rp(rx0, rx0 + .08, -dep, .02, rz0 + .12, rz0 + .75); rp(rx1 - .08, rx1, -dep, .02, rz0 + .12, rz0 + .75)
    for xx in [rx0 + .02, rx1 - .1] + [rx0 + (rx1 - rx0) * k / 4 - .04 for k in (1, 2, 3)]:
        rp(xx, xx + .08, -dep - .02, -dep + .06, rz0 + .12, rz1)  # posts
    for xx in (rx0 + .02, rx1 - .1):
        rp(xx, xx + .08, -dep + .06, 0.02, rz0 + .12, rz1)
        rp(xx, xx + .08, -dep + .06, 0.02, rz0 + .7, rz0 + .78)
    rp(rx0, rx1, -dep - .02, -dep + .05, rz0 + .75, rz0 + .82)    # sill rail
    rp(rx0, rx1, -dep - .02, -dep + .05, rz1 - .4, rz1 - .33)     # head rail
    # vertical slat screens between posts (front and sides), lower panel carved as raised squares
    for k in range(4):
        a_ = rx0 + (rx1 - rx0) * k / 4 + .06; b_ = rx0 + (rx1 - rx0) * (k + 1) / 4 - .06
        x = a_
        while x < b_ - .02:
            vs, _ = lib.bm_box(rsl, x, x + .022, -dep, -dep + .02, rz0 + .82, rz1 - .4); lib.set_rand_attr(rsl, vs, R.random()); x += .055
        for j in range(3):
            pa = a_ + (b_ - a_) * j / 3 + .03; pb = a_ + (b_ - a_) * (j + 1) / 3 - .03
            rp(pa, pb, -dep - .035, -dep - .015, rz0 + .25, rz0 + .62)
    for side in (rx0 + .04, rx1 - .06):
        y = -dep + .1
        while y < -.05:
            vs, _ = lib.bm_box(rsl, side - .01, side + .012, y, y + .022, rz0 + .82, rz1 - .4); lib.set_rand_attr(rsl, vs, R.random()); y += .055
    for xx in (rx0 + .2, (rx0 + rx1) / 2, rx1 - .2):
        corbel(cb, xx, .02, rz0, dep + .05, .55, .14)
    ro_ = lib.from_bm('C1_Roshan', rs, c, M['teak']); lib.uv_box(ro_); lib.bevel(ro_, .005, 2)
    rl = lib.from_bm('C1_RoshanSlats', rsl, c, M['shutter2']); lib.uv_box(rl)
    cbo = lib.from_bm('C1_RoshanCorbels', cb, c, M['beam']); lib.uv_box(cbo); lib.bevel(cbo, .006, 2)
    L = bpy.data.lights.new('C1_RoomLamp', 'POINT'); L.color = (1, .7, .4); L.shadow_soft_size = .2
    lo2 = bpy.data.objects.new('C1_RoomLamp', L); lo2.location = (14.7, 1.8, 5.6); c.objects.link(lo2)
    lo2['day_energy'] = 0.0; lo2['night_energy'] = 60.0
    # rain spouts + stains
    wd = bmesh.new(); ir = bmesh.new()
    for sx in (3.0, 7.2): spout(wd, ir, sx, H2 + .02)
    for sx in (12.6, 17.1): spout(wd, ir, sx, H1 + .02)
    w = lib.from_bm('C_Spouts', wd, c, M['beam']); lib.uv_box(w); lib.bevel(w, .005, 2)
    i_ = lib.from_bm('C_SpoutStraps', ir, c, M['iron']); lib.uv_box(i_)
    q = [(sx - .3, sx + .3, H2 - 2.0, H2) for sx in (3.0, 7.2)] + [(sx - .3, sx + .3, H1 - 3.0, H1) for sx in (12.6, 17.1)]
    q += [(x - .07, x + .07, z - R.uniform(.3, .6), z - .02) for (x, z) in ends]
    q += [(cx - .6, cx + .6, 3.55, 4.65) for cx, *_ in win1]
    decal_set(c, M, 'Decal_C_Drips', q)
    # lantern by the house door
    hero.lantern(c, M, 'C_Lantern', 18.2, 2.9)
    # goods: rolled rugs leaning by the textile shop, brass pots by the brass shop
    for k in range(3):
        bm = bmesh.new()
        lib.bm_cyl(bm, (5.55 + k * .14, -.18, 0), (5.62 + k * .14, -.05, 1.75), .07, 16)
        o = lib.from_bm('C2_Rug%d' % k, bm, c, M['fabric'], smooth=True); lib.uv_box(o)
        o.color = ((.45, .1, .08, 1), (.15, .2, .35, 1), (.5, .35, .15, 1))[k]
    pots = bmesh.new()
    for k in range(4):
        r = R.uniform(.12, .2)
        lib.bm_lathe(pots, (1.1 + k * .42, -.35, 0), [(0, 0), (r * .6, 0), (r, r * .7), (r * .55, r * 1.6), (r * .6, r * 1.75), (0, r * 1.75)], 18)
    pt = lib.from_bm('C2_BrassPots', pots, c, M['brass'], smooth=True); lib.uv_box(pt)
    return ends

# ------------------------------------------------------------------ pergola over the alley
def pergola(c, M):
    wood = bmesh.new(); iron = bmesh.new(); stone = bmesh.new()
    zb0, zb1 = 4.42, 4.62
    def wp(a, b, ya, yb, za, zb, m=None):
        vs, _ = lib.bm_box(wood, a, b, ya, yb, za, zb, m=m); lib.set_rand_attr(wood, vs, R.random())
    # north ledger on the facades (on small corbels), south beam on posts
    wp(-5.7, B_X1 - .05, -.16, .02, zb0, zb1)
    for x in [-5.4 + k * 1.5 for k in range(int((B_X1 + 5.4) / 1.5))]:
        corbel(wood, x, .0, zb0, .2, .22, .12)
    wp(-5.7, 15.05, POST_Y - .09, POST_Y + .09, zb0, zb1)
    for px in POSTS_X:
        wp(px - .08, px + .08, POST_Y - .08, POST_Y + .08, .18, zb0)
        vs, _ = lib.bm_box(stone, px - .16, px + .16, POST_Y - .16, POST_Y + .16, 0, .2); lib.set_rand_attr(stone, vs, .3)
        for sx in (-1, 1):                                        # diagonal braces post -> beam
            if -5.6 < px + sx * .6 < 15.0:
                d = Vector((sx * .62, 0, .62)); L = d.length
                m = T(px + sx * .04, POST_Y, zb0 - .66) @ RY(sx * 45)
                wp(-.04, .04, -.04, .04, 0, L, m=m)
    # cross beams (y) every 2.25 m, then battens (x) every 0.42 m on top
    for xb in [-5.5] + [-4.5 + 2.25 * k for k in range(9)] + [14.9]:
        wp(xb - .07, xb + .07, POST_Y - .35, -.14, zb1, zb1 + .17)
    y = -.35
    while y > POST_Y - .3:
        wp(-5.75, 15.1, y - .03, y + .03, zb1 + .17, zb1 + .24); y -= .42
    po = lib.from_bm('Pergola_Timber', wood, c, M['beam']); lib.uv_box(po); lib.bevel(po, .006, 2)
    so = lib.from_bm('Pergola_PostBases', stone, c, M['paver']); lib.uv_box(so); lib.bevel(so, .015, 3)
    # hanging wayfinding board (the old souqs are signposted by name), readable from both directions
    for rot, off in ((90, .02), (-90, -.02)):
        b_, t_ = sign(c, M, 'سوق التمر', 0, 0, 1.3, .32, y=0)
        bpy.context.view_layer.update()
        m = T(6.75 + off, -3.5, 3.95) @ RZ(rot)
        for o in (b_, t_): o.matrix_world = m @ o.matrix_world
    ch = bmesh.new()
    for yy in (-4.05, -2.95):
        lib.bm_cyl(ch, (6.75, yy, 4.3), (6.75, yy, 4.62), .006, 6)
    cho = lib.from_bm('Pergola_SignChains', ch, c, M['iron']); lib.uv_box(cho)
    # hanging lanterns on the alley centreline, one per bay (chain from the cross beam, no wall bracket)
    for k, xb in enumerate((-4.5, 0.0, 4.5, 9.0, 13.5)):
        hanging_lantern(c, M, 'PergolaLantern%d' % k, xb, -3.1, 4.62)

def hanging_lantern(c, M, name, x, y, ztop, drop=.75):
    iron = bmesh.new(); glass = bmesh.new(); bulb = bmesh.new()
    n = int(drop / .035)
    for k in range(n):
        lib.bm_torus(iron, (x, y, ztop - .02 - .035 * k), .016, .004, (1, 0, 0) if k % 2 else (0, 1, 0), 10, 4)
    zt = ztop - drop
    lib.bm_lathe(iron, (x, y, zt - .02), [(.11, 0), (.12, .01), (.05, .09), (.02, .11), (.03, .13), (0, .15)], 6)
    for i in range(6):
        a = 2 * math.pi * i / 6
        lib.bm_cyl(iron, (x + .095 * math.cos(a), y + .095 * math.sin(a), zt - .30), (x + .095 * math.cos(a), y + .095 * math.sin(a), zt - .01), .006, 6)
    lib.bm_lathe(iron, (x, y, zt - .34), [(0, -.05), (.02, -.03), (.06, 0), (.10, .02), (.10, .04), (0, .04)], 6)
    lib.bm_lathe(glass, (x, y, zt - .30), [(.088, 0), (.088, .29)], 6)
    lib.bm_lathe(bulb, (x, y, zt - .27), [(0, 0), (.022, .01), (.028, .05), (.012, .09), (0, .1)], 10)
    io = lib.from_bm(name + '_Iron', iron, c, M['iron'], smooth=True); lib.uv_box(io)
    go = lib.from_bm(name + '_Glass', glass, c, M['glass']); go.visible_shadow = False
    bo = lib.from_bm(name + '_Bulb', bulb, c, M['bulb'], smooth=True); bo.visible_shadow = False
    L = bpy.data.lights.new(name + '_Light', 'POINT'); L.energy = 0; L.color = (1, .7, .4); L.shadow_soft_size = .03
    lo = bpy.data.objects.new(name + '_Light', L); lo.location = (x, y, zt - .21); c.objects.link(lo)

# ------------------------------------------------------------------ the designed ground
def ground(c, M):
    j = .008
    field = bmesh.new(); band = bmesh.new(); md = bmesh.new(); dr = bmesh.new(); gr = bmesh.new()
    def stone(bmx, x0, x1, y0, y1, cat, var=.5, h=.06):
        hz = h + R.uniform(-.002, .002)
        vs, _ = lib.bm_box(bmx, x0 + j / 2, x1 - j / 2, y0 + j / 2, y1 - j / 2, -.06, hz - .06)
        lay = bmx.loops.layers.color.get('tile') or bmx.loops.layers.color.new('tile')
        col = (cat, var, R.random(), 1.0)
        for v in vs:
            for l in v.link_loops: l[lay] = col
    YF0, YF1 = -.52, -6.48              # field (between the drains)
    # facade bands: beige 60x40 stones, joints staggered
    for (ya, yb) in ((-.4, 0.0), (YS, YS + .4)):
        x = X0
        while x < X1 - .01:
            w = min(.6, X1 - x); stone(band, x, x + w, ya, yb, 1.0, R.uniform(.45, .55)); x += w
    # slot drains along both facades
    for (ya, yb) in ((-.52, -.4), (YS + .4, YS + .52)):
        lib.bm_box(gr, X0, X1, ya + .005, yb - .005, -.12, -.11)
        x = X0
        while x < X1 - .01:
            x1_ = min(x + 1.0, X1)
            lib.bm_box(gr, x + .004, x1_ - .004, ya + .005, ya + .018, -.026, -.004); lib.bm_box(gr, x + .004, x1_ - .004, yb - .018, yb - .005, -.026, -.004)
            b = x + .02
            while b < x1_ - .02: lib.bm_box(gr, b, b + .01, ya + .015, yb - .015, -.024, -.006); b += .03
            x = x1_
    # cross bands (beige, 40 wide, 60-long stones laid across) at the post lines
    bands_x = [bx for bx in POSTS_X if X0 < bx < X1]
    for bx in bands_x:
        y = YF0
        while y > YF1 + .01:
            h = min(.6, y - YF1); stone(band, bx - .2, bx + .2, y - h, y, 1.0, R.uniform(.45, .55)); y -= h
    # grey field on one 40 cm grid aligned to x = 0, skipping bands and medallions
    MED = [(0.0, -3.5), (9.0, -3.5)]; RR = 1.25
    s = .4
    ix0 = math.floor(X0 / s); ix1 = math.ceil(X1 / s)
    for i in range(ix0, ix1):
        x0, x1 = i * s, (i + 1) * s
        if x1 <= X0 or x0 >= X1: continue
        if any(x0 < bx + .2 and x1 > bx - .2 for bx in bands_x):
            # trim to the band edge so the band reads as a clean line
            parts = []
            for bx in bands_x:
                if x0 < bx - .2 < x1: parts.append((x0, bx - .2))
                if x0 < bx + .2 < x1: parts.append((bx + .2, x1))
            if not parts: continue
        else:
            parts = [(max(x0, X0), min(x1, X1))]
        y = YF0
        while y > YF1 + .01:
            ya, yb = max(y - s, YF1), y
            for (a, b) in parts:
                if b - a < .04: continue
                cxm, cym = (a + b) / 2, (ya + yb) / 2
                if any(math.hypot(cxm - mx, cym - my) < RR + .2 - .3 for mx, my in MED): continue
                stone(field, a, b, ya, yb, 0.0, R.uniform(.44, .56))
            y -= s
    fo = lib.from_bm('Street2_Field', field, c, M['paver']); lib.uv_box(fo); lib.bevel(fo, .006, 2)
    bo = lib.from_bm('Street2_Bands', band, c, M['paver']); lib.uv_box(bo); lib.bevel(bo, .008, 2)
    cut = bmesh.new()
    for mx, my in MED: lib.bm_cyl(cut, (mx, my, -1), (mx, my, 1), RR + .16, 64)
    co = lib.from_bm('Street2_MedCutter', cut, c); co.hide_render = True; co.hide_viewport = True
    bm_ = fo.modifiers.new('Medallions', 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.object = co; bm_.solver = 'EXACT'
    # medallions: grey centre star, beige ring, grey ring, dark border
    lay = md.loops.layers.color.new('tile')
    def sector(cx, cy, r0, r1, a0, a1, cat):
        jr = j / 2
        a0 += jr / max(r1, .05); a1 -= jr / max(r1, .05)
        r0 = r0 + jr if r0 > 0 else 0; r1 = r1 - jr
        k = 6
        outer = [(cx + r1 * math.cos(a0 + (a1 - a0) * t / k), cy + r1 * math.sin(a0 + (a1 - a0) * t / k)) for t in range(k + 1)]
        inner = [(cx + r0 * math.cos(a1 - (a1 - a0) * t / k), cy + r0 * math.sin(a1 - (a1 - a0) * t / k)) for t in range(k + 1)] if r0 > 0 else [(cx, cy)]
        n0 = len(md.verts)
        lib.bm_prism(md, outer + inner, -.06, R.uniform(-.0015, .0015))
        col = (cat, R.uniform(.45, .55), R.random(), 1)
        md.verts.ensure_lookup_table()
        for v in md.verts[n0:]:
            for l in v.link_loops: l[lay] = col
    for mx, my in MED:
        for i in range(8): sector(mx, my, 0, .4, 2 * math.pi * i / 8, 2 * math.pi * (i + 1) / 8, 0.0 if i % 2 else 1.0)
        for i in range(16): sector(mx, my, .4, .82, 2 * math.pi * i / 16, 2 * math.pi * (i + 1) / 16, 1.0)
        for i in range(28): sector(mx, my, .82, RR, 2 * math.pi * i / 28, 2 * math.pi * (i + 1) / 28, 0.0)
        for i in range(36): sector(mx, my, RR, RR + .16, 2 * math.pi * i / 36, 2 * math.pi * (i + 1) / 36, .3)
    mo = lib.from_bm('Street2_Medallions', md, c, M['paver']); lib.uv_box(mo); lib.bevel(mo, .006, 2, 30)
    go = lib.from_bm('Street2_Drains', gr, c, M['iron']); lib.uv_box(go)
    bed = bmesh.new(); lib.bm_box(bed, X0, X1, YS - .01, .01, -.08, -.012)
    be = lib.from_bm('Street2_Bed', bed, c, M['mortar']); lib.uv_box(be)
    sand = bmesh.new(); lib.bm_box(sand, -1500, 1500, -1500, 1500, -.10, -.082)
    sa = lib.from_bm('Street2_Sand', sand, c, M['mud']); lib.uv_box(sa)

# ------------------------------------------------------------------ planters with date palms, benches
def palm(c, M, name, x, y, z, h=2.8, n=22):
    tr = bmesh.new(); fr = bmesh.new()
    uvl = fr.loops.layers.uv.new('UVMap')
    lean = R.uniform(-4, 4)
    segs = 34
    for s_ in range(segs):                       # trunk: stacked leaf-base rings
        z0 = z + h * s_ / segs; z1 = z + h * (s_ + 1) / segs
        r = .16 - .03 * s_ / segs
        n0 = len(tr.verts)
        lib.bm_lathe(tr, (x, y, z0), [(r * .97, 0), (r * 1.05, (z1 - z0) * .55), (r * .98, z1 - z0)], 9, cap_top=False, cap_bottom=False)
        tr.verts.ensure_lookup_table()
        bend = Vector((math.sin(math.radians(lean)) * (z0 - z) ** 2 * .06, 0, 0))
        for v in tr.verts[n0:]: v.co = Matrix.Rotation(s_ * .35, 4, 'Z') @ (v.co - Vector((x, y, 0))) + Vector((x, y, 0)) + bend
    top = Vector((x, y, z + h)) + Vector((math.sin(math.radians(lean)) * h * h * .06, 0, 0))
    for k in range(10):                                   # cut frond bases (boots) around the crown
        az = 2 * math.pi * k / 10 + .3
        d = Vector((math.cos(az), math.sin(az), 0))
        lib.bm_cyl(tr, top - Vector((0, 0, .25 + .06 * (k % 3))), top - Vector((0, 0, .1)) + d * .2 + Vector((0, 0, .12)), .035, 5)
    for k in range(n + 6):
        az = 2 * math.pi * k / n + R.uniform(-.15, .15)
        tilt = math.radians(R.uniform(15, 70) if k % 2 else R.uniform(35, 95)) if k < n else math.radians(R.uniform(100, 125))
        L = R.uniform(1.2, 1.55)
        dirv = Vector((math.cos(az), math.sin(az), 0))
        prev = None
        steps = 16
        for sidx in range(steps + 1):
            t = sidx / steps
            ang = tilt + math.radians(55) * t * t                # droops towards the tip
            p = top + dirv * (L * t * math.sin(ang) * 1.0) + Vector((0, 0, L * t * math.cos(ang)))
            # leaflets: V-shaped pair at each step
            if 0 < sidx < steps:
                side = dirv.cross(Vector((0, 0, 1))).normalized()
                ll = .42 * math.sin(math.pi * min(1, t * 1.15)) + .06
                for kk, sgn in enumerate((-1, 1, -1, 1) if sidx % 2 else (-1, 1)):
                    pp = p + dirv * (.035 * (kk % 2))
                    q0 = pp; q1 = pp + side * sgn * ll * .25 + Vector((0, 0, .02)) + dirv * .06
                    q2 = pp + side * sgn * ll + Vector((0, 0, -.06)) + dirv * .12
                    q3 = pp + dirv * .1
                    vs = [fr.verts.new(v) for v in (q0, q1, q2, q3)]
                    f = fr.faces.new(vs)
                    for l_, uvv in zip(f.loops, ((t, 0), (t, .3), (t, 1), (t, .1))): l_[uvl].uv = uvv
            if prev is not None:
                lib.bm_cyl(fr, prev, p, .012 * (1 - t) + .004, 4, caps=False)
            prev = p
    to = lib.from_bm(name + '_Trunk', tr, c, M['trunk'], smooth=True); lib.uv_box(to)
    fo = lib.from_bm(name + '_Fronds', fr, c, M['frond'], smooth=True)
    M['frond'].use_backface_culling = False          # one-sided leaflets, rendered double-sided

def furniture(c, M):
    pl = bmesh.new(); cap = bmesh.new(); bench = bmesh.new(); bi = bmesh.new()
    spots = [(-4.5, -5.75), (3.8, -5.75)]          # on the south side, between posts, in front of piers
    for (x, y) in spots:
        lib.bm_box(pl, x - .55, x + .55, y - .55, y + .55, 0, .55)
        lib.bm_box(cap, x - .6, x + .6, y - .6, y + .6, .55, .62)
        soil = bmesh.new(); lib.bm_box(soil, x - .5, x + .5, y - .5, y + .5, .5, .58)
        so = lib.from_bm('Planter_Soil', soil, c, M['mud']); lib.uv_box(so)
        palm(c, M, 'Palm_%d' % int(x), x, y, .58, R.uniform(1.9, 2.1))
    po = lib.from_bm('Planters', pl, c, M['plaster_w']); lib.uv_box(po, arch=True); lib.plaster_mods(po, .025, 2, .004)
    cp = lib.from_bm('Planter_Caps', cap, c, M['coral']); lib.uv_box(cp); lib.bevel(cp, .015, 3)
    for bx in (-0.2, 9.0):                           # benches facing the medallions, near the south side
        m = T(bx + (2.0 if bx < 1 else -2.2), -5.35, 0)
        for k in range(3):
            vs, _ = lib.bm_box(bench, -.8, .8, -.2 + k * .14, -.2 + k * .14 + .12, .43, .465, m=m); lib.set_rand_attr(bench, vs, R.random())
        for k in range(2):
            vs, _ = lib.bm_box(bench, -.8, .8, -.25 - .02 * k, -.215 - .02 * k, .58 + k * .16, .7 + k * .16, m=m); lib.set_rand_attr(bench, vs, R.random())
        for fx in (-.62, .62):
            lib.bm_box(bi, fx - .02, fx + .02, .18, .22, 0, .43, m=m); lib.bm_box(bi, fx - .02, fx + .02, -.26, -.22, 0, .9, m=m)
            lib.bm_box(bi, fx - .02, fx + .02, -.26, .22, .41, .43, m=m)
    be = lib.from_bm('Benches', bench, c, M['beam']); lib.uv_box(be); lib.bevel(be, .006, 2)
    bo = lib.from_bm('Benches_Iron', bi, c, M['iron']); lib.uv_box(bo); lib.bevel(bo, .004, 2)

# ------------------------------------------------------------------ alley ends: covered passages (سباط) so the street reads as part of a larger souq
def end_block(c, M, tag, mat='plaster_w', wing=None):
    """Built facing -y in local space (local x 0..21 across, depth 6). A covered passage (سباط) 3.2 m wide
    runs through it in line with the alley; the rest is plain plaster with pole ends, two windows, a spout."""
    W, D, H, P = 21.0, 6.0, 6.2, 6.9
    px0, px1 = 8.9, 12.1                       # passage, centred on the alley centreline
    sh = bmesh.new()
    solids = [(0, W, 0, D, 0, H), (0, W, 0, .4, H, P), (0, W, D - .4, D, H, P), (0, .4, .4, D - .4, H, P), (W - .4, W, .4, D - .4, H, P)]
    if wing: solids.append(wing)
    holes = [(px0, px1, -1, D - .45, -1, 3.4), (px0 - .3, px1 + .3, -1, .6, 3.4, 3.65), (px0 + .9, px1 - .9, D - .5, D + 1, 0, 2.5),
             (4.0, 4.9, -1, .6, 4.3, 5.4), (16.1, 17.0, -1, .6, 4.3, 5.4)]
    lib.shell(sh, solids, holes)
    so = lib.from_bm(tag + '_Shell', sh, c, [M[mat]]); lib.uv_box(so, arch=True); lib.plaster_mods(so, .035, 2, .01)
    bm = bmesh.new()
    lintel(bm, px0 - .3, px1 + .3, 3.4, 3.65, .6)
    for cx in (4.45, 16.55): lintel(bm, cx - .7, cx + .7, 5.4, 5.58, .6)
    lo = lib.from_bm(tag + '_Lintels', bm, c, M['beam']); lib.uv_box(lo); lib.bevel(lo, .012, 3, 30)
    poles = bmesh.new(); ends = []
    pole_row(poles, .5, W - .5, H - .3, 0, D, .42, ends)
    pole_row(poles, px0 + .15, px1 - .15, 3.4 - .07, -.1, D + .1, .38)            # passage ceiling
    po = lib.from_bm(tag + '_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .01, 2, 50)
    mt = bmesh.new(); lib.bm_box(mt, px0, px1, 0, D, 3.4, 3.42)
    mo = lib.from_bm(tag + '_PassageMat', mt, c, M['reed']); lib.uv_box(mo)
    for cx in (4.45, 16.55): window(c, M, cx, 4.3, 5.4, .9, 'shutter2', (0, 0), tag + '_W%d' % int(cx))
    wd = bmesh.new(); ir = bmesh.new(); spout(wd, ir, 14.0, H + .02)
    w = lib.from_bm(tag + '_Spout', wd, c, M['beam']); lib.uv_box(w); lib.bevel(w, .005, 2)
    i_ = lib.from_bm(tag + '_SpoutStrap', ir, c, M['iron']); lib.uv_box(i_)
    decal_set(c, M, 'Decal_' + tag, [(13.7, 14.3, H - 2.6, H)] + [(x - .07, x + .07, z - R.uniform(.3, .6), z - .02) for (x, z) in ends])
    # the passage floor continues the paving; a warm lamp half way through
    fl = bmesh.new(); lib.bm_box(fl, px0, px1, 0, D, -.06, 0)
    lib.set_rand_attr(fl, list(fl.verts), .3)
    fo = lib.from_bm(tag + '_PassageFloor', fl, c, M['paver']); lib.uv_box(fo)
    hanging_lantern(c, M, tag + '_PassageLantern', (px0 + px1) / 2, D / 2, 3.38, .45)
    # far end of the passage: a studded double door, closed (the souq continues behind it)
    dr = bmesh.new(); st = bmesh.new()
    a, b = px0 + .9, px1 - .9
    for vs in (lib.bm_box(dr, a, a + .1, D - .62, D - .42, 0, 2.5)[0], lib.bm_box(dr, b - .1, b, D - .62, D - .42, 0, 2.5)[0], lib.bm_box(dr, a, b, D - .62, D - .42, 2.4, 2.5)[0]):
        lib.set_rand_attr(dr, vs, R.random())
    hero.panel_leaf(dr, (b - a - .2) / 2, 2.38, t=.05, m=T(a + .1, D - .5, .02))
    hero.panel_leaf(dr, (b - a - .2) / 2, 2.38, t=.05, m=T((a + b) / 2, D - .5, .02))
    for zz in (.45, 1.2, 1.95):
        for xx in (a + .25, (a + b) / 2 - .12, (a + b) / 2 + .12, b - .25):
            lib.bm_dome(st, (xx, D - .501, zz), .014, .01, (0, -1, 0), 8, 3)
    do = lib.from_bm(tag + '_EndDoor', dr, c, M['teak']); lib.uv_box(do); lib.bevel(do, .004, 2)
    so = lib.from_bm(tag + '_EndDoorStuds', st, c, M['iron'], smooth=True); lib.uv_box(so)

# ------------------------------------------------------------------ build all
def build(M0):
    M = street_materials(M0)
    root = lib.coll('STREET_Test'); lib.clear_collection(root)
    cb = lib.coll('Street_BuildingB', root); cc = lib.coll('Street_BuildingC', root)
    cp = lib.coll('Street_Pergola', root); cg = lib.coll('Street_Ground', root); cf = lib.coll('Street_Furniture', root)
    for c_ in (cb, cc, cp, cg, cf): lib.clear_collection(c_)
    # the hero building's own street test is replaced (kept, just hidden) by the designed ground
    hg = bpy.data.collections.get('Ground')
    if hg:
        for o in list(hg.all_objects):
            if o is None: continue
            o.hide_render = True
            try: o.hide_set(True)
            except Exception: pass
    building_B(cb, M)
    building_C(cc, M)
    transform_collection(cc, T(C_TX, YS, 0) @ RZ(180))
    ce = lib.coll('Street_EndEast', root); cw = lib.coll('Street_EndWest', root)
    for c_ in (ce, cw): lib.clear_collection(c_)
    end_block(ce, M, 'EndE', 'plaster_w', wing=(14.0, 20.5, -1.05, 0, 0, 5.2))     # fills the step past Building C
    transform_collection(ce, T(B_X1, 7.0, 0) @ RZ(-90))          # local x 10.5 -> world y -3.5
    end_block(cw, M, 'EndW', 'plaster_o', wing=(0.5, 7.0, -.25, 0, 0, 5.2))
    transform_collection(cw, T(-5.75, -14.0, 0) @ RZ(90))
    pergola(cp, M)
    ground(cg, M)
    furniture(cf, M)
    return M
