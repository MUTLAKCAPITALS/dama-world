# Continue DAMA WORLD real voice work

User: Mutlaq (Kuwait). Free Firebase Spark and GitHub Pages only. Do not activate billing or Blaze. Reply in concise Kuwaiti Arabic. User has authorized implementation and publication after verification.

## Durable checkpoint
- Repository: MUTLAKCAPITALS/dama-world.
- Branch: feat/real-world-match-voice.
- Checkpoint commit containing the complete patch: 464eeb9e1770e88a521428e9bbaf87d3db29dee7.
- Patch: dev/voice-work-in-progress.patch.
- Base/main at checkpoint: 7faf31fb85ae6bb86e3cd88eb4972ece506906fc (PR9 community release).
- **The new voice implementation is NOT DEPLOYED.** The branch currently contains a patch checkpoint, not the applied code. Apply the patch on a checkout of the base/branch (git apply --check first), then inspect changes. Keep this checkpoint file and remove the patch artifact from the final implementation PR if appropriate.
- Do not resend/recreate the patch; it contains all 13 changed/new files, including index.html, owner panel, full Firestore rules, native voice module, tests and package lock.
- Original working directory: /workspace/scratch/2124bac2e516/dama-world-voice. Local progress JSON: /workspace/scratch/2124bac2e516/game-checkpoint.json. These may not survive a new chat; use GitHub checkpoint.

## Requested voice behavior and implementation
Real opt-in voice in the open world and human online matches. World channels 1–10 per country, maximum 8 registered players per channel; explicitly channel audio, not proximity or synchronized human world movement. Match private channel, only host+guest bound to match ID. Microphone starts OFF and needs explicit click, real getUserMedia + WebRTC, replaceTrack reopening, real connection status, report, block/local mute, owner mute/ban, immediate track cleanup and lease expiration.
World and match share one session, with no audio leaking between them. Existing accounts, saves, online matches, community and owner panel must keep working.
Complete new Firestore rules must be published before game deployment. User previously authorized doing this; no need to ask repeatedly.

## Verification reached
- 236 frontend checks passed locally (217 prior +19 voice).
- 182 rules checks passed locally (160 prior +22 voice). Two extra rules tests were added afterward, so planned rules count is 184; rerun those.
- Native test dependency @roamhq/wrtc@0.10.0 is test-only and pinned in dev/firebase/package.json and package-lock.json.
- New required suite dev/firebase/test_voice_media.cjs uses real native libwebrtc PCs, independent Firebase emulator clients and generated PCM (not microphones), proving decoded audio if successful. Planned checks: two-way world audio, three-player mesh, microphone-off silence, reopen, owner mute, cleanup, private match audio and background exit.
- That native test FAILED LOCALLY because this environment produced zero ICE candidates, even for a minimal standalone RTC PC on Node 22.17.0 and Node24. Do not claim it passed. The last test diagnostic showed both PCs with local/remote offer/answer present, ICE gathering complete, zero received candidates, connectionState new.
- A cleanup-only native segmentation fault was encountered too; the test now uses a one-shot cleanup guard, a brief drain and explicit process.exit.
- Run required media suite in existing GitHub Actions CI (Node22/Java21). Existing .github/workflows/free-verification.yml runs npm ci --prefix dev/firebase and npm test --prefix dev/firebase; suites.cjs now includes media checks. Do not merge/deploy until it passes or a concrete implementation issue is fixed.
- Native PCM/emulator checks DO NOT satisfy the user's earlier request for two real browser accounts on two different browsers. Only one cloud Chrome was available, and the 3D game could not initialize WebGL. This limitation remains. Be honest about device/browser verification and direct STUN-only connectivity; no paid TURN service was added.

## Next steps
1. Restore/apply patch and inspect it; rerun frontend and rules.
2. Commit applied source to feat/real-world-match-voice, open a PR to main, require full CI including native media. Debug genuine failures, preserve all existing tests.
3. Publish the tested complete firestore.rules through existing Firebase console owner session. Do not expose login secrets. Old rules are PR9.
4. Merge only after successful CI and verify Pages deployment and owner panel. Explain actual world channel usage and match voice, and remaining real-device acceptance limits.
5. Send the complete rules file and exact current game link. Never claim everything fully tested if the two-browser test is still pending.

Prior live URLs (PR9, no new voice yet):
https://mutlakcapitals.github.io/dama-world/?v=7faf31f
https://mutlakcapitals.github.io/dama-world/admin.html?v=7faf31f
