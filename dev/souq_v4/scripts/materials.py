# DAMA WORLD — souq v4 — procedural PBR material library, built node by node (no image files).
# Every material works in metre-scale UVs from lib.uv_box, so the same graphs bake cleanly to
# textures for the game later (Phase 6). World-space position is used only for height-based dirt.
import bpy

class NB:
    """Tiny node-graph builder."""
    def __init__(self, name):
        m = bpy.data.materials.get(name)
        if m: bpy.data.materials.remove(m)
        self.m = m = bpy.data.materials.new(name)
        try: m.use_nodes = True
        except Exception: pass
        self.t = m.node_tree; self.t.nodes.clear(); self.x = 0
        self.out = self.n('ShaderNodeOutputMaterial')
        try: m.displacement_method = 'BOTH'
        except Exception:
            try: m.cycles.displacement_method = 'BOTH'
            except Exception: pass
    def n(self, kind, **props):
        nd = self.t.nodes.new(kind); nd.location = (self.x, 0); self.x -= 180
        for k, v in props.items(): setattr(nd, k, v)
        return nd
    def sock(self, nd, key, out=False):
        coll = nd.outputs if out else nd.inputs
        if isinstance(key, int): return coll[key]
        for s in coll:
            if s.identifier == key and s.enabled: return s
        for s in coll:
            if s.name == key and s.enabled: return s
        for s in coll:
            if s.name == key or s.identifier == key: return s
        raise KeyError(key)
    def link(self, a, b):
        self.t.links.new(a, b)
    def val(self, nd, key, v):
        self.sock(nd, key).default_value = v
    def put(self, nd, key, v):
        """v: a socket (link) or a constant."""
        s = self.sock(nd, key)
        if hasattr(v, 'is_output'): self.link(v, s)
        else:
            if isinstance(v, tuple) and len(v) == 3:
                try:
                    if len(s.default_value) == 4: v = (*v, 1.0)
                except TypeError: pass
            s.default_value = v
    # ---- building blocks returning output sockets ----
    def uv(self):
        return self.sock(self.n('ShaderNodeUVMap', uv_map='UVMap'), 'UV', True)
    def tc(self, kind='Object'):
        return self.sock(self.n('ShaderNodeTexCoord'), kind, True)
    def pos(self):
        return self.sock(self.n('ShaderNodeNewGeometry'), 'Position', True)
    def xyz(self, v, scale=(1, 1, 1)):
        mp = self.n('ShaderNodeVectorMath', operation='MULTIPLY'); self.put(mp, 0, v); mp.inputs[1].default_value = scale
        return mp.outputs[0]
    def sep(self, v):
        s = self.n('ShaderNodeSeparateXYZ'); self.put(s, 0, v); return s.outputs
    def noise(self, v, scale, detail=4, rough=.55, dist=0., dims='3D', fac=True, lac=2.0):
        nd = self.n('ShaderNodeTexNoise'); nd.noise_dimensions = dims
        if v is not None: self.put(nd, 'Vector', v)
        self.val(nd, 'Scale', scale); self.val(nd, 'Detail', detail); self.val(nd, 'Roughness', rough)
        self.val(nd, 'Distortion', dist)
        try: self.val(nd, 'Lacunarity', lac)
        except Exception: pass
        return self.sock(nd, 'Fac' if fac else 'Color', True)
    def voronoi(self, v, scale, out='Distance', feature='F1', rnd=1.0, metric='EUCLIDEAN'):
        nd = self.n('ShaderNodeTexVoronoi', feature=feature, distance=metric)
        if v is not None: self.put(nd, 'Vector', v)
        self.val(nd, 'Scale', scale); self.val(nd, 'Randomness', rnd)
        return self.sock(nd, out, True)
    def wave(self, v, scale, dist, detail=3, kind='BANDS', axis='X', profile='SIN', dscale=1.0, phase=0.):
        nd = self.n('ShaderNodeTexWave', wave_type=kind, bands_direction=axis, wave_profile=profile)
        if v is not None: self.put(nd, 'Vector', v)
        self.val(nd, 'Scale', scale); self.val(nd, 'Distortion', dist); self.val(nd, 'Detail', detail)
        self.val(nd, 'Detail Scale', dscale); self.val(nd, 'Phase Offset', phase)
        return self.sock(nd, 'Fac', True)
    def math(self, op, a, b=0.0, clamp=False):
        nd = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.put(nd, 0, a); self.put(nd, 1, b); return nd.outputs[0]
    def ramp(self, f, stops, interp='LINEAR'):
        """stops: [(pos, (r,g,b) or value)]"""
        nd = self.n('ShaderNodeValToRGB'); self.put(nd, 'Fac', f)
        cr = nd.color_ramp; cr.interpolation = interp
        while len(cr.elements) > 1: cr.elements.remove(cr.elements[-1])
        for i, (p, c) in enumerate(stops):
            e = cr.elements[0] if i == 0 else cr.elements.new(p)
            e.position = p
            e.color = (c, c, c, 1) if isinstance(c, (int, float)) else (*c, 1)
        return nd.outputs['Color']
    def band(self, f, a, b):
        """smooth 0..1 between a and b"""
        nd = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', clamp=True)
        self.put(nd, 'Value', f); self.val(nd, 'From Min', a); self.val(nd, 'From Max', b)
        return self.sock(nd, 'Result', True)
    def mix(self, a, b, f, blend='MIX'):
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend, clamp_result=True)
        self.put(nd, 'Factor_Float', f); self.put(nd, 'A_Color', a); self.put(nd, 'B_Color', b)
        return self.sock(nd, 'Result_Color', True)
    def mixf(self, a, b, f):
        nd = self.n('ShaderNodeMix', data_type='FLOAT')
        self.put(nd, 'Factor_Float', f); self.put(nd, 'A_Float', a); self.put(nd, 'B_Float', b)
        return self.sock(nd, 'Result_Float', True)
    def hsv(self, c, h=.5, s=1., v=1.):
        nd = self.n('ShaderNodeHueSaturation'); self.put(nd, 'Color', c)
        self.put(nd, 'Hue', h); self.put(nd, 'Saturation', s); self.put(nd, 'Value', v); return nd.outputs['Color']
    def objrand(self):
        return self.sock(self.n('ShaderNodeObjectInfo'), 'Random', True)
    def prand(self):
        """per-part random: object random + the 'tile' attribute written per plank/stone."""
        sc = self.n('ShaderNodeSeparateColor'); self.put(sc, 'Color', self.attr('tile'))
        return self.math('FRACT', self.math('ADD', self.objrand(), sc.outputs[0]))
    def edgemask(self, radius=.03, gain=6.0, samples=8):
        """0 on flat areas, ->1 on convex/concave arrises (bevel-normal vs true normal)."""
        bv = self.n('ShaderNodeBevel'); bv.samples = samples; self.val(bv, 'Radius', radius)
        gN = self.sock(self.n('ShaderNodeNewGeometry'), 'Normal', True)
        dp = self.n('ShaderNodeVectorMath', operation='DOT_PRODUCT'); self.put(dp, 0, self.sock(bv, 'Normal', True)); self.put(dp, 1, gN)
        return self.math('MINIMUM', self.math('MULTIPLY', self.math('SUBTRACT', 1.0, self.sock(dp, 'Value', True)), gain), 1.0)
    def objcolor(self):
        return self.sock(self.n('ShaderNodeObjectInfo'), 'Color', True)
    def attr(self, name, out='Color'):
        nd = self.n('ShaderNodeAttribute', attribute_name=name); return self.sock(nd, out, True)
    def ao(self, dist, inside=False):
        nd = self.n('ShaderNodeAmbientOcclusion', inside=inside, only_local=False)
        self.val(nd, 'Distance', dist); return self.sock(nd, 'AO', True)
    def bump(self, h, strength, dist=0.01, normal=None):
        nd = self.n('ShaderNodeBump'); self.put(nd, 'Height', h)
        self.val(nd, 'Strength', strength); self.val(nd, 'Distance', dist)
        if normal is not None: self.put(nd, 'Normal', normal)
        return self.sock(nd, 'Normal', True)
    def bsdf(self, color, rough, normal=None, metal=0.0, spec=.5, extra=None):
        p = self.n('ShaderNodeBsdfPrincipled')
        self.put(p, 'Base Color', color); self.put(p, 'Roughness', rough); self.put(p, 'Metallic', metal)
        try: self.put(p, 'Specular IOR Level', spec)
        except Exception: pass
        if normal is not None: self.put(p, 'Normal', normal)
        for k, v in (extra or {}).items(): self.put(p, k, v)
        self.link(p.outputs[0], self.out.inputs['Surface'])
        return p
    def displace(self, h, scale, mid=0.5):
        d = self.n('ShaderNodeDisplacement'); self.put(d, 'Height', h); self.val(d, 'Scale', scale); self.val(d, 'Midlevel', mid)
        self.link(d.outputs[0], self.out.inputs['Displacement'])

