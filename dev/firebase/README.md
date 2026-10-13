# Firebase rules verification — 2026-10-13

The rules were inspected in the existing `dama-world` Firebase project. Email/password, Google, anonymous authentication, and the `mutlakcapitals.github.io` authorized domain were already enabled. Those settings were not changed.

## Changes

- A player's `users/{uid}` document contains a complete save. Only that player and the verified administrator may read it.
- An existing name reservation can be updated by its owner without changing ownership. This fixes reusing the same normalized name with different display capitalization.
- Rooms require a registered, unbanned player. An invitee may read a waiting room by its code; active rooms are readable only by participants and the administrator.
- Guest-seat claims cannot replace the host or inject moves. Moves append one entry in turn, chat preserves the latest 40 messages, and each side controls its own presence and voice signals.
- Results cannot be rewritten after completion. A participant can close an active game without a reward; the host can delete only a waiting room.
- `onlHost` retries another generated code when a collision points to an active room the player cannot read.

Rules for administrator controls, public configuration, reports, and owner writes to private saves retain their prior behavior.

## Reproduce

Use Node 20 or newer and Java 17. The pinned Firebase CLI 14.22.0 supports that Java runtime. Dependencies are development-only; the browser game does not load them.

From the repository root:

```sh
npm ci --prefix dev/firebase
npm test --prefix dev/firebase
node dev/tests/run.cjs
```

The runner starts a loopback Firestore emulator for `demo-dama-world-rules`. Tests reject any emulator address other than `127.0.0.1:8181` and use synthetic identities. They do not write to the production project. Emulator logs and `node_modules` are not deliverables.

## Evidence

- Candidate rules: **61 passed, 0 failed** in the Firebase emulator, including the actual `onlHost`, `onlJoin`, `onlSend`, and `onlChat` functions extracted from `index.html`.
- Existing game suites after the client change: **109 passed**.
- The same 61 cases against the previous rules: **36 passed, 25 failed**, as expected. These are behavioral cases, not 25 independent vulnerabilities.
- Firebase Console Rules Playground reproduced the previous cross-player save-read permission and owner name-update denial. The draft reverses both outcomes. Playground requests simulate rules; they do not change player documents.

For the historical comparison, from the repository root:

```sh
RULES_FILE=dev/firebase/fixtures/rules-before-2026-10-13.rules npm test --prefix dev/firebase
```

An exit code of 1 is expected for that historical fixture. Never deploy it as the intended current policy.

## Release procedure

Deploy the client change first, then publish the exact root `firestore.rules` content to the existing default database. A GitHub Pages deployment alone does not publish Firebase rules. Confirm the active Firebase rules version and the Pages workflow for the actual commit. Update both players' browsers before creating a new room.

## Remaining limits

Rules enforce room ownership, move order, payload structure, and immutable completed results. They do **not** adjudicate board legality or prove that a claimed win is valid. Save contents, rewards, and competitive ratings still need a trusted server to resist a modified client. Safe coordinated account deletion also needs a backend and remains disabled in the game.

Actual two-device WebGL play, audio across different networks, GPU use, and long sessions have not been verified here. Voice signaling permissions pass emulator tests; that does not prove microphone or media connectivity. The existing voice setup uses STUN without TURN.

No production player data was created, edited, or deleted for these tests, and no billing plan was changed.

## Official references

- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/security/rules-fields
- https://firebase.google.com/docs/rules/simulator
- https://firebase.google.com/docs/rules/unit-tests
