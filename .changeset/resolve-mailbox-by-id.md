---
"fastmail-cli": patch
---

Allow resolving mailboxes by ID in email commands.

`--mailbox` on `email list` and `email search` now accepts a mailbox ID
in addition to a name or role. An exact ID match is tried first, so
mailboxes with duplicate names across nested folders can be targeted
unambiguously.
