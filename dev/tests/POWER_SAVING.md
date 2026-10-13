# Device-local power saving

This update continues from the published free-plan release `3b8217c08c0dc29ceb5e843dfb8963121f9c4c01`. It adds no service, dependency, billing, or production-data migration.

## Behavior

- Power saving defaults on for phones and off for desktop devices, using the existing touch/screen-size classification. The graphics settings include an accessible on/off control. The preference is stored on this device as `damaworld.powerSave.v1`, separately from account progress.
- The effective saving preset disables realtime shadows, postprocessing and grass instances. The account's selected quality is preserved and restored when saving is disabled. Automatic quality fallback does not overwrite that choice while saving is enabled.
- Main phone rendering retains its 30 FPS limit and existing low-quality pixel ratio cap of 0.75. The separate video-lobby renderer now caps its pixel ratio at 1 in saving mode instead of 2. Text and controls retain their CSS resolution. The phone renderer requests the browser's low-power GPU preference; this is a hint, not a temperature guarantee.
- While a ready video or loaded poster completely covers the lobby world, saving mode skips the hidden world's NPCs, spectators, cars, environmental animations, character animation, culling and main scene draw. The visible lobby renderer and music continue. A missing/failed cover immediately falls back to the full scene. Matches, transitions and the wardrobe are excluded from this optimization.
- After 1.5 seconds without gameplay animation, a quiet match renders at 10 FPS in saving mode. A moving stone, busy turn, camera transition, capture effect or camera shake restores the active rate. Idle detection uses elapsed time rather than repeatedly adding time since the last rendered frame.
- Hidden pages and lost WebGL contexts continue to skip main rendering. The lobby's video decoders now pause when hidden and resume only the background plus the currently required character clips. A late play promise cannot restart a decoder while the page is hidden.

## Verification

```sh
node dev/tests/run.cjs
npm test --prefix dev/firebase
```

The rendering suite exercises the actual shipped functions with simulated 120 Hz display callbacks, world-work counters and video elements. It checks defaults and stored overrides, untouched account quality, settings controls, disabled effects, fallback visibility, idle/moving frame rates, one scheduled main callback, elapsed quick-match clocks, and hidden/resumed/failed video playback.

Expected totals: 109 existing game checks, 22 free-usage checks, 26 power-saving checks and 67 Firestore emulator checks = 224 checks. The existing GitHub workflow repeats the suites on Node 22 and Java 21. Firebase configuration, access rules, save synchronization, move protocol, heartbeat timing and voice signaling are unchanged.

These checks measure code paths and simulated scheduling, not phone temperature or battery life. Real-device WebGL, multiplayer and voice remain to be verified. Compare the old and new versions on the same phone with the same brightness, charging state and scene for a meaningful device result; do not infer a percentage temperature reduction from the render counters.

References:

- https://threejs.org/manual/pages/responsive.html
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
