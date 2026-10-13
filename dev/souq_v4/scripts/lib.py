# DAMA WORLD — souq v4 — shared bpy helpers (meshes, modifiers, UVs, collections).
# Everything here builds geometry from numbers; nothing is imported from outside.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

R = random.Random(7)          # fixed seed: rebuilding gives the same building

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def clear_collection(c):
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)

def mesh_obj(name, verts, faces, c, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(clean_customdata=False)
    me.update()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    if mat: me.materials.append(mat)
    if smooth: me.shade_smooth()
    return o

def from_bm(name, bm, c, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    if mat:
        if isinstance(mat, (list, tuple)):
            for m in mat: me.materials.append(m)
        else: me.materials.append(mat)
    if smooth: me.shade_smooth()
    return o

# ---------- primitives written straight into a bmesh (so many parts can share one object) ----------
def bm_box(bm, x0, x1, y0, y1, z0, z1, mat_index=0, m=None):
    """Axis-aligned box from bounds; optional matrix m applied after."""
    vs = [bm.verts.new(Vector(p) if m is None else m @ Vector(p)) for p in (
        (x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1))]
    idx = ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7))
    fs = []
    for f in idx:
        face = bm.faces.new([vs[i] for i in f]); face.material_index = mat_index; fs.append(face)
    return vs, fs