def lin(h):
    """sRGB hex -> linear tuple"""
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

# ------------------------------------------------------------------ materials
def coral_stone_graph(b, uv, scale=1.0):
    """Rubble wall of sea/coral stones (فروش) laid in mud mortar: returns (color, height).
    Stones ~15-25 cm, flattish, each with its own tone and pores; joints recessed."""
    warp = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(warp, 0, uv)
    wn = b.noise(uv, 3.0 * scale, 2, .5, 0, fac=False)
    sc = b.n('ShaderNodeVectorMath', operation='SCALE'); b.put(sc, 0, wn); b.put(sc, 'Scale', .14)
    b.link(sc.outputs[0], warp.inputs[1])
    v = b.xyz(warp.outputs[0], (1.0, 1.7, 1.0))
    cell = b.n('ShaderNodeTexVoronoi', feature='F1'); b.put(cell, 'Vector', v); b.val(cell, 'Scale', 6.5 * scale)
    edge = b.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); b.put(edge, 'Vector', v); b.val(edge, 'Scale', 6.5 * scale)
    tone = b.sep(b.sock(cell, 'Color', True))[0]
    ed = b.sock(edge, 'Distance', True)
    jn = b.noise(uv, 9 * scale, 3, .6)
    joint = b.band(b.math('SUBTRACT', ed, b.math('MULTIPLY', jn, .06)), .05, -.01)   # 1 in the mortar joint (uneven width)
    bulge = b.math('SQRT', b.band(ed, .0, .3))
    mid = b.noise(uv, 14 * scale, 5, .65)
    pores = b.math('LESS_THAN', b.voronoi(uv, 60 * scale, 'Distance'), .16)
    fine = b.noise(uv, 35 * scale, 6, .7)
    big = b.noise(uv, 1.5 * scale, 3, .5)
    stone = b.ramp(tone, [(0, lin('#8e7a5e')), (.35, lin('#a08a6a')), (.7, lin('#ad9675')), (1, lin('#978062'))])
    stone = b.mix(stone, lin('#6a5843'), b.math('MULTIPLY', pores, .6))
    stone = b.mix(stone, lin('#c2ae8c'), b.math('MULTIPLY', b.band(fine, .55, .8), .25))
    stone = b.mix(stone, lin('#7a6750'), b.math('MULTIPLY', big, .25))
    mortar = b.ramp(fine, [(0, lin('#8f7b5f')), (1, lin('#a8936f'))])
    col = b.mix(stone, mortar, joint)
    h = b.math('ADD', b.math('MULTIPLY', bulge, .35), b.math('MULTIPLY', fine, .25))
    h = b.math('ADD', h, b.math('MULTIPLY', mid, .5))
    h = b.math('ADD', h, b.math('MULTIPLY', tone, .2))
    h = b.math('SUBTRACT', h, b.math('MULTIPLY', pores, .2))
    h = b.mixf(h, b.math('MULTIPLY', fine, .1), joint)
    return col, h

