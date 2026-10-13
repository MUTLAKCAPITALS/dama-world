# Authoritative online games and account deletion

This release is staged for review. It is not deployed or enabled on the production Firebase project. The current live release is `106bef6da04f65ee41fa308eb0f5342c35ec4814`.

## Changes

- Protocol 3 rooms accept move intents through `damaOnline`. The server checks turn order, mandatory captures, legal paths, and the canonical board before committing a move.
- Board completion, resignation, and leaving an active match settle both players in one Firestore transaction. Retried requests return the existing result and cannot issue a second reward. Canceling an empty waiting room has no result or reward.
- `competitive/{uid}` and its receipts are writable only by the server. Online ratings start at 1000 independently of untrusted legacy ratings; existing local progress is preserved. The menu and result screen label the verified online rating separately.
- `damaDeleteAccount` accepts only the authenticated caller after explicit confirmation and recent reauthentication. A retryable Firestore event worker deletes Auth, private saves, claimed names, the competitive ledger, and control data. It anonymizes shared rooms and moderation records while preserving the opponent's account. A minimal UID tombstone blocks writes from an old token.
- Account deletion remains disabled unless `cfg/backend.accountDeletion` is explicitly enabled. The owner account cannot delete itself through the game.

This does not migrate the shop, NPC rewards, or the complete legacy economy to server authority. Existing client rewards remain a compatibility mirror; the competitive ledger is the authoritative online record. App Check, collusion prevention, abandoned-match timeouts, and a complete economic migration are separate work. Actual graphics, microphone permissions, and two-device voice still require real-device verification.

## Local verification

Use Node 22 and Java 21. Dependencies are pinned in the three lockfiles:

```sh
npm ci --prefix functions
npm ci --prefix dev/firebase
npm ci --prefix dev/backend
node dev/tests/run.cjs
npm test --prefix dev/firebase
npm test --prefix dev/backend
```

The suites use demo project IDs and loopback emulators. Backend tests refuse to run against a live project. The HTTP integration uses the official Google Functions Framework with the actual exported Firebase callable wrappers and Firebase client SDK; synthetic Auth tokens are validated by the Auth emulator. The deletion event is explicitly delivered as a CloudEvent and delivered again to verify idempotency. This verifies the handler, not production Eventarc delivery or IAM.

Local results: 109 existing game checks, 61 Firestore compatibility checks, 44 backend checks, 11 client failure checks, and 11 HTTP/CloudEvent checks. Local execution used Node 24; the review workflow repeats the suites on the deployment target, Node 22. GitHub Actions has read-only repository permissions and no deployment credentials.

## Activation gate

Firebase requires a Blaze billing plan to deploy Cloud Functions. Obtain approval for usage-based billing before upgrading the project. Do not enter payment details, accept billing terms, or change the plan without that approval. Function instance limits are resource controls, not a monthly spending cap.

Before production activation:

1. Verify the exact review commit and successful Node 22 CI. Record the existing Firestore rules and `cfg/backend` values for rollback.
2. After billing approval and administrator setup, deploy from this reviewed commit to the explicit project: `npx --prefix dev/firebase firebase deploy --project dama-world --only functions:dama-backend,firestore:rules`. Confirm all three functions and the Firestore event trigger are healthy. Choose and verify administrator billing alerts separately; alerts do not stop charges.
3. Keep `cfg/backend.enabled` and `cfg/backend.accountDeletion` false while deploying. Verify the new client is live after merging the approved release and completing GitHub Pages deployment.
4. Arrange a quiet maintenance window. Drain active protocol 2 rooms and require both players to refresh before enabling protocol 3. Activation blocks legacy room writes immediately; do not switch while old matches are running.
5. Set `cfg/backend` to `{enabled: true, protocol: 3, accountDeletion: false}`. Smoke-test create, join, a legal move, reconnect, resignation, rating, and one receipt per participant using explicitly authorized test accounts. Check actual production trigger delivery with a disposable account before enabling the deletion UI.
6. Only after that disposable-account check, set `accountDeletion: true`. Monitor worker errors and pending/cleaning deletion jobs. Handler retries are safe; investigate jobs that stop progressing. Do not manually delete tombstones or restore deleted account data.

All online action calls require the protocol 3 feature flag to remain enabled during a match. Disabling it freezes existing protocol 3 rooms; coordinate maintenance and drain matches before rollback. An urgent rollback may interrupt games. If deletion is disabled, already accepted jobs must still finish.

Official deployment requirement: https://firebase.google.com/docs/functions/get-started

## Data and access

- Callable region: `us-central1`; runtime: Node 22.
- Per function: zero minimum instances, maximum two instances, concurrency 20, 256 MiB memory. The cleanup worker has a 540-second timeout; callable requests have 60 seconds.
- No production service-account key, token, player export, or browser session credential is included in the repository.
- No production player account was deleted and no production ledger was changed during local verification.
