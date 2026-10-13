# Street test: one Mubarakiya alley, three buildings

This test is built in Blender from scripts only: `scripts/street.py`, called through `run.rebuild_street()`. The approved hero building is untouched; its old ground test is hidden, not deleted.

## Layout (metres, Blender axes)
- **Alley:** runs along X. Its north facade line is at y = 0 and its south facade line at y = −7, so it is 7 m wide.
- **North side:**
  - The **hero building** (approved), x −5.75…5.75.
  - **Building B**, x 5.75…15.05. It is a single-storey arcade (riwaq) of three pointed arches, with a covered walkway 2 m deep. Behind the walkway are glazed timber shopfronts: dates (تمور), textiles (أقمشة) and perfume and incense (عطور وبخور).
- **South side:** **Building C**, x −6…14, in two parts.
  - **C1** is a two-storey merchant house in ochre plaster. It has a projecting timber roshan on corbels, two glazed shops (ذهب ومجوهرات / دهن العود) and a studded house door with a plaster surround.
  - **C2** is a single-storey row of four small shops with folding plank doors in different paints: brassware, a tailor, textiles and rope. Two are open with interiors and two are closed.
- **Ends:** covered passages (سباط) through a plain plaster block at each end, so the alley reads as part of a larger souq. These blocks are backdrop only.
- **Over the alley:** a timber pergola carried on corbelled ledgers on the north facades and on posts on the south side, 0.8 m from the shops.
  - Cross beams every 2.25 m, battens every 0.42 m and diagonal braces.
  - Hanging lanterns on the centreline and a hanging wayfinding board (سوق التمر).
- **Ground (designed, not random):**
  - grey 40 cm squares on one grid, aligned to the hero gate (x = 0);
  - beige 60×40 bands along both facades;
  - beige cross bands at every pergola post;
  - circular medallions on the centreline at x = 0 and x = 9;
  - slot drains under both roof edges.
  - Each stone varies only about ±5% in tone.

## Player movement and the third-person camera
- **Clear walking lane:** about 5.2 m wide, between the south posts and the north facade band, with nothing in it. Benches, planters, stools and goods stay within 1.1 m of the facades.
- **Headroom under the pergola:** 4.4 m. A camera boom of 2.5–3 m behind and above the player stays under the beams.
- **Bays:** 4.5 m between posts. That is wide enough for two players to pass a third.
- **Shop sills:** 20–35 cm, readable as steps. In the game, shop interiors are not entered for now; their openings get a collision box.
- **Collision when integrated (not done now):**
  - one box per building;
  - posts 0.16 m square;
  - planters 1.1 m;
  - benches as boxes;
  - the medallions are flush, so they need no collision.

## Browser notes: estimates only, not measured
- The ground should become one plane with a tiling paver texture plus medallion decals, instead of about 1,000 separate stones.
- The pergola is about 60 thin boxes, which should be one merged mesh or an InstancedMesh per piece type.
- Each building would get the same LOD / bake plan as the hero building (see `PERFORMANCE.md`).
- These are targets to test later in the real game. No performance result here is proven yet.

## Render speed (measured in Blender on the RTX 3050)
- **GPU OptiX:** after Blender was restarted, Cycles had fallen back to CPU because the GPU setting had not been saved in the preferences. It is now saved.
- **Persistent Data:** on/off made no difference (41 s vs 40 s), because the time is spent shading, not loading the scene.
- **Baking the hero walls to 8K maps:** the eye-level render dropped from 42 s to 26 s, with no visible difference (PSNR 32 dB). In the plaster close-up it dropped from 42 s to 20 s, but hairline cracks and chipped edges are visibly softer.
  - **Decision:** baked maps are used for previews; finals and close-ups keep the procedural originals.
- **Presets:** `bake.preset('preview')` is 50% resolution with 32 samples, about 5–6 s per street view. `bake.preset('final')` is 100% resolution with 96 samples.
