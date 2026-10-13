# Mubarakiya street in the open world: preview only

Status: a test area for review. It is **not** on `main` and **not** in the normal game. Nothing runs unless the page URL contains `souqtest`.

## What is in the game
- **Buildings:** the three approved buildings (hero, B arcade, C merchant house + shop row), both covered passages, the pergola, furniture and palms, and the designed paving. There is no redesign; one placement change is listed under "Walk-in shops".
- **Location:** a separate block south of the Kuwait map. Game z = 150 − Blender y; x is the same.
- **Fast travel:** two map entries:
  - شارع المباركية (تجربة): inside the alley, facing east.
  - المباركية من الخارج (تجربة): north of the block, facing it.
- **Walkable area:** the street block plus a 12 m sand apron all round, so the buildings can be seen from every side.

## Pipeline (Blender → GLB), `scripts/gameexport.py`
1. **Prepare each group** (hero, heroprops, bldB, bldC, endE, endW, street). The group's objects are evaluated without subdivision or displacement, with bevels reduced to 1 segment. Then they are joined, and glass and emissive faces are split off.
2. **Bake.** Smart-UV atlas, then Cycles bakes colour, normal and roughness. The colour and normal maps are 2048–4096, roughness is 512–1024.
   - Two bake faults were found and fixed (see below).
   - The bake checks itself and re-bakes if the colour map comes back black.
3. **LOD1:** decimate to 35%, sharing the same atlas.
4. **Ground:** baked top-down onto one quad (4096×1024).
5. **Export:** GLB with JPEG textures and Draco geometry compression.
6. **Collision:** measured from the real geometry, not hand-placed:
   - walls: inside/outside test on a 10 cm grid, off-grid and in two ray directions;
   - props: one box per part;
   - raised floors: shop floors and sills;
   - ceilings: upward rays every 25 cm.

## Bake faults found and fixed during the browser test
- **Dark blotches on every plaster wall.** The originals were still visible during the bake, a few millimetres from the bake mesh because of their displacement. The plaster's dirt mask (an Ambient Occlusion node) saw them. The originals are now hidden while baking.
- **The plaster's per-object "Random" value** changes when parts are joined. Each object's real value is now measured and carried through the bake. It turned out not to be the visible cause, but it keeps the mud-patch amount true to the original.

## Loader, `dev/souq_street.js` (embedded in index.html as v40)
- three r128 GLTFLoader + DRACOLoader, from the same jsDelivr path the game already uses. The custom `glbLoad` used by the existing assets is untouched.
- One `THREE.LOD` per building (LOD1 beyond 38 m). Glass is transparent with no depth write; lanterns are emissive.
- Baked colour is kept linear, to match the game's renderer (no sRGB output).
- The street is built only after **every** model has arrived. Before this fix, a slow network gave a half-built street.
- Collision, raised floors and camera ceilings are applied to the Kuwait world only, by wrapping `groundY`, `souqCeil`, `resolve` and `buildWorld`. The camera ceiling is the lowest one **along the camera boom**, so the camera never pokes through an awning or a shop ceiling.
- On a raw.githack preview, the models come from one pinned jsDelivr copy (`SOUQ_ASSET_REF`). A test checks that copy is byte-identical to `models/souq/`.

## Walk-in shops (tested by walking the character in the browser)
- **Hero spice shop:** the sacks were rearranged along the side walls and the sill to leave a 1 m aisle. This is the only change to the approved scene; backup `backup_before_game_walkin.blend`.
- **B arcade:** all three shops can be entered.
- **C1 gold and perfume shops:** entered up to the counter.
- **C2:** the two open shops can be entered.
- **Closed by design:** the hero gate, the hero's shuttered right shop, C1's house door, the two closed C2 shops, and the doors at the ends of both covered passages.

## Measured in the browser (built-in browser on the user's laptop: AMD Radeon integrated GPU, D3D11)
Filled in in the report below.

## Not done / not claimed
- **Mobile:** not tested on a phone. No mobile result is claimed.
- **Sky and final lighting:** not started (as asked). The street uses the game's current golden-hour light.
- **Full souq:** not built. It waits for approval.
