# DAMA WORLD — souq v4 — game-ready export of the street test for the browser game (three.js r128).
# For each group (hero, its props, Building B, Building C, the two end blocks, pergola + furniture):
#   1. evaluate every object WITHOUT the render-only density modifiers (subdivision, displacement),
#      bevels reduced to one segment, booleans kept -> a light but faithful mesh
#   2. join into one mesh, split off glass and light bulbs (kept as tiny separate materials)
#   3. new non-overlapping UV 'BakeUV' and bake the procedural look (colour incl. AO/edge grime,
#      roughness, tangent normal incl. all bump detail) into one atlas per group
#   4. LOD1 = the same mesh decimated, same atlas
#   5. export one GLB per group (LOD0 + LOD1 + glass + emissive), JPEG textures
# The ground is baked top-down onto one flat plane (selected-to-active) so ~1,000 stones cost 2 triangles.
# Collision, raised floors and ceilings are measured from the real geometry and written to JSON.
import bpy, bmesh, os, json, math, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import lib

OUT = r'C:\Users\LENOVO\Documents\DAMA_WORLD\souq_v4\game'
GROUPS = [
    ('hero',      ['Structure', 'Doors', 'Windows', 'Roof'], (4096, 2048, 1024)),
    ('heroprops', ['Shop', 'Details'],                       (2048, 1024, 512)),
    ('bldB',      ['Street_BuildingB'],                      (2048, 2048, 1024)),
    ('bldC',      ['Street_BuildingC'],                      (4096, 2048, 1024)),
    ('endE',      ['Street_EndEast'],                        (2048, 1024, 512)),
    ('endW',      ['Street_EndWest'],                        (2048, 1024, 512)),
    ('street',    ['Street_Pergola', 'Street_Furniture'],    (2048, 1024, 512)),
]
GLASS = {'M_LanternGlass', 'M_ShopGlass', 'M_GlassJar'}
EMIT = {'M_BulbWarm'}
SKIP_MATS = {'M_DripDecal', 'M_RustDecal'}
STATUS = {'log': []}

def log(msg):
    STATUS['log'].append(msg)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'export_log.txt'), 'a', encoding='utf-8') as f: f.write(msg + '\n')

