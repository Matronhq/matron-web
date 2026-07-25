---
title: Web voice capture (#470) + ToolStream ANSI color (#508)
date: 2026-07-24
status: draft
owner: easelyte
loops: [470, 508]
repo: easelyte/matron-web
branch: vps-voice-ansi
regions_owned: [composer (~2843), ToolStream (~2039)]  # of src/journal/components.tsx
related_principles: []
rejected_alternatives:
  - "voice send via stageFiles+confirmStagedFile reuse (flashes the text-caption modal for a voice note — semantically wrong UX)"
  - "extracting a dispatchAttachment helper out of confirmStagedFile (rejected R1 — the existing public sendAttachment already does uncoupled build→persist→upload; a void extraction would strip the 3-way persist outcome and silently drop or double-dequeue sends). sendVoiceNote reuses sendAttachment."
  - "voice playback-before-send step (buys little for voice-to-transcription where the transcript is the payload; adds blob-URL audio element lifecycle)"
  - "ANSI: carry SgrState across WS chunks in client state (unneeded — client already accumulates the full buffer; single-pass parse per render is correct)"
  - "ANSI: theme-matched <pre> background with palette-as-is (rejected R1 — palette is tuned for dark; on a light-theme bg the bright colors fail AA). Chosen: self-contained fixed terminal surface (#1e2127 bg / #dcdcdc fg), theme-independent."
unresolved_questions: []
---

# Web voice capture (#470) + ToolStream ANSI color (#508)

> **Plan-review refinements (2026-07-24, authoritative in `plans/2026-07-24-web-voice-ansi.md` T-2.1/T-2.3/T-2.5).** Adversarial plan-review (3 rounds) tightened several async-lifecycle details under-specified here; the plan is the executable contract for them: (1) **chunks are per-recording** — each recorder's `ondataavailable`/`onstop`/`onerror` closes over its OWN `localChunks` array + `rid` and identity-guards on `rid === recordingIdRef.current`, so a late `dataavailable` from a superseded recording can't contaminate a newer one (cross-conversation audio leak). (2) **Teardown owns the `requesting→idle` reset**; stale `getUserMedia` callbacks stop the late stream and return WITHOUT `setVoiceState`. (3) **Teardown preserves the async finalize path** — it calls `releaseMedia()` (mic/audio only), keeping the watchdog + `localChunks` alive so `onstop`/watchdog `finalize`s the COMPLETE audio (the final queued `dataavailable` fires after `stop`); do NOT finalize directly in teardown (would truncate). (4) **`"sent"` = "persisted + upload dispatched", not "delivered"** — upload failures surface via a visible outbox tile; composer toast only for artifact-less `persist-failed`/`skipped`. (5) **Effective MIME captured at start** (`recMimeRef = recorder.mimeType` post-`start()`), used for the Blob — avoids relabeling a non-WebM fallback as `audio/webm`. (6) **Acquisition watchdog** (20 s) — `getUserMedia` may never settle; on timeout, leave `requesting`→`error` and reject a late stream. (7) **`onFail` surfaces only when `voiceStateRef === "idle"`** (supersedes the earlier `!== "recording"` — don't clobber an active new recording OR requesting acquisition).


Two independent web-client features folded into one branch (`vps-voice-ansi`). Both are **web-only** — zero bridge/server work. This session owns the composer (~2843) and `ToolStream` (~2039) regions of `src/journal/components.tsx`; two sibling windows own other regions of the same file. Stay in these two regions plus the supporting client/module/pcss/test files listed below.

---

## Feature 1 — #470 Voice capture UI (design + build)

### Background (what already works)
The whisper transcription pipeline is **done bridge-side**: audio riding the generic `file` media event is auto-transcribed and surfaces as `[Voice note transcription]`. The web client already has:
- `client.ts` → `api.uploadMedia(bytes, contentType)` (POST `/media`, returns `{media_id, size, content_type}`).
- The full staged-upload → outbox → send pipeline (`stageFiles` → `confirmStagedFile` → `runPendingUpload`), including offline outbox persistence and retry.
- Journal media cap = **50 MB** (nginx `client_max_body_size 60M`).

The mic button at `components.tsx:2841-2848` is a **disabled placeholder** (`aria-disabled="true"`, tooltip "Voice messages are not supported by this journal server"). That tooltip is now **factually wrong** — the server does support audio via the generic file event. This feature replaces the placeholder with a working capture UI.

### Goal
Click mic → record (live waveform + timer) → stop → the audio blob is sent as an `audio/webm` media message through the existing outbox pipeline → the bridge auto-transcribes → the transcript appears in the timeline. Visual target: the v3 mock voice-composer flow (mic → waveform+timer → transcript inserted).

### Design decisions

**Send path — dedicated `client.sendVoiceNote(blob)` that reuses the existing `sendAttachment` (chosen).**
Voice notes must NOT open the text-caption modal (`UploadConfirmDialog`) — a caption prompt is semantically wrong for a voice note whose payload is the transcription. The recording preview (waveform + timer + stop/discard) IS the confirmation surface. So we send via a dedicated method that bypasses the `stageFiles`/`confirmStagedFile` dialog path.

**Do NOT extract a helper from `confirmStagedFile`.** The repo already has the exact uncoupled send primitive: `sendAttachment(file, convoId, caption?)` (`client.ts:712-724`) does build → `persistPendingAttachment` → `refreshSelectedConversation` + `runPendingUpload` with **zero** `stagedUploads` coupling, and is already the primitive `attachFiles` (drag-drop batch) uses. `confirmStagedFile`'s post-persist logic (`client.ts:984-1029`) is entangled with staged-item bookkeeping (the three-way `PersistPendingAttachmentOutcome` branch, `head.message` retry identity, `stagedSendChain`, dequeue) — extracting it as a `Promise<void>` helper would strip exactly those semantics and either silently drop the send (early-return on null `stagedUploads`) or dequeue an unpersisted file (silent data loss). `confirmStagedFile` stays untouched.

**`sendAttachment` gains a return value** (backward-compatible — `attachFiles` at `client.ts:919` `await`s it and ignores the result; verified no caller type-depends on `void`). The three values mirror the real `PersistPendingAttachmentOutcome` kinds (`client.ts:86-89`) plus the pre-persist early-returns — no renaming, no semantic drift:
```
public async sendAttachment(file, convoId, caption?):
    Promise<"sent" | "persisted-terminal" | "persist-failed" | "skipped">
  // "skipped"           → no api/db, or child convo (the existing early-returns)
  // "persist-failed"    → persistPendingAttachment → persist-failed (NO outbox row; the silent-loss case)
  // "persisted-terminal"→ persistPendingAttachment → persisted-terminal (a BROWSER-side pre-upload
  //                        terminal state, e.g. electron-binary-unsupported / browser-memory-limit;
  //                        persisted with a visible outbox error tile, NOT silent). This is NOT the
  //                        server too_large path — that happens later, inside runPendingUpload.
  // "sent"              → persisted-uploadable; the method then awaits runPendingUpload. A SERVER
  //                        too_large during that upload is handled INTERNALLY (attachState→error,
  //                        outbox error tile) and the method still resolves "sent" — the server
  //                        rejection surfaces via the outbox tile, not via this return value.
```
The existing early-returns and the `persistOutcome.kind !== "persisted-uploadable"` branch just become typed returns; **no control-flow change** (the method still `await`s `runPendingUpload` before resolving `"sent"` — see §3-step-4 for why the composer does NOT block on that await). One canonical dispatch core — resolving the P2 concern that a new helper would diverge.

`sendVoiceNote(blob, convoId?)` lives in `client.ts`, so when `convoId` is omitted it defaults to the client's OWN `this.state.selectedConversationId` (NOT the Composer's `convoIdRef`, which is component-side and invisible to the client — that was a spec error). The recording path always passes the explicit `capConvoRef`, so the default only covers a hypothetical no-arg caller:
1. Resolve `convoId` (arg or `this.state.selectedConversationId`); bail `"skipped"` if unset, a child convo, or archived.
2. Empty-blob guard: `if (blob.size === 0) return "skipped"`.
3. Build `new File([blob], "voice-note.webm", { type: blob.type || "audio/webm" })`.
4. `return await this.sendAttachment(file, convoId)`. The bridge keys transcription on `audio/*`, so a `codecs=opus` suffix is fine to keep; filename is cosmetic (bridge routes on content type).

**Persist-failure feedback (was silent-loss gap).** The composer (§finalize step 5) treats a resolved outcome of `"persist-failed"` or `"skipped"` as a failure → `voiceState="error"` ("Couldn't save the recording — try again."), so a failed outbox write is NOT silently dropped. `"sent"` and `"persisted-terminal"` are treated as delivered — both leave a durable, VISIBLE outbox tile (an upload-in-progress tile, or for `persisted-terminal` a visible error tile — note the browser-memory/empty terminal kinds are Dismiss-only, not retryable, since `canRetry` isn't set for them; still visible, not silent). `persisted-terminal` is practically unreachable for voice (opus is tiny; empty is guarded), so this is a correctness note, not a live path. Everything genuinely artifact-less surfaces as the composer error; the rest flows through the normal outbox tile.

**Archived-egress TOCTOU (Tier-2, accepted).** `sendVoiceNote` checks `archivedIds` at entry; `sendAttachment`'s pipeline rechecks `isChildConvo` immediately before egress but never rechecks `archivedIds`. A cross-tab archive of the convo *after* the entry check but *before* egress can still emit. This is a **pre-existing property of `sendAttachment`** (shared by drag-drop), not introduced here; tightening the egress guard to recheck `archivedIds` is a client-wide change outside these two owned regions. Documented, not fixed.

**Capture — `MediaRecorder` + `getUserMedia`.**
- Capability guard: if `!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined"` → keep the mic button disabled, tooltip "Voice recording isn't supported in this browser." (Replaces the stale server-not-supported tooltip.)
- MIME selection: prefer `audio/webm;codecs=opus`, fall back to `audio/webm`, then `""` (let the browser default). Use `MediaRecorder.isTypeSupported`.
- Chunks collected via `ondataavailable` into a ref array.
- **Empty-recording guard:** if total captured bytes == 0 (immediate stop, mic race), discard silently and return to idle — do not send an empty blob (also enforced by `sendVoiceNote`'s size==0 guard).

**Lifecycle & failure state machine (the load-bearing part).**
`voiceState: "idle" | "requesting" | "recording" | "error"` (the ONLY React state; drives render). Plus one render-driving state `elapsedMs: number` (timer display, see §5). Everything else is refs (must not re-render, must survive async callbacks): `mediaRecorder`, `mediaStream`, `audioContext`, `analyser`, `rafId`, `chunks`, `recordingStartMs`, `deadlineTimer`, `tickTimer`, `watchdogTimer`, `errorMsg`, `mountedRef`, `voiceStateRef` (mirror of `voiceState` — **updated SYNCHRONOUSLY with every transition**: all state changes go through a `setVoiceState(x)` wrapper that does `voiceStateRef.current = x` immediately BEFORE `reactSetVoiceState(x)`, so the ref never lags a scheduled render. Without this, a `sendVoiceNote` that resolves/rejects in a microtask before React commits the idle render would see a stale `"recording"` mirror and silently suppress the failure — the ref must lead, not follow, the render), `dispositionRef: "send" | "discard"`, `sendInFlightRef: boolean`, `stopInFlightRef: boolean` (interim re-entry lock: true from first stop trigger until finalize completes), `finalizedRef: boolean` (ensures `finalize()` runs exactly once per recording), `recordingIdRef: number` (monotonic per-recording identity — every `onstop`/watchdog/deadline callback captures the id live at record-start and no-ops if it's stale), `genRef: number` (monotonic request generation), `capConvoRef: string` (convo the recording was started in). The composer already maintains `convoIdRef` (`components.tsx:2570`) holding the live selected-convo id — the state machine reads **`convoIdRef.current`** for the current convo (there is NO `client.selectedConversationId` getter; do not invent one).

**Transitions (complete):** `idle → requesting` (mic click) → `recording` (stream acquired + recorder started) → `idle` (onstop finalizer) | `error` (any failure edge). `error → idle` on dismiss or next mic click. No other transitions exist.

**1 — Acquire (idle → requesting).** On mic click: `const gen = ++genRef; setVoiceState("requesting"); capConvoRef = convoIdRef.current; errorMsg = null`. Call `getUserMedia({ audio: true })`:
- **reject** (denied/no-device/etc.) → `if (gen !== genRef) { if (mountedRef.current) setVoiceState("idle"); return; }` (superseded by convo-switch/re-click → return to idle, NOT stuck in `requesting`) else `setVoiceState("error")` with a mapped message (`NotAllowedError`/`SecurityError` → "Microphone access denied.", `NotFoundError` → "No microphone found.", else "Couldn't access the microphone."). Explicit permission-denial transition — the composer never wedges in `requesting`.
- **resolve** → `if (gen !== genRef || !mountedRef.current) { stream.getTracks().forEach(t => t.stop()); if (mountedRef.current) setVoiceState("idle"); return; }` (stale grant after unmount / convo switch / mic re-click → stop the late stream AND, if still mounted, return to idle — a convo switch during `requesting` must not leave the mic disabled forever). Else continue to §2. Any teardown / convo switch / new mic click does `++genRef`, invalidating in-flight requests. **(Both stale branches reset `requesting → idle` when mounted; the `requesting` state always has a bounded exit — P23.)**

**2 — Start recording (requesting → recording | error).** With the stream, build in ONE `try/catch`, with **`recorder.start()` LAST** so a throw never leaves a started-but-unfinalized recorder: (i) `new MediaRecorder(stream, {mimeType})` + wire `ondataavailable`/`onstop`/`onerror`; (ii) `new AudioContext()` + analyser wiring; (iii) set `chunks=[]; dispositionRef="discard"` (default-safe); `sendInFlightRef=false; stopInFlightRef=false; finalizedRef=false; const rid = ++recordingIdRef` (this recording's identity; every callback below captures `rid` and compares to `recordingIdRef.current`); `recordingStartMs=Date.now()`; start the waveform rAF, the timer tick (§5), the deadline `setTimeout` (§4), add the `visibilitychange` listener; (iv) **`recorder.start(1000)`** — a **1 s timeslice** so `ondataavailable` fires periodically and `chunks` accumulate DURING recording, not all-at-once on stop. Without a timeslice, a lost `onstop` also means a lost final `dataavailable` → an empty capture; the timeslice means the watchdog path still has ~all the audio. (v) `setVoiceState("recording")`. On any throw → stop the stream's tracks, `releaseResources()` (cancels the timers/rAF/listener just started, closes a partial `AudioContext`; the recorder never started so there's nothing to `stop()`), `setVoiceState("error")` ("Couldn't start recording."). The already-wired `recorder.onerror` (device error mid-recording) → set `errorMsg`, `setVoiceState("error")`, then `stopRecorder("discard")` so `onstop` releases resources (its error-preserving guard, §3-step-3, keeps the `"error"` state). Capability detection does NOT guarantee these succeed — every post-acquisition step has a defined failure edge.

**3 — Stop (recording → idle) — a single `finalize()` is the SOLE finalizer (called by `onstop` and the watchdog); ALL triggers are idempotent.** `MediaRecorder.stop()` fires `onstop` asynchronously for BOTH send and discard, so intent is carried in `dispositionRef`, set BEFORE any `stop()`. **The trigger side must be idempotent to match the sole-finalizer design.** `MediaRecorder.state` flips to `"inactive"` *synchronously* inside the first `stop()`, but `onstop` fires later, and `voiceState` stays `"recording"` (buttons live) across that gap — so a second trigger (double-click Stop&send, Discard-then-switch, a convo-switch/unmount landing in the window) would call `stop()` on an already-`"inactive"` recorder and throw an uncaught `InvalidStateError`. Two guards:
  - **`stopRecorder(disposition)` helper** — the ONLY thing that calls `recorder.stop()`:
    ```
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;   // authoritative idempotency guard
    if (disposition === "send") { dispositionRef = "send"; sendInFlightRef = true; }
    else if (!sendInFlightRef) { dispositionRef = "discard"; }
    stopInFlightRef = true; armWatchdog();
    mediaRecorder.stop();
    ```
    The `state === "inactive"` early-return is what actually guarantees idempotency AND the committed-send invariant: because `MediaRecorder.state` flips to `"inactive"` *synchronously* inside the first `stop()`, any second trigger returns here before touching `dispositionRef` — so a Stop&send followed by a Discard never overwrites the committed `"send"` (the second call is a no-op, no throw). The `else if (!sendInFlightRef)` branch is belt-and-suspenders for any future caller that reaches it while the recorder is still active; today it is not the load-bearing guard.
  - **UI re-entry (cosmetic best-effort, not the safety layer).** `stopInFlightRef=true` on the first trigger; the Discard/Stop&send buttons read `voiceState === "recording" && !stopInFlightRef` to disable. Note `stopInFlightRef` is a plain ref, so the disabled attribute only updates on the next render (≤ the 500 ms tick) — it reduces the double-click window but the AUTHORITATIVE idempotency guarantee is the `state === "inactive"` guard above, not this.
  - **Absent-signal watchdog (P55)** — a stop can be accepted but `onstop` may never fire (browser/runtime failure). On the first stop trigger, capture `const rid = recordingIdRef.current` and arm `setTimeout(() => finalize(rid), 3000)`. Both `onstop` (as `() => finalize(rid)` with its own captured `rid`) and the watchdog call the SAME idempotent **`finalize(rid)`**; the watchdog runs the FULL finalize (not a bare release-and-idle), so a committed `"send"` is snapshotted+dispatched and an empty committed capture surfaces an error (§finalize step 3), never silent idle-success. `finalize` clears the watchdog. Prevents a permanent wedge in `"recording"` AND silent loss.
- **Call sites** (all route through `stopRecorder`): Stop&send button → `stopRecorder("send")`; Discard button → `stopRecorder("discard")`; convo switch / unmount → `stopRecorder("discard")` (respects `sendInFlightRef`, so a committed send still completes to `capConvoRef`).
- **`finalize(rid)` — the ONE place that consumes chunks + finalizes; called by `onstop` AND the watchdog, each passing the `rid` it captured at record-start. Two guards:**
  1. **Identity guard (P56):** `if (rid !== recordingIdRef.current) return;` — a stale callback from a SUPERSEDED recording (e.g. recording A's `onstop` arriving >3 s late, after A's watchdog already ran AND recording B started) no-ops immediately; it must not touch B's refs. **Then** `if (finalizedRef) return; finalizedRef = true;` (dedup within THIS recording — `onstop` vs its own watchdog). Snapshot `const blob = chunks.length ? new Blob(chunks, {type: recorder?.mimeType}) : null` and `const wantSend = dispositionRef === "send"`.
  2. **Release resources** (idempotent `releaseResources()`: clear `deadlineTimer`+`tickTimer`+`watchdogTimer`, `cancelAnimationFrame(rafId)`, stop all `mediaStream` tracks, `close()` the `AudioContext`, remove the `visibilitychange` listener, null the media refs). Chunks are already snapshotted, so releasing cannot lose them.
  3. **Committed-send-but-empty guard (P3, B3 fix):** `if (wantSend && !blob)` — a committed send with NO audio (the timeslice should prevent this, but a lost `onstop`+`dataavailable` could still leave chunks empty) → `if (mountedRef.current) { setVoiceState("error"); errorMsg = "Recording failed to save."; }` and `console.warn` a watchdog/empty diagnostic; return. NEVER report idle-success for a lost committed recording.
  4. **Success transition, error-preserving:** else `if (mountedRef.current && voiceStateRef.current !== "error") { setVoiceState("idle"); setElapsedMs(0); }` — returns to idle UNLESS a device error already surfaced (`recorder.onerror` set `"error"`, browser then queued `stop`); the guard prevents erasing it. Read via the `voiceStateRef` mirror (state is stale inside the recorder closure).
  5. **Fire the send, non-blocking (rejection-handled, fail-visible):**
     ```
     if (wantSend && blob && capConvoRef) {
       const onFail = () => {
         // Fail-visible (P3): surface the failure UNLESS an active new recording would
         // be clobbered. This is composer-global by decision — see the resolved-tradeoff
         // note below. It may appear after a convo switch; that's accepted as strictly
         // better than silently losing a rare persist failure.
         if (mountedRef.current && voiceStateRef.current !== "recording") {
           setVoiceState("error"); errorMsg = "Couldn't save the recording — try again.";
         }
       };
       void client.sendVoiceNote(blob, capConvoRef)
         .then(outcome => { if (outcome !== "sent" && outcome !== "persisted-terminal") onFail(); })
         .catch(onFail);   // sendAttachment can reject (attachFiles wraps it in try/catch) — never an unhandled promise
     }
     ```
     > **Plan-review update:** the `onFail` guard is `voiceStateRef.current === "idle"` (surface only when idle — don't clobber an active new recording OR requesting acquisition), superseding the `!== "recording"` shown above. See the plan-review refinements note at the top (item 7) and plan T-2.3.

     **Resolved tradeoff (reviewer oscillation, documented per engineering-judgment rule):** two review rounds flipped on whether a superseded recording's failure should be *suppressed* (avoid a toast in the wrong convo) or *surfaced* (avoid silent data loss). Decision: **fail-visible wins** — a persist-failure (rare: IndexedDB write failed, no outbox artifact) is important enough that surfacing it, even possibly after a convo switch, beats hiding it. The only hard guard is against clobbering an *active* new recording (`voiceStateRef !== "recording"`). No further fix on this point.
     Dispatched to the convo the recording was started in (explicit `capConvoRef`). The state machine already returned to idle in step 3; per the fail-visible decision above, a failure re-surfaces as a composer error whenever the composer is not mid-`recording` — it is composer-global and MAY appear after a convo switch (accepted). The ONLY guard is `voiceStateRef.current !== "recording"` (don't clobber an active new recording). `sendInFlightRef=false; stopInFlightRef=false` at the end. (Prose, the `onFail` code block, and the acceptance test all state this single fail-visible contract — no convo-scoped suppression anywhere.)
- **`onstop`** is wired at record-start as `() => finalize(rid)` (capturing that recording's `rid`), so a stale `onstop` no-ops via the identity guard. Starting a new recording bumps `recordingIdRef` and resets `finalizedRef=false` (in §2).

**4 — Duration cap (best-effort, 50 MB is the hard backstop).** Cap target **5:00** on an absolute `Date.now()` deadline (not tick count — bg tabs throttle timers). BOTH the `setTimeout(deadline)` handler AND the `visibilitychange`→visible reconcile (`if (Date.now()-recordingStartMs >= CAP_MS)`) auto-stop by calling **`stopRecorder("send")`** — NOT a direct `recorder.stop()`. Routing through the guarded helper is mandatory: it sets `stopInFlightRef` (disabling Discard) and arms the watchdog, so the cap path can't leave Discard actionable and race the committed send (the bug of calling `stop()` directly). **Caveat (Tier-2, accepted):** a fully OS-suspended tab freezes JS, so neither the timeout nor the visibility handler runs until resume — the blob can exceed 5:00. This is best-effort, not a hard guarantee. The HARD limit is the server's 50 MB media cap: an oversize upload returns `too_large` during `runPendingUpload`, which is handled on the normal attachment path (`attachState→error`, a visible **outbox error tile** with retry) — NOT a `sendAttachment` return value or composer toast. Still user-visible, just via the same tile every oversize attachment uses. The 5:00 target only bounds normal foreground sessions.

**5 — Timer display (explicit re-render source).** The MM:SS timer + `aria-live` need a render source; `recordingStartMs` is a non-rendering ref. Drive them with `tickTimer = setInterval(() => setElapsedMs(Date.now() - recordingStartMs), 500)`, cleared in `releaseResources()`. Display is DERIVED from `elapsedMs` (`floor(elapsedMs/60000):pad(...)`), computed from `Date.now()` so a throttled/coalesced interval only reduces update frequency, never drifts the value. (Foreground intervals fire ~normally; the timer matters only in foreground.)

**Recording UI.**
- **idle:** mic button enabled in `mx_MessageComposer_actions` (where the placeholder is now).
- **requesting:** mic button busy (disabled, spinner/pulse), aria-label "Requesting microphone…".
- **recording:** the composer input row is replaced by a **recording strip**: `[pulsing dot] [live waveform canvas] [MM:SS timer] [Discard] [Stop & send]`. Textarea/send/attach hidden (recording is modal within the composer).
- **error:** inline dismissible error line (`errorMsg`, styled like `mj_ConnectionError`), auto-clears on dismiss or next mic click.

**Waveform.** Web Audio `AnalyserNode` (`getByteTimeDomainData`) rendered to a small `<canvas>` via `requestAnimationFrame` — live amplitude trace, writes directly to canvas (no React re-render). `aria-hidden`. Under `prefers-reduced-motion: reduce`, draw a flat baseline instead of the animated trace. Canvas stroke = `--cpd-color-icon-accent-primary`; dot = `--cpd-color-text-critical-primary`.

**Unmount / convo-switch effects.** `mountedRef` set false in the `useEffect` cleanup on unmount. That cleanup and the `useLayoutEffect` on `convoId` change both: `++genRef` (invalidate any in-flight permission request), then — ONLY if a recorder is active — `stopRecorder("discard")`. `stopRecorder`'s own `!mediaRecorder || state === "inactive"` guard makes this a safe no-op when idle/requesting/error (no recorder yet, or already stopped), so an unmount in any state is harmless. As a belt-and-suspenders for the requesting→never-recorded case (stream may still be acquiring), the cleanup also calls `releaseResources()` directly (idempotent). Because `finalize()` references only refs + the stable `client` (state reads go through `voiceStateRef`; the sole `setVoiceState` is `mountedRef`-guarded), it runs correctly even after unmount: a committed send still completes to `capConvoRef`, resources still release, and the post-unmount `setVoiceState` is skipped.

### Accessibility (WCAG AA)
- Recording state announced via `aria-live="polite"` region driven by `elapsedMs` (§5) ("Recording, 0:14"); updates on the 500 ms tick.
- Buttons: "Stop and send voice message", "Discard recording", "Record voice message".
- Timer text meets contrast on both themes (`--cpd-color-text-primary`/`secondary`).
- Waveform is decorative (`aria-hidden`) — all state conveyed textually by the timer + live region.
- Focus: on entering recording, move focus to "Stop & send". On return to idle, focus the mic button ONLY when this finalize is for the still-current context — `capConvoRef === convoIdRef.current` AND the active element is still within this composer (not the user typing elsewhere). A late `onstop`/watchdog finalize after a convo switch must NOT steal focus into the new conversation (P56 — the idle transition belongs to the old recording, not whatever composer is current later).

### Files touched (Feature 1)
- `src/journal/components.tsx` — `Composer` (lifecycle state machine, recording strip, mic button) — **owned region**.
- `src/journal/client.ts` — add `sendVoiceNote(blob, convoId?)`; change `sendAttachment` return type to `"sent" | "persisted-terminal" | "persist-failed" | "skipped"` (backward-compatible; `attachFiles` ignores it). **`confirmStagedFile` untouched.**
- `src/journal/icons.tsx` — add `StopIcon` / `TrashIcon` (discard) if not present; reuse `MicOnIcon`.
- `src/journal/journal.pcss` — recording-strip styles, pulsing dot, waveform canvas, `prefers-reduced-motion` block.

---

## Feature 2 — #508 ToolStream ANSI color (mechanical fold-in)

### Background
`ToolStream` (`components.tsx:2039`) renders live PTY output as a raw `<pre>{stream.content}</pre>`. Colored output arrives with ANSI SGR escape codes, so the terminal escapes render as **literal garbage** (`^[[32m…`). Cosmetic only.

The legacy client has a complete, correct parser at `/opt/matron/web/src/components/views/messages/ansiToReact.tsx`:
- `SgrState`, `INITIAL_SGR_STATE`, `parseAnsi(input, prevState, prevTail, startKey): { nodes, state, tail }`.
- 16-color palette (30-37/90-97 fg, 40-47/100-107 bg via -10 mirror), bold/dim/inverse, `SGR 0/1/2/7/22/27/39/49`.
- Holds incomplete trailing escape sequences in `tail`; strips non-SGR CSI (cursor moves).

### Key simplification
`stream.content` is the **full accumulated (byte-capped) buffer** — the client accumulates deltas in `handleEphemeral` (`client.ts:1595`) before render. So `ToolStream` does NOT parse WS deltas; it re-renders the whole string each time. Therefore a **single** `parseAnsi(content, INITIAL_SGR_STATE, "", 0)` per render is correct and sufficient — SGR state carries naturally within the one string. The legacy cross-chunk state/tail carrying (needed by the legacy delta-parsing `MLiveOutputBody`) is NOT needed here.

### Design decisions
- **Port** the parser into a new module `src/journal/ansi.tsx` (`parseAnsi` + `SgrState` + `INITIAL_SGR_STATE` + palette; keep the license header), with **one deliberate divergence from the legacy: drop ANSI background + inverse + dim support.** The port keeps foreground colors + bold only (SGR `0/1/22/39` + `30-37`/`90-97`), and **parses-and-ignores** background codes (`40-47`/`100-107`/`49`), inverse (`7`/`27`), AND dim (`2`) — all consumed by the CSI scanner (never rendered as literal text) but setting no style. **Why:** (a) background support creates a foreground/background contrast matrix — e.g. `\x1b[47m` (white bg) with the default `#dcdcdc` fg = 1:1, unreadable; (b) `dim` (reduced opacity) can push even the clamped `#8b909a` (5.03:1) below the 4.5:1 AA floor (≈3.2:1 at 60% opacity). Both would break the WCAG AA contract. Tool output (build/test/compiler logs) is overwhelmingly foreground-colored at full weight; dropping bg/inverse/dim is graceful degradation (text still shows in full-opacity default/foreground color, just no highlight/dimming) and collapses the contrast audit to a single **full-opacity** fg-on-`#1e2127` check — every emitted color ≥ 5:1. `SgrState` drops `bg`/`inverse`/`dim`; `spanStyle` uses `fg`/`bold` only. Documented divergence, not a bug.
- **`ToolStream` render change:** replace `{stream.content}` inside `<pre>` with `parseAnsi(text, INITIAL_SGR_STATE, "", 0).nodes`. **Strip BEFORE prefixing** (order matters — the fragment must be at position 0): `const cleaned = headTruncated ? stripLeadingSgrFragment(content) : content;` then `const text = headTruncated ? "… earlier output omitted …\n" + cleaned : content;`. Memoize the parse with `useMemo` keyed on `text`. (Applying the strip to the already-prefixed string would leave the fragment mid-string, unmatched.)
- **Palette theming — self-contained terminal surface (concrete, theme-independent).** The legacy palette is *tuned for a dark terminal background* (its own comment). A terminal/CI-log view is conventionally a self-contained surface with its own fixed colors, independent of app theme — the same way a code block owns its palette. So the `mj_LiveTool pre` becomes an explicit terminal surface with **BOTH** a fixed dark background AND a fixed light default foreground (the earlier draft's bug was fixing only the background, leaving unstyled text inheriting `--cpd-color-text-primary`, which is dark in light theme → dark-on-dark). Concrete pairing, identical in both themes:
  - background: `#1e2127` (dark terminal surface)
  - default (unstyled) foreground: `#dcdcdc` (= the palette's ANSI-white `37`, ≥ 7:1 on `#1e2127`, AAA)
  - ANSI palette: the ported hex table, unchanged, **except** clamp the two near-black codes that fail AA on the dark surface — map `30 → #8b909a` (5.03:1) and `90 → #a7adb8` (7.15:1). Both the original `30 (#3a3a3a → 1.42:1)` and `90 (#5c6370 → 2.67:1)` fail; the clamps are computed to clear the 4.5:1 normal-text threshold. All other palette colors (incl. brights `91-97`) verified ≥ 5:1 on `#1e2127`; default fg `#dcdcdc` = 11.76:1. (Contrast computed via WCAG relative-luminance; values pinned in the plan's test list.)
  - **Scoped `--cpd-*` exception, documented:** these five fixed hex values are terminal-emulator chrome, deliberately theme-independent — the one legitimate exception to the `--cpd-*`-only ship constraint (a terminal surface that flips with the app theme is wrong). Called out explicitly in the pcss comment and the PR description so the review doesn't re-flag it as a token violation. Everything outside the terminal surface stays `--cpd-*`.
  - Contrast audit reduces to ONE backdrop (`#1e2127`) because background SGR codes are dropped (above): default fg + every emitted foreground palette color checked once against `#1e2127`, both themes identical — no fg/bg pair matrix. Documented in the spec; a computed-style test asserts the surface class/colors are applied (jsdom can't measure contrast — the pairing is audited by construction).
- **Truncation caveats.** When `headTruncated`, `capToolStream` (`client.ts:200`) cuts at a raw byte offset with no escape-boundary awareness. Two effects:
  1. **Lost color state (accepted):** the retained tail may begin mid-run, so colors set before the cut are lost and the tail starts at the default fg until the next escape. Cosmetic; not fixed.
  2. **Leaked escape fragment (mitigated, low-false-positive).** A byte cut inside an SGR sequence `ESC [ <params> m` can leave any suffix of it. The reviewers correctly noted that a digit-led heuristic (`32m`, `2m`) collides with legitimate text (`"2ms latency"`, `"32m remaining"`) — corrupting real output is worse than an occasional un-colored escape. So when `headTruncated`, strip ONLY the **`[`-led** form: **`/^\[[0-9;]*m/`** (a `[` followed by zero-or-more digits/semicolons, terminated by `m`) — i.e. the common cut that drops only the `ESC` byte and keeps `[…m`. This has near-zero legit collision (a real line almost never starts with `[` then only digits/`;` then `m`): "[link]"→`[`then`l` no match; "[0]"→`]`≠m no match; "[1;2;3]"→`]`≠m no match. **Accepted residuals (documented, same cosmetic tier as the color-state loss):** cuts that also drop the `[` (leaving `32m`/`2m`/`;32m`) or land at other offsets are NOT stripped — they require a byte-precise cut AND a following legit collision to matter, and stripping them would eat real diagnostic text. Covered by unit tests.

### Files touched (Feature 2)
- `src/journal/ansi.tsx` — **new**, ported parser (with the `30→#8b909a` / `90→#a7adb8` near-black clamp — the single authoritative pairing, matching Palette theming + the test list) + a `stripLeadingSgrFragment(content)` helper for the truncation case.
- `src/journal/components.tsx` — `ToolStream` render: memoized `parseAnsi(...)`, apply `stripLeadingSgrFragment` when `headTruncated` (owned region).
- `src/journal/journal.pcss` — terminal surface on `mj_LiveTool pre`: fixed `#1e2127` bg + `#dcdcdc` default fg, with a comment marking the scoped `--cpd-*` exception.
- `test/unit-tests/journal/ansi-test.ts` — **new** parser + fragment-strip render tests.

---

## Testing

**Feature 2 (ANSI) — unit tests (`ansi-test.ts`):**
- Plain text (no escapes) → single text node, unstyled.
- `\x1b[32mgreen\x1b[0m` → styled span (color `#98c379`) then reset.
- Bold (`1`) applies, `22` clears it.
- **Background (`\x1b[42m`/`\x1b[47m`), inverse (`7`/`27`), and dim (`2`) parsed-and-ignored** — consumed (not literal text), set NO style (dropped-bg/inverse/dim divergence). `\x1b[47mhi` → plain "hi", no backgroundColor; `\x1b[2m\x1b[32mhi` → green "hi" at full opacity (no dim).
- Compound params `\x1b[1;31m` (bold + red fg).
- Incomplete trailing escape held in `tail` (not emitted as literal).
- Non-SGR CSI (`\x1b[2J`, cursor move) stripped, surrounding text preserved.
- `39`/`49` reset fg/bg only.
- Unsupported (256-color `\x1b[38;5;196m`) silently ignored, text preserved.
- Near-black clamp: `\x1b[30m` → `#8b909a`, `\x1b[90m` → `#a7adb8` (AA-legible on the terminal surface).
- `stripLeadingSgrFragment` (applied only when `headTruncated`, regex `/^\[[0-9;]*m/`): `"[32mhello"`→`"hello"`; `"[mhello"`→`"hello"`; `"[1;31mx"`→`"x"`; strips NOTHING from `"2ms latency"`, `"32m remaining"`, `"[link] x"`, `"[0] done"`, `"test output"` (digit-led + non-SGR-bracket residuals left intact to avoid eating real text).
- **Strip-before-prefix integration:** with `headTruncated=true` and content `"[32mBUILD OK"`, the rendered `ToolStream` shows the "… earlier output omitted …" prefix then **default-colored** "BUILD OK" with NO literal `[32m` — the stripped `[32m` fragment took its color state with it (accepted color-state-loss caveat), so "BUILD OK" is NOT green; the test asserts no `[32m` text AND no green span (not "colored").

**Feature 1 (voice) — jest + jsdom:**
jsdom has no real `MediaRecorder`/`getUserMedia`/`AudioContext`. Test the client method + guards directly, and the lifecycle via injectable mocks:
- Capability guard: with `navigator.mediaDevices` undefined, mic button stays disabled with the browser-unsupported tooltip.
- `client.sendVoiceNote(blob, convoId?)`: inject a Blob, assert it routes through `sendAttachment` with a `content_type` starting with `audio/` (blob type may carry a `;codecs=opus` suffix) and the passed/resolved convoId; assert it does NOT set `stagedUploads` (no caption modal). Reuse existing `client-test.ts` upload-mock patterns.
- Empty-blob guard: `sendVoiceNote(new Blob([]))` → `"skipped"`, no dispatch.
- Convo-state bail: no convo / child convo / archived convo → `"skipped"`, no dispatch.
- Explicit-convo routing: `sendVoiceNote(blob, "A")` while `convoIdRef` = "B" → dispatches to "A" (recorded-convo routing, not "still selected").
- Outcome mapping: mock `persistPendingAttachment` → each of `persisted-uploadable`/`persisted-terminal`/`persist-failed`; assert `sendAttachment` returns `"sent"`/`"persisted-terminal"`/`"persist-failed"` respectively.
- `sendAttachment` return-type change: existing `attachFiles`/`confirmStagedFile` tests stay green (return value ignored by existing callers — regression guard).
- **Disposition (discard must not send):** with a mocked recorder whose `stop()` invokes the captured `onstop`, assert discard/convo-switch/unmount (`dispositionRef="discard"`) does NOT call `sendVoiceNote`, while Stop&send (`dispositionRef="send"`) fires it once, to `capConvoRef`.
- **In-flight send survives teardown:** Stop&send (sets `sendInFlightRef`) followed by a convo-switch teardown → `onstop` still sends to `capConvoRef` (teardown did not clobber the "send" disposition).
- **Success transition:** after `onstop` for a send, `voiceState` returns to `"idle"` synchronously (does NOT await the upload); a later rejected `sendVoiceNote` promise flips to `"error"`.
- **Permission-denial transition:** `getUserMedia` rejects (`NotAllowedError`) → `voiceState="error"` with the mapped message, NOT stuck in `"requesting"`.
- **Late-permission guard:** `getUserMedia` resolves after `genRef` advanced (unmount/switch) → late stream tracks stopped, recording never starts.
- **Timer tick:** advance fake timers 1500 ms during recording → `elapsedMs`-derived MM:SS + `aria-live` text advance (not frozen at 0:00).
- **Double-stop idempotency:** with a mocked recorder whose `state` flips to `"inactive"` on first `stop()`, a second stop trigger (double-click, or discard-then-switch) → `stopRecorder` no-ops (no throw), `onstop` fires once.
- **Error-preserving finalizer:** `recorder.onerror` sets `"error"`, then a queued `stop` fires `onstop` → `voiceState` stays `"error"` (not flipped to `"idle"`).
- **Send rejection (fail-visible):** mock `sendVoiceNote` to reject → `voiceState` flips to `"error"`, no unhandled rejection. Holds whether or not the convo was switched (fail-visible is composer-global); the ONLY case it does NOT flip is when an active new recording is in progress (`voiceStateRef==="recording"`).
- **Fast-failure not suppressed (B2):** `sendVoiceNote` resolves `"skipped"` synchronously in the microtask right after finalize schedules idle → because `voiceStateRef` was set to `"idle"` synchronously by the `setVoiceState` wrapper, `onFail` surfaces the error (not swallowed by a stale `"recording"` mirror).
- **Requesting-wedge exit (B1):** switch convos (bump `genRef`) while `getUserMedia` is pending, then resolve/reject the stale promise → `voiceState` returns to `"idle"` (mic re-enabled), late stream tracks stopped.
- **Committed-send survives Discard:** Stop&send then Discard (before `onstop`) → disposition stays `"send"`, note sent to `capConvoRef` (not dropped).
- **Watchdog runs full finalize:** Stop&send fires but `onstop` never invoked; advance fake timers 3000 ms → `finalize()` runs (resources released, committed send dispatched to `capConvoRef`, `voiceState`→`"idle"`), and a subsequent late `onstop` is a no-op (`finalizedRef`).
- **Auto-stop routes through guard:** the 5:00 deadline fires `stopRecorder("send")` (sets `stopInFlightRef`, disables Discard) — a Discard click after the deadline does NOT flip disposition to discard (committed send survives).
- **Stale-callback identity guard:** recording A's watchdog finalizes A; start recording B (bumps `recordingIdRef`); a late `finalize(rid_A)` from A → no-ops (`rid_A !== recordingIdRef.current`), B's refs/chunks untouched.
- **Committed-empty capture:** committed send (`dispositionRef="send"`) but `chunks` empty at finalize → `voiceState="error"` ("Recording failed to save."), NO idle-success, warn logged.
- **Timeslice:** `recorder.start` is called with a `1000` ms timeslice argument (chunks accumulate during recording).
- **Partial-start finalize:** `AudioContext` construction throws (recorder not yet started) → tracks stopped, timers/rAF cleared, `voiceState="error"`.
- Full real-media-stream teardown (`MediaStreamTrack.stop` releasing the OS mic indicator) and OS-suspend cap behavior are manual-verified (jsdom limitation, documented).

**Feature 2 — terminal surface:** a component test asserting `ToolStream` renders the `mj_LiveTool pre` with the terminal-surface class (computed contrast is audited-by-construction on the single `#1e2127` backdrop, not measured in jsdom).

**Manual verification (documented, not automated):** real mic capture → record → stop → transcript appears; permission-denied path; 5-min auto-stop incl. backgrounded-tab reconciliation; convo switch discards; discard button discards; both themes; keyboard-only operation; a colored `npm test`/build stream renders with color and no literal escapes (incl. a >64KB truncated stream).

---

## Ship constraints (from brief)
- `--cpd-*` tokens only; both themes; WCAG AA. **One documented exception, precedence-ruled:** the ANSI terminal surface (`mj_LiveTool pre`) uses five fixed, theme-independent hex values (`#1e2127` bg, `#dcdcdc` fg, the `30`/`90` clamps `#8b909a`/`#a7adb8`, and the ported foreground palette) — a terminal-emulator chrome that must NOT flip with the app theme. Where this Feature-2 exception and the "`--cpd-*` tokens only" rule conflict, **the terminal-surface exception governs for `mj_LiveTool pre` and its descendants only**; everything else stays `--cpd-*`. This carve-out is called out in the pcss comment + PR description so review gates don't re-flag it.
- **Merge only — no live deploy** (batched at end with the other two windows).
- Rebase on `origin/main` before ship (sibling windows are merging into the same `components.tsx`).
- Flow: this spec → `/spec-review` → `/plan-slim` → `/execute-slim` → `/ship-slim`.

## Out of scope
- Bridge/server changes (transcription already live).
- Voice playback-before-send / re-record UX (rejected — see frontmatter).
- 256-color / truecolor ANSI (parser silently ignores; matches legacy).
- Fixing the truncation-boundary **color-state** reset (accepted cosmetic caveat). The truncation **fragment leak** IS fixed (`stripLeadingSgrFragment`).
- ANSI-aware truncation in `capToolStream` (client-shared byte-cap; out of these two owned regions — the `stripLeadingSgrFragment` mitigation in `ToolStream` covers the visible symptom).
