# DAMA WORLD — souq v4 — entry point. In Blender:  import run; run.rebuild(); run.render([...])
import sys, importlib, bpy

def _fresh():
    for k in ('lib', 'materials', 'details', 'hero', 'scene', 'street', 'bake'): sys.modules.pop(k, None)
    import lib, materials, hero, scene
    return lib, materials, hero, scene

def rebuild(samples=96):
    lib, materials, hero, scene = _fresh()
    M = materials.build_all()
    info = hero.build(M)
    scene.material_board(M)
    scene.render_setup(samples)
    scene.cameras(); scene.world('day')
    return info

def render(jobs, flag='queue_done', samples=None):
    lib, materials, hero, scene = _fresh()
    if samples: bpy.context.scene.cycles.samples = samples
    scene.queue(jobs, flag)

def rebuild_street(samples=96):
    """Builds the street test around the approved hero building (which is left exactly as it is)."""
    for k in ('lib', 'materials', 'details', 'hero', 'scene', 'street'): sys.modules.pop(k, None)
    import lib, materials, details, hero, scene, street
    M = {m.name: m for m in bpy.data.materials}
    keys = dict(plaster='M_LimePlaster', coral='M_CoralStone', teak='M_TeakOiled', beam='M_BeamWeathered', pole='M_MangrovePole',
                shutter='M_ShutterPaint', shutter2='M_ShutterPaintBrown', iron='M_IronBlack', brass='M_BrassAged', paver='M_PaverStone',
                mortar='M_SandMortar', mud='M_RoofMud', reed='M_ReedMat', burlap='M_Burlap', spice='M_Spice', glass='M_LanternGlass',
                bulb='M_BulbWarm', jar='M_Jar', jar2='M_JarGreen', clay='M_Clay', frame='M_FramePaint', drip='M_DripDecal',
                rust='M_RustDecal', basket='M_Basket', glassjar='M_GlassJar', terracotta='M_Terracotta', wicker='M_WickerDark')
    MM = {k: bpy.data.materials[v] for k, v in keys.items()}
    street.build(MM)
    scene.cameras(); scene.world('day')