def _ctx():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    return dict(window=win, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'), screen=win.screen)

def collect(colls):
    seen, out = set(), []
    for cn in colls:
        c = bpy.data.collections.get(cn)
        if not c: continue
        for o in c.all_objects:
            if o.name in seen or o.hide_render or o.type not in ('MESH', 'CURVE', 'FONT'): continue
            mats = {s.material.name for s in o.material_slots if s.material}
            if mats and mats <= SKIP_MATS: continue
            seen.add(o.name); out.append(o)
    return out

def light_mesh(o):
    """Evaluated copy of o without subdivision/displacement and with 1-segment bevels (restored after)."""
    saved = []
    for md in getattr(o, 'modifiers', []):
        if md.type in ('SUBSURF', 'DISPLACE'):
            keep = md.type == 'SUBSURF' and ('Sack' in o.name)
            if keep:
                saved.append((md, 'levels', md.levels)); md.levels = 1
                saved.append((md, 'render_levels', md.render_levels)); md.render_levels = 1
            else:
                saved.append((md, 'show_viewport', md.show_viewport)); md.show_viewport = False
                saved.append((md, 'show_render', md.show_render)); md.show_render = False
        elif md.type == 'BEVEL' and md.segments > 1:
            saved.append((md, 'segments', md.segments)); md.segments = 1
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    for md, attr, v in saved: setattr(md, attr, v)
    me.transform(o.matrix_world)
    return me

RAND_ATTR = 'objrand'

def object_randoms(objs):
    """Cycles' Object Info > Random for each object, measured (not guessed): every object gets a stand-in
    plane carrying its exact name; one selected-to-active bake reads all of them into one image row.
    Needed because joining the parts for the game gives them one new random value, and the plaster
    materials use it to decide how much mud shows through (narrow 0.700-0.715 threshold)."""
    names = [o.name for o in objs]
    if not names: return {}
    sc = bpy.context.scene; vl = bpy.context.view_layer; n = len(names)
    mat = bpy.data.materials.new('__rand_probe__'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    oi = nt.nodes.new('ShaderNodeObjectInfo'); cc = nt.nodes.new('ShaderNodeCombineColor')
    df = nt.nodes.new('ShaderNodeBsdfDiffuse'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    for k in ('Red', 'Green', 'Blue'): nt.links.new(oi.outputs['Random'], cc.inputs[k])
    nt.links.new(cc.outputs[0], df.inputs['Color']); nt.links.new(df.outputs[0], out.inputs[0])
    tm = bpy.data.materials.new('__rand_target__'); tm.use_nodes = True
    im = bpy.data.images.new('__rand_img__', n, 4, float_buffer=True); im.colorspace_settings.name = 'Non-Color'
    tn = tm.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = im; tm.node_tree.nodes.active = tn
    Z = -80.0; renamed = []; made = []
    try:
        for i, nm in enumerate(names):
            ob = bpy.data.objects.get(nm)
            if ob: ob.name = nm + '__randtmp'; renamed.append((ob, nm))
            me = bpy.data.meshes.new('__rp_%d' % i)
            me.from_pydata([(i + .05, .05, Z + .05), (i + .95, .05, Z + .05), (i + .95, .95, Z + .05), (i + .05, .95, Z + .05)], [], [(0, 1, 2, 3)])
            me.materials.append(mat); p_ = bpy.data.objects.new(nm, me); sc.collection.objects.link(p_); made.append(p_)
            assert p_.name == nm, 'name clash for ' + nm
        verts, faces, uvs = [], [], []
        for i in range(n):
            b = len(verts); verts += [(i, 0, Z), (i + 1, 0, Z), (i + 1, 1, Z), (i, 1, Z)]; faces.append((b, b + 1, b + 2, b + 3))
            uvs += [(i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, 1), (i / n, 1)]
        tme = bpy.data.meshes.new('__rand_target__'); tme.from_pydata(verts, [], faces)
        uvl = tme.uv_layers.new(name='UVMap')
        for li, l in enumerate(tme.loops): uvl.data[li].uv = uvs[l.vertex_index]
        tme.materials.append(tm); tgt = bpy.data.objects.new('__rand_target__', tme); sc.collection.objects.link(tgt); made.append(tgt)
        s0 = sc.cycles.samples; sc.cycles.samples = 1
        try:
            with bpy.context.temp_override(**_ctx()):
                for x in vl.objects: x.select_set(False)
                for p_ in made: p_.select_set(True)
                vl.objects.active = tgt
                bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=0, use_selected_to_active=True,
                                    cage_extrusion=.1, max_ray_distance=.2)
        finally:
            sc.cycles.samples = s0
        px = list(im.pixels)
        res = {nm: round(px[(2 * n + i) * 4], 5) for i, nm in enumerate(names)}
    finally:
        for p_ in made:
            m_ = p_.data; bpy.data.objects.remove(p_, do_unlink=True); bpy.data.meshes.remove(m_)
        for ob, nm in renamed: ob.name = nm
        for x in (mat, tm): bpy.data.materials.remove(x)
        bpy.data.images.remove(im)
    return res

def _uses_random(m):
    return bool(m and m.node_tree and any(nd.type == 'OBJECT_INFO' and nd.outputs['Random'].is_linked for nd in m.node_tree.nodes))

def build_joined(name, objs):
    """One mesh (world space) with all source materials; returns {'opaque','glass','emit'} objects."""
    temps = []
    gx = lib.coll('GAME_Export')
    rnd = object_randoms([o for o in objs if any(_uses_random(sl.material) for sl in o.material_slots)])
    log('%s: object random measured for %d objects' % (name, len(rnd)))
    for o in objs:
        me = light_mesh(o)
        if not me.polygons: bpy.data.meshes.remove(me); continue
        at = me.attributes.new(RAND_ATTR, 'FLOAT', 'FACE')
        at.data.foreach_set('value', [rnd.get(o.name, .5)] * len(me.polygons))
        if len(me.uv_layers) and 'UVMap' not in me.uv_layers: me.uv_layers[0].name = 'UVMap'
        if not len(me.uv_layers): me.uv_layers.new(name='UVMap')
        t = bpy.data.objects.new('__tmp_' + o.name, me); gx.objects.link(t); temps.append(t)
    vl = bpy.context.view_layer
    with bpy.context.temp_override(**_ctx()):
        for x in vl.objects: x.select_set(False)
        for t in temps: t.select_set(True)
        vl.objects.active = temps[0]
        bpy.ops.object.join()
    joined = vl.objects.active
    slots = [s.material for s in joined.material_slots]
    parts = {}
    for kind in ('opaque', 'glass', 'emit'):
        sel = set()
        for i, m in enumerate(slots):
            nm = m.name if m else ''
            k = 'glass' if nm in GLASS else 'emit' if nm in EMIT else 'skip' if nm in SKIP_MATS else 'opaque'
            if k == kind: sel.add(i)
        if not sel: continue
        me = joined.data.copy(); me.name = name + '_' + kind
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in sel], context='FACES')
        n = len(bm.faces); bm.to_mesh(me); bm.free()
        if not n: bpy.data.meshes.remove(me); continue
        o = bpy.data.objects.new(name + '_' + kind, me); gx.objects.link(o)
        parts[kind] = o
    jm = joined.data; bpy.data.objects.remove(joined, do_unlink=True); bpy.data.meshes.remove(jm)
    return parts

