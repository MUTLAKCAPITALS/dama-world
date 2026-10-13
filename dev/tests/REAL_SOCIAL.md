# Real friends and private messages

This release replaces the lobby friend list and friend search with authenticated Firestore links. Search is an exact normalized registered name lookup in the existing name registry. It never invents accounts or reads another user's private save.

A canonical `friendships/<sorted-uid>~<sorted-uid>` document holds a pending/accepted/closed/blocked link, verified name snapshots, both participants, independent blocks and the last 20 private messages. Only the recipient may accept a request. Neither participant can remove the other's block, erase the link to bypass it, change participants or impersonate the other message sender. Returning members' old demo social data is retained in their save but no longer displayed as real friends.

A private owner-controlled `socialPrefs` document enforces the existing “everyone / nobody” request setting on the server. Legacy friends-of-friends settings conservatively become “nobody”; that unsupported option is removed. Displayed private text respects the existing profanity-filter preference.

The server limits repeated requests to the same closed pair to one per minute and messages to one per second per conversation. UI operations confirm server transactions before reporting success. Failed message drafts retain an attempt token, so retries in the retained history do not duplicate the message. Concurrent crossed requests remain pending until explicit acceptance.

One bounded listener loads up to 100 visible links. Exact-name search can find an additional contact; an open private conversation gets a dedicated listener so it remains live outside the lobby's first page. Listeners detach when the page is hidden/offline and ignore stale callbacks after navigation or an account change. This uses the existing Spark project and does not enable billing. Free quotas still apply.

Real contacts show a neutral account label, not fabricated presence, ratings or profile statistics. The existing world/team/clan chat remains labeled simulation. Real private messages contain plain escaped text; they are not end-to-end encrypted. Closed links retain their private recent history. No live player requests or messages were sent during implementation.

Validation: `node dev/tests/run.cjs` runs the client and lifecycle checks. `node dev/firebase/run.cjs` runs the existing rule tests and new authorization/transaction checks against synthetic users on a loopback emulator. The new coverage includes sender/recipient/outsider separation, independent blocking, query limits, moderation mute, message retention, spoofing, concurrent requests, retry identity, account changes and listener cleanup. Physical iPhone/WebGL rendering is not verified in the cloud browser.
