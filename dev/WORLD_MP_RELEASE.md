# Real multiplayer open world — 2026-10-13

Base: `main` 0b31092 (verified voice release). Branch: `feat/world-multiplayer`. Module: `dev/world_mp.js`, embedded exactly in `index.html` after `voiceInstall()`.

## Behavior

- **Channels.** Each country has channels 1–10 with 8 authenticated seats (`worlds/{country}_{n}/seats/{0-7}`), aligned with the existing voice channels. Players auto-join their saved channel (next free one if full). The 🏳 «العالم» button shows the live count, the real players, per-channel occupancy, a WhatsApp invite link (`#world=kw-3`), «صوت القناة», reconnect and «إخفاء نفسي».
- **Real players only.** A seat needs a registered, unbanned account and its reserved name (`names/{key}`). Avatars are built only from authenticated seats; NPCs stay NPCs and are never counted or labelled as players. Real players have a gold name tag with a green dot; tapping it, tapping the character or using the main action button near them opens their card.
- **One character per account.** `worldUsers/{uid}` points to the only live seat. Opening the account on a second phone replaces the first; the old phone stops and does not fight back until the user presses «دخول العالم».
- **Movement.** Position, rotation and state (idle/walk/run/sit/wave/match) travel over direct WebRTC data channels (unordered, no retransmits): 10 packets/s while moving, 1/s idle, ~35 bytes each. Receivers validate every packet, clamp to the world, interpolate 140 ms behind, extrapolate ≤250 ms and snap on teleports. No Firestore write is made for movement while direct channels are open.
- **Fallback.** If a direct channel cannot open (restrictive NAT, no TURN), the seat document carries the pose: at most one write per 3 s, only after moving ≥0.4 m (rules enforce ≥2 s). Others walk the avatar toward it.
- **Leave/disconnect.** Leaving sends a goodbye packet and deletes the seat → instant removal. A dropped phone's direct channel closes → hidden after 4 s. Abandoned seats expire after 70 s (25 s heartbeat). Hidden tab/offline/lobby/travel/account change/ban stop the session; returning reconnects automatically.
- **Challenges.** «تحدي دامة» creates a real waiting room (existing v25 room protocol) and one `worldChallenges/{from}` invitation. The friend gets a banner (قبول/رفض, 30 s). Accepting joins exactly that challenger's room; both sit on the same table (host +axis seat, guest opposite) and the opponent body uses the friend's real look. The existing online engine validates every move. After the match both return to the open world with saves unchanged. Busy players auto-decline.
- **Voice.** No new voice system. World voice still stops when a match begins; match voice remains the existing private two-seat channel (opt-in). After a challenge match the game *asks* to rejoin world voice listen-only; the microphone is never opened by this module.
- **Results.** Rules now allow claiming a win only right after your own last move, and a resignation only for the opponent. Clients replay the server moves and do not record a loss the board does not support.

## Free-tier limits (Firebase Spark, no Blaze)

- Movement over direct channels costs no Firebase quota. Per player: ~144 heartbeat writes/hour (+1 rules read each), seat-list reads by the other 7 players, and a few signaling writes per pair when connecting.
- Six friends together for 1 hour with direct connections: ≈1,000 writes and ≈6,000 reads. Spark's 20,000 writes / 50,000 reads per day allow roughly **8 such hours per day**, shared with saves, chat and voice. Fallback mode adds up to 1,200 writes/hour per moving player, so heavy fallback shortens that.
- Hard cap 8 per channel; 10 channels × 5 countries. Practical: 6–8 friends in one channel on mid-range phones (≤7 data channels + ≤7 voice connections each).
- No TURN relay (paid). Peer pairs that cannot connect directly still see each other through the slower fallback.

## Verification

- `node dev/tests/run.cjs`: existing 236 + 23 world client checks (exact embedding, look whitelist, packet validation, ordering, interpolation, teleport snap, send-rate caps, fallback throttling, heartbeat, duplicate account, visibility rules, NPC exclusion, invitation validation, busy auto-decline, forged result rejection, mic never opened, cleanup).
- `npm test --prefix dev/firebase` (emulator): existing 194 + 24 world rules checks (shipped claim transaction, impersonation, other-uid/guest/banned, seat theft, stale tabs, 2 s write limit, bounds/whitelists, 8-seat cap, lease reuse, single pointer, private signaling, blocks, challenge creation/answer/expiry/throttle, result rules) + `test_world_sync.cjs`: six independent Firebase clients with real native WebRTC data channels (`@roamhq/wrtc`): 5-player full mesh, movement with zero Firestore pose writes, sit state, a 6th WebRTC-less player via fallback both ways, clean leave, abrupt drop, rejoin without duplicates, same-account replacement, full challenge→accept→room join, decline→room deletion.
- **Not verified:** physical phones, Safari/Chrome on iOS/Android, WebGL rendering of avatars/labels, mobile-carrier NAT success rate, real frame rate. This environment cannot reach the CDN, Firebase or GitHub Pages from a browser.

## Deployment order

1. Publish the complete root `firestore.rules` (Firestore → Rules). It contains all previous rules unchanged except the stricter `rooms` result check, plus the new `worldUsers`, `worlds`, `worldChallenges` sections.
2. Merge this PR (GitHub Pages deploys `main`). Old tabs must reload.
