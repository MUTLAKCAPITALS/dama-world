# Hero building: from Blender source to a browser-ready asset (plan)

This is a plan only. No optimisation has been carried out yet: Phase 6 runs only after approval.

**Target:** DAMA WORLD's browser build, three.js r128 running on mid-range phones, hosted free on GitHub Pages.

## 1. High-detail source (what exists now)

- **Source file:** `mubarakiya_hero_v4.blend`, rebuilt from the scripts in `scripts/` with `run.rebuild()`.
- **Counts:** measured in Blender after the revision pass.

| Part | Base mesh (tris) | Rendered with subdivision/displacement (tris) |
| --- | ---: | ---: |
| Structure (walls, mouldings, lintels, platforms) | 13.7k | 567k |
| Doors (gate + both shopfronts) | 18.0k | 26.9k |
| Windows | 2.0k | 12.7k |
| Roof (poles, mats, spouts, roof room) | 3.9k | 13.3k |
| Details (lanterns, cable, props, decals) | 6.1k | 10.4k |
| Spice-shop interior | 34.9k | 93.7k |
| Street frontage test | 24.7k | 149k |
| **Total** | **103k** | **873k** |

- **Materials and objects:** 26 materials and 115 objects. Every material is procedural (node graphs, no image files).
- **Biggest single costs:**
  - Wall subdivision and displacement: 479k tris.
  - Gate studs: 385 domes, 15.6k tris.
  - Pavers as individual bevelled stones: 109k tris.
  - Sack subdivision: 58k tris.

None of these figures can ship as they are. They exist for the beauty renders and as the bake source.

## 2. Game-ready LOD0 target (closer than about 15 m)

| Item | Budget |
| --- | --- |
| Building shell + mouldings + lintels + poles + spouts + roof room | 6–8k tris |
| Gate (frame, planks as one slab per leaf with real gaps, middle rail, bands, 2 knockers) | 1.2k tris |
| Shopfronts (leaves, frames, hasp) | 1.0k tris |
| Windows (frames, square bars, 2 leaves each) | 1.2k tris |
| Lanterns ×2, canopy, cable, stools, jar, broom | 1.5k tris |
| Spice-shop interior (only while the player is within about 12 m) | 2.5k tris |
| **LOD0 total** | **about 14–16k tris** |
| Draw calls | **3**: opaque atlas, interior atlas, alpha-blended decals/glass |
| Textures | 2 × 1024² (albedo+roughness in A, normal+AO), mobile-compressed (KTX2/Basis; WebP fallback) |

The street does not need its stones as geometry. It becomes one ground mesh (about 50 tris) with a tiling paver texture plus a medallion decal. The drain is a strip mesh with an alpha-tested grate (about 20 tris).

## 3. LOD1 and LOD2 strategy

- **LOD1 (about 15–40 m), about 3k tris, 1 draw call**
  - Keep the silhouette and the depth of the openings: reveals become 20 cm insets, not the full 55 cm.
  - Pole ends become 6-sided stubs. Window bars and studs are removed (they are in the normal map). Lanterns become 2 crossed cards.
  - The interior is replaced by a single back-plane card showing the baked view of the shop. This is a cheap "interior card", so the opening never looks empty.
- **LOD2 (40 m+), about 300–500 tris**
  - A box with the parapet line, the roof-room block and the canopy as one quad.
  - The whole facade becomes one baked texture: colour + normal, 512².
  - At this distance the building is mostly an impostor of itself.
- **Switching:** the three LODs are swapped with `THREE.LOD`. The game already culls by distance in `updateNPCs`; the same hook can call `lod.update(camera)` only on buildings in the active zone.

## 4. Bake vs keep as geometry

**Bake (high → low, Cycles):**
- Plaster: colour, roughness, normal (lumps, trowel marks, cracks, pinholes, chipped arrises) and AO.
- Drip, rust and pole-stain decals: bake them into the plaster albedo, so they cost 0 draw calls.
- Gate: studs, plank gaps, grain, edge wear and the wicket outline go to normal + albedo. The geometry keeps only the leaves, middle rail, bands and knockers.
- Shutter panels on LOD1/LOD2.
- Paver bevels and joints: a tiling texture.
- Sacks and spice heaps: the subdivided folds become a normal map on a 200-tri sack.
- Ambient occlusion for the whole building, in a second UV set or packed in the normal map's alpha.
- Lighting: AO only, not full lightmaps, because the game has a day/night cycle and lightmaps would lock the time of day. Lantern light pools at night become an emissive decal on the wall and ground.

**Keep as real geometry (it shows in silhouette or parallax at eye level):**
- Wall thickness and reveals.
- Lintels proud of the wall, the string course, the sills and the coping.
- Pole ends and rain spouts. These are the strongest Kuwaiti cue at street level.
- Gate leaves, middle rail, iron bands, and the knocker rings (8 segments).
- The window bars as real 4-sided bars, because alpha cards shimmer on phones.
- Canopy poles and struts.
- Platforms, lanterns (low-poly) and the water jar.

**Instance, don't copy:** pole ends, sacks, jars, lanterns and stools use `InstancedMesh` (1 draw call per prop type per zone).

## 5. What can be atlased later (shared by every souq building)

- **Souq trim sheet, 1024²:**
  - a seamless plaster tile in two tones;
  - a strip of plaster moulding, a strip of lintel timber and a strip of pole bark with end grain;
  - an iron strip, a painted-wood strip in teal and brown, and a 2×2 m paver tile.
- **Per-building unique sheet, 1024² or 512²:** only the baked AO/dirt and the unique pieces (that building's gate, its sign, its shop interior card).
- **Props atlas, shared:** sacks, spices, jars, baskets, loomi, brass, terracotta.

With the shared sheets, 20 buildings cost about 2 shared + 20 small unique textures, instead of 40 large ones. That keeps the whole souq download under about 10 MB.

## 6. Engine changes needed before integration (Phase 6, after approval)

- `glbLoad` currently reads one mesh / one primitive / one material and no byte stride. It needs to read multi-primitive GLBs, or we ship one GLB per material (3 per building).
- KTX2 needs `KTX2Loader` and the Basis transcoder. Both are free and can be hosted on GitHub Pages next to the game.
- Collision: 10–12 boxes per building through the existing `addBox` (walls, platforms, water jar, stools). No mesh collision.
- Night: at most 2 real-time point lights near the player, chosen dynamically. Every other lantern is emissive + a baked light-pool decal.

## 7. How to verify before release

- Load the LOD0 GLB in the real game on a mid-range Android phone and an iPhone, through raw.githack on the test branch.
- **Targets:**
  - 60 fps when idle and ≥ 45 fps while walking past the building;
  - GPU memory < 40 MB for the zone;
  - first load of the building < 1.5 MB over the network.
- Compare a game screenshot against `qc/` renders at the same camera.