def unwrap(o, margin=.003):
    me = o.data
    uv = me.uv_layers.get('BakeUV') or me.uv_layers.new(name='BakeUV')
    me.uv_layers.active = uv
    vl = bpy.context.view_layer
    with bpy.context.temp_override(**_ctx()):
        for x in vl.objects: x.select_set(False)
        vl.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    if 'UVMap' in me.uv_layers: me.uv_layers.active = me.uv_layers['UVMap']

def _img(name, w, h, noncolor):
    im = bpy.data.images.get(name)
    if im: bpy.data.images.remove(im)
    im = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    return im

# The game's Kuwait day sun (normalised W.sunDir, game axes x, y-up, z): baked as a shadow mask so phones,
# where the game's low quality turns shadow maps off, still get the building and pergola shadows.
GAME_SUN = (-0.6649, 0.4388, 0.6044)
AO_DISTANCE = 4.0     # metres: corners, arcades, shop interiors and the street under the pergola see less sky

def _bake_ao_into_orm(o, rough, hide=None, mats_t=()):
    """Sky visibility (ambient occlusion) baked at the roughness size and packed glTF-style into one ORM
    image: R = occlusion, G = roughness, B = metal (0). Costs no extra texture in the game.
    The scene stays visible (neighbouring buildings and the pergola occlude); objects in `hide`
    (sources of a selected-to-active bake, which sit on top of the target) are hidden for this pass."""
    import numpy as np
    sc = bpy.context.scene; vl = bpy.context.view_layer
    w, h = rough.size
    ao = _img('GX_%s_ao' % o.name, w, h, True)
    nodes = []
    for m in mats_t:
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = ao; n.name = '__bake__'
        m.node_tree.nodes.active = n; nodes.append((m, n))
    ls = sc.world.light_settings; d0 = ls.distance; ls.distance = AO_DISTANCE
    hidden = [x for x in (hide or []) if not x.hide_render]
    for x in hidden: x.hide_render = True
    try:
        with bpy.context.temp_override(**_ctx()):
            for x in vl.objects: x.select_set(False)
            o.select_set(True); vl.objects.active = o
            bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
    finally:
        ls.distance = d0
        for x in hidden: x.hide_render = False
        for m, n in nodes: m.node_tree.nodes.remove(n)
    sm = _bake_sun_mask(o, w, h, hide, mats_t)
    a = np.empty(w * h * 4, dtype=np.float32); ao.pixels.foreach_get(a)
    r = np.empty(w * h * 4, dtype=np.float32); rough.pixels.foreach_get(r)
    m = np.empty(w * h * 4, dtype=np.float32); sm.pixels.foreach_get(m)
    a = a.reshape(-1, 4); r = r.reshape(-1, 4); m = m.reshape(-1, 4)
    orm = np.stack([a[:, 0], r[:, 1], m[:, 0], np.ones(len(a), np.float32)], 1).ravel()
    log('%s: sun mask mean %.2f' % (o.name, float(m[:, 0].mean())))
    out = _img('GX_%s_orm' % o.name, w, h, True); out.pixels.foreach_set(orm)
    for im in (ao, out):
        im.filepath_raw = os.path.join(OUT, 'bake', im.name + '.png'); im.file_format = 'PNG'; im.save()
    log('%s: AO mean %.2f' % (o.name, float(a[:, 0].mean())))
    return out

