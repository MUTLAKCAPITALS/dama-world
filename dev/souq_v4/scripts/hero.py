# DAMA WORLD — souq v4 — HERO BUILDING: a two-storey Mubarakiya souq building, modelled from scratch.
# Ground floor: two shops (one open spice shop, one shuttered) either side of a «بو خوخة» double gate.
# Upper floor: three deep-set windows with iron bars and panelled shutters.
# Roof: mangrove poles + reed mat + mud slab, plaster parapet with coping and timber rain spouts.
# Units: metres. Facade faces -Y (street side), outer face at y = 0. Z up, street level z = 0.
import bpy, bmesh, math
from mathutils import Vector, Matrix
import lib, details
from lib import R

W2 = 5.75          # half width
DEPTH = 6.5
TF = 0.55          # front/back wall thickness
TS = 0.50          # side wall thickness
ROOF = 7.35        # top of roof slab / main walls
PAR = 8.15         # top of parapet (below coping)
FLOOR1 = 3.85      # underside of first-floor slab
SHOP = [(-4.95, -2.65), (2.65, 4.95)]
SHOP_Z = (0.35, 2.90)
GATE = (-1.05, 1.05, 3.10)
WIN_X = (-3.8, 0.0, 3.8); WIN_W = 0.95; WIN_Z = (4.85, 6.15)
SIDE_WIN = (2.9, 3.5, 5.0, 5.9)
RR = (2.55, 3.45, 10.0)      # roof room: x0, y0, top of its walls
RD = (3.55, 4.40, 9.30)      # roof room door: x0, x1, head

def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
def RZ(a): return Matrix.Rotation(math.radians(a), 4, 'Z')
def RX(a): return Matrix.Rotation(math.radians(a), 4, 'X')

# ------------------------------------------------------------------ structure
def build_shell(c, M):
    big = 9
    solids = [
        (-W2, W2, 0, TF, 0, ROOF),                      # front wall
        (-W2, W2, DEPTH - TF, DEPTH, 0, ROOF),          # back wall
        (-W2, -W2 + TS, 0, DEPTH, 0, ROOF),             # left wall
        (W2 - TS, W2, 0, DEPTH, 0, ROOF),               # right wall
        (-2.45, -2.15, TF, DEPTH - TF, 0, FLOOR1),      # cross walls flanking the gate passage
        (2.15, 2.45, TF, DEPTH - TF, 0, FLOOR1),
        (-W2 + TS, -2.45, 4.0, 4.3, 0, FLOOR1),          # shop back walls
        (2.45, W2 - TS, 4.0, 4.3, 0, FLOOR1),
        (-W2, W2, 0, 0.40, ROOF, PAR),                  # parapet ring
        (-W2, W2, DEPTH - 0.40, DEPTH, ROOF, PAR),
        (-W2, -W2 + 0.40, 0.40, DEPTH - 0.40, ROOF, PAR),
        (W2 - 0.40, W2, 0.40, DEPTH - 0.40, ROOF, PAR),
        (RR[0], W2, RR[1], DEPTH, ROOF, RR[2] + .35),    # roof stair room (غرفة السطح)
    ]
    holes = []
    for a, b in SHOP:
        holes.append((a, b, -1, 1, SHOP_Z[0], SHOP_Z[1]))
        holes.append((a - 0.25, b + 0.25, -1, 1, SHOP_Z[1], SHOP_Z[1] + 0.22))   # lintel seat
    g0, g1, gz = GATE
    holes.append((g0, g1, -1, 1, -1, gz))
    holes.append((g0 - 0.30, g1 + 0.30, -1, 1, gz, gz + 0.24))
    for cx in WIN_X:
        holes.append((cx - WIN_W/2, cx + WIN_W/2, -1, 1, WIN_Z[0], WIN_Z[1]))
        holes.append((cx - WIN_W/2 - 0.25, cx + WIN_W/2 + 0.25, -1, 1, WIN_Z[1], WIN_Z[1] + 0.20))
    y0, y1, z0, z1 = SIDE_WIN
    holes.append((-big, -W2 + TS + 0.01, y0, y1, z0, z1))
    holes.append((-big, -W2 + TS + 0.01, y0 - 0.22, y1 + 0.22, z1, z1 + 0.18))
    holes.append((W2 - TS - 0.01, big, y0 + 0.7, y1 + 0.7, z0, z1))
    holes.append((W2 - TS - 0.01, big, y0 + 0.48, y1 + 0.92, z1, z1 + 0.18))
    holes.append((RR[0] + .40, W2 - .40, RR[1] + .40, DEPTH - .40, ROOF, RR[2] + 1))
    holes.append((-3.55, -2.95, 3.9, 4.4, SHOP_Z[0], SHOP_Z[0] + 2.05))          # spice shop: door to its store room
    holes.append((RD[0], RD[1], RR[1] - .1, RR[1] + .5, ROOF, RD[2]))
    holes.append((RD[0] - .22, RD[1] + .22, RR[1] - .1, RR[1] + .5, RD[2], RD[2] + .18))
    for sx in (-1.9, 1.9):                                                    # rain-spout slots
        holes.append((sx - 0.09, sx + 0.09, -1, 0.41, ROOF, ROOF + 0.15))

    def mat_of(p, n):
        interior = (-W2 + TS - 1e-3 <= p.x <= W2 - TS + 1e-3) and (TF - 1e-3 <= p.y <= DEPTH - TF + 1e-3) and p.z < ROOF + 1e-3
        return 1 if interior else 0
    bm = bmesh.new()
    nf = lib.shell(bm, solids, holes, mat_of)
    o = lib.from_bm('Shell_Walls', bm, c, [M['plaster'], M['plaster_in']])
    lib.uv_box(o, arch=True)
    lib.plaster_mods(o, bevel_w=0.035, subdiv=2, disp=0.010)
    return o, nf

