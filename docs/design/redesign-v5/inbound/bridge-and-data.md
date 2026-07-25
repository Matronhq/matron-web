# Inbound data for design — bridge payload schema + content reality

Answers two of the three §9 asks in `GENERATIVE-SYSTEM.md` ("bridge payload schema", "real transcripts"). The third — frequency data on which controls the operator uses — needs telemetry or Fantin's input; not here yet.

## Session status / limits — exact schema (`src/journal/types.ts`)

```ts
interface SessionStatus {
  model?: string;                 // e.g. "claude-sonnet-4-5" (full id; the header shows this)
  context?: { tokens: number; window: number; pct: number };   // the ctx meter
  limits?: Array<{
    label: string;                // server-authored string — see below
    percent: number;              // 0..100
    resets?: string;              // human string, e.g. "3h20"
    resets_at?: string;           // ISO timestamp (preferred; resets is derived)
  }>;
  email?: string;
}
```

### What the labels actually are today
The bridge currently emits these `label` strings (verbatim), in this order:
- `"Session"` — the 5-hour rolling window → your `5h`
- `"Week (all models)"` → your `wk`
- `"Week (Sonnet 5)"` → today shortened to `"Sonnet 5"` by `usageBarLabel()`

`context` is **not** a limit — it's a separate field the client prepends as the first meter (`ctx`).

### The fable limit
There is **no fable/`fbl` limit in the payload today** — that's why it's absent live, and your "omit until the bridge sends it" default is correct. When/if we wire it, it will arrive as another `limits[]` entry with a `label` like `"Week (Fable 5)"`. Your `labelMap` already has `fable → fbl`; we'll also add `"Week (Fable 5)" → fbl`. Its **semantics (what it measures / window / reset)** remain the one open product decision — the schema is ready for it either way.

### Units/derivation
- `percent` is already 0–100; render directly.
- Prefer `resets_at` (ISO) and derive the countdown client-side; `resets` is a fallback string.
- Accessible label should read the **long** `label`, not the short one (per GENERATIVE-SYSTEM §3): "context 72 percent", not "ctx".

## Content reality (real transcripts)

Sending **actual operator transcripts** to the design canvas is a data-sharing decision for Fantin — they can carry live ops detail. So rather than dump real conversations, the fidelity harness now ships a **representative synthetic thread** that exercises every `EventContent` branch (`fixtures/index.tsx`): fenced code, plain prose, `tool_output` (exit 0), `diff` (Edit, +2/−1), `permission_request`, and `user:` own-bubbles, plus two subagents. It's schema-accurate; it is not claimed to match the true length/density distribution.

If you want the *true* distribution (turn lengths, tool-call density, how often a turn is only a diff), that's a redaction pass on the journal DB — say the word and we'll produce a redacted sample deliberately, rather than by accident.