def _bake_sun_mask(o, w, h, hide=None, mats_t=()):
    """1 where the game's day sun reaches the surface, 0 in shadow (Cycles SHADOW bake, only a temporary
    sun lamp in the game's direction, other lights and the world light off for the pass)."""
    sc = bpy.context.scene; vl = bpy.context.view_layer
    sm = _img('GX_%s_sun' % o.name, w, h, True)
    nodes = []
    for mt in mats_t:
        n = mt.node_tree.nodes.new('ShaderNodeTexImage'); n.image = sm; n.name = '__bake__'
        mt.node_tree.nodes.active = n; nodes.append((mt, n))
    gx_, gy_, gz_ = GAME_SUN
    to_sun = Vector((gx_, -gz_, gy_)).normalized()          # game (x, y, z) -> Blender (x, -z, y)
    ld = bpy.data.lights.new('__game_sun__', 'SUN'); ld.energy = 3.0; ld.angle = math.radians(1.0)
    lo = bpy.data.objects.new('__game_sun__', ld); sc.collection.objects.link(lo)
    lo.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()
    lights = [x for x in sc.objects if x.type == 'LIGHT' and x is not lo and not x.hide_render]
    hidden = lights + [x for x in (hide or []) if not x.hide_render]
    for x in hidden: x.hide_render = True
    w0 = sc.world; dark = bpy.data.worlds.new('__dark__'); sc.world = dark
    try:
        with bpy.context.temp_override(**_ctx()):
            for x in vl.objects: x.select_set(False)
            o.select_set(True); vl.objects.active = o
            bpy.ops.object.bake(type='SHADOW', margin=6, use_clear=True)
    finally:
        sc.world = w0; bpy.data.worlds.remove(dark)
        for x in hidden: x.hide_render = False
        bpy.data.objects.remove(lo); bpy.data.lights.remove(ld)
        for mt, n in nodes: mt.node_tree.nodes.remove(n)
    sm.filepath_raw = os.path.join(OUT, 'bake', sm.name + '.png'); sm.file_format = 'PNG'; sm.save()
    return sm

def _gltf_output_group():
    """The node group the glTF exporter reads extra outputs from (here: Occlusion)."""
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is None:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g

def bake_maps(o, sizes, samples=24, selected=None, extrusion=.15):
    """Bake colour / roughness / normal for o (or from `selected` onto o). sizes = (col, nrm, rough) or
    ((w,h), (w,h), (w,h)). Returns the three images (already saved as PNG next to the GLBs)."""
    sc = bpy.context.scene; vl = bpy.context.view_layer
    me = o.data; me.uv_layers.active = me.uv_layers['BakeUV']
    old = sc.cycles.samples; sc.cycles.samples = samples
    srcs = selected or [o]
    mats = []
    for s in srcs:
        for sl in s.material_slots:
            if sl.material and sl.material not in mats: mats.append(sl.material)
    if selected:   # the target needs a material that holds the image node
        tm = bpy.data.materials.get('__bake_target__') or bpy.data.materials.new('__bake_target__')
        try: tm.use_nodes = True
        except Exception: pass
        o.data.materials.clear(); o.data.materials.append(tm)
        mats_t = [tm]
    else:
        mats_t = mats
    res = []
    swapped = []      # Object Info > Random -> the per-part measured value, only while baking
    if not selected:
        for m in mats_t:
            if not _uses_random(m): continue
            nt = m.node_tree; an = nt.nodes.new('ShaderNodeAttribute'); an.attribute_type = 'GEOMETRY'; an.attribute_name = RAND_ATTR; an.name = '__objrand__'
            for nd in [x for x in nt.nodes if x.type == 'OBJECT_INFO']:
                for l in list(nd.outputs['Random'].links):
                    to = l.to_socket; nt.links.remove(l); nt.links.new(an.outputs['Fac'], to); swapped.append((m, nd, to))
    try:
        for (btype, tag, nc), sz in zip((('DIFFUSE', 'col', False), ('NORMAL', 'nrm', True), ('ROUGHNESS', 'rough', True)), sizes):
            w, h = sz if isinstance(sz, tuple) else (sz, sz)
            im = _img('GX_%s_%s' % (o.name, tag), w, h, nc)
            nodes = []
            for m in mats_t:
                n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = im; n.name = '__bake__'
                m.node_tree.nodes.active = n; nodes.append((m, n))
            with bpy.context.temp_override(**_ctx()):
                for x in vl.objects: x.select_set(False)
                for s in srcs: s.select_set(True)
                o.select_set(True); vl.objects.active = o
                kw = dict(type=btype, margin=6, use_clear=True)
                if btype == 'DIFFUSE': kw['pass_filter'] = {'COLOR'}
                if btype == 'NORMAL': kw['normal_space'] = 'TANGENT'
                if selected: kw.update(use_selected_to_active=True, cage_extrusion=extrusion, max_ray_distance=extrusion * 2)
                bpy.ops.object.bake(**kw)
                if btype == 'DIFFUSE':      # an occasional first bake comes back all black: check and bake again
                    for attempt in range(2):
                        import numpy as np
                        px = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(px)
                        if float(px.reshape(-1, 4)[:, :3].max()) > .02: break
                        log('black colour bake on %s, retry %d' % (o.name, attempt + 1))
                        bpy.ops.object.bake(**kw)
            for m, n in nodes: m.node_tree.nodes.remove(n)
            im.filepath_raw = os.path.join(OUT, 'bake', im.name + '.png'); im.file_format = 'PNG'
            os.makedirs(os.path.join(OUT, 'bake'), exist_ok=True); im.save()
            res.append(im)
        res[2] = _bake_ao_into_orm(o, res[2], srcs if selected else None, mats_t)
    finally:
        sc.cycles.samples = old
        for m, nd, to in swapped:
            nt = m.node_tree
            for l in list(to.links): nt.links.remove(l)
            nt.links.new(nd.outputs['Random'], to)
        for m in {m for m, _, _ in swapped}:
            an = m.node_tree.nodes.get('__objrand__')
            if an: m.node_tree.nodes.remove(an)
    return res