def bm_cyl(bm, p0, p1, r, seg=10, mat_index=0, caps=True, r1=None):
    """Cylinder between two points (optionally tapered to r1)."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0); L = ax.length; ax.normalize()
    t = ax.orthogonal().normalized(); b = ax.cross(t)
    r1 = r if r1 is None else r1
    ring0, ring1 = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = t * math.cos(a) + b * math.sin(a)
        ring0.append(bm.verts.new(p0 + d * r)); ring1.append(bm.verts.new(p1 + d * r1))
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i])); f.material_index = mat_index
    if caps:
        f = bm.faces.new(list(reversed(ring0))); f.material_index = mat_index
        f = bm.faces.new(ring1); f.material_index = mat_index
    return ring0, ring1

def bm_dome(bm, c, r, h, n_axis=Vector((0,-1,0)), seg=8, rings=3, mat_index=0):
    """Low dome (rivet / stud head) sitting on a surface with normal n_axis."""
    c = Vector(c); n = Vector(n_axis).normalized(); t = n.orthogonal().normalized(); b = n.cross(t)
    prev = None
    for k in range(rings):
        a = (math.pi / 2) * k / rings
        rr, hh = r * math.cos(a), h * math.sin(a)
        ring = [bm.verts.new(c + n * hh + (t * math.cos(2*math.pi*i/seg) + b * math.sin(2*math.pi*i/seg)) * rr) for i in range(seg)]
        if prev:
            for i in range(seg):
                j = (i + 1) % seg
                f = bm.faces.new((prev[i], prev[j], ring[j], ring[i])); f.material_index = mat_index
        prev = ring
    top = bm.verts.new(c + n * h)
    for i in range(seg):
        f = bm.faces.new((prev[i], prev[(i+1) % seg], top)); f.material_index = mat_index

def bm_torus(bm, c, R_, r, axis=Vector((0,-1,0)), seg=16, sseg=6, mat_index=0):
    c = Vector(c); ax = Vector(axis).normalized(); t = ax.orthogonal().normalized(); b = ax.cross(t)
    rings = []
    for i in range(seg):
        a = 2*math.pi*i/seg
        d = t*math.cos(a) + b*math.sin(a)
        rings.append([bm.verts.new(c + d*(R_ + r*math.cos(2*math.pi*k/sseg)) + ax*(r*math.sin(2*math.pi*k/sseg))) for k in range(sseg)])
    for i in range(seg):
        A, B = rings[i], rings[(i+1) % seg]
        for k in range(sseg):
            l = (k + 1) % sseg
            f = bm.faces.new((A[k], B[k], B[l], A[l])); f.material_index = mat_index

def bm_prism(bm, pts2d, z0, z1, mat_index=0, m=None):
    """Extrude a CCW 2D polygon (x,y) from z0 to z1."""
    tr = (lambda v: m @ Vector(v)) if m else Vector
    lo = [bm.verts.new(tr((x, y, z0))) for x, y in pts2d]
    hi = [bm.verts.new(tr((x, y, z1))) for x, y in pts2d]
    n = len(pts2d)
    f = bm.faces.new(list(reversed(lo))); f.material_index = mat_index
    f = bm.faces.new(hi); f.material_index = mat_index
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((lo[i], lo[j], hi[j], hi[i])); f.material_index = mat_index

def wall_with_openings(bm, x0, x1, z0, z1, y0, y1, holes, mat_index=0, axis='x', m=None):
    """Solid wall slab with rectangular through-openings and clean quad topology.
    The wall spans x0..x1 (or y if axis='y'), z0..z1, thickness y0..y1. holes = [(a,b,za,zb)].
    Built as a grid of cells: front/back faces for solid cells + reveal faces where solid meets void."""
    xs = sorted({x0, x1, *[min(max(h[0], x0), x1) for h in holes], *[min(max(h[1], x0), x1) for h in holes]})
    zs = sorted({z0, z1, *[min(max(h[2], z0), z1) for h in holes], *[min(max(h[3], z0), z1) for h in holes]})
    nx, nz = len(xs) - 1, len(zs) - 1
    def solid(i, j):
        if i < 0 or j < 0 or i >= nx or j >= nz: return False
        cx, cz = (xs[i] + xs[i+1]) / 2, (zs[j] + zs[j+1]) / 2
        return not any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes)
    cache = {}
    def V(u, y, z):
        p = (u, y, z) if axis == 'x' else (y, u, z)
        if m is not None: p = tuple(m @ Vector(p))
        k = tuple(round(c, 5) for c in p)
        if k not in cache: cache[k] = bm.verts.new(k)
        return cache[k]
    faces = []
    def F(vs):
        f = bm.faces.new(vs); f.material_index = mat_index; faces.append(f)
    for i in range(nx):
        for j in range(nz):
            if not solid(i, j): continue
            a, b, c, d = xs[i], xs[i+1], zs[j], zs[j+1]
            F((V(a,y0,c), V(b,y0,c), V(b,y0,d), V(a,y0,d)))            # front
            F((V(a,y1,c), V(a,y1,d), V(b,y1,d), V(b,y1,c)))            # back
            if not solid(i-1, j): F((V(a,y0,c), V(a,y0,d), V(a,y1,d), V(a,y1,c)))
            if not solid(i+1, j): F((V(b,y0,c), V(b,y1,c), V(b,y1,d), V(b,y0,d)))
            if not solid(i, j-1): F((V(a,y0,c), V(a,y1,c), V(b,y1,c), V(b,y0,c)))
            if not solid(i, j+1): F((V(a,y0,d), V(b,y0,d), V(b,y1,d), V(a,y1,d)))
    if axis == 'y':   # mirrored handedness: flip so normals point out
        for f in faces: f.normal_flip()
    return faces

# ---------- modifiers ----------
def bevel(o, w=0.01, seg=2, angle=40, harden=True, clamp=True, name='Bevel'):
    md = o.modifiers.new(name, 'BEVEL')
    md.width = w; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(angle)
    md.harden_normals = harden; md.use_clamp_overlap = clamp; md.miter_outer = 'MITER_ARC'
    o.data.shade_smooth()
    return md

def plaster_mods(o, bevel_w=0.035, subdiv=3, disp=0.012, seed=0):
    """Hand-plastered look: rounded arrises + gentle undulation (real geometry, not a texture)."""
    bevel(o, bevel_w, 3, 35)
    s = o.modifiers.new('Density', 'SUBSURF'); s.subdivision_type = 'SIMPLE'
    s.levels = subdiv; s.render_levels = subdiv
    tex = bpy.data.textures.get('plaster_undulation') or bpy.data.textures.new('plaster_undulation', 'CLOUDS')
    tex.noise_scale = 0.9; tex.noise_depth = 2
    d = o.modifiers.new('Undulation', 'DISPLACE'); d.texture = tex; d.strength = disp; d.mid_level = 0.5
    d.texture_coords = 'GLOBAL'
    tex2 = bpy.data.textures.get('plaster_bow') or bpy.data.textures.new('plaster_bow', 'CLOUDS')
    tex2.noise_scale = 2.6; tex2.noise_depth = 1
    d2 = o.modifiers.new('Bow', 'DISPLACE'); d2.texture = tex2; d2.strength = disp * 1.6; d2.mid_level = 0.5
    d2.texture_coords = 'GLOBAL'
    o.data.shade_smooth()

# ---------- UVs: box projection in metres, U follows the longest side (wood grain) ----------
def uv_box(o, scale=1.0, world=True, arch=False):
    """Box projection in metres.
    arch=False (timber/metal parts): per connected part, U follows that part's longest side, so wood
    grain runs along every plank, batten and pole.  arch=True (walls): V is always world-up on vertical
    faces, so rain streaks and rising damp run the right way on every wall."""
    me = o.data
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    mw = o.matrix_world if world else Matrix()
    island_dims = {}
    if not arch:
        seen = set()
        for f0 in bm.faces:
            if f0.index in seen: continue
            stack, part = [f0], []
            seen.add(f0.index)
            while stack:
                f = stack.pop(); part.append(f)
                for v in f.verts:
                    for g in v.link_faces:
                        if g.index not in seen: seen.add(g.index); stack.append(g)
            vs = {v for f in part for v in f.verts}
            d = [max(v.co[i] for v in vs) - min(v.co[i] for v in vs) for i in range(3)]
            for f in part: island_dims[f.index] = d
    bm.faces.index_update()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        others = [i for i in range(3) if i != ax]
        if arch:
            if ax != 2: others = [others[0], 2]
        else:
            d = island_dims.get(f.index, (1, 1, 1))
            others.sort(key=lambda i: -d[i])
        for l in f.loops:
            p = mw @ l.vert.co if world else l.vert.co
            l[uv].uv = (p[others[0]] * scale, p[others[1]] * scale)
    bm.to_mesh(me); bm.free()

def link_dup(o, name, loc=None, rot=None, c=None):
    d = o.copy(); d.name = name
    (c or o.users_collection[0]).objects.link(d)
    if loc is not None: d.location = loc
    if rot is not None: d.rotation_euler = rot
    return d

def set_rand_attr(bm, verts, value, layer='tile'):
    """Store a per-part random number in a colour attribute (read by materials for per-stone/plank variation)."""
    lay = bm.loops.layers.color.get(layer) or bm.loops.layers.color.new(layer)
    col = (value, R.random(), R.random(), 1.0)
    for v in set(verts):
        for l in v.link_loops:
            l[lay] = col

def bm_lathe(bm, c, prof, seg=16, mat_index=0, cap_top=True, cap_bottom=True):
    """Surface of revolution around the vertical axis through c. prof = [(radius, z), ...] bottom->top."""
    c = Vector(c); rings = []
    for r, z in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new(c + Vector((0, 0, z)))])
        else:
            rings.append([bm.verts.new(c + Vector((r*math.cos(2*math.pi*i/seg), r*math.sin(2*math.pi*i/seg), z))) for i in range(seg)])
    for A, B in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(A) == 1 and len(B) == 1: continue
            if len(A) == 1: f = bm.faces.new((A[0], B[i], B[j]))
            elif len(B) == 1: f = bm.faces.new((A[i], A[j], B[0]))
            else: f = bm.faces.new((A[i], A[j], B[j], B[i]))
            f.material_index = mat_index
    if cap_bottom and len(rings[0]) > 1:
        f = bm.faces.new(list(reversed(rings[0]))); f.material_index = mat_index
    if cap_top and len(rings[-1]) > 1:
        f = bm.faces.new(rings[-1]); f.material_index = mat_index
    return rings

def shell(bm, solids, holes, mat_of=None):
    """Watertight architectural shell from solid boxes minus hole boxes, on one shared 3D grid.
    Only faces between solid and empty cells are emitted, so walls, returns, reveals and
    corners join without seams or internal faces (clean, manifold, all quads).
    solids/holes: [(x0,x1,y0,y1,z0,z1)]. mat_of(center, normal) -> material index."""
    def axis_vals(k):
        s = set()
        for b in solids + holes: s.add(round(b[2*k], 4)); s.add(round(b[2*k+1], 4))
        return sorted(s)
    xs, ys, zs = axis_vals(0), axis_vals(1), axis_vals(2)
    nx, ny, nz = len(xs)-1, len(ys)-1, len(zs)-1
    cx = [(xs[i]+xs[i+1])/2 for i in range(nx)]; cy = [(ys[i]+ys[i+1])/2 for i in range(ny)]; cz = [(zs[i]+zs[i+1])/2 for i in range(nz)]
    inside = lambda b, p: b[0] < p[0] < b[1] and b[2] < p[1] < b[3] and b[4] < p[2] < b[5]
    S = set()
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                p = (cx[i], cy[j], cz[k])
                if any(inside(b, p) for b in solids) and not any(inside(h, p) for h in holes): S.add((i, j, k))
    cache = {}
    def V(i, j, k):
        key = (i, j, k)
        if key not in cache: cache[key] = bm.verts.new((xs[i], ys[j], zs[k]))
        return cache[key]
    n = 0
    for (i, j, k) in S:
        quads = []
        if (i-1, j, k) not in S: quads.append(((V(i,j,k), V(i,j,k+1), V(i,j+1,k+1), V(i,j+1,k)), (-1,0,0)))
        if (i+1, j, k) not in S: quads.append(((V(i+1,j,k), V(i+1,j+1,k), V(i+1,j+1,k+1), V(i+1,j,k+1)), (1,0,0)))
        if (i, j-1, k) not in S: quads.append(((V(i,j,k), V(i+1,j,k), V(i+1,j,k+1), V(i,j,k+1)), (0,-1,0)))
        if (i, j+1, k) not in S: quads.append(((V(i,j+1,k), V(i,j+1,k+1), V(i+1,j+1,k+1), V(i+1,j+1,k)), (0,1,0)))
        if (i, j, k-1) not in S: quads.append(((V(i,j,k), V(i,j+1,k), V(i+1,j+1,k), V(i+1,j,k)), (0,0,-1)))
        if (i, j, k+1) not in S: quads.append(((V(i,j,k+1), V(i+1,j,k+1), V(i+1,j+1,k+1), V(i,j+1,k+1)), (0,0,1)))
        for vs, nrm in quads:
            f = bm.faces.new(vs); n += 1
            if mat_of:
                c = sum((v.co for v in vs), Vector()) / 4
                f.material_index = mat_of(c, nrm)
    return n