def plaster_trims(c, M):
    """Applied plaster mouldings: plinth skirting, string course, gate surround, window sills, coping."""
    bm = bmesh.new()
    # plinth skirting (rising-damp zone), only where the facade meets the street
    for a, b in ((-W2 - .035, -5.05), (-2.55, -1.55), (1.55, 2.55), (5.05, W2 + .035)):
        lib.bm_box(bm, a, b, -0.035, 0.0, 0, 0.5)
    for sx in (-1, 1):
        x0, x1 = (-W2 - .035, -W2) if sx < 0 else (W2, W2 + .035)
        lib.bm_box(bm, x0, x1, 0.0, DEPTH, 0, 0.5)
    # string course at first-floor level, wrapping the corners
    lib.bm_box(bm, -W2 - .05, W2 + .05, -0.05, 0.0, 3.98, 4.13)
    lib.bm_box(bm, -W2 - .05, -W2, 0.0, DEPTH, 3.98, 4.13)
    lib.bm_box(bm, W2, W2 + .05, 0.0, DEPTH, 3.98, 4.13)
    # gate surround: proud frame
    g0, g1, gz = GATE
    lib.wall_with_openings(bm, g0 - .5, g1 + .5, 0, gz + .52, -0.055, 0.0, [(g0 - .2, g1 + .2, -1, gz + .30)])
    # window sills and a thin surround
    for cx in WIN_X:
        a, b = cx - WIN_W/2, cx + WIN_W/2
        lib.bm_box(bm, a - .12, b + .12, -0.07, 0.05, WIN_Z[0] - .10, WIN_Z[0])
        lib.wall_with_openings(bm, a - .16, b + .16, WIN_Z[0], WIN_Z[1] + .32, -0.03, 0.0, [(a - .02, b + .02, WIN_Z[0] - 1, WIN_Z[1] + .22)])
    # parapet coping (rounded by the bevel)
    for b in ((-W2 - .03, W2 + .03, -0.03, 0.43), (-W2 - .03, W2 + .03, DEPTH - .43, DEPTH + .03),
              (-W2 - .03, -W2 + .43, 0.43, DEPTH - .43), (W2 - .43, W2 + .03, 0.43, DEPTH - .43)):
        lib.bm_box(bm, b[0], b[1], b[2], b[3], PAR, PAR + 0.09)
    o = lib.from_bm('Plaster_Trims', bm, c, M['plaster'])
    lib.uv_box(o, arch=True)
    lib.plaster_mods(o, bevel_w=0.022, subdiv=2, disp=0.006)
    return o

def platforms(c, M):
    """Raised seller platforms «دچة» in front of each shop: plastered body + sea-stone cap."""
    bm = bmesh.new(); cap = bmesh.new()
    for a, b in SHOP:
        lib.bm_box(bm, a - .1, b + .1, -0.62, 0.0, 0, 0.30)
        n = 3; w = (b - a + .26) / n
        for i in range(n):
            vs, _ = lib.bm_box(cap, a - .13 + i * w + .004, a - .13 + (i + 1) * w - .004, -0.66, 0.0, 0.30, 0.36 + R.uniform(-.004, .004))
            lib.set_rand_attr(cap, vs, 1.0)
    o = lib.from_bm('Shop_Platforms', bm, c, M['plaster']); lib.uv_box(o, arch=True); lib.plaster_mods(o, .03, 2, .006)
    k = lib.from_bm('Shop_Platform_Caps', cap, c, M['paver']); lib.uv_box(k); lib.bevel(k, .015, 3)
    return o, k

