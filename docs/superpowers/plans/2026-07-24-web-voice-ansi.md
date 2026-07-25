---
title: Web voice capture (#470) + ToolStream ANSI color (#508) — implementation plan
date: 2026-07-24
spec: docs/superpowers/specs/2026-07-24-web-voice-ansi-design.md
repo: easelyte/matron-web
branch: vps-voice-ansi
loops: [470, 508]
risk: medium   # web-only, no auth/RLS/payments/data-loss; MediaRecorder async lifecycle is the main correctness surface <!-- heavy-signal:docs -->
regions_owned: [ToolStream (~2039), Composer (~2544-2866)]  # of src/journal/components.tsx
---

# Web voice capture (#470) + ToolStream ANSI color (#508)

Two independent, web-only features on branch `vps-voice-ansi`. **Merge only — no live deploy** (batched with two sibling windows). **Rebase on `origin/main` before ship** (siblings merge into the same `components.tsx`). This session owns ONLY the `ToolStream` (~2039) and `Composer` (~2544-2866) regions of `components.tsx`, plus new/support files.

Phase 1 (ANSI) is deliberately first: it is small, self-contained, and touches only the `ToolStream` region + a new module — landing it early shrinks the `components.tsx` diff surface before the larger voice change.

## Dependency graph
- **Phase 1 (ANSI)** and **Phase 2 (voice)** are fully independent (different files/regions) — could parallelize, but this session runs them sequentially, ANSI first.
- Within Phase 1: T-1.1 (module) → T-1.2 (module tests) ∥ T-1.3 (ToolStream+pcss wiring) → T-1.4 (render test). T-1.3 depends on T-1.1.
- Within Phase 2: T-2.1 (client) ∥ T-2.2 (icons) → T-2.3 (lifecycle) → T-2.4 (UI+pcss) → T-2.5 (tests). T-2.3 depends on T-2.1+T-2.2.

## Spec coverage map
| Spec part | Task(s) |
|---|---|
| Feature 2: port parser, drop bg/inverse/dim, 30/90 clamp, INITIAL_SGR_STATE | T-1.1 |
| Feature 2: `stripLeadingSgrFragment` `/^\[[0-9;]*m/` | T-1.1 |
| Feature 2: ToolStream single-pass parse, strip-before-prefix, memo | T-1.3 |
| Feature 2: terminal surface pcss (`#1e2127`/`#dcdcdc`, scoped exception) | T-1.3 |
| Feature 2: parser + fragment + strip-order + surface tests | T-1.2, T-1.4 |
| Feature 1: `sendAttachment` typed return; `sendVoiceNote(blob, convoId?)` | T-2.1 |
| Feature 1: `StopIcon`/`TrashIcon` | T-2.2 |
| Feature 1: lifecycle state machine (acquire/start/stop/finalize/watchdog/timer/cap/teardown) | T-2.3 |
| Feature 1: recording UI, mic button, error line, waveform, a11y, focus | T-2.4 |
| Feature 1: client + composer tests | T-2.5 |

---

## Phase 1 — ANSI color rendering (#508)

### T-1.1: Create `src/journal/ansi.tsx` (ported parser + fragment stripper)
- [ ] New file `src/journal/ansi.tsx` with the AGPL license header (copy from `/opt/matron/web/src/components/views/messages/ansiToReact.tsx`).
- [ ] `SgrState` = `{ fg: string | null; bold: boolean }` — **drop `bg`, `inverse`, `dim`** vs legacy. `INITIAL_SGR_STATE = { fg: null, bold: false }`.
- [ ] Palette: the legacy 16-color foreground table (`30-37`, `90-97`), **with the two near-black clamps**: `30 → "#8b909a"`, `90 → "#a7adb8"` (the rest verbatim).
- [ ] **SGR param consumption (Codex R4-B2 — fixes a latent bug the legacy parser has too).** Do NOT loop `applyParam` over every semicolon-split number: `\x1b[38;5;31m` would then apply `31`=red and `\x1b[38;2;255;0;0m` would apply `0`=reset, contradicting "ignore extended color". Instead **walk the param list with an index and consume `38`/`48` extended-color sequences as a UNIT**: on encountering `38` or `48`, look at the next param — if `5`, skip 1 more (the 256-index); if `2`, skip 3 more (r,g,b) — consuming the whole payload without applying any of it. All other params go through `applyParam`.
- [ ] `applyParam(state, param)`: handle `0` (reset), `1` (bold on), `22` (bold off), `39` (fg null), `30-37`/`90-97` (fg = palette). **Parse-and-ignore** (consume, no style): `2`, `7`, `27`, `40-47`, `49`, `100-107`. Any other single param (incl. `38`/`48` sub-values that somehow reach it) is ignored.
- [ ] `spanStyle(state)`: `color` (if fg) + `fontWeight: 600` (if bold) only. `isStyled` = `fg !== null || bold`.
- [ ] `parseAnsi(input, prevState, prevTail, startKey): { nodes, state, tail }` — port the CSI scanner verbatim (ESC `[` … final-byte `@`–`~`, hold incomplete trailing escape in `tail`, only `m` is SGR, strip other CSI). Styled runs → `<span key style>`, else raw text nodes.
- [ ] `stripLeadingSgrFragment(content: string): string` — `return content.replace(/^\[[0-9;]*m/, "")`. Only the `[`-led orphan form; documented residual for other cut offsets.
- **Acceptance:** module exports `SgrState`, `INITIAL_SGR_STATE`, `parseAnsi`, `stripLeadingSgrFragment`; `pnpm lint:types` clean; no `bg`/`inverse`/`dim` field anywhere in `SgrState`.

### T-1.2: Parser unit tests (`test/unit-tests/journal/ansi-test.ts`)
- [ ] New jest test file. Cases (from spec §Testing):
  - Plain text → single unstyled text node.
  - `\x1b[32mgreen\x1b[0m` → span `color:#98c379` then reset.
  - Bold (`1`) applies, `22` clears.
  - **Bg (`\x1b[47mhi`), inverse (`\x1b[7m`), dim (`\x1b[2m\x1b[32mhi`) parsed-and-ignored** — no backgroundColor, no swap, full-opacity green; no literal escape text.
  - Compound `\x1b[1;31m` → bold + red fg.
  - Incomplete trailing escape held in `tail`.
  - Non-SGR CSI (`\x1b[2J`, cursor move) stripped, surrounding text kept.
  - `39` resets fg.
  - Extended-color consumed-as-unit (Codex R4-B2): `\x1b[38;5;196m` ignored (no style); **collision cases: `\x1b[38;5;31mX` → X is NOT red (the `31` is part of the 256 payload, consumed); `\x1b[38;2;0;0;0mX` → X is NOT reset-styled (the `0`s are the truecolor payload); `\x1b[48;5;1mX` → X has no background.** Text preserved in all.
  - Near-black clamp: `\x1b[30m`→`#8b909a`, `\x1b[90m`→`#a7adb8`.
  - `stripLeadingSgrFragment`: `"[32mhello"`→`"hello"`, `"[mhello"`→`"hello"`, `"[1;31mx"`→`"x"`; NO strip from `"2ms latency"`, `"32m remaining"`, `"[link] x"`, `"[0] done"`, `"test output"`.
- **Acceptance:** `pnpm test -- ansi-test` green; every listed case asserted.

### T-1.3: `ToolStream` render + terminal-surface pcss
- [ ] In `components.tsx` `ToolStream` (~2039): replace the raw `<pre>{…}</pre>` body. Compute (memoized `useMemo` keyed on `stream.content`+`stream.headTruncated`):
  - `const cleaned = stream.headTruncated ? stripLeadingSgrFragment(stream.content) : stream.content;`
  - `const text = stream.headTruncated ? "… earlier output omitted …\n" + cleaned : stream.content;`
  - `const nodes = parseAnsi(text, INITIAL_SGR_STATE, "", 0).nodes;`
  - Render `<pre>{nodes}</pre>` — the `<pre>` stays inside the existing `<div className="markdown-body mj_LiveTool">`, so the `.mj_LiveTool pre` terminal surface (T-1.3 pcss) applies via ancestry; NO new class on `<pre>` is added. (Strip runs on `content` BEFORE the prefix is prepended — order is load-bearing.)
- [ ] **Export `ToolStream`** (add `export` to the `function ToolStream(...)` declaration at ~2039) so T-1.4 can import + render it in isolation (Codex R2-B2). No other call-site change.
- [ ] Import `parseAnsi`, `INITIAL_SGR_STATE`, `stripLeadingSgrFragment` from `./ansi`.
- [ ] `journal.pcss` (Claude R1-M2 — the selector is SHARED, do NOT recolor in place): the base rule at ~1367-1382 is a 4-selector block `.mj_ToolCommand, .mj_ToolCard pre, .mj_LiveTool pre, .mj_Unknown pre { … background: var(--cpd-color-bg-subtle-secondary); … }`. **Extract `.mj_LiveTool pre` into its OWN rule** (leave the other three selectors on the shared `--cpd` background — they must NOT become terminal-colored): add a dedicated `.mj_LiveTool pre { background: #1e2127; color: #dcdcdc; }` with comment `/* terminal surface — theme-independent fixed colors (scoped --cpd exception, see spec §Feature 2); ANSI palette tuned for this backdrop */`. **Place it AFTER line ~1382 so it wins the same-specificity (0,0,1,1) cascade** over the shared rule (source-order tiebreak) — a rule placed before would be silently overridden with no test to catch it. Keep the shared block's layout props (wrap/padding) applying to `.mj_LiveTool pre` (don't duplicate-then-diverge them). NOTE: the ~1791 `.mj_LiveTool pre` block is inside a media query and sets only `min-width`/`max-width` — no color there; leave it.
- **Acceptance:** a colored stream renders with color and NO literal `^[[…m`; `pnpm lint:types` clean; `.mj_LiveTool pre` shows `#1e2127`/`#dcdcdc` in both themes; layout unchanged.

