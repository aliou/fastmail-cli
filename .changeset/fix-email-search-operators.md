---
"fastmail-cli": patch
---

Fix `email search` to parse fielded query operators.

Previously, `fastmail email search "from:alice@example.com"` sent the
entire string as a plain text search, so sender-based searches would
never return results. The CLI now parses field operators before building
the JMAP filter:

- `from:<value>` maps to `filter.from`
- `to:<value>` maps to `filter.to`
- `cc:<value>` maps to `filter.cc`
- `bcc:<value>` maps to `filter.bcc`
- `subject:<value>` maps to `filter.subject` (supports quoted values: `subject:"hello world"`)
- `body:<value>` maps to `filter.body`
- Any remaining text is passed as `filter.text` for full-text search