def lintels(c, M):
    bm = bmesh.new()
    def beam(x0, x1, z0, z1, y0=-0.012, y1=TF - 0.01, axis='x'):
        j = lambda: R.uniform(-.006, .006)
        vs, fs = lib.bm_box(bm, x0 + j(), x1 + j(), y0 + j(), y1, z0 + j(), z1 + j())
        lib.set_rand_attr(bm, vs, R.random())
    for a, b in SHOP: beam(a - .25, b + .25, SHOP_Z[1], SHOP_Z[1] + .22)
    g0, g1, gz = GATE; beam(g0 - .30, g1 + .30, gz, gz + .24)
    for cx in WIN_X: beam(cx - WIN_W/2 - .25, cx + WIN_W/2 + .25, WIN_Z[1], WIN_Z[1] + .20)
    y0, y1, z0, z1 = SIDE_WIN
    vs, _ = lib.bm_box(bm, -W2 - .012, -W2 + TS - .01, y0 - .22, y1 + .22, z1, z1 + .18); lib.set_rand_attr(bm, vs, R.random())
    vs, _ = lib.bm_box(bm, W2 - TS + .01, W2 + .012, y0 + .48, y1 + .92, z1, z1 + .18); lib.set_rand_attr(bm, vs, R.random())
    o = lib.from_bm('Timber_Lintels', bm, c, M['beam']); lib.uv_box(o); lib.bevel(o, .012, 3, 30)
    return o

