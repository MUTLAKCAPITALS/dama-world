# DAMA WORLD — souq v4 — preview lighting, QC cameras and batch rendering (Cycles, for review only).
# The game will NOT use these lights: Phase 6 bakes lighting/AO into textures for three.js.
import bpy, math, os
from mathutils import Vector
import lib

BY = 60.0     # material board sits well away from the building so no elevation camera sees it
OUT = r'C:\Users\LENOVO\Documents\DAMA_WORLD\souq_v4\renders'

def look_at(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def camera(name, loc, target, lens=35, ortho=None, c=None):
    cam = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    o = bpy.data.objects.get(name) or bpy.data.objects.new(name, cam)
    if not o.users_collection: (c or lib.coll('QC_Cameras')).objects.link(o)
    o.location = loc; look_at(o, target)
    cam.lens = lens; cam.clip_start = .05; cam.clip_end = 300
    cam.sensor_width = 36
    if ortho: cam.type = 'ORTHO'; cam.ortho_scale = ortho
    else: cam.type = 'PERSP'
    return o

def cameras():
    c = lib.coll('QC_Cameras')
    return {
        'front':   (camera('CAM_Front', (0, -40, 5.1), (0, 0, 5.1), ortho=15.0, c=c), (1600, 1200)),
        'side':    (camera('CAM_Side', (-40, 3.0, 5.1), (0, 3.0, 5.1), ortho=14.5, c=c), (1600, 1200)),
        'three_q': (camera('CAM_ThreeQuarter', (-11.0, -12.5, 3.6), (0.4, 1.8, 4.3), 30, c=c), (1600, 1000)),
        'eye':     (camera('CAM_EyeLevel', (2.4, -6.2, 1.65), (-1.2, 0.6, 2.55), 22, c=c), (1600, 1000)),
        'gate':    (camera('CAM_Gate', (0.55, -2.35, 1.45), (0.0, 0.25, 1.5), 40, c=c), (1200, 1400)),
        'window':  (camera('CAM_Window', (-2.75, -2.2, 4.75), (-3.8, 0.2, 5.45), 45, c=c), (1400, 1100)),
        'roof':    (camera('CAM_RoofEdge', (3.6, -2.6, 6.6), (1.9, 0.0, 7.5), 40, c=c), (1400, 1000)),
        'shop':    (camera('CAM_SpiceShop', (-2.05, -2.7, 1.5), (-3.8, 1.8, 1.35), 26, c=c), (1400, 1000)),
        'base':    (camera('CAM_WallBase', (-7.3, -2.0, 1.0), (-5.6, 0.4, 0.75), 40, c=c), (1400, 1000)),
        'plaster': (camera('CAM_PlasterClose', (-6.75, -1.55, 1.55), (-5.72, 0.35, 1.15), 32, c=c), (1400, 1000)),
        'street':  (camera('CAM_StreetFrontage', (7.2, -10.2, 3.4), (-0.4, -2.6, 0.5), 24, c=c), (1600, 1000)),
        'shop2':   (camera('CAM_SpiceShopDeep', (-3.75, -1.6, 1.55), (-3.85, 3.0, 1.3), 24, c=c), (1400, 1000)),
        'st_east':  (camera('CAM_St_EyeEast', (-6.2, -3.3, 1.65), (6.0, -2.4, 2.3), 22, c=c), (1600, 1000)),
        'st_west':  (camera('CAM_St_EyeWest', (14.2, -3.9, 1.65), (1.0, -3.2, 2.4), 22, c=c), (1600, 1000)),
        'st_tps':   (camera('CAM_St_ThirdPerson', (-3.2, -3.6, 2.75), (4.0, -3.4, 1.55), 26, c=c), (1600, 1000)),
        'st_over':  (camera('CAM_St_Overview', (24.0, -19.0, 13.0), (4.0, -3.5, 2.0), 30, c=c), (1600, 1000)),
        'st_C':     (camera('CAM_St_FacadeC', (6.5, -1.0, 1.65), (5.0, -7.0, 3.6), 20, c=c), (1600, 1000)),
        'st_B':     (camera('CAM_St_ArcadeB', (8.6, -5.6, 1.65), (10.6, 1.5, 2.3), 22, c=c), (1600, 1000)),
        'board':   (camera('CAM_MaterialBoard', (40, BY - 9, 3.2), (40, BY, 1.0), ortho=13.0, c=c), (2000, 800)),
    }

def sky_types():
    return [e.identifier for e in bpy.types.ShaderNodeTexSky.bl_rna.properties['sky_type'].enum_items]

def world(mode='day'):
    w = bpy.data.worlds.get('SouqWorld') or bpy.data.worlds.new('SouqWorld')
    bpy.context.scene.world = w
    try: w.use_nodes = True
    except Exception: pass
    t = w.node_tree; t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputWorld'); bg = t.nodes.new('ShaderNodeBackground')
    sky = t.nodes.new('ShaderNodeTexSky')
    types = sky_types()
    for k in ('MULTIPLE_SCATTERING', 'NISHITA', 'SINGLE_SCATTERING', 'HOSEK_WILKIE'):
        if k in types: sky.sky_type = k; break
    if mode == 'day':
        for a, v in (('sun_elevation', math.radians(36)), ('sun_rotation', math.radians(212)), ('altitude', 0.0),
                     ('air_density', 1.6), ('dust_density', 3.0), ('ozone_density', 1.0), ('sun_disc', False)):
            try: setattr(sky, a, v)
            except Exception: pass
        bg.inputs['Strength'].default_value = 0.24
    else:
        for a, v in (('sun_elevation', math.radians(-3)), ('sun_rotation', math.radians(212)), ('sun_disc', False)):
            try: setattr(sky, a, v)
            except Exception: pass
        bg.inputs['Strength'].default_value = 2.2
    # below the horizon the physical sky is black: blend into a warm dusty haze instead
    tc = t.nodes.new('ShaderNodeTexCoord'); sp = t.nodes.new('ShaderNodeSeparateXYZ')
    mr = t.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = -0.02; mr.inputs['From Max'].default_value = 0.06
    mx = t.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    haze = (0.62, 0.60, 0.56, 1) if mode == 'day' else (0.010, 0.012, 0.02, 1)
    t.links.new(tc.outputs['Generated'], sp.inputs[0]); t.links.new(sp.outputs[2], mr.inputs['Value'])
    fac = [x for x in mx.inputs if x.identifier == 'Factor_Float'][0]
    A = [x for x in mx.inputs if x.identifier == 'A_Color'][0]; B = [x for x in mx.inputs if x.identifier == 'B_Color'][0]
    A.default_value = haze
    t.links.new(mr.outputs[0], fac); t.links.new(sky.outputs[0], B)
    t.links.new([x for x in mx.outputs if x.identifier == 'Result_Color'][0], bg.inputs[0]); t.links.new(bg.outputs[0], out.inputs[0])
    # sun lamp (key light) — warm, raking across the facade from front-left
    c = lib.coll('QC_Lights')
    sun = bpy.data.objects.get('KeySun')
    if not sun:
        sun = bpy.data.objects.new('KeySun', bpy.data.lights.new('KeySun', 'SUN')); c.objects.link(sun)
    sun.data.angle = math.radians(0.6)
    d = Vector((-0.55, 0.72, -0.50)).normalized()          # direction the light travels
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    moon = bpy.data.objects.get('Moon')
    if not moon:
        moon = bpy.data.objects.new('Moon', bpy.data.lights.new('Moon', 'SUN')); c.objects.link(moon)
    moon.rotation_euler = Vector((-0.5, 0.7, -0.5)).normalized().to_track_quat('-Z', 'Y').to_euler()
    moon.data.angle = math.radians(1.5); moon.data.color = (0.62, 0.72, 1.0)
    night = mode != 'day'
    sun.data.energy = 0 if night else 4.4; sun.data.color = (1.0, 0.88, 0.72)
    sun.hide_render = night
    moon.data.energy = 0.22 if night else 0; moon.hide_render = not night
    bpy.context.scene.view_settings.exposure = 0.35 if night else -0.35
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name not in ('KeySun', 'Moon'):
            ne = o.get('night_energy', 90 if 'Shop' in o.name else 75); de = o.get('day_energy', 25 if 'Shop' in o.name else 0)
            o.data.energy = ne if night else de
    for m in bpy.data.materials:
        if m.name.startswith('M_Bulb'):
            for n in m.node_tree.nodes:
                if n.type == 'EMISSION': n.inputs['Strength'].default_value = 25 if night else 6

def render_setup(samples=128):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    cp = bpy.context.preferences.addons['cycles'].preferences
    try:
        cp.compute_device_type = 'OPTIX'; cp.refresh_devices()
        for d in cp.devices: d.use = d.type in ('OPTIX',)
        s.cycles.device = 'GPU'
    except Exception as e:
        print('GPU fallback', e); s.cycles.device = 'CPU'
    s.cycles.samples = samples; s.cycles.use_adaptive_sampling = True; s.cycles.adaptive_threshold = 0.02
    s.cycles.use_denoising = True
    try: s.cycles.denoiser = 'OPTIX'
    except Exception: pass
    s.cycles.max_bounces = 8; s.cycles.diffuse_bounces = 4; s.cycles.glossy_bounces = 3
    s.cycles.transmission_bounces = 6; s.cycles.transparent_max_bounces = 8
    s.cycles.caustics_reflective = False; s.cycles.caustics_refractive = False
    s.cycles.blur_glossy = 1.0
    s.view_settings.view_transform = 'AgX'
    try: s.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    s.view_settings.exposure = -0.35
    s.render.film_transparent = False
    s.render.image_settings.file_format = 'PNG'
    s.render.resolution_percentage = 100

def clay(on):
    vl = bpy.context.view_layer
    vl.material_override = bpy.data.materials.get('M_Clay') if on else None
    for o in bpy.data.objects:
        if o.name.startswith('Decal_'): o.hide_render = on

def queue(jobs, done_flag='queue_done'):
    """Render a list of (camera_key, file_name, mode, clay) one per timer tick so each MCP call returns at once."""
    cams = cameras(); os.makedirs(OUT, exist_ok=True)
    jobs = list(jobs)
    bpy.app.driver_namespace['souq_status'] = 'running'
    log = []
    def tick():
        if not jobs:
            bpy.app.driver_namespace['souq_status'] = 'done: ' + ', '.join(log)
            open(os.path.join(OUT, done_flag + '.txt'), 'w').write('\n'.join(log))
            return None
        key, fname, mode, is_clay = jobs.pop(0)
        cam, (rx, ry) = cams[key]
        s = bpy.context.scene; s.camera = cam
        s.render.resolution_x, s.render.resolution_y = rx, ry
        world(mode); clay(is_clay)
        import time; t = time.time()
        s.render.filepath = os.path.join(OUT, fname)
        try:
            bpy.ops.render.render(write_still=True)
            log.append('%s %.0fs' % (fname, time.time() - t))
        except Exception as e:
            log.append('%s ERROR %s' % (fname, e))
        clay(False)
        return 0.2
    bpy.app.timers.register(tick, first_interval=0.2)

def material_board(M):
    """Swatch row: one bevelled block per material, labelled — for material close-up QC."""
    import bmesh
    c = lib.coll('QC_MaterialBoard'); lib.clear_collection(c)
    keys = [('plaster', 'Lime plaster'), ('coral', 'Coral stone'), ('teak', 'Oiled teak'), ('beam', 'Weathered beam'),
            ('pole', 'Mangrove pole'), ('shutter', 'Painted shutter'), ('shutter2', 'Brown paint'), ('iron', 'Forged iron'),
            ('brass', 'Aged brass'), ('paver', 'Paving stone'), ('reed', 'Reed mat'), ('mud', 'Roof mud')]
    x0 = 40 - (len(keys) - 1) * 1.05 / 2
    for i, (k, label) in enumerate(keys):
        bm = bmesh.new(); vs, _ = lib.bm_box(bm, -.45, .45, -.45, .45, 0.3, 1.9)
        lib.set_rand_attr(bm, vs, 1.0 if i % 2 else 0.0)
        o = lib.from_bm('Swatch_' + k, bm, c, M[k]); o.location = (x0 + i * 1.05, BY, 0)
        lib.uv_box(o)
        lib.bevel(o, .04, 3)
        s = o.modifiers.new('Density', 'SUBSURF'); s.subdivision_type = 'SIMPLE'; s.levels = s.render_levels = 4
        cu = bpy.data.curves.new('Label_' + k, 'FONT'); cu.body = label; cu.size = .13; cu.align_x = 'CENTER'
        t = bpy.data.objects.new('Label_' + k, cu); c.objects.link(t)
        t.location = (x0 + i * 1.05, BY - .5, 0.08); t.rotation_euler = (math.radians(90), 0, 0)
        t.data.materials.append(M['clay'])
    bm = bmesh.new(); lib.bm_box(bm, 30, 50, BY + .6, BY + .8, -1, 4); lib.bm_box(bm, 30, 50, BY - 3, BY + .8, -.02, 0)
    back = lib.from_bm('Board_Backdrop', bm, c, M['clay'])
