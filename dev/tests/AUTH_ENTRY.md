# Sign-in entry flow

`auth_start.js` and `auth_start.css` render a sign-in dialog before the game loads.
The entry module waits for Firebase Auth restoration and uses local session persistence.
A restored non-anonymous account proceeds automatically. Signed-out visitors and restored
anonymous users see Google, email sign-in, registration and password-reset options.

`index.html` keeps the game dependencies and inline game source inert until authentication
finishes. This also lets the sign-in UI render without requiring a WebGL context.
After authentication, the existing account module reads and reconciles the save. Only a
successful `local` reconciliation starts `boot()` and enters the lobby. A `cloud` result
waits for the existing verified adoption/reload. Failed reads or adoption keep the gate
closed and expose retry; background save-sync retries still work.

The entry module records an existing-account restore intent *before* changing accounts,
then pins it to the resulting UID before loading game code. Guest progress is retained
when registering/linking a new account. Credentials are passed to Firebase only and are
not put in localStorage. Profile/photo writes and owner controls start after reconciliation.
The profile's Account tab now includes an account-management button.

## Run the checks

```sh
node dev/tests/test_auth_start.cjs
node dev/tests/test_save_sync.cjs
```

The first command checks initial sign-in, restored sessions, anonymous users, new/existing
accounts, Google linking/collision, wrong passwords, reset, timeout/retry, save adoption,
account changes and WebGL failure. It also runs the actual account functions with the
entry module to check local 150 / cloud 900 restoration and failed reads. The second
command retains the isolated regression coverage for the published save-sync fix,
including legacy saves with no `editAt`. Both exit nonzero on assertion failure.

These tests use an in-memory Firebase stand-in and do not contact the live project.
`test_save_sync.py` is the earlier browser harness: it expects a test page that runs the
game directly. It must use an isolated fixture with the inert game/dependency script
types converted back to JavaScript and the entry module omitted; it is not a sign-in
UI test. Do not disable the entry gate in the deployed page.

For a live smoke check: open a fresh browser and verify the sign-in form; sign in with a
test account and verify its cloud balance; reload and verify automatic lobby entry;
sign out using Profile > Account > My account, then reload and verify the sign-in form.
Verify the form layout in portrait and landscape. Live OAuth and full WebGL gameplay
must be checked in a browser/device that supports those services.
