# DAMA WORLD — souq v4 — revision pass: lived-in detail, richer spice shop, decals, street frontage test.
# Same rules as hero.py: modelled from numbers, procedural materials, no downloaded assets.
import bpy, bmesh, math
from mathutils import Vector, Matrix
import lib
from lib import R

POLE_ENDS = []        # (x, z, y_front) filled by hero.roof_and_floor

def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
def RZ(a): return Matrix.Rotation(math.radians(a), 4, 'Z')
def RX(a): return Matrix.Rotation(math.radians(a), 4, 'X')
def RY(a): return Matrix.Rotation(math.radians(a), 4, 'Y')

def _new_since(bm, n0):
    bm.verts.ensure_lookup_table()
    return [bm.verts[i] for i in range(n0, len(bm.verts))]

def _xform(bm, verts, m):
    for v in verts: v.co = m @ v.co

# ------------------------------------------------------------------ decals (stains that follow the architecture)
def _decal_quad(bm, uv, x0, x1, z0, z1, y, axis='y'):
    if axis == 'y':
        ps = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    else:   # on a side wall facing -x at x = y (u runs along +y)
        ps = [(y, x1, z0), (y, x0, z0), (y, x0, z1), (y, x1, z1)]
    vs = [bm.verts.new(p) for p in ps]
    f = bm.faces.new(vs)
    for l, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): l[uv].uv = (u, v)

def decals(c, M, H):
    drip = bmesh.new(); uv = drip.loops.layers.uv.new('UVMap')
    rust = bmesh.new(); uvr = rust.loops.layers.uv.new('UVMap')
    yy = -0.032
    for cx in H.WIN_X:                                  # dirty water off each sill
        w = H.WIN_W + .3
        _decal_quad(drip, uv, cx - w / 2, cx + w / 2, H.WIN_Z[0] - 1.25, H.WIN_Z[0] - .10, yy)
        _decal_quad(rust, uvr, cx - .35, cx + .35, H.WIN_Z[0] - .45, H.WIN_Z[0] - .1, yy - .001)
    for sx in (-1.9, 1.9):                              # long run under each rain spout
        _decal_quad(drip, uv, sx - .32, sx + .32, H.ROOF - 3.2, H.ROOF + .05, yy)
    for (x, z, yf) in POLE_ENDS:                        # tannin stain under each pole end
        if yf > .5: continue
        w = R.uniform(.12, .2)
        _decal_quad(drip, uv, x - w / 2, x + w / 2, z - R.uniform(.35, .7), z - .02, yy)
    for lx in (-1.95, 1.95):                            # rust under the lantern brackets
        _decal_quad(rust, uvr, lx - .07, lx + .07, 2.55, 2.85, yy - .001)
    d = lib.from_bm('Decal_Drips', drip, c, M['drip']); d.visible_shadow = False
    r = lib.from_bm('Decal_Rust', rust, c, M['rust']); r.visible_shadow = False
    return d, r