def M_coral():
    b = NB('M_CoralStone'); uv = b.uv()
    col, h = coral_stone_graph(b, uv)
    b.bsdf(col, .92, b.bump(h, .8, .02))
    b.displace(h, .012)
    return b.m

def M_plaster(name='M_LimePlaster', base='#c8ad84', dirt_h=0.7, loss=0.70, exterior=True):
    """Aged lime/mud plaster over coral stone.
    Tone: three scales of breakup + an older wash coat showing through where the top wash is thin.
    Surface: lumps, trowel strokes, pinholes and grain (bump) + real displacement where plaster is lost.
    Ageing: worn/chipped arrises, hand grime around openings at 0.6-1.8 m, rain runs from the roof,
    rising damp with an uneven tide line and a faint salt bloom above it, grime in recesses (AO)."""
    b = NB(name); uv = b.uv(); P = b.pos(); z = b.sep(P)[2]
    rnd = b.objrand()
    broad = b.noise(uv, .12, 2, .5)
    mott = b.noise(uv, .45, 4, .6, .3)
    mott2 = b.noise(uv, 2.2, 5, .6)
    patch = b.noise(uv, 6.0, 3, .5)
    c0 = b.ramp(mott, [(0, lin('#bba07a')), (.5, lin(base)), (1, lin('#d9c6a1'))])
    c0 = b.mix(c0, lin('#b09370'), b.math('MULTIPLY', b.band(mott2, .55, .8), .38))
    c0 = b.mix(c0, lin('#dccaa8'), b.math('MULTIPLY', b.band(broad, .45, .75), .45))       # sun-bleached
    c0 = b.mix(c0, lin('#a58a66'), b.math('MULTIPLY', b.band(broad, .4, .15), .35))
    c0 = b.mix(c0, lin('#bd9f74'), b.math('MULTIPLY', b.band(patch, .5, .7), .3))          # small tonal patches
    # older wash coat (yellower) where the newest lime wash has worn thin
    wash = b.band(b.noise(uv, 1.6, 6, .68, .1), .62, .70)
    c0 = b.mix(c0, lin('#cfae7a'), b.math('MULTIPLY', wash, .55))
    trowel = b.noise(b.xyz(uv, (3.0, 9.0, 1.0)), 1.2, 3, .5)
    edges = b.edgemask(.045, 6.0)
    # --- plaster loss
    lossn = b.noise(uv, 1.1, 6, .7, .2)
    lowz = b.math('SUBTRACT', 1.0, b.band(z, .1, 1.1))
    lm = b.math('ADD', lossn, b.math('MULTIPLY', lowz, .07))
    chipn = b.band(b.noise(uv, 5, 5, .65), .5, .72)
    lm = b.math('ADD', lm, b.math('MULTIPLY', b.band(edges, .3, .9), b.math('ADD', .02, b.math('MULTIPLY', chipn, .32))))
    lm = b.math('ADD', lm, b.math('MULTIPLY', rnd, .04))
    edge = b.band(lm, loss, loss + .015)
    hedge = b.band(lm, loss - .01, loss + .06)
    rim = b.math('SUBTRACT', b.band(lm, loss - .035, loss), edge)
    scol, sh = coral_stone_graph(b, uv)
    # --- hairline cracks
    cw = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(cw, 0, uv)
    cwn = b.noise(uv, 6.0, 3, .6, 0, fac=False); cws = b.n('ShaderNodeVectorMath', operation='SCALE'); b.put(cws, 0, cwn); b.put(cws, 'Scale', .07); b.link(cws.outputs[0], cw.inputs[1])
    cr = b.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); b.put(cr, 'Vector', b.xyz(cw.outputs[0], (1.0, 1.3, 1.0)))
    b.val(cr, 'Scale', 2.4); b.val(cr, 'Randomness', 1.0)
    crk = b.math('MULTIPLY', b.band(b.sock(cr, 'Distance', True), .006, .0), b.band(b.noise(uv, 1.7, 3, .5), .58, .66))
    # --- rain runs from the roof
    st1 = b.band(b.noise(b.xyz(uv, (5.0, .22, 1.0)), 1.0, 4, .55), .52, .8)
    st2 = b.band(b.noise(b.xyz(uv, (14.0, .4, 1.0)), 1.0, 3, .5), .58, .85)
    zone = b.band(b.noise(b.xyz(uv, (.6, .15, 1.0)), 1.0, 2, .5), .45, .65)
    topw = b.band(z, 2.5, 7.4)
    streak = b.math('MULTIPLY', b.math('MULTIPLY', b.math('ADD', b.math('MULTIPLY', st1, .75), b.math('MULTIPLY', st2, .35)), topw), zone)
    under_coping = b.band(z, 7.3, 8.0)
    # --- rising damp: uneven tide line, salt bloom just above it, splash-back at the foot
    tide = b.math('ADD', dirt_h, b.math('MULTIPLY', b.math('SUBTRACT', b.noise(uv, 1.4, 4, .6), .5), .5))
    zrel = b.math('SUBTRACT', z, tide)                       # <0 under the tide line
    damp = b.band(zrel, .06, -.25)
    damp = b.math('MULTIPLY', damp, b.math('ADD', .55, b.math('MULTIPLY', b.noise(uv, 3, 4, .6), .6)))
    salt = b.math('MULTIPLY', b.math('SUBTRACT', b.band(zrel, -.02, .05), b.band(zrel, .05, .16)), b.band(b.noise(uv, 9, 4, .6), .45, .7))
    splash = b.math('MULTIPLY', b.math('SUBTRACT', 1.0, b.band(z, .0, .32)), b.math('ADD', .35, b.math('MULTIPLY', b.noise(uv, 14, 3, .6), .4)))
    # --- hand grime: arrises and reveals around openings at touch height
    touchz = b.math('MULTIPLY', b.band(z, .55, .95), b.band(z, 1.9, 1.5))
    hand = b.math('MULTIPLY', b.math('MULTIPLY', b.band(edges, .05, .5), touchz), b.band(b.noise(uv, 3, 3, .5), .35, .65))
    # worn limewash on the arrises above touch height: slightly lighter, chalky
    chalk = b.math('MULTIPLY', b.band(edges, .2, .8), b.math('SUBTRACT', 1.0, touchz))
    ao = b.ao(.35)
    c = b.mix(c0, lin('#85704f'), b.math('MULTIPLY', streak, .45 if exterior else .05))
    c = b.mix(c, lin('#8a785d'), b.math('MULTIPLY', under_coping, .25))
    c = b.mix(c, lin('#e6dcc6'), b.math('MULTIPLY', chalk, .22))
    gN2 = b.sep(b.sock(b.n('ShaderNodeNewGeometry'), 'Normal', True))[2]
    c = b.mix(c, lin('#a08a6c'), b.math('MULTIPLY', b.band(gN2, .5, .9), b.math('ADD', .25, b.math('MULTIPLY', b.noise(uv, 8, 3, .5), .35))))   # dust on ledges & sills
    c = b.mix(c, lin('#7d6a52'), b.math('MULTIPLY', hand, .55))
    c = b.mix(c, lin('#66533d'), b.math('MULTIPLY', damp, .9))
    c = b.mix(c, lin('#e2dccb'), b.math('MULTIPLY', salt, .2))
    c = b.mix(c, lin('#5e4f3d'), b.math('MULTIPLY', splash, .6))
    c = b.mix(c, lin('#a08868'), b.math('MULTIPLY', rim, .8))
    c = b.mix(c, scol, edge)
    c = b.mix(c, lin('#6a5a46'), b.math('MULTIPLY', crk, .55))
    c = b.mix(lin('#4f4031'), c, b.math('POWER', ao, .55))
    # --- surface relief
    fine = b.noise(uv, 55, 8, .75)
    grain = b.noise(uv, 180, 4, .7)
    pins = b.math('LESS_THAN', b.voronoi(uv, 45, 'Distance'), .07)
    hp = b.math('ADD', .7, b.math('MULTIPLY', trowel, .12))
    hp = b.math('ADD', hp, b.math('MULTIPLY', fine, .05))
    hp = b.math('ADD', hp, b.math('MULTIPLY', grain, .03))
    hp = b.math('SUBTRACT', hp, b.math('MULTIPLY', pins, .05))
    lump = b.noise(uv, 3.5, 3, .55)
    hp = b.math('ADD', hp, b.math('MULTIPLY', lump, .28))
    hp = b.math('SUBTRACT', hp, b.math('MULTIPLY', crk, .08))
    h = b.mixf(hp, b.math('MULTIPLY', sh, .45), hedge)
    # --- roughness: varied at three scales; damp & stone rougher, hand-polished spots a bit smoother
    rv = b.math('ADD', .72, b.math('MULTIPLY', mott2, .16))
    rv = b.math('ADD', rv, b.math('MULTIPLY', b.math('SUBTRACT', patch, .5), .14))
    rv = b.math('ADD', rv, b.math('MULTIPLY', b.math('SUBTRACT', grain, .5), .10))
    rv = b.math('SUBTRACT', rv, b.math('MULTIPLY', hand, .12))
    rv = b.math('ADD', rv, b.math('MULTIPLY', damp, .08))
    rough = b.mixf(rv, .95, edge)
    micro = b.math('SUBTRACT', b.math('ADD', b.math('MULTIPLY', grain, .7), b.math('MULTIPLY', b.noise(uv, 420, 3, .6), .3)), b.math('MULTIPLY', pins, .6))
    nmicro = b.bump(micro, .22, .0015)
    b.bsdf(c, rough, b.bump(h, .38, .02, nmicro))
    b.displace(b.math('SUBTRACT', h, .5), .03, 0.0)
    return b.m

