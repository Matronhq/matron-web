# Bridge payload proposal — send facts, not presentation

Every string-parsing workaround in the client exists because the bridge sends a **rendered line** where it could send **structured data**. The client then has to un-render it: strip emoji, re-parse counts out of prose, guess which limit a label refers to. That parsing is fragile in the exact way that matters — it fails silently and it fails differently as the bridge's copy drifts.

**The rule:** the bridge sends what happened; the client decides how it looks. Emoji, labels, counts-in-prose, and truncation-with-ellipsis are presentation, and a GUI client has icons, chips, and line clamps that do the same job better.

**Non-breaking migration.** The bridge presumably also feeds a terminal, where `📨 Queued (1): …` is exactly right. So nothing is removed: keep `payload.body` as the human-readable line, and **add** a structured sibling. The client prefers structure when present and falls back to `body` when absent, so a bridge that hasn't shipped a given field yet keeps working. Order of value is roughly the order below.

---

## 1. Queued-message prompts — highest value

**Today** (client has to un-render all of this):

```json
{ "type": "prompt", "payload": { "body": "📨 Queued (1): Now below the header i see a sub agen…" } }
```

The client strips a leading emoji run, parses `Queued (n):` for the count, and receives a body **already truncated by the bridge** — so it cannot show three readable lines even though it has room for them. Then the release arrives as a *second, unrelated* text event (`📤 Sending 1 queued message:` + a numbered list), which duplicates content the card already has and re-introduces emoji-as-chrome one message lower.

**Proposed:**

```json
{
  "type": "prompt",
  "payload": {
    "kind": "queued_release",
    "prompt_id": "pr_01H…",
    "question": "Send this now, or cancel and keep editing?",
    "items": [
      { "id": "q_01", "text": "Now below the header i see a sub agents element like in the mockup, we'll have to see how it behaves…" }
    ],
    "actions": [
      { "id": "send",   "label": "Send now", "intent": "primary" },
      { "id": "cancel", "label": "Cancel",   "intent": "neutral" }
    ],
    "body": "📨 Queued (1): Now below the header…"
  }
}
```

Three things this buys:
- `items[].text` **untruncated** — the client clamps to three lines itself and can expand on demand. Send the full text; truncation is a viewport decision, not a wire decision.
- `items.length` replaces parsing a count out of prose; the client renders it as a chip.
- `kind` + `actions[].intent` tell the client which card treatment and which single primary — no inference from copy.

**The release is a state change on the same event, not a new event:**

```json
{ "type": "prompt_reply", "payload": { "prompt_id": "pr_01H…", "action": "send", "released": ["q_01"], "at": 1785039420739 } }
```

The client re-inks the existing card in place. Nothing is restated in the thread.

## 2. Prompt vs permission — an explicit kind

The client currently distinguishes these by reading the copy. Make it declarative:

```json
{ "type": "prompt", "payload": {
  "kind": "permission",            // "question" | "permission" | "queued_release"
  "command": "systemctl restart nginx",
  "scope": "prod",
  "question": "Run this on prod?",
  "actions": [
    { "id": "allow",  "label": "Allow",        "intent": "primary" },
    { "id": "always", "label": "Always allow", "intent": "neutral" },
    { "id": "deny",   "label": "Deny",         "intent": "danger" }
  ],
  "expires_at": 1785039480000
} }
```

`command` as its own field means the client can render it as code rather than searching the sentence for backticks. `expires_at` lets the card show and enforce expiry instead of going stale silently. `intent` is what drives one-primary-per-surface (§10.5) without the client hard-coding button names.

## 3. Usage limits — ids and numbers, not display labels

**Today:** `Session`, `Week (all models)`, `Week (Sonnet 5)` — display strings the client reverse-engineers with a heuristic (`usageBarLabel()` parses parentheses), and which truncate in a 24px column. The relabel map in `design-tokens.json` is a workaround for this.

**Proposed:**

