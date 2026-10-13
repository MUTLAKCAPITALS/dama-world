# DAMA WORLD voice — continuation checkpoint

Repository: MUTLAKCAPITALS/dama-world. Branch: feat/real-world-match-voice.
User authorized implementation and publication after verification. Use free Firebase Spark and GitHub Pages only; never enable billing, Blaze, paid TURN or other paid services. Preserve accounts, saves and online play. Reply in concise Kuwaiti Arabic.

## Current state

- The saved patch from checkpoint 464eeb9e1770e88a521428e9bbaf87d3db29dee7 has been applied and inspected. Do not apply it again or restart the implementation.
- The original patch remains recoverable from that checkpoint commit. The patch artifact is removed from the implementation tree.
- Base production release was 7faf31fb85ae6bb86e3cd88eb4972ece506906fc (PR9 community release).
- Voice is implemented in dev/voice.js and embedded exactly in index.html. Complete rules are in firestore.rules; owner moderation is in admin.html.
- Voice is NOT DEPLOYED until complete rules publication and successful main/Pages deployment are explicitly recorded below.
- Current working copy: /workspace/scratch/e712d1f439da/dama-world. Local files may expire; GitHub is authoritative.

## Verification

- 236 frontend checks passed after restoring and applying the exact checkpoint patch.
- 184 Firestore emulator checks passed: 67 existing rules, 52 social, 41 community, 24 voice.
- Required native media suite dev/firebase/test_voice_media.cjs uses @roamhq/wrtc 0.10.0, independent Firebase emulator clients, synthetic PCM sources and decoded sinks. It must pass in existing GitHub Actions CI (Node22/Java21) before release.
- The earlier local native media attempt produced zero ICE candidates even in a minimal standalone PC; it was NOT a pass. Do not weaken or bypass the required media suite.
- Native media is not physical browser acceptance. Two real separately signed-in browsers/devices, Safari permission/autoplay, mobile networks, speaker echo and the 3D UI have not been verified. Earlier cloud Chrome could not initialize WebGL.

## Voice behavior

- Opt-in world channel audio: same country/channel 1–10, max eight registered players. This is not proximity audio or synchronized human world movement.
- Human matches use a private two-seat channel bound to room and match ID, host and guest only.
- Microphone starts OFF and requires explicit getUserMedia permission. Muting stops tracks; reopening uses replaceTrack.
- One voice session per account, world/match isolation, cleanup on exit, account/country change, hiding, offline and WebGL loss; server-timed 90-second lease.
- Real connection status, local mute/block, report, owner mute/ban. Firebase stores authenticated signaling only; direct STUN-only WebRTC carries audio. Restrictive networks may fail without TURN; no paid relay was added.

## Remaining release steps

1. Run the implementation PR through full GitHub Actions CI, including actual decoded media. Fix concrete failures and retain existing regression coverage.
2. Publish complete tested firestore.rules using the existing Firebase owner console session. Do not expose credentials.
3. Merge after CI succeeds, verify GitHub Pages publishes the same source, and inspect game/owner panel.
4. Record exact run/commit/deployment evidence and any remaining real-device limitations. Provide current game link and complete rules source.
