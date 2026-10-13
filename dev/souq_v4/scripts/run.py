# DAMA WORLD — souq v4 — entry point. In Blender:  import run; run.rebuild(); run.render([...])
import sys, importlib, bpy

def _fresh():
    for k in ('lib', 'materials', 'details', 'hero', 'scene'): sys.modules.pop(k, None)
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