def wood_graph(b, uv, base, dark, rnd, grain_scale=1.0):
    """Planked hardwood: grain bands along U, knots, per-part tone shift. returns (color, height, rings)."""
    v = b.xyz(uv, (1.0 * grain_scale, 9.0 * grain_scale, 1.0))
    vr = b.math('ADD', b.math('MULTIPLY', rnd, 17.3), 0.0)
    off = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(off, 0, v); off.inputs[1].default_value = (0, 0, 0)
    comb = b.n('ShaderNodeCombineXYZ'); b.put(comb, 'X', vr); b.put(comb, 'Y', vr); b.link(comb.outputs[0], off.inputs[1])
    vv = off.outputs[0]
    rings = b.wave(vv, .9, 6.0, 3, 'BANDS', 'Y', 'SIN', 2.0)
    rings = b.math('POWER', rings, 1.8)
    fibre = b.noise(b.xyz(vv, (.5, 40.0, 1.0)), 3.0, 8, .72)
    knots = b.band(b.voronoi(b.xyz(uv, (2.0, 2.0, 1.0)), 2.2, 'Distance'), .05, .0)
    col = b.ramp(b.math('ADD', b.math('MULTIPLY', rings, .35), b.math('MULTIPLY', fibre, .7)),
                 [(0, dark), (.55, base), (1, tuple(min(1, x * 1.35) for x in base))])
    col = b.mix(col, dark, b.math('MULTIPLY', knots, .8))
    col = b.hsv(col, .5, 1.0, b.math('ADD', .82, b.math('MULTIPLY', rnd, .36)))
    h = b.math('ADD', b.math('MULTIPLY', rings, .3), b.math('MULTIPLY', fibre, .7))
    return col, h, rings

