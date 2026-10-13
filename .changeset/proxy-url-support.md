---
"fastmail-cli": minor
---

Support routing all API requests through a configurable HTTP API proxy. Set the `FASTMAIL_PROXY_URL` environment variable or the `proxyUrl` config key to the proxy base URL (e.g. `https://proxy.example.com/fastmail`); session discovery, JMAP API calls, and blob upload/download are all rewritten to stay on the proxy. Also deduplicates the per-command client setup into a shared `createClient()` helper.
