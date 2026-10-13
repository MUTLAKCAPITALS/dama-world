# DAMA WORLD — souq v4 — bake the approved building's procedural materials to PBR maps.
# The procedural originals are kept untouched; use_baked(True/False) swaps between them per object.
# Maps per object: base colour (with the shader's AO/edge grime), roughness, tangent normal (bump detail).
import bpy, os, math, time
import lib

OUT = r'C:\Users\LENOVO\Documents\DAMA_WORLD\souq_v4\baked'
METAL = {'M_IronBlack': .35, 'M_BrassAged': .9}
STATUS = {}

def _expensive(o):
    for s in o.material_slots:
        m = s.material
        if m and m.node_tree and any(n.type in ('AMBIENT_OCCLUSION', 'BEVEL') for n in m.node_tree.nodes):
            return True
    return False

def targets(root='HERO_Building'):
    out = []
    for o in bpy.data.collections[root].all_objects:
        if o.type == 'MESH' and not o.hide_render and not o.name.startswith('BK_') and _expensive(o):
            out.append(o)
    return out

def size_for(o, density=300, cap=8192):
    area = sum(p.area for p in o.data.polygons) * max(o.scale) ** 2
    px = math.sqrt(max(area, 1e-4)) * density / .7          # ~70% of the atlas is used after packing
    s = 512
    while s < px and s < cap: s *= 2
    return s

def _ctx():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
    return dict(window=win, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'), screen=win.screen)

def prep_uv(objs):
    """Second, non-overlapping UV set 'BakeUV' (the procedural 'UVMap' stays as is)."""
    vl = bpy.context.view_layer
    with bpy.context.temp_override(**_ctx()):
        if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
        for o in objs:
            me = o.data
            uv = me.uv_layers.get('BakeUV') or me.uv_layers.new(name='BakeUV')
            me.uv_layers.active = uv
            for x in vl.objects: x.select_set(False)
            vl.objects.active = o; o.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
            bpy.ops.object.mode_set(mode='OBJECT')
            me.uv_layers.active = me.uv_layers['UVMap']
            uv.active_render = False

def _img(name, size, noncolor):
    im = bpy.data.images.get(name)
    if im and (im.size[0] != size): bpy.data.images.remove(im); im = None
    if not im: im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    return im

PASSES = (('DIFFUSE', 'col', False), ('ROUGHNESS', 'rough', True), ('NORMAL', 'nrm', True))

def bake_object(o, samples=48):
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene; vl = bpy.context.view_layer
    size = size_for(o)
    me = o.data; me.uv_layers.active = me.uv_layers['BakeUV']
    mats = [s.material for s in o.material_slots if s.material]
    res = {}
    old_samples = sc.cycles.samples; sc.cycles.samples = samples
    try:
        for btype, tag, nc in PASSES:
            im = _img('BK_%s_%s' % (o.name, tag), size if tag != 'rough' else max(512, size // 2), nc)
            nodes = []
            for m in mats:
                n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = im; n.name = '__bake__'
                m.node_tree.nodes.active = n; nodes.append((m, n))
            with bpy.context.temp_override(**_ctx()):
                for x in vl.objects: x.select_set(False)
                vl.objects.active = o; o.select_set(True)
                kw = dict(type=btype, margin=8, use_clear=True)
                if btype == 'DIFFUSE': kw['pass_filter'] = {'COLOR'}
                if btype == 'NORMAL': kw.update(normal_space='TANGENT')
                bpy.ops.object.bake(**kw)
            for m, n in nodes: m.node_tree.nodes.remove(n)
            im.filepath_raw = os.path.join(OUT, im.name + '.png'); im.file_format = 'PNG'; im.save()
            res[tag] = im
    finally:
        sc.cycles.samples = old_samples
        me.uv_layers.active = me.uv_layers['UVMap']
    return res, size

def baked_material(o):
    name = 'BK_' + o.name
    m = bpy.data.materials.get(name)
    if m: bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    t = m.node_tree; t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputMaterial'); p = t.nodes.new('ShaderNodeBsdfPrincipled')
    uv = t.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'BakeUV'
    def tex(tag):
        n = t.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images['BK_%s_%s' % (o.name, tag)]
        n.interpolation = 'Linear'; t.links.new(uv.outputs[0], n.inputs[0]); return n
    t.links.new(tex('col').outputs[0], p.inputs['Base Color'])
    t.links.new(tex('rough').outputs[0], p.inputs['Roughness'])
    nm = t.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'BakeUV'
    t.links.new(tex('nrm').outputs[0], nm.inputs['Color']); t.links.new(nm.outputs[0], p.inputs['Normal'])
    orig = [s.material.name for s in o.material_slots if s.material]
    p.inputs['Metallic'].default_value = max([METAL.get(n, 0.0) for n in orig] + [0.0])
    t.links.new(p.outputs[0], out.inputs['Surface'])
    try: m.displacement_method = 'BUMP'
    except Exception: pass
    return m

def use_baked(on=True, root='HERO_Building'):
    n = 0
    for o in bpy.data.collections[root].all_objects:
        if o.type != 'MESH': continue
        if 'orig_mats' not in o.keys():
            if not on: continue
            if not bpy.data.materials.get('BK_' + o.name): continue
            o['orig_mats'] = [s.material.name for s in o.material_slots if s.material]
        orig = list(o['orig_mats'])
        bk = bpy.data.materials.get('BK_' + o.name)
        if not bk: continue
        me = o.data
        if on:
            for i in range(len(me.materials)): me.materials[i] = bk
        else:
            for i, nm in enumerate(orig): me.materials[i] = bpy.data.materials[nm]
        n += 1
    return n

def bake_all_async(objs=None, log='bake_log.txt'):
    """One object per timer tick; progress in renders/bake_log.txt so each MCP call returns quickly."""
    objs = list(objs or targets())
    names = [o.name for o in objs]
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, log)
    open(path, 'w').write('start %d objects\n' % len(names))
    def tick():
        if not names:
            open(path, 'a').write('DONE\n'); return None
        nm = names.pop(0); o = bpy.data.objects.get(nm)
        t = time.time()
        try:
            _, size = bake_object(o)
            baked_material(o)
            open(path, 'a').write('%s %d %.0fs\n' % (nm, size, time.time() - t))
        except Exception as e:
            open(path, 'a').write('%s ERROR %r\n' % (nm, e))
        return 0.1
    bpy.app.timers.register(tick, first_interval=0.2)

# ------------------------------------------------------------------ render presets
def preset(kind):
    s = bpy.context.scene; c = s.cycles
    cp = bpy.context.preferences.addons['cycles'].preferences
    cp.compute_device_type = 'OPTIX'; cp.refresh_devices()
    for d in cp.devices: d.use = d.type == 'OPTIX'
    c.device = 'GPU'
    s.render.use_persistent_data = True
    c.use_denoising = True; c.denoiser = 'OPTIX'; c.use_adaptive_sampling = True
    if kind == 'preview':
        s.render.resolution_percentage = 50; c.samples = 32; c.adaptive_threshold = .05
        c.max_bounces = 6; c.diffuse_bounces = 3; c.glossy_bounces = 2
    else:   # final: same quality settings the approved renders used
        s.render.resolution_percentage = 100; c.samples = 96; c.adaptive_threshold = .02
        c.max_bounces = 8; c.diffuse_bounces = 4; c.glossy_bounces = 3