# ------------------------------------------------------------------ lived-in props on the facade and street
def cable_run(c, M):
    """Power cable feeding the two lanterns, clipped to the wall with a small sag between clips."""
    pts = [(-1.95, 3.0), (-1.95, 3.74), (-1.2, 3.72), (-.4, 3.74), (.4, 3.72), (1.2, 3.74), (1.95, 3.74), (1.95, 3.0)]
    cu = bpy.data.curves.new('Facade_Cable', 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = .0055; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    full = []
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        for k in range(6):
            t = k / 6
            sag = .025 * math.sin(math.pi * t) if abs(z1 - z0) < .1 else 0
            full.append((x0 + (x1 - x0) * t, -.04, z0 + (z1 - z0) * t - sag))
    full.append((pts[-1][0], -.04, pts[-1][1]))
    sp.points.add(len(full) - 1)
    for p, co in zip(sp.points, full): p.co = (*co, 1)
    o = bpy.data.objects.new('Facade_Cable', cu); c.objects.link(o); cu.materials.append(M['iron'])
    bm = bmesh.new()
    for x, z in pts[1:-1]:
        lib.bm_box(bm, x - .012, x + .012, -.05, -.02, z - .008, z + .012)
    lib.bm_box(bm, 2.05, 2.25, -.07, -.02, 3.55, 3.83)                 # junction box
    cl = lib.from_bm('Facade_Cable_Clips', bm, c, M['iron']); lib.uv_box(cl); lib.bevel(cl, .004, 2)
    return o

def stool(bm, x, y, z=0, rot=0, h=.38, s=.36):
    m = T(x, y, z) @ RZ(rot)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lean = Matrix.Rotation(math.radians(4 * sx), 4, 'Y') @ Matrix.Rotation(math.radians(-4 * sy), 4, 'X')
            vs, _ = lib.bm_box(bm, -.018, .018, -.018, .018, 0, h - .03, m=m @ T(sx * (s / 2 - .04), sy * (s / 2 - .04), 0) @ lean)
            lib.set_rand_attr(bm, vs, R.random())
    for k in range(5):
        vs, _ = lib.bm_box(bm, -s / 2, s / 2, -s / 2 + k * s / 5 + .004, -s / 2 + (k + 1) * s / 5 - .004, h - .03, h, m=m)
        lib.set_rand_attr(bm, vs, R.random())
    for zz in (.12,):
        for sy in (-1, 1):
            vs, _ = lib.bm_box(bm, -s / 2 + .04, s / 2 - .04, sy * (s / 2 - .04) - .01, sy * (s / 2 - .04) + .01, zz, zz + .025, m=m)
            lib.set_rand_attr(bm, vs, R.random())

def street_props(c, M):
    wood = bmesh.new(); clay = bmesh.new(); brass = bmesh.new(); straw = bmesh.new()
    # seller's stool beside the spice shop platform and a second one by the gate
    stool(wood, -2.25, -0.75, 0, 12)
    stool(wood, 1.32, -0.62, 0, -8, .34, .32)
    # drinking-water jar «حِب» on a wooden stand by the gate, cup on top
    x, y = 2.12, -.42
    for k in range(3):
        a = 2 * math.pi * k / 3 + .3
        lib.bm_cyl(wood, (x + .2 * math.cos(a), y + .2 * math.sin(a), 0), (x + .12 * math.cos(a), y + .12 * math.sin(a), .55), .022, 6)
    lib.bm_lathe(wood, (x, y, .5), [(.17, 0), (.18, .03), (.15, .05), (0, .05)], 20)
    lib.bm_lathe(clay, (x, y, .55), [(0, 0), (.09, 0), (.2, .12), (.24, .3), (.2, .5), (.11, .6), (.1, .66), (.12, .68), (.11, .7), (0, .7)], 28)
    lib.bm_lathe(wood, (x, y, 1.25), [(0, 0), (.13, 0), (.13, .02), (.03, .03), (.03, .06), (0, .06)], 20)
    lib.bm_lathe(brass, (x + .06, y - .02, 1.27), [(0, 0), (.03, 0), (.04, .07), (.035, .07), (.026, .005), (0, .005)], 14)
    # palm-frond broom «مكنسة خوص» leaning by the shuttered shop
    bx, by = 5.12, -.12
    n0 = len(straw.verts)
    for k in range(26):
        a = R.uniform(-.5, .5)
        lib.bm_cyl(straw, (bx + a * .03, by, .55), (bx + a * .22, by + R.uniform(-.03, .03), .0), .004, 4)
    lib.bm_cyl(straw, (bx, by, .5), (bx, by, 1.2), .022, 8)
    _xform(straw, _new_since(straw, n0), T(bx, by, 0) @ RY(-14) @ T(-bx, -by, 0))
    w = lib.from_bm('Props_Wood', wood, c, M['beam']); lib.uv_box(w); lib.bevel(w, .004, 2)
    cl = lib.from_bm('Props_WaterJar', clay, c, M['terracotta'], smooth=True); lib.uv_box(cl)
    br = lib.from_bm('Props_Cup', brass, c, M['brass'], smooth=True); lib.uv_box(br)
    st = lib.from_bm('Props_Broom', straw, c, M['basket']); lib.uv_box(st)
    # the game's own dallah (our Blender model) on a brass tray on the seller's stool
    try:
        src = r'C:\Users\LENOVO\Documents\DAMA_WORLD\dallah.blend'
        with bpy.data.libraries.load(src, link=False) as (fr, to):
            to.objects = [n for n in fr.objects if n == 'DW_Dallah_Game'][:1]
        for o in to.objects:
            if o is None: continue
            c.objects.link(o); o.name = 'Props_Dallah'
            o.parent = None; o.matrix_world = T(-2.22, -.78, .38) @ RZ(150)
            dims = max(o.dimensions); k = .30 / max(o.dimensions.z, 1e-3)
            o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
    except Exception as e:
        print('dallah not placed:', e)
    tray = bmesh.new()
    lib.bm_lathe(tray, (-2.25, -.75, .38), [(0, 0), (.16, 0), (.18, .015), (.19, .02), (0, .006)], 32)
    for k in range(3):
        a = 2.4 + k * .5
        lib.bm_lathe(tray, (-2.25 + .11 * math.cos(a), -.75 + .11 * math.sin(a), .386), [(0, 0), (.017, 0), (.024, .035), (.022, .036), (0, .01)], 12)
    tr = lib.from_bm('Props_Tray', tray, c, M['brass'], smooth=True); lib.uv_box(tr)

# ------------------------------------------------------------------ spice shop, second pass
SPICE = [(0.85, 0.60, 0.10), (0.62, 0.12, 0.05), (0.42, 0.27, 0.12), (0.30, 0.38, 0.12), (0.80, 0.42, 0.08),
         (0.20, 0.12, 0.08), (0.70, 0.55, 0.30), (0.50, 0.15, 0.10), (0.35, 0.30, 0.18)]

def sack(bm, x, y, z, r, h, tilt=0., rolled=True):
    n0 = len(bm.verts)
    prof = [(0, 0), (r * .85, 0), (r, .06), (r * 1.05, h * .45), (r * .97, h * .85), (r * 1.06, h)]
    if rolled: prof += [(r * 1.16, h + .025), (r * 1.12, h + .05), (r * .98, h + .045), (r * .93, h - .015)]
    else: prof += [(r * 1.0, h + .12), (r * .95, h + .14), (r * .9, h + .02)]
    lib.bm_lathe(bm, (0, 0, 0), prof, 24, cap_top=False)
    _xform(bm, _new_since(bm, n0), T(x, y, z) @ RX(tilt) @ RZ(R.uniform(0, 360)))
    return h

def heap(c, M, x, y, z, r, h, col, tilt=0., name='Spice'):
    bm = bmesh.new()
    lib.bm_lathe(bm, (0, 0, 0), [(r * .93, h - .02), (r * .75, h + .03), (r * .4, h + .075 + R.uniform(0, .03)), (0, h + .09 + R.uniform(0, .03))], 20)
    _xform(bm, list(bm.verts), T(x, y, z) @ RX(tilt))
    o = lib.from_bm(name, bm, c, M['spice'], smooth=True); lib.uv_box(o); o.color = (*col, 1)
    return o

def balls(c, M, cx, cy, z0, rad, n, col, name, r=.022):
    """Loose round items in a heap (dried limes «لومي», nuts...)."""
    bm = bmesh.new()
    for i in range(n):
        a = R.uniform(0, 2 * math.pi); d = rad * math.sqrt(R.random())
        hz = z0 + (rad - d) * .55 + R.uniform(0, .02)
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r * R.uniform(.85, 1.15),
                                   matrix=Matrix.Translation((cx + d * math.cos(a), cy + d * math.sin(a), hz)) @ Matrix.Diagonal((1, 1, R.uniform(.8, 1), 1)))
    o = lib.from_bm(name, bm, c, M['spice'], smooth=True); lib.uv_box(o); o.color = (*col, 1)
    return o

