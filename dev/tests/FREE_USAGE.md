# Free-plan connection and save repairs

The owner requires free services only. Do not activate billing, upgrade Firebase Spark, enroll in a paid trial, or deploy the closed Cloud Functions proposal in PR #4. This update is based on the published commit `106bef6da04f65ee41fa308eb0f5342c35ec4814` and works with its existing Firebase configuration and rules.

## Changes

- Room heartbeats allow only one outstanding request per room. Firestore write promises can stay pending offline; previously each timer tick could add another queued write. A late callback from an old room or listener cannot warn the new one.
- Visible rooms send at most one periodic heartbeat per 30 seconds instead of every 15 seconds. Hidden, known-offline, completed, and closed rooms do not send heartbeats. The 90-second stale-opponent warning, reconnect flow, and move/result validation remain in place. The timer resumes naturally when the page or connection returns. This halves periodic heartbeat traffic while both versions are visible and idle; it is not a promise to halve total Firebase use.
- An identical save already verified by the initial server read is acknowledged without rewriting the document or increasing its revision. Dirty changes, conflicts, and lost acknowledgements still use the existing transaction and backup path.
- Administrator counters use Firestore's aggregate REST endpoint, authenticated with the current Firebase user's ID token and enforced by the existing security rules. The compatibility SDK does not expose `count()`: the old fallback fetched complete collections, including private saves, to calculate their sizes. There is now no full-collection fallback, including on errors.
- The administrator page does not embed the owner's email. Access is verified by a protected server count before controls are displayed; changing the displayed email cannot bypass Firestore's existing rules. Control audit records identify the signed-in administrator by UID.
- Concurrent statistics refreshes cannot create overlapping query batches. Count requests have a 15-second abort deadline. Account changes prevent stale privileged requests or display updates. The recent-player preview remains bounded to eight documents.
- Connection and quota errors describe the actual problem without telling players to use a different app.

## Verification

```sh
node dev/tests/run.cjs
npm ci --prefix dev/firebase
npm test --prefix dev/firebase
```

The first command passes 109 existing behavior checks and 22 traffic/failure checks. The emulator passes 61 existing access-rule checks and six aggregate-count integration checks: correct totals and filters, empty counts, and denied ordinary, unauthenticated, and unverified-owner requests. Total: 198 checks.

These are local demo-project tests, with synthetic identities. No production player data is modified. Emulator calls are explicitly restricted to `127.0.0.1:8181` and a `demo-` project. The CI workflow runs the same suites on Node 22 and Java 21, has read-only repository permissions, and has no deployment credentials.

Free-plan quotas still apply. This change reduces avoidable requests; it does not remove service limits, deploy an authoritative competitive server, enable account deletion, or establish real-device WebGL/voice compatibility.

Primary references:

- https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- https://firebase.google.com/docs/firestore/use-rest-api
- https://firebase.google.com/docs/reference/js/v8/firebase.firestore.DocumentReference
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
