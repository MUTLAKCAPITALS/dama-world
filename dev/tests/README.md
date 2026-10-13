# Save-sync fix — tests

## The bug
`persist()` stamped `S.savedAt = Date.now()` on every save, and the game saves several times
during startup **before** `accBoot()` reads the account from Firestore. So the local copy always
looked newer than the cloud copy, and `accUpload()` overwrote a newer cloud save with an older
local one.

## The fix (`dev/v29_account.js`, built into `index.html`)

### Comparison basis that survives restarts
`S.editAt` is the time of the last **real** change to progress. It is saved with the progress, so it
is still correct after a reload. Cloud vs local compares `cloud.saveAt` with the `editAt` that was in
`localStorage` when the page loaded. Older saves without `editAt` fall back to `savedAt`.

### Startup saves vs real progress edits
`accMark()` runs on every `persist()`. It fingerprints `S` without the changing fields
(`savedAt`, `editAt`, `unsyncedDirty`):
- If nothing changed, `editAt` stays where it is.
- If something changed and the account is synced (or the player is a guest), `editAt = now`.
- If something changed while a signed-in account is **not** synced, `editAt` stays where it is
  and `unsyncedDirty` is set instead. These local edits are kept on the device. They are counted
  (`editAt = now`) only if the next successful server read shows the local copy is the newer one.

### Upload gate
`accUpload()` refuses to upload until `ACC.synced` is true. Only `accSync()` sets it, after a
successful read that came from the server.

### Read from the server, not the cache
`accSync()` uses `get({source:'server'})`. A failed read, or a snapshot with
`metadata.fromCache`, counts as a failure: nothing is uploaded and the read is retried.

### Restoring an existing account
`accAfterLogin(true)` stores the restore context (`acc.pendingRestore` = uid in `localStorage`,
plus `ACC.pendingCtx`). Retries and page reloads keep that context: the account's cloud save is
always adopted, and guest data is never uploaded over it. If the uid changes, the context is dropped.

### Adopting the cloud save
`accAdopt()` writes the cloud copy to `localStorage` and reads it back to verify. Only after
that succeeds does it record `accLoadedAt`, clear the restore context and reload.
On `QuotaExceededError` (or any write/verify failure) it does not record success, does not reload
and stays not synced (so nothing is uploaded). It shows a message that the server save is intact.
While adopting, `persist()`, `accRaw()` and `accUpload()` are blocked.

## Running the tests
`test_save_sync.py` runs the game in Chromium (Playwright) against `fbshim.js`, a local stand-in for
Firebase that keeps its data in `localStorage`. These keys switch on test conditions:

| Key | Effect |
|---|---|
| `shim:failGet` | every read fails |
| `shim:serverDown` | reads that ask for the server fail; plain reads return `shim:cache:<path>` marked `fromCache` |
| `shim:quota` | the test's init script makes `localStorage.setItem('damaworld.v1')` throw `QuotaExceededError` |

1. Build a test page: the game HTML with `<script src="online/fbshim.js"></script>` added before the
   game's scripts.
2. Serve the folder: `python3 -m http.server 8765`
3. Run all cases: `python3 test_save_sync.py <page>.html`. To run some cases: add their names, e.g.
   `... D E1 F`.

The script checks every expectation and **exits 1** if any value differs or the page throws an error.

## Cases

| Case | Scenario | Expected |
|---|---|---|
| A | local 150 @10000, cloud 900 @20000 | game 900, cloud 900 |
| B | same, read fails, then recovers | 150 kept and cloud untouched while failing; then 900 / 900 |
| C | local 500 (newer), cloud 900 @20000 | 500 uploaded |
| D | review #1: read fails, startup saves and a real edit (+5), page reload, then the connection returns | `editAt` stays 10000; then 900 / 900 |
| E1 | review #2: guest data newer, sign in to an existing account (900), read fails, automatic retry | 900 / 900; guest data not uploaded |
| E2 | same as E1, but the page reloads before recovery | context survives the reload; 900 / 900 |
| F | review #3: `QuotaExceededError` while adopting the cloud save | no reload, `accLoadedAt` not set, not synced, cloud 900 untouched |
| G | review #4: server unreachable, stale cache says older data | cache not trusted, no upload, cloud 900 untouched |
| H | guest registers a new account | guest progress uploaded to the new account; other accounts untouched |

## Results
- This branch: **all cases passed** (exit 0).
- The same tests against the previous commit `4ea6fb5`: **D, F and G fail** (exit 1). In D the 150 is
  uploaded over the 900.
- The full game regression passed with no errors.

## Known limit
If the same account plays on two devices at the same time, the last device to save wins. Nothing
merges the two.