def roof_and_floor(c, M):
    """Mangrove-pole (چندل) floor and roof, reed mat, mud slabs. Pole ends protrude through the walls."""
    poles = bmesh.new(); mats = bmesh.new(); mud = bmesh.new()
    def row(zc, y_front, y_back, x0, x1, spacing=0.42):
        n = int((x1 - x0) / spacing)
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n + R.uniform(-.03, .03)
            r = R.uniform(.058, .074)
            yf = y_front - R.uniform(.16, .30)
            yb = y_back + R.uniform(.10, .22)
            dz = R.uniform(-.012, .012)
            r0, r1 = lib.bm_cyl(poles, (x, yf, zc + dz), (x + R.uniform(-.03, .03), yb, zc - dz), r, 16, r1=r * R.uniform(.85, .95))
            details.POLE_ENDS.append((x, zc + dz, y_front))
            lib.set_rand_attr(poles, r0 + r1, R.random())
    row(FLOOR1 - .075, 0.0, DEPTH, -W2 + .35, W2 - .35)                # first floor
    row(ROOF - .30, 0.0, DEPTH, -W2 + .35, W2 - .35)                   # roof
    for zt in (FLOOR1, ROOF - .23):
        lib.bm_box(mats, -W2 + TS, W2 - TS, TF, DEPTH - TF, zt - .005, zt + .012)
    lib.bm_box(mud, -W2 + TS, W2 - TS, TF, DEPTH - TF, FLOOR1 + .012, FLOOR1 + .22)
    lib.bm_box(mud, -W2 + .40, W2 - .40, .40, DEPTH - .40, ROOF - .218, ROOF + .03)
    # shop floors (beaten earth on a raised base)
    for a, b in ((-W2 + TS, -2.45), (2.45, W2 - TS)):
        lib.bm_box(mud, a, b, TF, 4.0, 0, SHOP_Z[0])
    po = lib.from_bm('Mangrove_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .01, 2, 50)
    mo = lib.from_bm('Reed_Mats', mats, c, M['reed']); lib.uv_box(mo)
    mu = lib.from_bm('Mud_Slabs', mud, c, M['mud']); lib.uv_box(mu); lib.bevel(mu, .02, 2)
    return po, mo, mu

def roof_room(c, M):
    """Roof of the stair room + its plank door and lintel."""
    poles = bmesh.new(); mud = bmesh.new(); mats = bmesh.new(); door = bmesh.new(); lint = bmesh.new()
    x0, x1, y0, y1 = RR[0] + .40, W2 - .40, RR[1] + .40, DEPTH - .40
    n = 6
    for i in range(n + 1):
        x = x0 + .12 + (x1 - x0 - .24) * i / n + R.uniform(-.02, .02); r = R.uniform(.055, .07)
        r0, r1 = lib.bm_cyl(poles, (x, RR[1] - R.uniform(.15, .28), RR[2] - .33), (x, DEPTH + R.uniform(.08, .2), RR[2] - .33), r, 16)
        lib.set_rand_attr(poles, r0 + r1, R.random())
    lib.bm_box(mats, x0, x1, y0, y1, RR[2] - .265, RR[2] - .25)
    lib.bm_box(mud, x0, x1, y0, y1, RR[2] - .25, RR[2] + .02)
    vs, _ = lib.bm_box(lint, RD[0] - .22, RD[1] + .22, RR[1] - .012, RR[1] + .39, RD[2], RD[2] + .18); lib.set_rand_attr(lint, vs, R.random())
    # plank door, standing a little open
    w = RD[1] - RD[0] - .02; h = RD[2] - ROOF - .06
    m = T(RD[0] + .01, RR[1] + .30, ROOF + .04) @ RZ(28)
    shutter_leaf(door, 0, w, 0, h, t=.04, n=4, m=m, battens=(.12, .5, .88))
    po = lib.from_bm('RoofRoom_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .01, 2, 50)
    mo = lib.from_bm('RoofRoom_Mat', mats, c, M['reed']); lib.uv_box(mo)
    mu = lib.from_bm('RoofRoom_Mud', mud, c, M['mud']); lib.uv_box(mu); lib.bevel(mu, .02, 2)
    lo = lib.from_bm('RoofRoom_Lintel', lint, c, M['beam']); lib.uv_box(lo); lib.bevel(lo, .012, 3, 30)
    do = lib.from_bm('RoofRoom_Door', door, c, M['beam']); lib.uv_box(do); lib.bevel(do, .003, 2)

def spouts(c, M):
    """Timber rain spouts «مرزام»: open trough, iron strap, slight fall outward."""
    wood = bmesh.new(); iron = bmesh.new()
    for sx in (-1.9, 1.9):
        m = T(sx, 0, ROOF + .02) @ RX(7)
        L0, L1 = -0.85, 0.40
        lib.bm_box(wood, -.08, .08, L0, L1, 0, .025, m=m)
        lib.bm_box(wood, -.08, -.055, L0, L1, .025, .13, m=m)
        lib.bm_box(wood, .055, .08, L0, L1, .025, .13, m=m)
        lib.bm_box(iron, -.085, .085, -.62, -.57, -.004, .002, m=m)
        lib.bm_box(iron, -.086, -.08, -.62, -.57, 0, .135, m=m)
        lib.bm_box(iron, .08, .086, -.62, -.57, 0, .135, m=m)
    w = lib.from_bm('Rain_Spouts', wood, c, M['beam']); lib.uv_box(w); lib.bevel(w, .006, 2)
    i = lib.from_bm('Rain_Spout_Straps', iron, c, M['iron']); lib.uv_box(i)
    return w, i

# ------------------------------------------------------------------ the «بو خوخة» gate
def gate(c, M):
    g0, g1, gz = GATE
    yF = 0.25                               # door face sits 25 cm back from the facade
    frame = bmesh.new(); planks = bmesh.new(); iron = bmesh.new(); brass = bmesh.new()
    # frame: jambs, head, raised threshold
    for vs in (lib.bm_box(frame, g0, g0 + .12, yF - .02, yF + .22, 0, gz)[0],
               lib.bm_box(frame, g1 - .12, g1, yF - .02, yF + .22, 0, gz)[0],
               lib.bm_box(frame, g0, g1, yF - .02, yF + .22, gz - .12, gz)[0],
               lib.bm_box(frame, g0 - .02, g1 + .02, -0.04, TF - .05, 0, .09)[0]):
        lib.set_rand_attr(frame, vs, R.random())
    z0, z1 = .09, gz - .12
    W = (g1 - .12) - (g0 + .12)
    leaves = [(g0 + .12, -0.0015), (0.0015, g1 - .12)]
    wk = (0.205, 0.725, 0.40, 1.70)          # wicket «خوخة» ~52 × 130 cm in the right leaf
    gap = .004
    def plank(x0, x1, za, zb, dy=0.0):
        t = .042 + R.uniform(-.002, .002); y0 = yF + R.uniform(-.0015, .0015) + dy
        vs, _ = lib.bm_box(planks, x0, x1, y0, y0 + t, za, zb)
        lib.set_rand_attr(planks, vs, R.random())
    for li, (lx0, lx1) in enumerate(leaves):
        n = 5; w = (lx1 - lx0) / n
        for i in range(n):
            px0, px1 = lx0 + i * w + .0012, lx0 + (i + 1) * w - .0012
            if li == 1 and px1 > wk[0] and px0 < wk[1]:
                ia, ib = max(px0, wk[0]), min(px1, wk[1])
                if px0 < wk[0]: plank(px0, wk[0] - gap, z0, z1)
                if px1 > wk[1]: plank(wk[1] + gap, px1, z0, z1)
                plank(ia + (gap if ia == wk[0] else 0), ib - (gap if ib == wk[1] else 0), z0, wk[2] - gap)
                plank(ia + (gap if ia == wk[0] else 0), ib - (gap if ib == wk[1] else 0), wk[3] + gap, z1)
                plank(ia + (gap if ia == wk[0] else .0012) + .0, ib - (gap if ib == wk[1] else .0012), wk[2], wk[3], -0.002)
            else:
                plank(px0, px1, z0, z1)
        # back battens «شلامين»
        for zb in (.30, .95, 1.85, 2.70):
            vs, _ = lib.bm_box(planks, lx0 + .02, lx1 - .02, yF + .044, yF + .08, zb, zb + .12); lib.set_rand_attr(planks, vs, R.random())
        # front middle rail «الخشم»
        vs, _ = lib.bm_box(planks, lx0 + .005, lx1 - .005, yF - .032, yF + .001, 1.80, 1.94); lib.set_rand_attr(planks, vs, R.random())
        # iron bands top and bottom, corner plates
        for zb in (.20, 2.70):
            lib.bm_box(iron, lx0 + .004, lx1 - .004, yF - .006, yF + .001, zb, zb + .065)
    # wicket moulding (frames the small door)
    a, b, za, zb = wk; mt = .03
    for bx in ((a - gap - mt, a - gap, za - gap - mt, zb + gap + mt), (b + gap, b + gap + mt, za - gap - mt, zb + gap + mt),
               (a - gap, b + gap, za - gap - mt, za - gap), (a - gap, b + gap, zb + gap, zb + gap + mt)):
        vs, _ = lib.bm_box(planks, bx[0], bx[1], yF - .014, yF + .002, bx[2], bx[3]); lib.set_rand_attr(planks, vs, R.random())
    # ---- studs «مسامير»: rows along bands and rail, rosettes «وردة/ثريا» of five rings, edge columns
    S = []
    for lx0, lx1 in leaves:
        for zb in (.2325, 2.7325):
            k = 10
            for i in range(k): S.append((lx0 + (lx1 - lx0) * (i + .5) / k, yF - .006, zb))
        k = 9
        for i in range(k): S.append((lx0 + (lx1 - lx0) * (i + .5) / k, yF - .032, 1.87))
    def rosette(cx, cz, yv=yF):
        S.append((cx, yv, cz))
        for ring, cnt in ((.055, 6), (.11, 12), (.165, 18), (.22, 24), (.275, 30)):
            for i in range(cnt):
                a_ = 2 * math.pi * i / cnt + (math.pi / cnt if ring in (.11, .22) else 0)
                S.append((cx + ring * math.cos(a_), yv, cz + ring * math.sin(a_)))
        for d in (.31, .35): S.append((cx, yv, cz + d)); S.append((cx, yv, cz - d))
    lc = (leaves[0][0] + leaves[0][1]) / 2; rc = (leaves[1][0] + leaves[1][1]) / 2
    rosette(lc, 1.05); rosette(lc, 2.32); rosette(rc, 2.32)
    for lx0, lx1 in leaves:
        for x in (lx0 + .045, lx1 - .045):
            for zz in (.42, .62, .82, 1.32, 1.52, 2.10, 2.55):
                if lx0 > 0 and wk[0] - .05 < x < wk[1] + .05 and wk[2] - .05 < zz < wk[3] + .05: continue
                S.append((x, yF, zz))
    # wicket frame studs
    for i in range(7):
        zz = wk[2] + (wk[3] - wk[2]) * (i + .5) / 7
        S.append((wk[0] - gap - .015, yF - .014, zz)); S.append((wk[1] + gap + .015, yF - .014, zz))
    for (x, y, z) in S:
        lib.bm_dome(iron, (x, y + .0008, z), .0155, .011, (0, -1, 0), 8, 3)
    # ---- knocker on the left leaf, ring pull + lock plate on the wicket
    def knocker(x, z, R_=.075, plate=.05):
        r0, r1 = lib.bm_cyl(brass, (x, yF + .002, z), (x, yF - .010, z), plate, 16)
        lib.bm_dome(brass, (x, yF - .010, z), plate * .45, .022, (0, -1, 0), 12, 4)
        lib.bm_torus(brass, (x, yF - .028, z - R_ + .01), R_, .010, (0, 1, 0), 24, 8)
        lib.bm_cyl(brass, (x, yF - .010, z - .01), (x, yF - .03, z - .01), .009, 8)
    knocker(lc + .16, 1.50)
    knocker((wk[0] + wk[1]) / 2 + .14, 1.12, .045, .03)
    lib.bm_box(iron, wk[0] + .05, wk[0] + .13, yF - .010, yF - .002, 1.00, 1.18)            # lock plate
    lib.bm_box(iron, wk[0] + .085, wk[0] + .095, yF - .012, yF - .009, 1.06, 1.10)
    # pivot sockets: iron caps where the hinge stiles turn in the frame
    for x in (leaves[0][0] + .03, leaves[1][1] - .03):
        for z in (z0 + .01, z1 - .01):
            lib.bm_cyl(iron, (x, yF + .02, z - .03), (x, yF + .02, z + .03), .03, 12)
    fo = lib.from_bm('Gate_Frame', frame, c, M['teak']); lib.uv_box(fo); lib.bevel(fo, .008, 2)
    po = lib.from_bm('Gate_Planks', planks, c, M['teak']); lib.uv_box(po); lib.bevel(po, .0035, 2, 40)
    io = lib.from_bm('Gate_Ironwork', iron, c, M['iron'], smooth=True); lib.uv_box(io)
    bo = lib.from_bm('Gate_Brass', brass, c, M['brass'], smooth=True); lib.uv_box(bo)
    return fo, po, io, bo, len(S)

# ------------------------------------------------------------------ shops
def shutter_leaf(bm, x0, x1, z0, z1, t=.035, n=3, m=None, battens=(.25, .5, .75)):
    w = (x1 - x0) / n
    for i in range(n):
        vs, _ = lib.bm_box(bm, x0 + i * w + .0015, x0 + (i + 1) * w - .0015, 0, t, z0, z1, m=m)
        lib.set_rand_attr(bm, vs, R.random())
    for f in battens:
        zz = z0 + (z1 - z0) * f
        vs, _ = lib.bm_box(bm, x0 + .01, x1 - .01, -.022, 0.0005, zz - .05, zz + .05, m=m)
        lib.set_rand_attr(bm, vs, R.random())

def shops(c, M):
    open_sh = bmesh.new(); closed = bmesh.new(); iron = bmesh.new(); frame = bmesh.new()
    za, zb = SHOP_Z
    for si, (a, b) in enumerate(SHOP):
        # timber frame lining the opening
        for vs in (lib.bm_box(frame, a, a + .09, .30, .46, za, zb)[0], lib.bm_box(frame, b - .09, b, .30, .46, za, zb)[0],
                   lib.bm_box(frame, a, b, .30, .46, zb - .09, zb)[0], lib.bm_box(frame, a - .02, b + .02, -0.02, TF - .05, za - .04, za + .02)[0]):
            lib.set_rand_attr(frame, vs, R.random())
        lw = (b - a - .18) / 4
        if si == 0:      # open spice shop: four leaves folded back in pairs against the inner reveals
            for side in (0, 1):
                for k in range(2):
                    if side == 0:
                        hx = a + .09 + .045 * k
                        m = T(hx, .47 + .045 * k, 0) @ RZ(90 - 4 * k)
                    else:
                        hx = b - .09 + .035 - .045 * k
                        m = T(hx, .47 + .045 * k, 0) @ RZ(90 + 4 * k)
                    shutter_leaf(open_sh, 0, lw, za + .03, zb - .1, m=m)
        else:            # shuttered shop: leaves closed in the frame, hasp and padlock
            for k in range(4):
                shutter_leaf(closed, a + .09 + k * lw, a + .09 + (k + 1) * lw, za + .03, zb - .1, m=T(0, .26, 0))
            mx = (a + b) / 2
            lib.bm_box(iron, mx - .12, mx + .12, .21, .236, 1.42, 1.48)
            lib.bm_torus(iron, (mx + .1, .20, 1.40), .025, .006, (1, 0, 0), 12, 6)
            lib.bm_box(iron, mx + .07, mx + .13, .185, .215, 1.28, 1.37)
    o1 = lib.from_bm('ShopA_Shutters_Open', open_sh, c, M['shutter']); lib.uv_box(o1); lib.bevel(o1, .003, 2)
    o2 = lib.from_bm('ShopB_Shutters_Closed', closed, c, M['shutter2']); lib.uv_box(o2); lib.bevel(o2, .003, 2)
    o3 = lib.from_bm('Shop_Hardware', iron, c, M['iron'], smooth=True); lib.uv_box(o3)
    o4 = lib.from_bm('Shop_Frames', frame, c, M['beam']); lib.uv_box(o4); lib.bevel(o4, .006, 2)
    return o1, o2, o3, o4

def shop_canopy(c, M):
    """Shade canopy over the spice shop: mangrove poles let into the wall, a front pole, two
    diagonal struts on the piers, and a reed mat on top (sloping out so rain runs off)."""
    poles = bmesh.new(); mat = bmesh.new()
    x0, x1 = -5.18, -2.42
    zw, zf, yf = 3.42, 3.18, -1.35            # height at wall, at front, front line
    for i in range(5):
        x = x0 + .06 + (x1 - x0 - .12) * i / 4 + R.uniform(-.02, .02)
        r0, r1 = lib.bm_cyl(poles, (x, .25, zw + .03), (x, yf - .12, zf - .005), R.uniform(.042, .05), 14)
        lib.set_rand_attr(poles, r0 + r1, R.random())
    r0, r1 = lib.bm_cyl(poles, (x0 - .15, yf + .02, zf - .065), (x1 + .15, yf + .02, zf - .065), .052, 14)
    lib.set_rand_attr(poles, r0 + r1, R.random())
    for x in (x0 + .05, x1 - .05):
        r0, r1 = lib.bm_cyl(poles, (x, .02, 2.30), (x, yf + .08, zf - .10), .04, 8)
        lib.set_rand_attr(poles, r0 + r1, R.random())
    ang = math.degrees(math.atan2(zw - zf, -yf))
    m = T(0, 0, zw + .075) @ RX(ang)
    L = math.hypot(zw - zf, yf) + .12
    lib.bm_box(mat, x0 - .08, x1 + .08, -L, 0.02, 0, .014, m=m)
    po = lib.from_bm('Shop_Canopy_Poles', poles, c, M['pole'], smooth=True); lib.uv_box(po); lib.bevel(po, .008, 2, 50)
    mo = lib.from_bm('Shop_Canopy_Mat', mat, c, M['reed']); lib.uv_box(mo)
    return po, mo

# ------------------------------------------------------------------ windows
def panel_leaf(bm, w, h, t=.035, m=None):
    """Panelled shutter leaf (stiles, rails, raised panels), hinge at local x=0, face at y=0."""
    sw, rw = .06, .07
    parts = [(0, sw, 0, h), (w - sw, w, 0, h), (sw, w - sw, 0, rw), (sw, w - sw, h - rw, h), (sw, w - sw, h * .5 - rw / 2, h * .5 + rw / 2)]
    for x0, x1, z0, z1 in parts:
        vs, _ = lib.bm_box(bm, x0, x1, 0, t, z0, z1, m=m); lib.set_rand_attr(bm, vs, R.random())
    for z0, z1 in ((rw, h * .5 - rw / 2), (h * .5 + rw / 2, h - rw)):
        vs, _ = lib.bm_box(bm, sw - .004, w - sw + .004, .01, t - .008, z0 - .004, z1 + .004, m=m); lib.set_rand_attr(bm, vs, R.random())
        vs, _ = lib.bm_box(bm, sw + .03, w - sw - .03, .004, t - .012, z0 + .03, z1 - .03, m=m); lib.set_rand_attr(bm, vs, R.random())

def windows(c, M):
    frames = bmesh.new(); leaves = bmesh.new(); bars = bmesh.new(); hw = bmesh.new()
    states = {-3.8: (5, 100), 0.0: (0, 0), 3.8: (95, 12)}     # degrees each leaf is opened inward
    for cx in WIN_X:
        a, b = cx - WIN_W / 2, cx + WIN_W / 2; z0, z1 = WIN_Z
        # painted frame: outer casing + inner stop bead + a sill board, each a separate piece
        for vs in (lib.bm_box(frames, a, a + .07, .30, .44, z0, z1)[0], lib.bm_box(frames, b - .07, b, .30, .44, z0, z1)[0],
                   lib.bm_box(frames, a, b, .30, .44, z1 - .07, z1)[0], lib.bm_box(frames, a - .015, b + .015, .27, .46, z0, z0 + .055)[0],
                   lib.bm_box(frames, a + .07, a + .09, .30, .33, z0 + .055, z1 - .07)[0], lib.bm_box(frames, b - .09, b - .07, .30, .33, z0 + .055, z1 - .07)[0],
                   lib.bm_box(frames, a + .07, b - .07, .30, .33, z1 - .09, z1 - .07)[0]):
            lib.set_rand_attr(frames, vs, R.random())
        # hand-forged square bars, slightly irregular, through a flat cross bar
        n = 5
        for i in range(n):
            x = a + (b - a) * (i + 1) / (n + 1) + R.uniform(-.006, .006)
            m = T(x, .12, z0 - .04) @ Matrix.Rotation(math.radians(R.uniform(-.6, .6)), 4, 'Y') @ RZ(45 if i % 2 else 0)
            lib.bm_box(bars, -.011, .011, -.011, .011, 0, z1 - z0 + .08, m=m)
        zm = (z0 + z1) / 2
        lib.bm_box(bars, a - .02, b + .02, .1, .14, zm - .022, zm + .022)
        # two panelled leaves with strap hinges and a barrel bolt
        lw = (b - a - .14) / 2; h = z1 - z0 - .13
        o1, o2 = states[cx]
        ml = T(a + .07, .42, z0 + .06) @ RZ(o1)
        mr = T(b - .07, .42, z0 + .06) @ RZ(-o2) @ T(-lw, 0, 0)
        panel_leaf(leaves, lw, h, m=ml)
        panel_leaf(leaves, lw, h, m=mr)
        for zz in (.08, h - .12):
            lib.bm_box(hw, 0, .16, -.004, 0, zz, zz + .03, m=ml)
            lib.bm_box(hw, lw - .16, lw, -.004, 0, zz, zz + .03, m=mr)
            lib.bm_cyl(hw, (a + .072, .418, z0 + .06 + zz - .01), (a + .072, .418, z0 + .06 + zz + .04), .009, 8)
            lib.bm_cyl(hw, (b - .072, .418, z0 + .06 + zz - .01), (b - .072, .418, z0 + .06 + zz + .04), .009, 8)
        lib.bm_box(hw, lw - .07, lw - .01, -.012, 0, h * .5 - .015, h * .5 + .015, m=ml)
    L = bpy.data.lights.new('UpperRoomLamp', 'POINT'); L.energy = 0; L.color = (1, .68, .38); L.shadow_soft_size = .1
    lo = bpy.data.objects.new('UpperRoomLamp', L); lo.location = (-3.6, 2.2, 5.6); c.objects.link(lo)
    lo['day_energy'] = 0.0; lo['night_energy'] = 45.0
    f = lib.from_bm('Window_Frames', frames, c, M['frame']); lib.uv_box(f); lib.bevel(f, .006, 2)
    hwo = lib.from_bm('Window_Hardware', hw, c, M['iron'], smooth=True); lib.uv_box(hwo)
    l = lib.from_bm('Window_Shutters', leaves, c, M['shutter']); lib.uv_box(l); lib.bevel(l, .004, 2)
    br = lib.from_bm('Window_Bars', bars, c, M['iron']); lib.uv_box(br); lib.bevel(br, .003, 2)
    # small side windows: bars only + a closed leaf
    side = bmesh.new()
    y0, y1, z0, z1 = SIDE_WIN
    for i in range(3):
        y = y0 + (y1 - y0) * (i + 1) / 4
        lib.bm_cyl(side, (-W2 + .12, y, z0 - .03), (-W2 + .12, y, z1 + .03), .012, 8)
        lib.bm_cyl(side, (W2 - .12, y + .7, z0 - .03), (W2 - .12, y + .7, z1 + .03), .012, 8)
    so = lib.from_bm('Side_Window_Bars', side, c, M['iron'], smooth=True); lib.uv_box(so)
    sl = bmesh.new()
    panel_leaf(sl, (y1 - y0) / 2, z1 - z0 - .02, m=T(-W2 + .35, y0, z0 + .01) @ RZ(90))
    panel_leaf(sl, (y1 - y0) / 2, z1 - z0 - .02, m=T(-W2 + .35, y0 + (y1 - y0) / 2, z0 + .01) @ RZ(90))
    slo = lib.from_bm('Side_Window_Shutters', sl, c, M['shutter']); lib.uv_box(slo); lib.bevel(slo, .004, 2)
    return f, l, br

# ------------------------------------------------------------------ wall lanterns
def lantern(c, M, name, x, z):
    iron = bmesh.new(); glass = bmesh.new(); bulb = bmesh.new()
    # wall bracket: back plate, arm, diagonal brace, scroll
    lib.bm_box(iron, x - .05, x + .05, -0.012, 0.0, z - .16, z + .06)
    lib.bm_box(iron, x - .012, x + .012, -.46, 0.0, z + .02, z + .045)
    lib.bm_cyl(iron, (x, -0.005, z - .14), (x, -.30, z + .025), .009, 6)
    lib.bm_torus(iron, (x, -.17, z - .02), .045, .006, (1, 0, 0), 14, 5)
    # chain
    hx, hy = x, -.42
    for k in range(3):
        lib.bm_torus(iron, (hx, hy, z + .0 - .035 * k - .02), .016, .004, (1, 0, 0) if k % 2 else (0, 1, 0), 10, 4)
    zt = z - .15      # top of lantern
    # cap, body posts, base
    lib.bm_lathe(iron, (hx, hy, zt - .02), [(.11, 0), (.12, .01), (.05, .09), (.02, .11), (.03, .13), (0, .15)], 6)
    for i in range(6):
        a = 2 * math.pi * i / 6
        px, py = hx + .095 * math.cos(a), hy + .095 * math.sin(a)
        lib.bm_cyl(iron, (px, py, zt - .30), (px, py, zt - .01), .006, 6)
    lib.bm_lathe(iron, (hx, hy, zt - .34), [(0, -.05), (.02, -.03), (.06, 0), (.10, .02), (.10, .04), (0, .04)], 6)
    lib.bm_lathe(glass, (hx, hy, zt - .30), [(.088, 0), (.088, .29)], 6, cap_top=True, cap_bottom=True)
    lib.bm_lathe(bulb, (hx, hy, zt - .27), [(0, 0), (.022, .01), (.028, .05), (.012, .09), (0, .1)], 10)
    io = lib.from_bm(name + '_Iron', iron, c, M['iron'], smooth=True); lib.uv_box(io)
    go = lib.from_bm(name + '_Glass', glass, c, M['glass']); lib.uv_box(go); go.visible_shadow = False
    bo = lib.from_bm(name + '_Bulb', bulb, c, M['bulb'], smooth=True); bo.visible_shadow = False
    L = bpy.data.lights.new(name + '_Light', 'POINT'); L.energy = 35; L.color = (1, .7, .4); L.shadow_soft_size = .03
    lo = bpy.data.objects.new(name + '_Light', L); lo.location = (hx, hy, zt - .21); c.objects.link(lo)
    return lo

# ------------------------------------------------------------------ ground: pavers with a medallion
def build(M):
    root = lib.coll('HERO_Building')
    lib.clear_collection(root)
    st = lib.coll('Structure', root); dr = lib.coll('Doors', root); wn = lib.coll('Windows', root)
    rf = lib.coll('Roof', root); dt = lib.coll('Details', root); sh = lib.coll('Shop', root)
    gr = lib.coll('Ground', root); lt = lib.coll('Lights', root)
    for cc in (st, dr, wn, rf, dt, sh, gr, lt): lib.clear_collection(cc)
    info = {}
    details.POLE_ENDS.clear()
    import sys; H = sys.modules[__name__]
    shell, info['shell_faces'] = build_shell(st, M)
    plaster_trims(st, M); platforms(st, M); lintels(st, M)
    roof_and_floor(rf, M); spouts(rf, M); roof_room(rf, M)
    *_, info['studs'] = gate(dr, M)
    shops(dr, M); details.spice_shop(sh, M, H); shop_canopy(sh, M)
    windows(wn, M)
    lantern(dt, M, 'LanternL', -1.95, 2.95); lantern(dt, M, 'LanternR', 1.95, 2.95)
    details.cable_run(dt, M); details.street_props(dt, M); details.decals(dt, M, H)
    info['pavers'] = details.street(gr, M, H)
    return info