def M_wood_oiled(name='M_TeakOiled', base='#43291a', dark='#180d06', rough=.48):
    """Oiled teak door planks. Each plank gets its own tone (three timber batches), the grain reads in
    the bump, oil is worn off the arrises and at touch height, sun greys the wood unevenly, grime
    gathers at the foot and around the hardware."""
    b = NB(name); uv = b.uv(); rnd = b.prand(); z = b.sep(b.pos())[2]
    col, h, rings = wood_graph(b, uv, lin(base), lin(dark), rnd)
    batch = b.ramp(rnd, [(0, lin('#523522')), (.33, lin('#3e2717')), (.66, lin('#5a3c26')), (1, lin('#4a2e1c'))], 'CONSTANT')
    col = b.mix(col, batch, .4)
    col = b.hsv(col, b.math('ADD', .49, b.math('MULTIPLY', rnd, .025)), b.math('ADD', .85, b.math('MULTIPLY', rnd, .3)), b.math('ADD', .82, b.math('MULTIPLY', rnd, .36)))
    # long uneven streaks along each plank (weathering follows the grain)
    lng = b.band(b.noise(b.xyz(uv, (.5, 14.0, 1.0)), 2.0, 4, .6), .4, .75)
    col = b.mix(col, lin('#6a5a48'), b.math('MULTIPLY', lng, .28))
    ao = b.ao(.08)
    col = b.mix(lin('#120a05'), col, b.math('POWER', ao, .8))
    edges = b.edgemask(.006, 5.0)
    wear = b.math('MULTIPLY', edges, b.band(b.noise(uv, 18, 4, .6), .35, .6))
    col = b.mix(col, lin('#8a6a48'), b.math('MULTIPLY', wear, .55))        # oil worn off the arrises
    touch = b.math('MULTIPLY', b.band(z, .6, 1.0), b.math('SUBTRACT', 1.0, b.band(z, 1.4, 1.8)))
    col = b.mix(col, b.hsv(col, .5, .85, 1.3), b.math('MULTIPLY', touch, .3))
    dust = b.band(b.noise(uv, 6, 5, .6), .55, .75)
    col = b.mix(col, lin('#7d6a55'), b.math('MULTIPLY', dust, .2))
    bleach = b.math('MULTIPLY', b.band(b.noise(b.xyz(uv, (1.0, 6.0, 1.0)), 2.5, 4, .6), .45, .8), .55)
    col = b.mix(col, lin('#5e5244'), b.math('MULTIPLY', bleach, .55))
    foot = b.math('SUBTRACT', 1.0, b.band(z, .05, .5))
    col = b.mix(col, lin('#2a2016'), b.math('MULTIPLY', foot, .55))
    scr = b.band(b.noise(b.xyz(uv, (.3, 25.0, 1.0)), 6.0, 2, .5), .66, .7)
    col = b.mix(col, lin('#8a6a4a'), b.math('MULTIPLY', scr, .3))
    r = b.math('ADD', rough, b.math('MULTIPLY', b.math('ADD', dust, bleach), .3))
    r = b.math('ADD', r, b.math('MULTIPLY', wear, .2))
    r = b.math('ADD', r, b.math('MULTIPLY', b.math('SUBTRACT', b.noise(uv, 9, 3, .5), .5), .15))
    hh = b.math('ADD', h, b.math('MULTIPLY', scr, -.3))
    hh = b.math('ADD', hh, b.math('MULTIPLY', rings, .6))
    b.bsdf(col, r, b.bump(hh, .85, .007))
    return b.m

def M_wood_weathered(name='M_BeamWeathered', base='#6b5a48', dark='#2e241a'):
    """Sun-bleached, cracked structural timber (lintels, pergola, mangrove poles)."""
    b = NB(name); uv = b.uv(); rnd = b.prand()
    col, h, rings = wood_graph(b, uv, lin(base), lin(dark), rnd, .8)
    cracks = b.band(b.noise(b.xyz(uv, (.4, 18.0, 1.0)), 3.0, 3, .5), .62, .7)
    grey = b.noise(uv, .8, 3, .5)
    col = b.mix(col, lin('#8d8478'), b.math('MULTIPLY', b.band(grey, .4, .7), .5))
    col = b.mix(col, lin('#120c07'), b.math('MULTIPLY', cracks, .9))
    ao = b.ao(.12)
    col = b.mix(lin('#1a120b'), col, b.math('POWER', ao, .7))
    h = b.math('SUBTRACT', h, b.math('MULTIPLY', cracks, 1.2))
    b.bsdf(col, .82, b.bump(h, .6, .006))
    return b.m