### T-1.4: `ToolStream` render test
- [ ] In `test/unit-tests/journal/` (new `tool-stream-ansi-test.ts`) — new `*-test.ts` files render via `React.createElement`, NOT JSX (jest/tsconfig match `.ts` only; JSX in `.ts` is a parse error; follow `diff-card-test.ts`): import the now-exported `ToolStream` (T-1.3) and render it with a `ToolStreamState` whose `content` has SGR codes → assert colored `<span style="color:…">` nodes are present, NO literal escape text (`^[[`/`[32m`) in the DOM, and the `<pre>` is nested under an element with class `mj_LiveTool` (surface-via-ancestry; jsdom can't measure computed colors, so assert the class ancestry + the parsed spans, NOT a computed background).
- [ ] Strip-before-prefix integration: `headTruncated=true`, content `"[32mBUILD OK"` → rendered shows the "… earlier output omitted …" prefix then **default-colored** "BUILD OK" (NO `[32m` text AND NO green span — the stripped fragment took its color state with it).
- [ ] **CSS source-order gate (Codex R4-M2 — jsdom can't computed-style, so a mis-ordered rule would ship the wrong surface undetected).** Add a text-level assertion (read `src/journal/journal.pcss`): the dedicated `.mj_LiveTool pre { … #1e2127 … #dcdcdc … }` rule exists AND its index in the file is AFTER the shared `.mj_ToolCommand, .mj_ToolCard pre, .mj_LiveTool pre, .mj_Unknown pre` block (so it wins the same-specificity cascade). Fails loudly if placed before or missing.
- **Acceptance:** `pnpm test` green for the new test; all assertions present; `ToolStream` is imported (compiles → confirms the export); the pcss source-order assertion passes.

---

## Phase 2 — Voice capture UI (#470)

### T-2.1: `client.ts` — `sendAttachment` typed return + `sendVoiceNote`
- [ ] Change `sendAttachment(file, convoId, caption?)` return type `Promise<void>` → `Promise<"sent" | "persisted-terminal" | "persist-failed" | "skipped">`. Convert existing early-returns to typed returns, NO control-flow change:
  - `if (!api || !db) return "skipped";` · `if (this.isChildConvo(convoId)) return "skipped";`
  - persist branch: `persisted-uploadable` → proceed + `return "sent"` after the `Promise.all`; `persisted-terminal` → `return "persisted-terminal"`; else → `return "persist-failed"`.
- [ ] **`"sent"` semantics (Codex R1-B3).** `runPendingUpload` catches upload failures, persists an outbox error tile, and RESOLVES (does not throw) — so `"sent"` means **"durably persisted to the outbox and the upload was dispatched"**, NOT "delivery confirmed". A later upload failure surfaces via the standard outbox error tile (retryable for `upload_failed`), exactly like every drag-drop attachment — NOT silently lost. The voice composer error toast (T-2.3) fires ONLY for the artifact-less outcomes (`persist-failed`/`skipped`); upload failures are visible in the timeline tile, not the toast. Document this in a `sendAttachment` doc-comment so `"sent"` is not misread as delivery.
- [ ] **Fix the one type-breaking caller (Claude R1-B1) — REQUIRED before T-2.1's lint:types acceptance.** `test/unit-tests/journal/client-test.ts:~1908-1915` spies `sendAttachment` with `mockImplementationOnce(() => Promise<void>)` + `mockResolvedValueOnce(undefined)`; the widened union makes both a `tsc --noEmit` error. Update the spy: type `firstAttempt` as `Promise<"sent">` (or the union) and change `mockResolvedValueOnce(undefined)` → `mockResolvedValueOnce("sent")`. (Claude verified this is the ONLY one of ~25 call sites that type-depends on `void`; the rest await-and-discard.)
- [ ] Verify `attachFiles` (client.ts:919) still compiles (it `await`s and ignores the result — backward-compatible), and `pnpm lint:types` is clean across `test/unit-tests/journal/**` (the spy fix above is what makes this pass).
- [ ] Add `public async sendVoiceNote(blob: Blob, convoId?: string): Promise<"sent" | "persisted-terminal" | "persist-failed" | "skipped">`:
  - `const cid = convoId ?? this.state.selectedConversationId;` — bail `"skipped"` if unset / `isChildConvo(cid)` / `archivedIds.has(cid)`. (The archived check at entry is entry-only; a cross-tab archive DURING persist/upload is the **accepted Tier-2 TOCTOU caveat** documented in the spec — `sendAttachment` never rechecks `archivedIds` pre-egress, a pre-existing property shared by drag-drop; out of these owned regions. Not re-fixed. Re-flagged by Codex R2-M1; disposition: accept per spec.)
  - `if (blob.size === 0) return "skipped";`
  - Derive the filename extension from the actual MIME so a non-WebM fallback isn't labeled `.webm` (Codex R5-B1): `const type = blob.type || "audio/webm"; const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"; const file = new File([blob], \`voice-note.${ext}\`, { type });` (bridge routes on `content_type`, so the extension is cosmetic-but-correct).
  - `return await this.sendAttachment(file, cid);`
- **Acceptance:** `pnpm lint:types` clean; `sendVoiceNote` never touches `stagedUploads`; `confirmStagedFile` unchanged (git diff shows no edit to it).

### T-2.2: `icons.tsx` — `StopIcon` + `TrashIcon`
- [ ] Add `export function StopIcon(props: IconProps)` (filled square / stop glyph) and `export function TrashIcon(props: IconProps)` (discard), matching the existing icon component shape (viewBox, `IconProps` spread, `aria-hidden` default). Reuse existing `MicOnIcon`, `CloseIcon`.
- **Acceptance:** both exported, `pnpm lint:types` clean, render without warnings.

### T-2.3: `Composer` — voice lifecycle state machine
Implement per spec §Feature 1 "Lifecycle & failure state machine" exactly. In `Composer` (~2544):
> **Notation (Codex R4-B3):** every non-`voiceState`/`elapsedMs` value below is a `useRef`; the pseudocode writes bare names (`genRef`, `mediaRecorder`, `capConvoRef`) for brevity, but the ACTUAL code MUST access/mutate via `.current` — `++genRef.current`, `mediaRecorder.current?.state`, `capConvoRef.current = convoIdRef.current`, etc. (repo convention, see `convoIdRef.current` at components.tsx:2570). An executor copying a sample verbatim without `.current` will fail `pnpm lint:types`.
- [ ] State: add `voiceState: "idle"|"requesting"|"recording"|"error"` and `elapsedMs: number`. Refs (all `useRef`; Codex R3-B3 — declare EVERY one, incl. `genRef`, or `tsc` fails): `genRef = useRef(0)` (monotonic request/recording generation), `mediaRecorder, mediaStream, audioContext, analyser, rafId, chunksRef, recMimeRef` (effective MIME captured at start — Codex R3-B1), `recordingStartMs, deadlineTimer, tickTimer, watchdogTimer, acquireTimer` (getUserMedia acquisition timeout — Codex R3-B2), `errorMsg, mountedRef, voiceStateRef, dispositionRef, sendInFlightRef, stopInFlightRef, finalizedRef, recordingIdRef, capConvoRef`.
- [ ] `setVoiceState(x)` wrapper: set `voiceStateRef.current = x` SYNCHRONOUSLY then the React setter (mirror must lead render — B2 fix).
- [ ] Capability guard: mic button disabled (browser-unsupported tooltip) if `!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined"`.
- [ ] MIME pick: prefer `audio/webm;codecs=opus` → `audio/webm` → `""` via `MediaRecorder.isTypeSupported`.
- [ ] **Acquire** (mic click): `const gen = ++genRef.current; setVoiceState("requesting"); capConvoRef.current = convoIdRef.current; errorMsg=null;` then arm an **acquisition watchdog (Codex R3-B2 — `getUserMedia` may never settle if the user ignores the prompt)** with a **LOCAL timer handle captured in the closure (Codex R4-M1 — a shared `acquireTimer` ref lets a stale request clear a newer request's timer):** `const localTimer = setTimeout(() => { if (gen === genRef.current && voiceStateRef.current === "requesting") { ++genRef.current; setVoiceState("error"); errorMsg = "Microphone request timed out — try again."; } }, 20000); acquireTimer.current = localTimer;`. Then call `getUserMedia({audio:true})`.
  - Both **reject** and **resolve** first do `clearTimeout(localTimer); if (acquireTimer.current === localTimer) acquireTimer.current = null;` (clear ONLY this acquisition's own timer — never a newer one).
  - **reject** → `if (gen !== genRef.current) { return; }` (superseded — do NOT touch state; teardown owns the `requesting→idle` reset — Codex R1-B2) else mapped error + `setVoiceState("error")` (`NotAllowedError`/`SecurityError`→"Microphone access denied.", `NotFoundError`→"No microphone found.", else "Couldn't access the microphone.").
  - **resolve** → `if (gen !== genRef.current || !mountedRef.current) { stream.getTracks().forEach(t=>t.stop()); return; }` (stale/unmounted/timed-out → stop late stream, do NOT setState). Else start (§below).
- [ ] **Start** (try/catch, `recorder.start(1000)` LAST): `const rid = ++recordingIdRef.current; const localChunks: Blob[] = []; chunksRef.current = localChunks;` build `MediaRecorder`; **wire callbacks that capture `rid` + `localChunks` in their CLOSURE and identity-guard (Codex R1-B1):** `recorder.ondataavailable = e => { if (rid === recordingIdRef.current && e.data.size) localChunks.push(e.data); }`, `recorder.onstop = () => finalize(rid, localChunks)`, `recorder.onerror = () => { if (rid !== recordingIdRef.current) return; errorMsg="…"; setVoiceState("error"); stopRecorder("discard"); }`. Build `AudioContext`+analyser; set `dispositionRef="discard"; sendInFlightRef=false; stopInFlightRef=false; finalizedRef=false; recordingStartMs=Date.now();` start rAF waveform + `tickTimer` + deadline `setTimeout` + `visibilitychange` listener; **MIME capture — leave UNKNOWN until a real signal (Codex R4-B1 + R5-B1 definitive; do NOT init to a truthy default or `||=` never fires).** `recMimeRef.current = undefined` at start; set it from the FIRST real signal: `recorder.onstart = () => { if (rid === recordingIdRef.current) recMimeRef.current ||= recorder.mimeType || undefined; }` AND `ondataavailable` does `recMimeRef.current ||= e.data.type || undefined` (the chunk's own type is authoritative for the actual container). Apply the `"audio/webm"` default ONLY at finalization if still `undefined`. `recorder.start(1000)`; `setVoiceState("recording")`. On throw → stop tracks + `releaseResources()` + `setVoiceState("error")` ("Couldn't start recording."). (`chunksRef` holds the CURRENT recording's local array only; each callback uses its own closure array + rid guard, so cross-recording contamination is impossible.)
- [ ] `stopRecorder(disposition)` — ONLY caller of `recorder.stop()`: guard `if (!mediaRecorder || mediaRecorder.state === "inactive") return;` then set disposition (`send` → `dispositionRef="send"; sendInFlightRef=true`; else `if(!sendInFlightRef) dispositionRef="discard"`), `stopInFlightRef=true`, `const rid = recordingIdRef.current; const lc = chunksRef.current; watchdogTimer = setTimeout(() => { console.warn("voice: onstop absent — watchdog finalizing", {rid, disposition: dispositionRef, chunks: lc.length, elapsedMs: Date.now()-recordingStartMs}); finalize(rid, lc); }, 3000)` (Codex R3-M1 — the watchdog fallback logs a structured diagnostic so its path is distinguishable from a normal finalize), `mediaRecorder.stop()`.
- [ ] `finalize(rid, localChunks)`: identity guard `if (rid !== recordingIdRef.current) return;` then `if (finalizedRef) return; finalizedRef=true;` snapshot `const mime = recMimeRef.current || "audio/webm"; const blob = localChunks.length ? new Blob(localChunks, {type: mime}) : null;` (apply the `audio/webm` default ONLY here, at finalization, if no real MIME signal ever arrived — Codex R5-B1) + `const wantSend = dispositionRef==="send";` `releaseResources()`; committed-empty guard (`if (wantSend && !blob)` → error + `console.warn` + return); else error-preserving idle (`if mounted && voiceStateRef!=="error"` → idle + elapsed 0); then non-blocking send (`if wantSend && blob && capConvoRef`) with `onFail` (**`if mounted && voiceStateRef==="idle"` → error** — surface ONLY when idle; do NOT clobber an active new recording OR requesting acquisition, Codex R3-M3) on both `.then(non-`sent`/non-`persisted-terminal`)` and `.catch`. Reset `sendInFlightRef=false; stopInFlightRef=false`.
- [ ] Two release helpers (Codex R2-B1 — teardown must NOT drop the final queued chunk):
  - `releaseMedia()` (idempotent): clear deadline/tick timers, `cancelAnimationFrame`, stop stream tracks, `close()` AudioContext, remove `visibilitychange` listener. **Does NOT clear the watchdog, NOT null `localChunks`, NOT null `mediaRecorder`** — so a still-pending async `onstop` (which fires AFTER the queued final `dataavailable`, i.e. with the COMPLETE audio) and the watchdog backstop remain live.
  - `releaseResources()` (idempotent): `releaseMedia()` + clear `watchdogTimer` + null media/recorder refs. Called by `finalize()` at the END (after the blob is snapshotted from the now-complete `localChunks`).
- [ ] **Timer** (§5): `tickTimer = setInterval(()=>setElapsedMs(Date.now()-recordingStartMs), 500)`; MM:SS derived from `elapsedMs`.
- [ ] **Cap** (§4): deadline `setTimeout` AND `visibilitychange`→visible reconcile both call `stopRecorder("send")` (NOT direct stop) when `Date.now()-recordingStartMs >= CAP_MS` (5:00).
- [ ] **Waveform**: `AnalyserNode.getByteTimeDomainData` → `<canvas>` via rAF (direct draw, no re-render), `aria-hidden`; `prefers-reduced-motion` → flat baseline.
- [ ] **Teardown effects** (`mountedRef` false on unmount cleanup; runs from unmount cleanup AND `useLayoutEffect` on `convoId` change). Ownership-correct sequence (Codex R1-B2 requesting-reset + R1-M1 watchdog-survival + R2-B1 final-chunk-preservation):
  ```
  ++genRef;                                             // invalidate any pending getUserMedia
  if (voiceStateRef.current === "requesting") { setVoiceState("idle"); return; }  // teardown OWNS the requesting→idle reset (no recorder yet); nothing else to release
  if (mediaRecorder && mediaRecorder.state !== "inactive") stopRecorder("discard");  // still recording (no prior stop) → discard via async onstop
  // For BOTH the just-issued discard AND an already-committed Stop&send (sendInFlightRef, recorder already inactive):
  // release ONLY the mic/audio resources now, but KEEP the watchdog + localChunks + recorder-callbacks alive
  // so the async onstop (which fires AFTER the queued final dataavailable, with the COMPLETE audio) — or the
  // watchdog backstop — finalizes the full recording. Do NOT finalize() directly here: stop() queues the final
  // dataavailable BEFORE stop, so localChunks is not yet complete at teardown time (R2-B1).
  releaseMedia();                                       // partial: preserves watchdog + chunks + recorder for the async finalize
  ```
  `onstop`/watchdog `finalize(rid, localChunks)` runs even after unmount (closures over refs + stable `client`; `mountedRef`-guarded `setVoiceState`), dispatches a committed send to `capConvoRef` with the full audio, then `releaseResources()`. Generation-invalidation still synchronously resets only the `requesting` state this composer owns.
- [ ] **`mountedRef` is TWO-way (Codex R5-M1 — React Strict-Mode dev double-invokes setup→cleanup→setup).** The mount effect MUST set `mountedRef.current = true` in setup AND `false` in cleanup — never one-way. A one-way `false`-on-cleanup leaves `mountedRef` stuck `false` after Strict-Mode's simulated cleanup, so a later `getUserMedia` resolve hits `!mountedRef.current` and refuses to record. Test: render `Composer` under `<StrictMode>`, then resolve `getUserMedia` → recording still starts.
- [ ] **Focus**: on `recording` focus "Stop & send"; on idle focus mic button ONLY if `capConvoRef === convoIdRef.current` and active element still within this composer (M3 guard).
- **Acceptance:** `pnpm lint:types` clean; no direct `recorder.stop()` outside `stopRecorder`; `finalize` is the only chunk consumer; every recorder callback (`ondataavailable`/`onstop`/`onerror`) closes over its own `rid`+`localChunks` and identity-guards on `rid === recordingIdRef.current`; `voiceStateRef` updated synchronously in the `setVoiceState` wrapper; stale `getUserMedia` callbacks never call `setVoiceState`.

### T-2.4: `Composer` — recording UI, mic button, pcss, a11y
- [ ] Replace the disabled mic placeholder (`components.tsx` ~2843) with an active mic button (idle) wired to Acquire; `requesting` busy state; disabled+tooltip when capability guard fails.
- [ ] **Recording strip** (voiceState==="recording"): replaces the composer input row — `[pulsing dot] [waveform canvas] [MM:SS] [Discard] [Stop & send]`; textarea/attach/send hidden. Discard→`stopRecorder("discard")`; Stop&send→`stopRecorder("send")`; both disabled while `stopInFlightRef` (best-effort).
- [ ] **Error line**: inline dismissible (`errorMsg`, styled like `mj_ConnectionError`), clears on dismiss / next mic click.
- [ ] `journal.pcss`: recording-strip layout, pulsing dot (`--cpd-color-text-critical-primary`), waveform canvas (`--cpd-color-icon-accent-primary` stroke), `prefers-reduced-motion` block. `--cpd-*` tokens only (no fixed hex here).
- [ ] a11y: `aria-live="polite"` region ("Recording, 0:14", driven by `elapsedMs`); button labels ("Stop and send voice message" / "Discard recording" / "Record voice message"); waveform `aria-hidden`.
- **Acceptance:** both themes render; WCAG AA on the strip; keyboard-only operable; mic tooltip no longer says "not supported by this journal server".

### T-2.5: Voice tests (`test/unit-tests/journal/`)
**File conventions (Claude R1-m4):** new test files are `*-test.ts` (jest `testMatch`/tsconfig include only `.ts`, NOT `.tsx`) — render via `React.createElement(...)`, NOT JSX (JSX in a `.ts` file is a TS parse error). Match the existing pattern in `diff-card-test.ts` / `components-test.ts`.
- [ ] **Mock harness (Claude R1-M3 + Codex R3-M2 — REQUIRED, async-fidelity is load-bearing).** jsdom lacks `MediaRecorder`/`navigator.mediaDevices.getUserMedia`/`AudioContext`. Build a shared mock that reproduces the REAL async timing: `MediaRecorder` mock whose `state` flips to `"inactive"` **synchronously** inside `stop()`, but dispatches `dataavailable`+`stop` as a **task, NOT a microtask** — use `setTimeout(0)` under jest fake timers; **do NOT use `queueMicrotask`** (a microtask runs before intervening tasks and collapses the exact teardown/rerender/generation-race window these tests exist to cover — Codex R3-M2). The mock emits a final `dataavailable` (with a distinguishable final chunk) BEFORE `stop`, mirroring the W3C order. Exposes `mimeType` (settable, to simulate the non-WebM fallback), static `isTypeSupported`, settable `ondataavailable`/`onstop`/`onerror`, and a `getUserMedia` mock that can resolve/reject/**never-settle**. Assert at least one test observes `state==="inactive"` BEFORE `onstop` runs, AND that an unmount/convo-switch can be dispatched in the window after synchronous inactivation but before the final events fire.
- [ ] `client-test.ts` (extend): `sendVoiceNote` routes through `sendAttachment` with `content_type` starting `audio/` + passed convoId; no `stagedUploads`; empty-blob→`"skipped"`; convo-state bail (none/child/archived)→`"skipped"`; explicit-convo routing (`sendVoiceNote(blob,"A")` while ref="B" → dispatches "A"); outcome mapping (`persisted-uploadable`/`persisted-terminal`/`persist-failed` → `"sent"`/`"persisted-terminal"`/`"persist-failed"`); **upload-failure visibility (Codex R1-B3): `uploadMedia` rejects (or `connection.send()===false`) → `sendAttachment` still returns `"sent"` (persisted) AND a visible outbox error tile is produced (assert the pending-message error state), NOT a silent success** — documents that `"sent"` ≠ delivery; `attachFiles`/`confirmStagedFile` regression green.
- [ ] Composer tests (new `composer-voice-test.ts`, using the async mock harness): capability guard; disposition (discard≠send, Stop&send→`sendVoiceNote(...,capConvoRef)` once); in-flight send survives teardown; **committed-send-survives-teardown with FULL audio (Codex R1-M1 + R2-B1): Stop&send then immediate unmount/convo-switch, THEN the async final `dataavailable` + `onstop` fire → `finalize` dispatches to `capConvoRef` a blob containing ALL chunks incl. the final queued one (assert the mock's final chunk is present in the sent blob, not just that a send occurred); watchdog preserved across teardown (`releaseMedia` not `releaseResources`)**; double-stop idempotency (no throw, finalize once); error-preserving finalizer; **send rejection fail-visible** (flips error whether or not switched; NOT when actively recording); **fast-failure not suppressed** (sync `voiceStateRef`); **requesting-wedge exit** (switch during pending getUserMedia → idle, and the stale resolve does NOT re-touch state / clobber a newer request); permission-denial → error; late-permission guard; timer tick advances; watchdog runs full finalize (committed send dispatched); auto-stop routes through guard; stale-callback identity guard; **cross-recording chunk isolation (Codex R1-B1): recording A stopped, recording B started, then A's queued `dataavailable` fires → B's blob contains ONLY B's chunks (A's late data rejected by the `rid` guard)**; committed-empty → error; `recorder.start` called with `1000` timeslice; **acquisition timeout (Codex R3-B2): `getUserMedia` never settles → after the 20 s `acquireTimer`, `voiceState` leaves `requesting` → `error` ("timed out"), and a subsequently-resolving stale stream is stopped, not recorded**; **fallback MIME captured via onstart (Codex R3-B1 + R4-B1): mock reports `recorder.mimeType===""` immediately after `start()` and `audio/mp4` only once `onstart` fires → the sent blob/file `content_type` is `audio/mp4` (captured in the identity-guarded `onstart`), NOT relabeled `audio/webm`; the mock must expose the empty-until-onstart transition so the test would fail if capture were synchronous**; **A-fails-while-B-requesting (Codex R3-M3): A's send rejects while B is in `requesting` → B's `requesting` is NOT clobbered to error (onFail surfaces only when `idle`)**; **acquisition-timer race (Codex R4-M1): request A times out + bumps gen, user starts request B (new local timer), A's late resolve fires → it clears ONLY its own timer, B's 20 s watchdog still armed (B doesn't wedge if it also never settles)**.
- [ ] fast-stop-before-onstart MIME (Codex R5-B1): stop the mock before `onstart` fires but after a chunk with `data.type="audio/mp4"` → sent file is `voice-note.m4a` / `content_type: audio/mp4`, NOT `.webm`; if NO real MIME signal ever arrives, defaults to `audio/webm` only at finalize.
- [ ] **Watchdog-partial decision (Codex R5-M2, documented — NOT re-fixed).** When the watchdog fires (onstop absent — a rare browser failure), the timeslice means at most ~1 s of tail may be missing. Decision: **send the available audio as `"sent"` with the `console.warn` diagnostic** — for a voice note, partial delivery (transcription gets ~all of it) beats erroring away the whole recording; the warn is the operator-visible signal. NOT surfaced as a user error (right-size: rare browser-failure, partial > total loss). Test asserts the watchdog path sends the collected chunks and logs the warn.
- [ ] **Browser smoke-test decision (Codex R5-M3, documented).** jsdom cannot validate real codec bytes / permission / AudioContext / track teardown. This is a **merge-only, no-live-deploy** branch (batched with 2 siblings). The manual-verify below is the operator's PRE-DEPLOY checklist (run before the batched deploy, not a blocker for the merge-only PR) — adding a headless-browser (Playwright + fake-media) harness is out of scope for this batch.
- [ ] Manual-verify checklist (operator, pre-deploy — jsdom can't automate): real mic capture→transcript appears; permission-denied path; 5-min auto-stop incl. backgrounded-tab; convo switch discards; discard button discards; both themes; keyboard-only; mic-indicator releases on stop; a non-Chrome/FF browser's codec fallback (if available).
- **Acceptance:** `pnpm test` green for the new/extended files; every listed case asserted; the mock dispatches `onstop` asynchronously (verified by a gap-observing assertion).

---

## Ship
- **Pre-execution hygiene (Claude R1-m5):** this checkout (`/opt/matron/web-journal`) may carry an unrelated uncommitted edit from a sibling window (e.g. `docs/superpowers/plans/2026-07-24-web-header-adaptive-usage-subagent.md`). It is NOT a code collision (docs only, not `components.tsx`) — do NOT stage or revert it (it's another window's work). Stage ONLY this feature's files when committing (`git add` specific paths, never `-A`).
- **Rebase prerequisite decision (Codex R4-M3 — a dirty tree blocks `git rebase`).** The batched-merge model means the sibling windows commit their work before the end-of-batch merge, so the tree should be clean by ship time. If an unrelated uncommitted sibling change is STILL present when the rebase runs, **do NOT auto-stash another window's work** (risky, cross-window state loss — R100 worktree discipline): <!-- heavy-signal:docs --> `/ship-slim`/rebase HALTS and surfaces to the operator to coordinate (sibling commits, or operator resolves). The ship agent must not invent a stash strategy for work it doesn't own.
- Rebase on `origin/main` (siblings merged into `components.tsx`); resolve conflicts in owned regions (`ToolStream` ~2039, `Composer` ~2544-2866) only.
- `/execute-slim` runs implementer per task + Codex review at phase boundaries + `/ship-slim` (final adversarial review, PR, **merge only — no live deploy**).

> **For agentic workers:** REQUIRED SUB-SKILL — pick by plan signals (frontmatter + scope):
> - **Typical plan** (no `risk: high`, no auth/RLS/payments/data-loss surfaces): `/execute-slim` — implementer per task, Codex review per phase boundary, /ship-slim at end.
> - **Heavy plan** (R100, `risk: high`, auth/RLS/payments/data-loss): `/execute-heavy-codex` — per-task implementer + spec-compliance + quality + fix-mode chain via Codex, Sonnet only at every 5th phase + end-of-plan.
>
> Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Appendix: Verified Claims (research pass 2026-07-24)

✓ **`MediaRecorder.stop()` sets `state` to `"inactive"` synchronously, then queues `dataavailable`/`stop` events asynchronously.** Verified against MDN/W3C MediaStream Recording spec (stop() algorithm step 2 sets state inactive; events are queued-task). This is the basis for the `stopRecorder` `state === "inactive"` idempotency guard (T-2.3). Source: developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop.

✓ **`stop()` on an already-`"inactive"` recorder throws `InvalidStateError`.** Verified (MDN exceptions section). This is exactly why every stop routes through the guarded `stopRecorder` (T-2.3) rather than calling `recorder.stop()` directly.

✓ **`start(timeslice)` fires `dataavailable` periodically at the interval.** Standard MediaRecorder behavior (MDN); underpins the 1 s timeslice in T-2.3 (chunks accumulate during recording so a lost `onstop` still leaves ~all audio).

✓ **`getUserMedia({audio})` rejects with `NotAllowedError` (permission denied) / `NotFoundError` (no device).** Standard MediaDevices behavior; underpins the mapped error messages in T-2.3 Acquire.
