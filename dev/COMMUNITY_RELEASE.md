# Real community release — 2026-10-13

## Behavior

- World and clan messages are written by registered Firebase users, ordered by server timestamp, and watched with one latest-50 query per subscribed channel. Synthetic lines and automated replies are removed.
- Public/clan text is 1–200 Unicode code points, filtered against the existing Arabic/English word list, with an additional normalized check in Firestore rules. The filter is a word filter, not complete semantic moderation; reporting remains available.
- A transaction binds each message to its sender's reserved, normalized name and to a server-enforced 3-second per-user cooldown. Sent messages are immutable; only the verified owner can delete them. Admin mute/ban prevents sends.
- Each message has report and block controls. Reports contain the actual message evidence and appear in the owner's reports tab. The owner's new chat tab watches the latest 50 messages and deletes selected messages. Reports can delete older messages directly.
- Friend search resolves the complete registered name. Requests require recipient acceptance. WhatsApp invitations open a compose link with the registered name; opening a link never automatically sends or accepts a request.
- Presence uses server timestamps, a foreground heartbeat and a 180-second cutoff, with the existing visibility preference. Unknown activity is shown as unknown, never randomly online. Only accepted friends may read a player's presence.
- A new account has no friends or requests. Guests see “سجّل عشان تضيف ربعك”. Empty friends show “ادعُ ربعك بالواتساب”. Empty chat shows “كن أول من يكتب 👋”. Badges count received unblocked messages or incoming requests, never fabricated numbers.
- A clan contains only registered users who join for themselves. Creation starts with the founder alone, is free, and has a maximum of 50 members. There are no generated member names or team rankings. A user can belong to one clan at a time.
- NPCs remain in the world and tournaments. Simulated social invitations, profile visits/likes and mutual-friend metrics are removed. The old simulated private-room shortcut now leads through the existing real online flow.
- Private-message drafts survive failed sends and reopening during the current session. Late privacy reads cannot overwrite a newer explicit choice. Community subscriptions and drafts are isolated on account changes, and listeners pause in the background/offline.

## Deployment

Publish the complete root `firestore.rules` file in Firestore → Rules, then deploy this source revision. It includes the existing saves, account/name reservations, owner controls, online rooms and voice rules; do not paste only the new community sections. No paid services, billing changes, Cloud Functions or new packages are required.

Firebase Spark quotas still apply. Queries are bounded and background listeners are detached; this release does not claim unlimited free capacity. Old game tabs should reload to use the new community client.

## Verified automatically

- `node dev/tests/run.cjs`: 217 checks (entry 36, guest 23, save 12, reliability 42, free usage 22, power 26, mobile 10, friends 22, community 24).
- `node dev/firebase/run.cjs`: 160 checks against the loopback Firestore emulator (existing rules 67, friends 52, community 41).
- Community integration tests use two independent Firebase clients and the shipped transaction functions. They verify live delivery, independent cooldowns, concurrent writes, reserved-name spoof rejection, ban/mute enforcement, immutable messages, owner-only deletion, exact reports, block lists, private presence, self-owned clan membership and concurrent join isolation.
- Frontend checks cover script parsing, exact source embedding, stale callbacks, draft retries, account switches, server confirmation, unread counts, escaping, presence expiration, invitation links and old-message moderation.

## Required browser acceptance — NOT YET RUN

The available automation environment exposes one Chrome browser. Two independent emulator clients are **not** two browsers. The live WebGL game has not been verified with two separately signed-in browser sessions. This release must not be described as fully browser-tested until the following steps have been completed:

1. Browser A and Browser B: use two registered accounts with distinct reserved names. Check that a new account has zero friends, requests and fabricated messages.
2. Send a world message A→B and B→A. Check the latest-50 order, empty state, 1/200-character boundaries, rejection of 201 characters, profanity filtering and a second send inside 3 seconds.
3. Search by complete name, send a request, confirm that it stays pending, then decline and separately accept. Check that no NPC appears. Open a WhatsApp invite without automatic acceptance.
4. Leave a player visible/active, hide or close that browser for over three minutes, then return. Check online/offline/unknown states and the privacy toggle.
5. Block the other player. Confirm their world/clan messages disappear and requests cannot be sent. Unblock must not automatically restore friendship.
6. Create a clan in A, then explicitly join from B. Check real member names, clan messages, leaving and revoked access.
7. Report a real test message. In the owner panel, verify its evidence. Apply mute and ban and verify sending is refused. Delete a message using owner controls and verify removal in both browsers.
8. Go offline during a pending message, close/reopen chat, reconnect and retry. Confirm the draft survives and the same attempt does not duplicate. Sign out and switch accounts; no previous-account draft should appear.
9. Recheck existing login/save restoration, a complete online match, voice and owner controls. In mobile landscape check the keyboard, scrolling, three-dot menu and pinned match-result buttons.

Use only consenting test accounts. Do not remove real messages or alter real player moderation for a test.
