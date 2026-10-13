# Current regression suite

Run `node dev/tests/run.cjs` for the current entry, guest, save migration and reliability checks. See [RELIABILITY.md](RELIABILITY.md) for the 24-finding review, coverage and remaining Firebase/device requirements.

The save-sync notes below describe the original migration fix; revision checks and transaction acknowledgements now additionally protect uploads. The older Python browser harness is historical and is not included in the current runner.

# Save-sync fix — tests

The sign-in entry now has its own tests. See [AUTH_ENTRY.md](AUTH_ENTRY.md) for
`node dev/tests/test_auth_start.cjs` and `node dev/tests/test_save_sync.cjs`.
The older browser harness below needs an isolated direct-game fixture, as described there.

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

### Upgrading saves from the published version (no `editAt`)
Saves written by the published version have no `editAt`. When `v29_account.js` loads, it takes
`editAt` from the original `savedAt`, before the game saves anything during startup, and writes it
into the stored save right away. So the basis survives a reload even if the server read fails and
the game saves again (which moves `savedAt`) before the reload.

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
| M | **upgrade**: old save 150 (`savedAt` 10000, **no `editAt`**), cloud 900 @20000, read fails, startup default changes + saves (moves `savedAt`), reload, connection returns | basis pinned to 10000 and stored; server stays 900, game restores 900 |
| M2 | upgrade: old save older than cloud, no failure | 900 / 900 |
| M3 | upgrade: old save newer than cloud | local wins and is uploaded; uploaded `saveAt` = local `editAt` |

`save_obj(..., legacy=True)` builds a save exactly like the published version's: no `editAt`.
In M3, `editAt` moves to "now" after local wins, because startup default changes count as an
unsynced edit and are applied once local wins.

## Results at `08f601d`, before the new sign-in entry
- This branch: **all cases passed** (exit 0). The whole suite takes about 10 minutes in
  software-rendered Chromium, so it was run in two parts: A–H, then M, M2 and M3.
- Against commit `4ea6fb5`: **D, F and G fail**. In D the 150 is uploaded over the 900.
- Against commit `ffd973d`: **M fails**. `editAt` is missing, and after the reload the server goes
  from 900 to 150.
- The full game regression passed with no errors.

## Known limit
If the same account plays on two devices at the same time, the last device to save wins. Nothing
merges the two.

