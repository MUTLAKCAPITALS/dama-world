# Souq v4 — hero building (Phase 2)

Brand-new Blender project built entirely from code. It doesn't touch the game: `index.html`, Firebase,
the open world and every other system stay unchanged until Phase 6 is approved.

- Blender file: `Documents\DAMA_WORLD\souq_v4\mubarakiya_hero_v4.blend` (Blender 5.2)
- Renders: `Documents\DAMA_WORLD\souq_v4\renders\`
- References and licences: `REFERENCES.md`

## Scripts (`scripts/`)

| File | What it builds |
| --- | --- |
| `lib.py` | Mesh helpers. `shell()` turns solid boxes minus openings into one watertight all-quad wall mesh. Also boxes, cylinders, studs, tori, lathe, box-UVs (grain-aware / wall-aware) and plaster modifiers |
| `materials.py` | Procedural PBR library built node by node: lime plaster over coral rubble, coral stone, oiled teak, weathered beams, mangrove poles, painted shutters, forged iron, aged brass, paving, mortar, roof mud, reed mat, burlap, spice, glass, clay |
| `hero.py` | The building: shell, mouldings, lintels, pole floor and roof, rain spouts, roof stair room, the «بو خوخة» gate (planks, battens, middle rail, wicket, ~385 studs in rows and rosettes, knockers, lock plate, pivot caps), shops (open spice shop with interior, shuttered shop), canopy, windows (frames, bars, panelled shutters), lanterns, pavers with a medallion |
| `scene.py` | Preview-only lighting (physical sky + sun, night mode), QC cameras, material board, batch renderer |
| `run.py` | `run.rebuild()` then `run.render([...])` |

Run inside Blender with `scripts/` on `sys.path`:

```python
import run; run.rebuild(96)
run.render([('three_q', 'final_three_q.png', 'day', False)])
```

## Not done yet (later phases, after approval)
- Baking the procedural materials to texture atlases (colour, normal, roughness, AO), then testing the GLB in three.js.
- LOD0–2, collision meshes, and a performance budget measured in the game.
- Modular kit and the full market.
