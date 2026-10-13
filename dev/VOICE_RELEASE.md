# Real world and match voice — 2026-10-13

## Shipped behavior

- World microphone opens a real voice panel. Players explicitly join the same country and channel (1–10). Each channel has eight authenticated seats. This is channel audio, **not positional/proximity audio**; NPC motion and world rendering are unchanged.
- An online match has a private two-seat voice channel bound to its room and match ID. Only the current host and guest may join it. Computer matches have no human microphone action.
- Joining starts in listening mode. Only an explicit microphone press calls `getUserMedia`. Saved settings cannot silently reopen capture. Muting stops hardware tracks and removes them from all senders; reopening uses `replaceTrack` without renegotiation.
- World and match voice share one owned session. Leaving, changing accounts/countries, hiding the game, losing connectivity or the WebGL context closes capture, connections, audio elements and listeners. Returning requires an explicit reconnect. A server-timed 90-second lease also expires abandoned seats.
- UI distinguishes waiting, connecting, connected, failed and permission-denied states; it never treats a microphone toggle as proof of a remote connection. It has participant names, local peer mute, report, leave and reconnect controls. Existing master/player volume controls apply to all remote streams.
- Owner mute/ban changes atomically update private moderation and a public boolean-only voice control document. Other peers suppress the affected user's playback immediately. Private moderation reasons, gifts, saves and account data remain private.
- Blocked pairs cannot exchange SDP/ICE. Only the owner of a fresh occupied seat writes that seat's outgoing signaling; only its two parties can read it. Reserved names, fixed capacities, match roles, session IDs, timestamps, query bounds and payload bounds are checked in Firestore rules.
- Signaling paths are fixed per pair and overwritten for new sessions; audio is not recorded or uploaded to Firebase. Existing room/move/save/chat schemas and legacy voice rules remain intact.

## Cost and network scope

Uses the existing Firebase Spark project, direct WebRTC and existing STUN configuration. No billing, TURN subscription, relay server or Cloud Function is enabled. Firebase's existing free quotas still apply. Networks that block direct peer connectivity can fail; the UI exposes this and permits retry rather than claiming the other person can hear.

## Verification

- Existing 217 frontend checks remain, plus 19 voice checks for opt-in capture, denied/late permissions, account changes, mute, cleanup, real state labels, transceiver negotiation and ICE ordering.
- Existing 160 Firestore checks remain, plus 24 voice rules/integration checks using independent Firebase SDK clients and the shipped claim/release functions.
- `dev/firebase/test_voice_media.cjs` uses the shipped voice engine with real native libwebrtc peer connections, Firebase emulator signaling, synthetic PCM sources and decoded audio sinks. It tests world bidirectional media, a three-player mesh, silence on microphone-off, reopen, owner mute, cleanup and private match media. It is a required CI suite, not a substitute for browser acceptance.
- The local execution environment produced **zero ICE candidates even in a minimal standalone native WebRTC test**; media could not connect there. Record the CI result before release. Do not count that local attempt as passed.
- Two separately signed-in physical browsers/devices, Safari microphone permission/autoplay, different mobile networks, speaker echo and the 3D game UI still require manual acceptance. Previous cloud Chrome could not initialize WebGL. No production players or messages are fabricated for testing.

## Deployment

Publish the complete root `firestore.rules`, then deploy the game and owner panel from the same commit. Reload both players after updating, because old tabs use the earlier match voice protocol. Native `@roamhq/wrtc` is a test-only dependency; the web game downloads no new RTC library.
