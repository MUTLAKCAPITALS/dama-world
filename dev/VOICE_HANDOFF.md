# DAMA WORLD voice — released checkpoint

Repository: MUTLAKCAPITALS/dama-world. Working branch: feat/real-world-match-voice.
User authorized implementation and publication after verification. Keep Firebase Spark and GitHub Pages only: never activate billing, Blaze, paid TURN or other paid services. Preserve accounts, saves and online play. Reply in concise Kuwaiti Arabic.

## Completed release — 2026-10-13

- The original patch from checkpoint 464eeb9e1770e88a521428e9bbaf87d3db29dee7 was applied, reviewed and released. DO NOT apply it again or restart the implementation.
- PR10 merged: https://github.com/MUTLAKCAPITALS/dama-world/pull/10
- Production merge commit: 0b31092ee34a020e493b6d6939d67f8fcd1dd147.
- Final tested PR head: 0e15cf336de315b84be440b51b21cd06e8a43250.
- Final required CI succeeded: https://github.com/MUTLAKCAPITALS/dama-world/actions/runs/38388083159
- GitHub Pages build AND deploy succeeded for the production merge commit: https://github.com/MUTLAKCAPITALS/dama-world/actions/runs/38388253111
- Complete firestore.rules was published in the existing dama-world Firebase console at 14:06 Asia/Kuwait. A reload and full editor copy confirmed exact equality to the tested 26,767-character file (Git blob 270a867d51ed7049b003e2b48ecdd53c181b58f1).
- All pre-existing non-voice rules matched the production editor and were preserved. No account/save/player data was reset, no billing/service upgrades occurred.
- The saved patch artifact was removed from the implementation tree; its original commit remains recoverable.
- This branch's post-merge change only records final release evidence in this document. No application code remains undeployed.

## Live URLs, opened after deployment

Game: https://mutlakcapitals.github.io/dama-world/?v=0b31092
Owner panel: https://mutlakcapitals.github.io/dama-world/admin.html?v=0b31092
Complete deployed rules: https://github.com/MUTLAKCAPITALS/dama-world/blob/0b31092ee34a020e493b6d6939d67f8fcd1dd147/firestore.rules

## Verification completed

430 automated checks passed in final GitHub Actions:
- 236 frontend checks, including existing account/save/online regressions and 19 voice checks.
- 184 Firestore emulator checks: 67 general, 52 social, 41 community, 24 voice.
- 10 real native libwebrtc media checks with synthetic PCM and independent emulator clients: initial listening with capture closed, bidirectional world audio, three-player mesh, microphone-off silence, replaceTrack reopen, owner mute playback suppression, full world cleanup, private match bidirectional audio, opponent speaker mute and background cleanup.
- The owner panel was opened after release. Its first auth attempt showed Failed to fetch; one retry succeeded and the real dashboard, player list and aggregate counts loaded. No player moderation/settings were changed for testing.
- The earlier local native test produced zero ICE candidates. That failed local attempt is not counted as passed; successful media evidence comes from GitHub Actions.

## Remaining acceptance — do not claim completed

- The cloud game reached the published page but THREE.WebGLRenderer could not create a WebGL context, so gameplay/world voice UI could not be exercised there.
- Two separately signed-in physical browsers/devices and actual microphones have NOT been tested.
- Safari microphone permission/autoplay, mobile networks and speaker echo remain manual acceptance.
- Native synthetic PCM tests prove media transport in CI, not compatibility across all real devices/networks.
- Direct STUN-only WebRTC can fail on restrictive networks. No paid TURN relay was enabled.

## Implemented behavior

- Opt-in world channel audio in the same country/channel (1–10), max eight registered players. Not proximity audio or synchronized human movement.
- Human online matches use a private host/guest channel bound to room and match ID.
- Microphone starts OFF. Joining initially listens; explicit microphone click requests permission. Muting stops tracks; reopening uses replaceTrack.
- One owned voice session; no world/match audio overlap. Cleanup on exit, account/country change, hiding, offline and WebGL loss, plus a 90-second server-timed seat lease.
- Real connection status, local mute/block, report and owner mute/ban. Firebase stores authenticated signaling only; WebRTC transports audio.
- Ask testers to reload both players, enter the same country/channel, join listening and explicitly open their microphones.

## If work continues

Start from current GitHub main or inspect this branch's latest handoff. Production release is already complete; do not repeat the original deployment or reapply its patch.
The remaining meaningful task is real-device acceptance and fixes for reproducible failures found there.
Local working snapshot: /workspace/scratch/e712d1f439da/dama-world (may expire; GitHub is authoritative).