def game_material(name, col, nrm, rough, metal=0.0):
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    t = m.node_tree; t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputMaterial'); p = t.nodes.new('ShaderNodeBsdfPrincipled')
    def tex(im):
        n = t.nodes.new('ShaderNodeTexImage'); n.image = im; return n
    t.links.new(tex(col).outputs[0], p.inputs['Base Color'])
    # glTF wants roughness in G of a metallicRoughness map: route through Separate Color for the exporter
    rt = tex(rough); sep = t.nodes.new('ShaderNodeSeparateColor'); t.links.new(rt.outputs[0], sep.inputs[0])
    t.links.new(sep.outputs[1], p.inputs['Roughness'])
    gg = t.nodes.new('ShaderNodeGroup'); gg.node_tree = _gltf_output_group()      # R of the same ORM image = occlusion
    t.links.new(sep.outputs[0], gg.inputs['Occlusion'])
    # B carries the baked sun mask; wiring it to Metallic is what makes the exporter keep it. The game loader
    # forces metalness to 0, so in the game it is only read as the mask.
    t.links.new(sep.outputs[2], p.inputs['Metallic'])
    nm = t.nodes.new('ShaderNodeNormalMap'); t.links.new(tex(nrm).outputs[0], nm.inputs['Color']); t.links.new(nm.outputs[0], p.inputs['Normal'])
    t.links.new(p.outputs[0], out.inputs['Surface'])
    return m

def simple_material(name, kind):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    t = m.node_tree; t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputMaterial'); p = t.nodes.new('ShaderNodeBsdfPrincipled')
    if kind == 'glass':
        p.inputs['Base Color'].default_value = (.78, .84, .8, 1); p.inputs['Roughness'].default_value = .06
        p.inputs['Alpha'].default_value = .28
        try: m.blend_method = 'BLEND'
        except Exception: pass
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    else:
        p.inputs['Base Color'].default_value = (1, .78, .45, 1)
        p.inputs['Emission Color'].default_value = (1, .7, .38, 1); p.inputs['Emission Strength'].default_value = 4.0
    t.links.new(p.outputs[0], out.inputs['Surface'])
    return m

def finalize_for_export(o, mat):
    me = o.data
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons: p.material_index = 0
    for name in [u.name for u in me.uv_layers if u.name != 'BakeUV']: me.uv_layers.remove(me.uv_layers[name])
    if 'BakeUV' in me.uv_layers: me.uv_layers['BakeUV'].name = 'UVMap'
    for a in [a.name for a in me.color_attributes]: me.color_attributes.remove(me.color_attributes[a])

def lod1(o, ratio=.35):
    me = o.data.copy(); l = bpy.data.objects.new(o.name.replace('_LOD0', '') + '_LOD1', me)
    lib.coll('GAME_Export').objects.link(l)
    d = l.modifiers.new('Dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    nm = bpy.data.meshes.new_from_object(l.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    l.modifiers.clear(); old = l.data; l.data = nm; bpy.data.meshes.remove(old)
    return l

def export_glb(path, objs, draco=False):
    vl = bpy.context.view_layer
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=path, use_selection=True, export_format='GLB', export_yup=True, export_apply=False,
              export_texcoords=True, export_normals=True, export_image_format='JPEG', export_image_quality=86,
              export_materials='EXPORT', export_vertex_color='NONE', export_cameras=False, export_lights=False,
              export_animations=False, export_skins=False, export_morph=False, export_extras=False)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                  export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    kw = {k: v for k, v in kw.items() if k in props or k == 'filepath'}
    with bpy.context.temp_override(**_ctx()):
        for x in vl.objects: x.select_set(False)
        for o in objs: o.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)