def basket(bm, x, y, z, r, h, flare=1.15):
    lib.bm_lathe(bm, (x, y, z), [(0, 0), (r * .8, 0), (r, h * .3), (r * flare, h), (r * flare + .01, h + .01), (r * flare - .01, h + .015), (r * .95, h * .4), (0, .015)], 24, cap_top=False)

def spice_shop(c, M, H):
    a, b = -H.W2 + H.TS, -2.45           # inner x extent of shop A
    zf = H.SHOP_Z[0]
    wood = bmesh.new(); jars = bmesh.new(); jars2 = bmesh.new(); sacks = bmesh.new(); glass = bmesh.new()
    lids = bmesh.new(); brass = bmesh.new(); bask = bmesh.new(); cord = bmesh.new(); paper = bmesh.new()
    def plank(x0, x1, y0, y1, z0, z1, tilt=0.):
        m = T((x0 + x1) / 2, (y0 + y1) / 2, z0) @ RY(tilt)
        vs, _ = lib.bm_box(wood, (x0 - x1) / 2, (x1 - x0) / 2, (y0 - y1) / 2, (y1 - y0) / 2, 0, z1 - z0, m=m)
        lib.set_rand_attr(wood, vs, R.random())
    # --- back wall: left bay of uneven shelves, door to the store behind, high shelf over the door
    bx0, bx1 = a + .05, -3.62
    levels = [.42, .98, 1.46, 1.98]
    for i, zz in enumerate(levels):
        plank(bx0, bx1, 3.64, 3.99, zf + zz + R.uniform(-.015, .015), zf + zz + .035, R.uniform(-.6, .6))
    for x in (bx0, (bx0 + bx1) / 2 + R.uniform(-.05, .05), bx1 - .045):
        plank(x, x + .045, 3.64, 3.99, zf, zf + 2.25)
    plank(-3.6, b - .02, 3.70, 3.99, zf + 2.38, zf + 2.415)                    # high shelf over the doorway
    for zz, x in ((2.38, -3.5), (2.38, -2.65)):
        plank(x, x + .03, 3.85, 3.99, zf + zz - .18, zf + zz)                   # brackets
    # --- left wall: narrow shelves of glass jars
    for i, zz in enumerate((.95, 1.45, 1.95)):
        plank(a + .005, a + .30, 1.35, 3.55, zf + zz, zf + zz + .03)
    plank(a + .005, a + .30, 1.33, 1.37, zf, zf + 2.1); plank(a + .005, a + .30, 3.52, 3.56, zf, zf + 2.1)
    # --- counter along the right wall, with drawers
    plank(b - .52, b - .02, 2.15, 3.55, zf, zf + .82)
    plank(b - .56, b - .0, 2.11, 3.59, zf + .82, zf + .865)
    for k in range(3):
        y0 = 2.22 + k * .45
        plank(b - .535, b - .52, y0, y0 + .4, zf + .55, zf + .75)
        lib.bm_cyl(brass, (b - .54, y0 + .2, zf + .65), (b - .56, y0 + .2, zf + .65), .012, 8)
    # --- jars on the back shelves: varied sizes, some gaps, some glazed
    for i, zz in enumerate(levels):
        x = bx0 + .09
        while x < bx1 - .1:
            if R.random() < .12: x += .12; continue
            h = R.uniform(.16, .36) if i < 3 else R.uniform(.12, .22)
            r = R.uniform(.055, .10)
            prof = [(0, 0), (r * .7, 0), (r, h * .35), (r * .9, h * .8), (r * .45, h * .92), (r * .5, h), (0, h)]
            lib.bm_lathe(jars if R.random() < .55 else jars2, (x + r, 3.80 + R.uniform(-.04, .04), zf + levels[i] + .035), prof, 14)
            x += r * 2 + R.uniform(.02, .07)
    # baskets on the high shelf
    for x in (-3.42, -3.12, -2.8):
        basket(bask, x, 3.84, zf + 2.415, R.uniform(.09, .12), R.uniform(.12, .2))
    # --- glass jars with lids and coloured contents on the left wall
    k = 0
    for zz in (.95, 1.45, 1.95):
        y = 1.5
        while y < 3.4:
            r = R.uniform(.05, .07); h = R.uniform(.17, .26)
            gx = a + .15
            lib.bm_lathe(glass, (gx, y, zf + zz + .03), [(0, 0), (r, 0), (r, h * .85), (r * .7, h), (0, h)], 16)
            fill = R.uniform(.45, .8)
            bm = bmesh.new(); lib.bm_lathe(bm, (gx, y, zf + zz + .035), [(0, 0), (r * .93, 0), (r * .93, h * .85 * fill), (r * .6, h * .85 * fill + .01), (0, h * .85 * fill + .012)], 16)
            o = lib.from_bm('JarFill_%d' % k, bm, c, M['spice'], smooth=True); o.color = (*SPICE[k % len(SPICE)], 1); lib.uv_box(o)
            lib.bm_lathe(lids, (gx, y, zf + zz + .03 + h), [(0, 0), (r * .78, 0), (r * .8, .025), (r * .3, .035), (r * .25, .05), (0, .05)], 16)
            y += r * 2 + R.uniform(.03, .08); k += 1
    # --- brass balance on the counter + paper cones
    sx, sy, sz = b - .27, 2.65, zf + .865
    lib.bm_cyl(brass, (sx, sy, sz), (sx, sy, sz + .32), .012, 10)
    lib.bm_lathe(brass, (sx, sy, sz), [(0, 0), (.07, 0), (.07, .015), (.02, .03), (0, .03)], 18)
    lib.bm_cyl(brass, (sx, sy - .2, sz + .31), (sx, sy + .2, sz + .31), .007, 8)
    for d in (-.19, .19):
        for k3 in range(3):
            aa = 2 * math.pi * k3 / 3
            lib.bm_cyl(brass, (sx, sy + d, sz + .31), (sx + .06 * math.cos(aa), sy + d + .06 * math.sin(aa), sz + .1), .0015, 4)
        lib.bm_lathe(brass, (sx, sy + d, sz + .09), [(0, 0), (.08, .02), (.085, .03), (.075, .028), (0, .01)], 20)
    for k in range(4):
        n0 = len(paper.verts)
        lib.bm_lathe(paper, (0, 0, 0), [(0, 0), (.035, .12), (.033, .12), (0, .005)], 10, cap_top=False, cap_bottom=False)
        _xform(paper, _new_since(paper, n0), T(b - .4 + R.uniform(-.05, .05), 3.05 + k * .1, sz + .03) @ RY(90 + R.uniform(-15, 15)) @ RZ(R.uniform(0, 360)))
    # --- sacks: two rows inside at different heights, three on the platform outside (one tilted)
    spots = [(-4.62, 1.02, zf, .2, .42, 0), (-4.12, 1.08, zf, .18, .36, 0), (-3.62, 0.98, zf, .2, .46, 0),
             (-3.12, 1.06, zf, .17, .33, 0), (-4.45, 1.55, zf, .19, .55, 0), (-3.9, 1.6, zf, .2, .5, 0),
             (-4.55, -0.34, .36, .19, .4, 0), (-3.98, -0.30, .36, .17, .34, 6), (-3.4, -0.36, .36, .2, .44, -4)]
    for i, (x, y, z, r, h, tl) in enumerate(spots):
        sack(sacks, x, y, z, r, h, tl, rolled=(i % 3 != 2))
        heap(c, M, x, y, z, r, h if i % 3 != 2 else h + .02, SPICE[i % len(SPICE)], tl, 'Spice_%d' % i)
    # flat baskets of dried limes «لومي» and of dried chillies
    basket(bask, -3.0, 1.75, zf, .2, .12, 1.2)
    balls(c, M, -3.0, 1.75, zf + .07, .2, 70, (.22, .14, .07), 'Loomi', .024)
    basket(bask, -2.78, -0.3, .36, .18, .1, 1.25)
    balls(c, M, -2.78, -0.3, .42, .18, 55, (.30, .19, .09), 'Loomi_Out', .023)
    # wooden scoop resting in the turmeric sack
    lib.bm_cyl(wood, (-4.55, -.34, .78), (-4.36, -.24, .98), .012, 6)
    lib.bm_lathe(brass, (-4.57, -.35, .76), [(0, 0), (.04, .01), (.045, .04), (0, .01)], 12)
    # --- strings of dried chillies and hanging baskets
    for hx in (-4.75, -2.95):
        lib.bm_cyl(cord, (hx, .78, 2.86), (hx, .78, 1.95), .003, 4)
        for k in range(18):
            zz = 2.8 - k * .05; a2 = R.uniform(0, 2 * math.pi)
            n0 = len(cord.verts)
            lib.bm_lathe(cord, (0, 0, 0), [(0, 0), (.012, .015), (.009, .06), (0, .075)], 8)
            _xform(cord, _new_since(cord, n0), T(hx, .78, zz) @ RZ(math.degrees(a2)) @ RX(180 - R.uniform(10, 40)))
    ch = lib.from_bm('Chilli_Strings', cord, c, M['spice'], smooth=True); lib.uv_box(ch); ch.color = (.45, .05, .03, 1)
    for hx, hy in ((-4.2, 2.3), (-3.3, 2.55)):
        lib.bm_cyl(bask, (hx, hy, 3.7), (hx, hy, 3.05), .003, 4)
        basket(bask, hx, hy, 2.75, .14, .26, 1.05)
    # --- doorway to the store room: cloth curtain, partly drawn
    cur = bmesh.new()
    nx, nz = 18, 22
    vs = [[cur.verts.new((-3.55 + .6 * i / nx * (1 - .45 * (k / nz) ** 2) + .03 * math.sin(i * 1.7), 4.06 + .025 * math.sin(i * 1.3 + k * .2), zf + 2.0 * (1 - k / nz)))
           for i in range(nx + 1)] for k in range(nz + 1)]
    for k in range(nz):
        for i in range(nx):
            cur.faces.new((vs[k][i], vs[k][i + 1], vs[k + 1][i + 1], vs[k + 1][i]))
    co = lib.from_bm('Shop_Curtain', cur, c, M['burlap'], smooth=True); lib.uv_box(co)
    co.modifiers.new('Solid', 'SOLIDIFY').thickness = .004
    # --- assemble
    for name, bmx, mat, smooth in (('Shop_Shelves', wood, 'beam', False), ('Shop_Jars', jars, 'jar', True), ('Shop_Jars_Glazed', jars2, 'jar2', True),
                                   ('Shop_GlassJars', glass, 'glassjar', True), ('Shop_JarLids', lids, 'brass', True), ('Shop_Brass', brass, 'brass', True),
                                   ('Shop_Baskets', bask, 'basket', True), ('Shop_PaperCones', paper, 'burlap', True)):
        o = lib.from_bm(name, bmx, c, M[mat], smooth=smooth); lib.uv_box(o)
        if name == 'Shop_Shelves': lib.bevel(o, .004, 2)
        if name == 'Shop_PaperCones': o.modifiers.new('Solid', 'SOLIDIFY').thickness = .002
    sk = lib.from_bm('Shop_Sacks', sacks, c, M['burlap'], smooth=True); lib.uv_box(sk)
    sd = sk.modifiers.new('Soft', 'SUBSURF'); sd.levels = sd.render_levels = 2
    tx = bpy.data.textures.get('sack_folds') or bpy.data.textures.new('sack_folds', 'CLOUDS'); tx.noise_scale = .07; tx.noise_depth = 2
    dm = sk.modifiers.new('Folds', 'DISPLACE'); dm.texture = tx; dm.strength = .025; dm.texture_coords = 'GLOBAL'
    # --- light: the hanging bulb + a dim glow from the store room behind the curtain
    bulb = bmesh.new(); tin = bmesh.new()
    x, y = (a + b) / 2 - .2, 1.9
    lib.bm_cyl(tin, (x, y, H.FLOOR1 - .15), (x, y, 2.95), .004, 6)
    lib.bm_lathe(tin, (x, y, 2.70), [(.17, 0), (.15, .02), (.05, .17), (.03, .25)], 20, cap_top=True, cap_bottom=False)
    lib.bm_lathe(bulb, (x, y, 2.66), [(0, 0), (.03, .015), (.035, .05), (.015, .085), (0, .09)], 12)
    t = lib.from_bm('Shop_Lamp_Shade', tin, c, M['iron'], smooth=True); lib.uv_box(t)
    t.modifiers.new('Solid', 'SOLIDIFY').thickness = .004
    bl = lib.from_bm('Shop_Lamp_Bulb', bulb, c, M['bulb'], smooth=True); bl.visible_shadow = False
    L = bpy.data.lights.new('ShopBulb', 'POINT'); L.energy = 60; L.color = (1, .72, .42); L.shadow_soft_size = .04
    lo = bpy.data.objects.new('ShopBulb', L); lo.location = (x, y, 2.62); c.objects.link(lo)
    lo['day_energy'] = 45.0; lo['night_energy'] = 90.0
    L2 = bpy.data.lights.new('ShopStoreGlow', 'POINT'); L2.color = (1, .62, .32); L2.shadow_soft_size = .3
    l2 = bpy.data.objects.new('ShopStoreGlow', L2); l2.location = (-3.2, 4.9, 1.6); c.objects.link(l2)
    l2['day_energy'] = 22.0; l2['night_energy'] = 30.0
    return lo