def M_wood_painted(name='M_ShutterPaint', paint='#3f6f73', worn=.68):
    """Aged painted wood: several coats (an older colour shows where the top coat has flaked), paint
    chipped back to grey wood on arrises and low down, brush marks along the grain, chalky sun fade,
    grime in the panel corners."""
    b = NB(name); uv = b.uv(); rnd = b.prand(); z = b.sep(b.pos())[2]
    wc, wh, _ = wood_graph(b, uv, lin('#7a6a58'), lin('#3a3026'), rnd)
    wc = b.mix(wc, lin('#8a8478'), .35)                                   # bare wood greyed by sun
    chip = b.noise(uv, 7, 8, .72, .1)
    edges = b.edgemask(.006, 5.0)
    low = b.math('SUBTRACT', 1.0, b.band(z, .2, .9))
    m = b.math('ADD', chip, b.math('MULTIPLY', edges, .32))
    m = b.math('ADD', m, b.math('MULTIPLY', low, .06))
    m = b.math('ADD', m, b.math('MULTIPLY', rnd, .04))
    under = b.band(m, worn - .07, worn - .045)                            # older coat
    bare = b.band(m, worn, worn + .03)
    fade = b.noise(uv, 1.5, 3, .5)
    pc = b.ramp(fade, [(0, lin(paint)), (1, tuple(min(1, x * 1.25 + .05) for x in lin(paint)))])
    pc = b.hsv(pc, b.math('ADD', .49, b.math('MULTIPLY', rnd, .02)), 1.0, b.math('ADD', .9, b.math('MULTIPLY', rnd, .2)))
    pc = b.mix(pc, lin('#c9c2b0'), b.math('ADD', .06, b.math('MULTIPLY', b.band(fade, .5, .8), .12)))   # chalking
    brush = b.noise(b.xyz(uv, (.4, 30.0, 1.0)), 4.0, 3, .5)
    pc = b.mix(pc, b.hsv(pc, .5, 1.0, .85), b.math('MULTIPLY', brush, .25))
    pc = b.mix(pc, lin('#8f7a52'), under)                                 # previous ochre coat
    col = b.mix(pc, wc, bare)
    ao = b.ao(.06)
    col = b.mix(lin('#2a241c'), col, b.math('POWER', ao, .6))
    h = b.mixf(b.math('ADD', .6, b.math('MULTIPLY', b.math('ADD', wh, brush), .04)), b.math('MULTIPLY', wh, .4), bare)
    rough = b.mixf(b.math('ADD', .5, b.math('MULTIPLY', fade, .25)), .88, bare)
    b.bsdf(col, rough, b.bump(h, .55, .004))
    return b.m

def M_drip_decal(name='M_DripDecal', col='#4a3c2c', strength=.55):
    """Transparent decal: dirty water runs below sills, spouts and pole ends. Alpha from streak noise,
    fading out downwards (decal planes are UV'd 0..1 top->bottom)."""
    b = NB(name)
    try: b.m.blend_method = 'HASHED'
    except Exception: pass
    uv = b.uv(); sep = b.sep(uv)
    u, v = sep[0], sep[1]
    st = b.band(b.noise(b.xyz(uv, (9.0, .5, 1.0)), 1.0, 4, .6), .48, .78)
    st2 = b.band(b.noise(b.xyz(uv, (25.0, .9, 1.0)), 1.0, 3, .5), .55, .8)
    fall = b.math('MULTIPLY', b.band(v, 0.0, .9), b.band(v, 1.0, .9))     # fade at the bottom, crisp at the top
    side = b.math('MULTIPLY', b.band(u, 0.0, .2), b.band(u, 1.0, .8))
    a = b.math('MULTIPLY', b.math('MULTIPLY', b.math('ADD', st, b.math('MULTIPLY', st2, .5)), fall), side)
    a = b.math('MINIMUM', b.math('MULTIPLY', a, strength), 1.0)
    p = b.n('ShaderNodeBsdfPrincipled'); b.put(p, 'Base Color', lin(col)); b.put(p, 'Roughness', .9)
    tr = b.n('ShaderNodeBsdfTransparent')
    mx = b.n('ShaderNodeMixShader'); b.put(mx, 'Fac', a)
    b.link(tr.outputs[0], mx.inputs[1]); b.link(p.outputs[0], mx.inputs[2])
    b.link(mx.outputs[0], b.out.inputs['Surface'])
    return b.m

def M_iron(name='M_IronBlack'):
    """Black-painted forged iron: paint worn to bare dark metal on the highest points, rust breaking
    through at edges and damp spots, varied sheen."""
    b = NB(name); uv = b.uv(); P = b.pos()
    n1 = b.noise(P, 18, 6, .65); n2 = b.noise(P, 3, 4, .6); n3 = b.noise(P, 60, 4, .6)
    ao = b.ao(.03)
    edges = b.edgemask(.004, 4.0)
    rust = b.band(b.math('ADD', b.math('MULTIPLY', n1, .7), b.math('MULTIPLY', b.math('SUBTRACT', 1.0, ao), .6)), .55, .62)
    bare = b.math('MULTIPLY', edges, b.band(n3, .45, .65))
    rc = b.ramp(n2, [(0, lin('#4a2412')), (.5, lin('#6e3818')), (1, lin('#5c3a22'))])
    paint = b.mix(lin('#141413'), lin('#2a2724'), n2)
    paint = b.mix(paint, lin('#3a3632'), b.math('MULTIPLY', b.band(n3, .55, .8), .4))      # chalky, dusty paint
    col = b.mix(paint, lin('#5a5652'), bare)                                            # worn to bare metal
    col = b.mix(col, rc, rust)
    rough = b.math('ADD', .5, b.math('MULTIPLY', b.math('SUBTRACT', n3, .5), .3))
    rough = b.mixf(rough, .32, bare); rough = b.mixf(rough, .9, rust)
    metal = b.mixf(b.mixf(.15, .9, bare), 0.0, rust)
    b.bsdf(col, rough, b.bump(b.math('ADD', n1, b.math('MULTIPLY', rust, .5)), .35, .002), metal=metal)
    return b.m

