# Save-sync fix — tests

## The bug
`persist()` stamped `S.savedAt = Date.now()` on every save, and the game saves several times
during startup **before** `accBoot()` reads the account from Firestore. So the local copy always
looked newer than the cloud copy, and `accUpload()` overwrote a newer cloud save with an older
local one.

## The fix (`dev/v29_account.js`, built into `index.html`)
- `ACC.bootLocalAt` is read from `localStorage` when the script loads, before any startup save.
  Cloud vs local is compared against this, not against the live `S.savedAt`.
- `accUpload()` refuses to upload until `ACC.synced` is true, which is set only after a
  successful read of `users/{uid}` (`accSync()`).
- If the read fails, the local progress is kept, nothing is written to the server, and
  `accSync()` retries every 30 s.
- If the cloud save is newer, `accAdopt()` writes it locally and reloads, and `persist()`,
  `accRaw()` and `accUpload()` are blocked during the reload so nothing overwrites it.
- `accAfterLogin()` follows the same rule.

## Running the tests
`test_save_sync.py` runs the game in Chromium (Playwright) against `fbshim.js`, a local stand-in for
Firebase that keeps its data in `localStorage`. Setting `shim:failGet` makes reads fail.

1. Build a test page: the game HTML with `<script src="online/fbshim.js"></script>` added before the
   game's scripts.
2. Serve the folder: `python3 -m http.server 8765`
3. `python3 test_save_sync.py <page>.html all`

## Results

| Case | Before (main) | After (this branch) |
|---|---|---|
| A: local 150 (old), cloud 900 (newer) | game 150, **cloud overwritten to 150** | game 900, cloud 900 |
| B: cloud read fails (local 150, cloud 900) | — | game 150, **cloud untouched (900)** |
| B, after the server comes back | — | game 900, cloud 900 |
| C: local 500 (newer), cloud 900 (older) | — | game 500, uploaded as 500 |

The full game regression passed with no errors.

## Known limit
If the same account plays on two devices at the same time, the last device to save wins. Nothing
merges the two.