# ------------------------------------------------------------------ street frontage test
def street(c, M, H):
    """Mubarakiya-style alley in front of the building:
    - a 40 cm band of darker stones along the facade (edge to the building, takes the drip line)
    - main field of 60x30 cm pavers in running bond, mixed grey/beige
    - a circular medallion in front of the gate with a dark border ring
    - a slot drain with an iron grate running down the middle of the alley
    - a wooden bench on iron frames."""
    W2 = H.W2; j = .008
    cx, cy, rr = 0.0, -2.45, 1.30
    X0, X1, Y0 = -9.0, 9.0, -8.6
    DR = (-4.62, -4.30)                       # drain channel y-range
    field = bmesh.new(); band = bmesh.new()
    cnt = 0
    def stone(bmx, x0, x1, y0, y1, val, h=.06):
        nonlocal cnt
        hz = h + R.uniform(-.003, .003)
        vs, _ = lib.bm_box(bmx, x0 + j / 2, x1 - j / 2, y0 + j / 2, y1 - j / 2, -.06, hz - .06)
        lib.set_rand_attr(bmx, vs, val); cnt += 1
    # facade band (dark), wraps the building's front corners and sides
    x = X0
    while x < X1 - .01:
        w = min(.4 + R.uniform(-.06, .06), X1 - x)
        if x + w > -W2 - .02 and x < W2 + .02: stone(band, x, x + w, -.42, -.0, .3)
        x += w
    for sxs, (bx0, bx1) in ((-1, (-W2 - .42, -W2)), (1, (W2, W2 + .42))):
        y = 0
        while y < 8.0:
            w = .4 + R.uniform(-.06, .06); stone(band, bx0, bx1, y, y + w, .3); y += w
    # running-bond field
    L, Wd = .6, .3
    yrow = -.42; row = 0
    while yrow - Wd > Y0:
        y1r, y0r = yrow, yrow - Wd
        if not (y0r < DR[1] and y1r > DR[0]):
            x = X0 - (L / 2 if row % 2 else 0)
            while x < X1:
                x0, x1 = max(x, X0), min(x + L, X1)
                mx, my = (x0 + x1) / 2, (y0r + y1r) / 2
                if math.hypot(mx - cx, my - cy) > rr + .15 - .35:
                    stone(field, x0, x1, y0r, y1r, 1.0 if R.random() < .35 else 0.0)
                x += L
        row += 1; yrow -= Wd
    # the alleys beside the building
    for (ax0, ax1) in ((X0, -W2 - .42), (W2 + .42, X1)):
        y = 0.0; row = 0
        while y < 8.0:
            x = ax0 - (L / 2 if row % 2 else 0)
            while x < ax1:
                x0, x1 = max(x, ax0), min(x + L, ax1)
                if x1 - x0 > .05: stone(field, x0, x1, y, y + Wd, 1.0 if R.random() < .35 else 0.0)
                x += L
            y += Wd; row += 1
    fo = lib.from_bm('Street_Pavers', field, c, M['paver']); lib.uv_box(fo); lib.bevel(fo, .007, 2)
    bo = lib.from_bm('Street_FacadeBand', band, c, M['paver']); lib.uv_box(bo); lib.bevel(bo, .008, 2)
    cut = bmesh.new(); lib.bm_cyl(cut, (cx, cy, -1), (cx, cy, 1), rr + .15, 64)
    co = lib.from_bm('Medallion_Cutter', cut, c); co.hide_render = True; co.hide_viewport = True; co.display_type = 'WIRE'
    bmod = fo.modifiers.new('Medallion', 'BOOLEAN'); bmod.operation = 'DIFFERENCE'; bmod.object = co; bmod.solver = 'EXACT'
    # medallion
    md = bmesh.new()
    def sector(r0, r1, a0, a1, val):
        jr = j / 2
        a0 += jr / max(r1, .05); a1 -= jr / max(r1, .05)
        r0 = r0 + jr if r0 > 0 else 0; r1 = r1 - jr
        k = 6
        outer = [(cx + r1 * math.cos(a0 + (a1 - a0) * t / k), cy + r1 * math.sin(a0 + (a1 - a0) * t / k)) for t in range(k + 1)]
        inner = [(cx + r0 * math.cos(a1 - (a1 - a0) * t / k), cy + r0 * math.sin(a1 - (a1 - a0) * t / k)) for t in range(k + 1)] if r0 > 0 else [(cx, cy)]
        n0 = len(md.verts)
        lib.bm_prism(md, outer + inner, -.06, R.uniform(-.002, .002))
        lib.set_rand_attr(md, _new_since(md, n0), val)
    for i in range(8): sector(0, .42, 2 * math.pi * i / 8, 2 * math.pi * (i + 1) / 8, float(i % 2))
    for i in range(16): sector(.42, .86, 2 * math.pi * i / 16, 2 * math.pi * (i + 1) / 16, 1.0)
    for i in range(28): sector(.86, rr, 2 * math.pi * i / 28, 2 * math.pi * (i + 1) / 28, 0.0)
    for i in range(36): sector(rr, rr + .15, 2 * math.pi * i / 36, 2 * math.pi * (i + 1) / 36, .3)
    mo = lib.from_bm('Street_Medallion', md, c, M['paver']); lib.uv_box(mo); lib.bevel(mo, .006, 2, 30)
    # slot drain: granite kerbs either side, dark channel, iron grate
    dr = bmesh.new(); gr = bmesh.new()
    x = X0
    while x < X1 - .01:
        w = min(.8, X1 - x)
        stone(dr, x, x + w, DR[0], DR[0] + .09, .3); stone(dr, x, x + w, DR[1] - .09, DR[1], .3)
        x += w
    lib.bm_box(gr, X0, X1, DR[0] + .09, DR[1] - .09, -.16, -.15)
    seg = 1.0; x = X0
    while x < X1 - .01:
        x1 = min(x + seg, X1)
        lib.bm_box(gr, x + .005, x1 - .005, DR[0] + .092, DR[0] + .105, -.03, -.005)
        lib.bm_box(gr, x + .005, x1 - .005, DR[1] - .105, DR[1] - .092, -.03, -.005)
        b = x + .02
        while b < x1 - .02:
            lib.bm_box(gr, b, b + .012, DR[0] + .1, DR[1] - .1, -.028, -.006); b += .035
        x = x1
    dro = lib.from_bm('Street_DrainKerbs', dr, c, M['paver']); lib.uv_box(dro); lib.bevel(dro, .01, 2)
    gro = lib.from_bm('Street_DrainGrate', gr, c, M['iron']); lib.uv_box(gro)
    # bench: three-slat seat + back on two iron frames
    bench = bmesh.new(); bi = bmesh.new()
    m = T(3.6, -6.4, 0) @ RZ(180)
    for k in range(3):
        vs, _ = lib.bm_box(bench, -.9, .9, -.2 + k * .14, -.2 + k * .14 + .12, .43, .465, m=m); lib.set_rand_attr(bench, vs, R.random())
    for k in range(2):
        vs, _ = lib.bm_box(bench, -.9, .9, .2 + .02 * k, .235 + .02 * k, .58 + k * .16, .7 + k * .16, m=m @ T(0, 0, 0)); lib.set_rand_attr(bench, vs, R.random())
    for fx in (-.72, .72):
        lib.bm_box(bi, fx - .02, fx + .02, -.22, -.18, 0, .43, m=m)
        lib.bm_box(bi, fx - .02, fx + .02, .18, .22, 0, .9, m=m)
        lib.bm_box(bi, fx - .02, fx + .02, -.22, .22, .41, .43, m=m)
        lib.bm_box(bi, fx - .02, fx + .02, -.22, .22, .06, .08, m=m)
    be = lib.from_bm('Street_Bench', bench, c, M['beam']); lib.uv_box(be); lib.bevel(be, .006, 2)
    bio = lib.from_bm('Street_Bench_Iron', bi, c, M['iron']); lib.uv_box(bio); lib.bevel(bio, .004, 2)
    bed = bmesh.new(); lib.bm_box(bed, X0, X1, Y0, DR[0], -.08, -.012); lib.bm_box(bed, X0, X1, DR[1], 8.0, -.08, -.012)
    bd = lib.from_bm('Street_Bed', bed, c, M['mortar']); lib.uv_box(bd)
    sand = bmesh.new(); lib.bm_box(sand, -1500, 1500, -1500, 1500, -.10, -.082)
    sa = lib.from_bm('Ground_Sand', sand, c, M['mud']); lib.uv_box(sa)
    return cnt