def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def export_group(key, colls, sizes, samples=24):
    t0 = time.time()
    objs = collect(colls)
    parts = build_joined('GX_' + key, objs)
    op = parts.get('opaque')
    op.name = 'GX_%s_LOD0' % key; op.data.name = op.name
    unwrap(op)
    # the originals sit exactly where the bake mesh is, but displaced by a few mm: the plaster's AO dirt mask
    # would see them and bake dark blotches. Hide them (and older game copies) from render while baking.
    hidden = [o for o in objs if not o.hide_render] + [o for o in lib.coll('GAME_Export').objects
                                                       if o not in parts.values() and not o.hide_render]
    for o in hidden: o.hide_render = True
    try:
        col, nrm, rough = bake_maps(op, sizes, samples)
    finally:
        for o in hidden: o.hide_render = False
    gm = game_material('GM_' + key, col, nrm, rough)
    finalize_for_export(op, gm)
    l1 = lod1(op)
    out = [op, l1]
    if 'glass' in parts:
        g = parts['glass']; g.name = 'GX_%s_GLASS' % key
        g.data.materials.clear(); g.data.materials.append(simple_material('GM_glass', 'glass'))
        for p in g.data.polygons: p.material_index = 0
        out.append(g)
    if 'emit' in parts:
        e = parts['emit']; e.name = 'GX_%s_EMIT' % key
        e.data.materials.clear(); e.data.materials.append(simple_material('GM_emit', 'emit'))
        for p in e.data.polygons: p.material_index = 0
        out.append(e)
    for o in out:
        for name in [u.name for u in o.data.uv_layers if u.name != 'UVMap']: o.data.uv_layers.remove(o.data.uv_layers[name])
        for a in [a.name for a in o.data.color_attributes]: o.data.color_attributes.remove(o.data.color_attributes[a])
        if RAND_ATTR in o.data.attributes: o.data.attributes.remove(o.data.attributes[RAND_ATTR])
    path = os.path.join(OUT, 'souq_%s.glb' % key)
    size = export_glb(path, out)
    info = dict(key=key, objects=len(objs), lod0_tris=tri_count(op), lod1_tris=tri_count(l1),
                glass_tris=tri_count(out[2]) if len(out) > 2 and 'GLASS' in out[2].name else 0, bytes=size, seconds=round(time.time() - t0))
    log(json.dumps(info))
    return info

def export_ground(key='ground', x0=-5.75, x1=15.05, y0=-7.0, y1=0.0, sizes=((4096, 1024), (2048, 512), (1024, 256)), samples=16):
    """Alley paving baked top-down onto one quad."""
    t0 = time.time()
    src = [o for o in collect(['Street_Ground']) if o.type == 'MESH' and o.name not in ('Street2_Sand', 'Street2_Bed')]
    for o in src:     # the drains sit below; include them; bed/sand excluded
        pass
    me = bpy.data.meshes.new('GX_ground_LOD0')
    me.from_pydata([(x0, y0, .004), (x1, y0, .004), (x1, y1, .004), (x0, y1, .004)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='BakeUV')
    for l, (u, v) in zip(me.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))): uv.data[l].uv = (u, v)
    me.uv_layers.new(name='UVMap')
    g = bpy.data.objects.new('GX_ground_LOD0', me); lib.coll('GAME_Export').objects.link(g)
    col, nrm, rough = bake_maps(g, sizes, samples, selected=src, extrusion=.12)
    gm = game_material('GM_ground', col, nrm, rough)
    finalize_for_export(g, gm)
    path = os.path.join(OUT, 'souq_%s.glb' % key)
    size = export_glb(path, [g])
    info = dict(key=key, lod0_tris=2, bytes=size, seconds=round(time.time() - t0)); log(json.dumps(info))
    return info

# ------------------------------------------------------------------ collision / raised floors / ceilings
SHELLS = ('Shell_Walls', 'B_Shell', 'C1_Shell', 'C2_Shell', 'EndE_Shell', 'EndW_Shell')
NONSOLID = ('Glass', 'Sign', 'Lantern', 'Chilli', 'Spice', 'Loomi', 'JarFill', 'Decal', 'Bulb', 'Fronds', 'Cable', 'Handles',
            'DatesHeap', 'Shop_Lamp', 'Clips', 'Text', 'Rain', 'Spout', 'Poles', 'Mat', 'Mud', 'Lintel', 'Archivolt',
            'Coping', 'Trims', 'Studs', 'Brass', 'Hardware', 'Props_Cup', 'Props_Tray', 'Props_Dallah', 'Window_', 'W1_', 'W2_', '_W4', '_W16', 'Curtain',
            'Roshan', 'PaperCones', 'JarLids', 'Baskets', 'Floor', 'Medallion', 'Street2', 'Cutter', 'Bolt', 'Rug', 'Planter_Soil', 'Canopy')