```json
{ "limits": [
  { "id": "context",      "used": 144000, "limit": 200000, "unit": "tokens" },
  { "id": "session_5h",   "pct": 34, "resets_at": 1785045600000 },
  { "id": "week_all",     "pct": 61, "resets_at": 1785398400000 },
  { "id": "week_sonnet5", "pct": 18, "resets_at": 1785398400000, "model": "sonnet-5" }
] }
```

- **`id` is stable and machine-readable**; the client owns both the short label (`ctx` / `5h` / `wk` / `fbl`) and the long accessible name ("context, 72 percent"). Display strings stop being an API.
- **Send the raw pair (`used`/`limit`) where it exists**, not just a percentage — the client shows `144k/200k` in the popover and computes the bar itself.
- **`resets_at` as epoch ms**, not "resets in 2h" — a pre-formatted relative time goes stale the moment it's rendered; the client re-derives it every tick.
- Unknown ids still render via a fallback label, so a new limit appears without a client release. This is the piece that unblocks the `fbl` bar: **the design shows it the moment an id for it arrives, and omits it entirely until then.**

## 4. Tool output — structured status

```json
{ "type": "tool_output", "payload": {
  "command": "pnpm build",
  "exit_code": 0,
  "duration_ms": 41000,
  "output": "…",
  "output_truncated": true,
  "output_bytes": 184320,
  "expires_at": 1785125820000
} }
```

`exit_code` as a number drives the ok/failed treatment (currently inferred); `duration_ms` lets the client format `41s` vs `1m 20s` to its own rules; `output_truncated` + `output_bytes` replace the prose sentinels `Preview truncated` / `Output expired after 24 hours` — the client renders those strings, and can state the real size so a clip is visible (§10.8).

## 5. Diffs — counts as numbers

```json
{ "type": "diff", "payload": {
  "path": "src/journal/journal.pcss",
  "additions": 6, "deletions": 2,
  "hunks": [ … ],  // or keep unified text in `patch`
  "truncated": false,
  "file_url": "/files/…"
} }
```

Unified-diff text is fine to keep, but `additions`/`deletions` as integers avoids parsing `+6 −2` back out of a rendered badge, and `truncated` lets the client cap a 4000-line diff deliberately rather than by DOM weight.

## 6. Files and images — dimensions and type up front

```json
{ "type": "image", "payload": { "name": "…png", "bytes": 1258291, "mime": "image/png", "width": 2048, "height": 1280, "caption": "…" } }
```

`width`/`height` let the client reserve the right aspect box before the image loads, so the thread doesn't reflow mid-read. `mime` picks the icon (the design can't derive it from the extension — a legal filename may have none).

---

## What the client stops doing, per change

| Bridge change | Workaround it removes |
|---|---|
| `items[]` untruncated + `kind` | emoji stripping, `Label (n):` prefix parsing, bridge-side truncation the client can't undo |
| `prompt_reply` referencing `prompt_id` | duplicated release prose in the thread; card re-inks in place |
| limit `id` + `resets_at` | the short-label relabel map; `usageBarLabel()`'s parenthesis heuristic; stale relative times |
| `used`/`limit` pair | percentage-only bars that can't show `144k/200k` |
| `exit_code`, `duration_ms` | inferring failure from copy; fixed duration formatting |
| `output_truncated`/`_bytes` | prose sentinels as control flow |
| `additions`/`deletions` | parsing counts out of a badge |
| `width`/`height` | thread reflow on image load |

## Two conventions worth adopting wire-wide

1. **Timestamps are always epoch ms.** Never a formatted or relative string. `ts` already does this correctly — extend it to `resets_at`, `expires_at`, `at`.
2. **Text fields are never pre-truncated and never carry decoration.** Send the full string, unadorned. Clamping, ellipsis, icons, and case are the client's job — and the *only* client that currently wants the emoji version keeps it via `body`.

If you'd rather stage this: **§1 and §3 are where the design is currently paying the most tax** (§1 forces un-rendering, §3 forces a relabel map and blocks the fbl bar). The rest are cleanups that each delete one parsing branch.