def M_brass(name='M_BrassAged'):
    """Aged brass: brown-olive tarnish overall, hand-polished bright metal only where touched (arrises,
    front of the ring), dark grime and a trace of verdigris in recesses, varied sheen."""
    b = NB(name); P = b.pos()
    ao = b.ao(.02)
    tar = b.math('SUBTRACT', 1.0, ao)
    n = b.noise(P, 40, 5, .6); nb = b.noise(P, 8, 3, .5)
    edges = b.edgemask(.003, 4.0)
    polish = b.math('MULTIPLY', b.math('ADD', edges, b.math('MULTIPLY', b.band(nb, .55, .75), .5)), b.math('SUBTRACT', 1.0, tar))
    polish = b.math('MINIMUM', polish, 1.0)
    tarnish = b.ramp(nb, [(0, lin('#4e3f22')), (.5, lin('#6a5530')), (1, lin('#5a4a2c'))])
    bright = lin('#b8964e')
    col = b.mix(tarnish, bright, b.math('MULTIPLY', polish, .85))
    col = b.mix(col, lin('#2a2216'), b.math('MULTIPLY', b.band(tar, .3, .8), .7))
    col = b.mix(col, lin('#4f6a55'), b.math('MULTIPLY', b.band(tar, .6, .95), b.band(n, .5, .7)))
    rough = b.mixf(b.math('ADD', .5, b.math('MULTIPLY', b.math('SUBTRACT', n, .5), .3)), .22, polish)
    b.bsdf(col, rough, b.bump(n, .08, .001), metal=b.mixf(.85, 1.0, polish))
    return b.m

def M_paver(name='M_PaverStone'):
    """Market paving stone; tone per stone comes from the 'tile' colour attribute written at build time."""
    b = NB(name); uv = b.uv(); P = b.pos()
    att = b.n('ShaderNodeSeparateColor'); b.put(att, 'Color', b.attr('tile'))
    r = att.outputs[0]; g = att.outputs[1]
    grey = b.ramp(g, [(0, lin('#8a7e6c')), (.5, lin('#9a8d79')), (1, lin('#a89a85'))])
    beige = b.ramp(g, [(0, lin('#a89275')), (.5, lin('#b8a282')), (1, lin('#c4ae8e'))])
    dark = b.ramp(g, [(0, lin('#5f5a52')), (.5, lin('#6c665c')), (1, lin('#7a7266'))])
    base = b.mix(grey, beige, b.math('GREATER_THAN', r, .5))
    base = b.mix(base, dark, b.math('MULTIPLY', b.math('GREATER_THAN', r, .15), b.math('LESS_THAN', r, .5)))
    speck = b.noise(P, 90, 6, .7)
    mott = b.noise(P, 4, 4, .6)
    col = b.mix(base, lin('#6f6a61'), b.math('MULTIPLY', b.band(speck, .6, .75), .5))
    col = b.mix(col, lin('#857a6a'), b.math('MULTIPLY', mott, .25))
    ao = b.ao(.05)
    col = b.mix(lin('#4a4740'), col, b.math('POWER', ao, .5))
    wear = b.band(b.noise(P, 1.2, 3, .5), .45, .75)
    edges = b.edgemask(.008, 4.0)
    col = b.mix(col, b.hsv(col, .5, .8, 1.15), b.math('MULTIPLY', edges, .5))            # chipped, lighter arrises
    stain = b.band(b.noise(P, .7, 4, .6), .55, .75)
    col = b.mix(col, lin('#5a5246'), b.math('MULTIPLY', stain, .3))                       # old spills / foot traffic
    rough = b.mixf(.84, .6, wear)
    rough = b.math('ADD', rough, b.math('MULTIPLY', b.math('SUBTRACT', speck, .5), .15))
    b.bsdf(col, rough, b.bump(b.math('ADD', speck, mott), .3, .003))
    return b.m

def M_mortar():
    b = NB('M_SandMortar'); P = b.pos(); n = b.noise(P, 60, 6, .7)
    b.bsdf(b.ramp(n, [(0, lin('#7a6c58')), (1, lin('#a39377'))]), .95, b.bump(n, .6, .003)); return b.m

def M_mud():
    b = NB('M_RoofMud'); uv = b.uv(); n = b.noise(uv, 3, 6, .7); c = b.noise(uv, 30, 6, .7)
    col = b.ramp(n, [(0, lin('#8a7356')), (1, lin('#b39a76'))])
    b.bsdf(col, .95, b.bump(b.math('ADD', n, c), .6, .01)); return b.m

def M_reed_mat():
    """Woven reed mat (باسجيل) laid on the mangrove poles: two crossing wave textures."""
    b = NB('M_ReedMat'); uv = b.uv()
    w1 = b.wave(b.xyz(uv, (1, 1, 1)), 18, .3, 1, 'BANDS', 'X', 'SIN')
    w2 = b.wave(b.xyz(uv, (1, 1, 1)), 18, .3, 1, 'BANDS', 'Y', 'SIN')
    chk = b.math('GREATER_THAN', b.wave(uv, 4.5, 0, 0, 'BANDS', 'X', 'SAW'), .5)
    chk2 = b.math('GREATER_THAN', b.wave(uv, 4.5, 0, 0, 'BANDS', 'Y', 'SAW'), .5)
    sel = b.math('ABSOLUTE', b.math('SUBTRACT', chk, chk2))
    h = b.mixf(w1, w2, sel)
    n = b.noise(uv, 8, 4, .6)
    col = b.ramp(b.math('ADD', b.math('MULTIPLY', h, .5), b.math('MULTIPLY', n, .5)), [(0, lin('#5e4a30')), (1, lin('#b5975f'))])
    b.bsdf(col, .85, b.bump(h, .8, .004)); return b.m