def _parity_inside(bvh, p, d=Vector((1, 0, 0)), maxn=40):
    n = 0; q = p.copy()
    for _ in range(maxn):
        hit = bvh.ray_cast(q, d)
        if hit[0] is None: break
        n += 1; q = hit[0] + d * 1e-4
    return n % 2 == 1

def collision(region=(-12.0, 21.5, -14.0, 7.5), cell=.1, oz=150.0):
    t0 = time.time()
    groups = [g for _, g, _ in GROUPS] + [['Street_Ground']]
    names = set()
    objs = []
    for colls in groups:
        for o in collect(colls):
            if o.type == 'MESH' and o.name not in names: names.add(o.name); objs.append(o)
    # shells: parity test on a grid
    shell_meshes = []
    for o in objs:
        if o.name in SHELLS:
            me = light_mesh(o); bm = bmesh.new(); bm.from_mesh(me); shell_meshes.append(BVHTree.FromBMesh(bm)); bm.free(); bpy.data.meshes.remove(me)
    x0, x1, y0, y1 = region
    nx, ny = int((x1 - x0) / cell), int((y1 - y0) / cell)
    solid = [[False] * nx for _ in range(ny)]
    for j in range(ny):
        for i in range(nx):
            # off-grid sample point and two ray directions that must agree: a sample lying exactly on a
            # wall face (wall thickness 0.55 m = grid multiple) otherwise reads as a fake thin wall
            p = Vector((x0 + (i + .5) * cell + .0137, y0 + (j + .5) * cell + .0171, 1.0))
            if any(_parity_inside(b, p) and _parity_inside(b, p, Vector((0, 1, 0))) for b in shell_meshes): solid[j][i] = True
    rects = []
    used = [[False] * nx for _ in range(ny)]
    for j in range(ny):
        i = 0
        while i < nx:
            if solid[j][i] and not used[j][i]:
                i2 = i
                while i2 + 1 < nx and solid[j][i2 + 1] and not used[j][i2 + 1]: i2 += 1
                j2 = j
                while j2 + 1 < ny and all(solid[j2 + 1][k] and not used[j2 + 1][k] for k in range(i, i2 + 1)): j2 += 1
                for jj in range(j, j2 + 1):
                    for k in range(i, i2 + 1): used[jj][k] = True
                rects.append((x0 + i * cell, x0 + (i2 + 1) * cell, y0 + j * cell, y0 + (j2 + 1) * cell))
                i = i2 + 1
            else: i += 1
    boxes = [(a, b, c, d, 6.0) for a, b, c, d in rects]
    # every other solid: axis-aligned box per connected part, if it occupies the body band 0.4-1.8 m
    raised = []
    for o in objs:
        if o.name in SHELLS: continue
        me = light_mesh(o); bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        bm.verts.ensure_lookup_table(); seen = set()
        for v0 in bm.verts:
            if v0.index in seen: continue
            stack = [v0]; part = []; seen.add(v0.index)
            while stack:
                v = stack.pop(); part.append(v.co.copy())
                for e in v.link_edges:
                    w = e.other_vert(v)
                    if w.index not in seen: seen.add(w.index); stack.append(w)
            xs = [p.x for p in part]; ys = [p.y for p in part]; zs = [p.z for p in part]
            bx0, bx1, by0, by1, bz0, bz1 = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
            area = (bx1 - bx0) * (by1 - by0)
            if bz0 < .35 and .08 < bz1 < .5 and area > .3 and not any(k in o.name for k in ('Stool', 'Pergola', 'PostBase', 'Bench')):
                raised.append((bx0, bx1, by0, by1, round(bz1, 3))); continue
            if any(k in o.name for k in NONSOLID): continue
            if bz1 < .3 or bz0 > 1.8: continue
            if (bx1 - bx0) < .015 and (by1 - by0) < .015: continue
            boxes.append((bx0 - .02, bx1 + .02, by0 - .02, by1 + .02, round(bz1, 2)))
        bm.free()
    # ceilings: first surface above head height
    allbm = bmesh.new()
    for o in objs:
        if any(k in o.name for k in ('Decal', 'Glass', 'Lantern', 'Bulb', 'Sign', 'Chilli', 'Cable')): continue
        me = light_mesh(o); allbm.from_mesh(me); bpy.data.meshes.remove(me)
    allbvh = BVHTree.FromBMesh(allbm); allbm.free()
    c2 = .25; cnx, cny = int((x1 - x0) / c2), int((y1 - y0) / c2)
    ceil = {}
    for j in range(cny):
        for i in range(cnx):
            p = Vector((x0 + (i + .5) * c2, y0 + (j + .5) * c2, 2.2))
            hit = allbvh.ray_cast(p, Vector((0, 0, 1)), 8.0)
            if hit[0] is not None: ceil[(i, j)] = round(hit[0].z * 4) / 4
    for _ in range(2):          # close the gaps between pergola battens so the camera ceiling is continuous
        add = {}
        for (i, j), hz in ceil.items():
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                k = (i + di, j + dj)
                if k not in ceil and 0 <= k[0] < cnx and 0 <= k[1] < cny: add[k] = max(add.get(k, 0), hz)
        ceil.update(add)
    crects = []; usedc = set()
    for (i, j), hz in sorted(ceil.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if (i, j) in usedc: continue
        i2 = i
        while ceil.get((i2 + 1, j)) == hz and (i2 + 1, j) not in usedc: i2 += 1
        j2 = j
        while all(ceil.get((k, j2 + 1)) == hz and (k, j2 + 1) not in usedc for k in range(i, i2 + 1)): j2 += 1
        for jj in range(j, j2 + 1):
            for k in range(i, i2 + 1): usedc.add((k, jj))
        crects.append((x0 + i * c2, x0 + (i2 + 1) * c2, y0 + j * c2, y0 + (j2 + 1) * c2, hz))
    # Blender (x, y) -> game (x, z = oz - y)
    def tz(a, b): return (round(oz - b, 3), round(oz - a, 3))
    J = dict(
        version=1, origin=[0, 0, oz], note='Blender x -> x, Blender y -> z = origin.z - y; heights in metres',
        boxes=[[round(a, 3), round(b, 3), *tz(c, d), h] for a, b, c, d, h in boxes],
        raised=[[round(a, 3), round(b, 3), *tz(c, d), h] for a, b, c, d, h in raised],
        ceil=[[round(a, 3), round(b, 3), *tz(c, d), h] for a, b, c, d, h in crects],
        spawn=[-3.0, round(oz + 3.5, 3)], rect=[-12.0, 21.5, round(oz - 7.5, 3), round(oz + 14.0, 3)])
    with open(os.path.join(OUT, 'souq_collision.json'), 'w', encoding='utf-8') as f: json.dump(J, f, separators=(',', ':'))
    log('collision boxes=%d raised=%d ceil=%d %.0fs' % (len(J['boxes']), len(J['raised']), len(J['ceil']), time.time() - t0))
    return J

def run_all_async(keys=None, ground=True, coll=True):
    """One group per timer tick so the MCP connection gets a turn between groups."""
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'export_log.txt'), 'w').write('start\n')
    todo = [g for g in GROUPS if not keys or g[0] in keys]
    steps = [('g', g) for g in todo] + ([('ground', None)] if ground else []) + ([('coll', None)] if coll else [])
    def tick():
        if not steps:
            log('DONE'); return None
        kind, g = steps.pop(0)
        try:
            if kind == 'g': export_group(*g)
            elif kind == 'ground': export_ground()
            else: collision()
        except Exception as e:
            import traceback; log('ERROR %s %r\n%s' % (kind if not g else g[0], e, traceback.format_exc()))
        return 0.5
    bpy.app.timers.register(tick, first_interval=0.5)

def reexport(keys=None, draco=True):
    """Re-export the already-baked GAME_Export objects (no re-bake), e.g. with Draco compression."""
    res = {}
    objs = list(bpy.data.collections['GAME_Export'].objects)
    for key in keys or [g[0] for g in GROUPS] + ['ground']:
        sel = [o for o in objs if o.name.startswith('GX_%s_' % key) and o.type == 'MESH']
        order = sorted(sel, key=lambda o: ('LOD0' not in o.name, o.name))
        if not order: continue
        path = os.path.join(OUT, 'souq_%s.glb' % key)
        res[key] = export_glb(path, order, draco)
    log('reexport ' + json.dumps(res))
    return res
