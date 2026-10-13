# DAMA WORLD voice — continuation checkpoint

Repository: MUTLAKCAPITALS/dama-world. Branch: feat/real-world-match-voice.
User authorized implementation and publication after verification. Use free Firebase Spark and GitHub Pages only; never enable billing, Blaze, paid TURN or other paid services. Preserve accounts, saves and online play. Reply in concise Kuwaiti Arabic.

## Current state

- The saved patch from checkpoint 464eeb9e1770e88a521428e9bbaf87d3db29dee7 has been applied and inspected. Do not apply it again or restart the implementation.
- The original patch remains recoverable from that checkpoint commit. The patch artifact is removed from the implementation tree.
- Base production release was 7faf31fb85ae6bb86e3cd88eb4972ece506906fc (PR9 community release).
- Voice is implemented in dev/voice.js and embedded exactly in index.html. Complete rules are in firestore.rules; owner moderation is in admin.html.
- Full CI passed for implementation ad3c9fb6395fb9a3e55b72963a0173af19f02fdf: https://github.com/MUTLAKCAPITALS/dama-world/actions/runs/38387664700 . All 430 checks passed (236 frontend, 184 rules, 10 native media).
- Complete rules were published in the existing dama-world Firebase console at 2026-10-13 14:06 Asia/Kuwait, before game deployment. The old rules matched the tested base exactly; only the voice rules were added.
- Release PR: https://github.com/MUTLAKCAPITALS/dama-world/pull/10 . Read its current merge state and the matching Pages run before reporting game deployment. Do not assume it is unmerged from this pre-merge checkpoint.
- Current working copy: /workspace/scratch/e712d1f439da/dama-world. Local files may expire; GitHub is authoritative.

## Verification

- 236 frontend checks passed after restoring and applying the exact checkpoint patch.
- 184 Firestore emulator checks passed: 67 existing rules, 52 social, 41 community, 24 voice.
- Required native media suite dev/firebase/test_voice_media.cjs uses @roamhq/wrtc 0.10.0, independent Firebase emulator clients, synthetic PCM sources and decoded sinks. It passed all 10 native media checks in GitHub Actions (Node22/Java21), including two-way world audio, three-player mesh, mic-off silence, reopen, moderation, cleanup and private-match media.
- The earlier local native media attempt produced zero ICE candidates even in a minimal standalone PC; it was NOT a pass. Do not weaken or bypass the required media suite.
- Native media is not physical browser acceptance. Two real separately signed-in browsers/devices, Safari permission/autoplay, mobile networks, speaker echo and the 3D UI have not been verified. Earlier cloud Chrome could not initialize WebGL.

## Voice behavior

- Opt-in world channel audio: same country/channel 1–10, max eight registered players. This is not proximity audio or synchronized human world movement.
- Human matches use a private two-seat channel bound to room and match ID, host and guest only.
- Microphone starts OFF and requires explicit getUserMedia permission. Muting stops tracks; reopening uses replaceTrack.
- One voice session per account, world/match isolation, cleanup on exit, account/country change, hiding, offline and WebGL loss; server-timed 90-second lease.
- Real connection status, local mute/block, report, owner mute/ban. Firebase stores authenticated signaling only; direct STUN-only WebRTC carries audio. Restrictive networks may fail without TURN; no paid relay was added.

## Remaining release steps

1. Full implementation CI and complete rules publication are done. No application code changed after the successful run.
2. Merge PR10 once its current CI is green (the evidence-only documentation update reruns CI), then verify its Pages deployment and inspect the live game/owner panel.
3. If PR10 is already merged and Pages successful, continue from that release; do not republish or reapply the original patch unnecessarily.
4. Two real devices/browsers still require manual acceptance. Provide the live game link and complete rules source, without claiming device acceptance.