def M_burlap():
    """Jute sacking: coarse open weave, fibre fuzz, dusty spice stains near the rim."""
    b = NB('M_Burlap'); uv = b.uv(); P = b.pos(); z = b.sep(P)[2]
    w1 = b.wave(P, 160, 1.5, 2, 'BANDS', 'X', 'SIN'); w2 = b.wave(P, 160, 1.5, 2, 'BANDS', 'Z', 'SIN')
    w3 = b.wave(P, 160, 1.5, 2, 'BANDS', 'Y', 'SIN')
    weave = b.math('MAXIMUM', b.math('MULTIPLY', w1, w2), b.math('MULTIPLY', w3, w2))
    n = b.noise(P, 6, 4, .6); fz = b.noise(P, 400, 2, .5)
    col = b.ramp(n, [(0, lin('#7a6040')), (.5, lin('#9a7f55')), (1, lin('#b09468'))])
    col = b.mix(col, lin('#4a3a26'), b.math('MULTIPLY', b.math('SUBTRACT', 1.0, weave), .45))
    ao = b.ao(.1)
    col = b.mix(lin('#3a2c1c'), col, b.math('POWER', ao, .7))
    b.bsdf(col, .97, b.bump(b.math('ADD', weave, b.math('MULTIPLY', fz, .3)), .9, .003),
           extra={'Sheen Weight': .4}); return b.m

def M_spice():
    """Loose spice heap; hue comes from each object's colour property (set per sack)."""
    b = NB('M_Spice'); P = b.pos()
    g = b.noise(P, 220, 4, .8); v = b.noise(P, 8, 3, .5); lump = b.noise(P, 28, 3, .6)
    col = b.hsv(b.objcolor(), .5, 1.0, b.math('ADD', .75, b.math('MULTIPLY', v, .4)))
    col = b.mix(col, b.hsv(b.objcolor(), .5, 1.1, .45), b.math('MULTIPLY', b.band(g, .55, .7), .6))
    b.bsdf(col, .9, b.bump(b.math('ADD', g, b.math('MULTIPLY', lump, 1.5)), .9, .004)); return b.m

def M_glass():
    b = NB('M_LanternGlass')
    p = b.bsdf(lin('#f2dcb0'), .12, extra={'Transmission Weight': .9, 'IOR': 1.45})
    return b.m

def M_emit(name='M_BulbWarm', col='#ffb35c', strength=25.0):
    b = NB(name)
    e = b.n('ShaderNodeEmission'); e.inputs['Color'].default_value = (*lin(col), 1); e.inputs['Strength'].default_value = strength
    b.link(e.outputs[0], b.out.inputs['Surface']); return b.m

def M_ceramic(name='M_Jar', base='#7a4b2c'):
    b = NB(name); P = b.pos(); n = b.noise(P, 12, 4, .6)
    b.bsdf(b.hsv(lin(base), .5, 1.0, b.math('ADD', .85, b.math('MULTIPLY', n, .3))), .55, b.bump(n, .1, .002)); return b.m

def M_basket(name='M_Basket', base='#a88a5a'):
    """Woven palm-leaf basket (خوص): diagonal plaits."""
    b = NB(name); P = b.pos(); uv = b.uv()
    w1 = b.wave(P, 30, 1.0, 1, 'BANDS', 'X', 'TRI'); w2 = b.wave(P, 30, 1.0, 1, 'BANDS', 'Y', 'TRI')
    wv = b.math('MULTIPLY', w1, w2); n = b.noise(P, 10, 4, .6)
    col = b.ramp(b.math('ADD', b.math('MULTIPLY', wv, .6), b.math('MULTIPLY', n, .4)), [(0, tuple(x * .45 for x in lin(base))), (1, lin(base))])
    b.bsdf(col, .85, b.bump(wv, .7, .003)); return b.m

def M_terracotta():
    """Unglazed porous water jar: pale fired clay, darker where water sweats through the lower half."""
    b = NB('M_Terracotta'); P = b.pos(); z = b.sep(P)[2]
    n = b.noise(P, 6, 4, .6); f = b.noise(P, 60, 5, .7)
    col = b.ramp(n, [(0, lin('#8a6346')), (.5, lin('#a37a58')), (1, lin('#b08a66'))])
    wet = b.math('MULTIPLY', b.band(z, 1.05, .7), b.band(b.noise(P, 3, 3, .5), .3, .6))
    col = b.mix(col, lin('#5e3e2a'), b.math('MULTIPLY', wet, .7))
    b.bsdf(col, b.mixf(.88, .55, wet), b.bump(f, .3, .002)); return b.m

def M_glassjar():
    b = NB('M_GlassJar')
    b.bsdf(lin('#dfe8e0'), .08, extra={'Transmission Weight': 1.0, 'IOR': 1.5}); return b.m

def M_clay():
    """Neutral clay for the clay render (geometry check, no textures)."""
    b = NB('M_Clay'); b.bsdf(lin('#bdbab4'), .75); return b.m

def build_all():
    return dict(
        plaster=M_plaster(), plaster_in=M_plaster('M_PlasterInterior', '#d8c6a4', .3, .80, exterior=False),
        coral=M_coral(), teak=M_wood_oiled(), beam=M_wood_weathered(),
        pole=M_wood_weathered('M_MangrovePole', '#5d5042', '#231b14'),
        shutter=M_wood_painted(), shutter2=M_wood_painted('M_ShutterPaintBrown', '#4a2e1a', .71),
        iron=M_iron(), brass=M_brass(), paver=M_paver(), mortar=M_mortar(), mud=M_mud(),
        reed=M_reed_mat(), burlap=M_burlap(), spice=M_spice(), glass=M_glass(), bulb=M_emit(),
        jar=M_ceramic(), jar2=M_ceramic('M_JarGreen', '#4d5a3c'), clay=M_clay(),
        frame=M_wood_painted('M_FramePaint', '#2e5559', .72), drip=M_drip_decal(), rust=M_drip_decal('M_RustDecal', '#5a3218', .5),
        basket=M_basket(), glassjar=M_glassjar(), terracotta=M_terracotta(), wicker=M_basket('M_WickerDark', '#6a5434'))
