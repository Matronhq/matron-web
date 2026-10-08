/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The voice-note recorder shared by the chat composer and the tracker item reply box: microphone
 * acquisition (with its timeout and session binding), the MediaRecorder lifecycle (a 5-minute cap,
 * an onstop watchdog, late-error guards), the live waveform, and the controls drawn while recording.
 * The hook only records; what a finished recording is FOR belongs to the caller's `onRecorded`.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CloseIcon, MicOnIcon, StopIcon, TrashIcon } from "./icons";

export type VoiceState = "idle" | "requesting" | "recording" | "error";

/** Where a finished recording was made: the caller's context at mic time, and the session then. */
export interface VoiceRecordingContext {
    contextKey: string;
    sessionGen: number;
}

export interface VoiceRecorder {
    voiceState: VoiceState;
    voiceSupported: boolean;
    elapsedLabel: string;
    waveformActive: boolean;
    /** The error to show while `voiceState` is "error". */
    errorMessage: string | null;
    /** A stop was committed and the recorder has not finalized yet: the bar's buttons are inert. */
    stopInFlight: boolean;
    acquireVoice: () => void;
    commitVoiceStop: (disposition: "send" | "discard") => void;
    dismissError: () => void;
    /** A send of a finished recording failed: show `message` unless a new recording is under way. */
    reportSendFailure: (message: string) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    micButtonRef: React.RefObject<HTMLButtonElement | null>;
    stopButtonRef: React.RefObject<HTMLButtonElement | null>;
    waveformCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useVoiceRecorder({
    contextKey,
    client,
    onRecorded,
}: {
    /** The surface the mic serves (a conversation id, an item number). A change tears a recording down. */
    contextKey: string | undefined;
    /** The session generation binds a recording to the session it began in. */
    client: { readonly sessionGeneration: number };
    /** A recording committed with "send" that holds audio, made in the still-current session. */
    onRecorded: (blob: Blob, context: VoiceRecordingContext) => void;
}): VoiceRecorder {
    const contextKeyRef = useRef(contextKey);
    contextKeyRef.current = contextKey;
    const onRecordedRef = useRef(onRecorded);
    onRecordedRef.current = onRecorded;
    const [voiceState, reactSetVoiceState] = useState<VoiceState>("idle");
    const [elapsedMs, setElapsedMs] = useState(0);
    const [waveformActive, setWaveformActive] = useState(false);
    const genRef = useRef(0);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const rafId = useRef<number | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recMimeRef = useRef<string | undefined>(undefined);
    const recordingStartMs = useRef(0);
    const deadlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const acquireTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorMsg = useRef<string | null>(null);
    const mountedRef = useRef(false);
    const voiceStateRef = useRef<VoiceState>("idle");
    const dispositionRef = useRef<"send" | "discard">("discard");
    const sendInFlightRef = useRef(false);
    const stopInFlightRef = useRef(false);
    const finalizedRef = useRef(false);
    const recordingIdRef = useRef(0);
    const capContextRef = useRef<string | undefined>(undefined);
    const recordingSessionGenRef = useRef(0);
    const visibilityHandlerRef = useRef<(() => void) | null>(null);
    const voiceContextRef = useRef(contextKey);
    const containerRef = useRef<HTMLDivElement>(null);
    const micButtonRef = useRef<HTMLButtonElement>(null);
    const stopButtonRef = useRef<HTMLButtonElement>(null);
    const restoreVoiceFocusRef = useRef(false);
    const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
    const voiceSupported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== "undefined";
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    const elapsedSeconds = Math.floor((elapsedMs % 60_000) / 1000);
    const elapsedLabel = `${elapsedMinutes}:${String(elapsedSeconds).padStart(2, "0")}`;

    const setVoiceState = useCallback((next: VoiceState): void => {
        voiceStateRef.current = next;
        reactSetVoiceState(next);
    }, []);

    const releaseMedia = useCallback((): void => {
        if (deadlineTimer.current !== null) {
            clearTimeout(deadlineTimer.current);
            deadlineTimer.current = null;
        }
        if (tickTimer.current !== null) {
            clearInterval(tickTimer.current);
            tickTimer.current = null;
        }
        if (rafId.current !== null) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
        }
        mediaStream.current?.getTracks().forEach((track) => track.stop());
        mediaStream.current = null;
        const context = audioContext.current;
        audioContext.current = null;
        analyser.current = null;
        if (context && context.state !== "closed") void context.close().catch(() => undefined);
        if (visibilityHandlerRef.current) {
            document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
            visibilityHandlerRef.current = null;
        }
    }, []);

    const releaseResources = useCallback((): void => {
        releaseMedia();
        if (watchdogTimer.current !== null) {
            clearTimeout(watchdogTimer.current);
            watchdogTimer.current = null;
        }
        // Detach handlers on final release: after finalize the recorder object
        // can still emit a late onerror (e.g. during track teardown), which
        // would otherwise flip a finalized/sent note to a false error state.
        // finalizedRef guards the onerror body too; detaching is
        // belt-and-suspenders and also drops the reference for GC.
        const recorder = mediaRecorder.current;
        if (recorder) {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
        }
        mediaRecorder.current = null;
    }, [releaseMedia]);

    const finalizeVoice = useCallback(
        (rid: number, localChunks: Blob[]): void => {
            if (rid !== recordingIdRef.current) return;
            if (finalizedRef.current) return;
            finalizedRef.current = true;

            const mime = recMimeRef.current || "audio/webm";
            const blob = localChunks.length ? new Blob(localChunks, { type: mime }) : null;
            const wantSend = dispositionRef.current === "send";
            const capturedContext = capContextRef.current;
            const capturedSessionGen = recordingSessionGenRef.current;
            releaseResources();

            if (wantSend && !blob) {
                if (mountedRef.current) {
                    errorMsg.current = "Recording failed to save.";
                    setVoiceState("error");
                }
                console.warn("voice: committed recording contained no audio", {
                    rid,
                    disposition: dispositionRef.current,
                    chunks: localChunks.length,
                    elapsedMs: Date.now() - recordingStartMs.current,
                });
                sendInFlightRef.current = false;
                stopInFlightRef.current = false;
                return;
            }

            if (mountedRef.current && voiceStateRef.current !== "error") {
                restoreVoiceFocusRef.current = Boolean(containerRef.current?.contains(document.activeElement));
                setVoiceState("idle");
                setElapsedMs(0);
            }

            if (wantSend && blob && capturedContext && client.sessionGeneration !== capturedSessionGen) {
                console.warn("voice: session changed before finalize — recording not sent", { rid });
            }

            if (wantSend && blob && capturedContext && client.sessionGeneration === capturedSessionGen) {
                onRecordedRef.current(blob, { contextKey: capturedContext, sessionGen: capturedSessionGen });
            }
            sendInFlightRef.current = false;
            stopInFlightRef.current = false;
        },
        [client, releaseResources, setVoiceState],
    );

    const stopRecorder = useCallback(
        (disposition: "send" | "discard"): void => {
            const recorder = mediaRecorder.current;
            if (!recorder || recorder.state === "inactive") return;
            if (disposition === "send") {
                dispositionRef.current = "send";
                sendInFlightRef.current = true;
            } else if (!sendInFlightRef.current) {
                dispositionRef.current = "discard";
            }
            stopInFlightRef.current = true;
            const rid = recordingIdRef.current;
            const localChunks = chunksRef.current;
            watchdogTimer.current = setTimeout(() => {
                if (rid !== recordingIdRef.current || finalizedRef.current) return;
                console.warn("voice: onstop absent — watchdog finalizing", {
                    rid,
                    chunks: localChunks.length,
                    elapsedMs: Date.now() - recordingStartMs.current,
                });
                finalizeVoice(rid, localChunks);
            }, 3000);
            recorder.stop();
        },
        [finalizeVoice],
    );

    const startWaveform = useCallback((): void => {
        const values = new Uint8Array(analyser.current?.frequencyBinCount ?? 0);
        const reducedMotion =
            typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const draw = (): void => {
            const canvas = waveformCanvasRef.current;
            const currentAnalyser = analyser.current;
            if (canvas && currentAnalyser) {
                const context = canvas.getContext("2d");
                if (context) {
                    const width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
                    const height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
                    if (canvas.width !== width) canvas.width = width;
                    if (canvas.height !== height) canvas.height = height;
                    if (!reducedMotion) currentAnalyser.getByteTimeDomainData(values);
                    context.clearRect(0, 0, width, height);
                    const computed = getComputedStyle(canvas);
                    context.strokeStyle =
                        computed.getPropertyValue("--cpd-color-icon-accent-primary").trim() || computed.color;
                    context.lineWidth = Math.max(1, window.devicePixelRatio);
                    context.beginPath();
                    for (let index = 0; index < values.length; index += 1) {
                        const x = (index / Math.max(1, values.length - 1)) * width;
                        const y = reducedMotion ? height / 2 : (values[index] / 255) * height;
                        if (index === 0) context.moveTo(x, y);
                        else context.lineTo(x, y);
                    }
                    context.stroke();
                }
            }
            rafId.current = requestAnimationFrame(draw);
        };
        draw();
    }, []);

    const startRecording = useCallback(
        (stream: MediaStream): void => {
            const rid = ++recordingIdRef.current;
            const localChunks: Blob[] = [];
            chunksRef.current = localChunks;
            recMimeRef.current = undefined;
            mediaStream.current = stream;
            recordingSessionGenRef.current = client.sessionGeneration;
            setWaveformActive(false);
            try {
                const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((candidate) =>
                    window.MediaRecorder.isTypeSupported(candidate),
                );
                const recorder = mimeType
                    ? new window.MediaRecorder(stream, { mimeType })
                    : new window.MediaRecorder(stream);
                mediaRecorder.current = recorder;
                recorder.onstart = () => {
                    if (rid !== recordingIdRef.current || localChunks !== chunksRef.current) return;
                    recMimeRef.current ||= recorder.mimeType || undefined;
                };
                recorder.ondataavailable = (event) => {
                    if (rid !== recordingIdRef.current || localChunks !== chunksRef.current) return;
                    recMimeRef.current ||= event.data.type || undefined;
                    if (event.data.size) localChunks.push(event.data);
                };
                recorder.onstop = () => {
                    if (rid !== recordingIdRef.current || localChunks !== chunksRef.current) return;
                    finalizeVoice(rid, localChunks);
                };
                recorder.onerror = () => {
                    // finalizedRef: a late error after the note was already
                    // finalized+sent (notably via the onstop-absent watchdog)
                    // must not overwrite the sent/idle state with a false error.
                    if (rid !== recordingIdRef.current || localChunks !== chunksRef.current || finalizedRef.current)
                        return;
                    releaseMedia();
                    errorMsg.current = "Recording stopped unexpectedly.";
                    setVoiceState("error");
                    stopRecorder("discard");
                };

                try {
                    const context = new window.AudioContext();
                    audioContext.current = context;
                    const currentAnalyser = context.createAnalyser();
                    currentAnalyser.fftSize = 256;
                    analyser.current = currentAnalyser;
                    context.createMediaStreamSource(stream).connect(currentAnalyser);
                    startWaveform();
                    setWaveformActive(true);
                } catch {
                    if (rafId.current !== null) {
                        cancelAnimationFrame(rafId.current);
                        rafId.current = null;
                    }
                    const context = audioContext.current;
                    audioContext.current = null;
                    analyser.current = null;
                    if (context && context.state !== "closed") void context.close().catch(() => undefined);
                }

                dispositionRef.current = "discard";
                sendInFlightRef.current = false;
                stopInFlightRef.current = false;
                finalizedRef.current = false;
                recordingStartMs.current = Date.now();
                setElapsedMs(0);
                tickTimer.current = setInterval(() => {
                    setElapsedMs(Date.now() - recordingStartMs.current);
                }, 500);
                const capMs = 5 * 60 * 1000;
                deadlineTimer.current = setTimeout(() => {
                    if (Date.now() - recordingStartMs.current >= capMs) stopRecorder("send");
                }, capMs);
                const reconcileDurationCap = (): void => {
                    if (document.visibilityState === "visible" && Date.now() - recordingStartMs.current >= capMs) {
                        stopRecorder("send");
                    }
                };
                visibilityHandlerRef.current = reconcileDurationCap;
                document.addEventListener("visibilitychange", reconcileDurationCap);

                recorder.start(1000);
                setVoiceState("recording");
            } catch {
                stream.getTracks().forEach((track) => track.stop());
                releaseResources();
                errorMsg.current = "Couldn't start recording.";
                setVoiceState("error");
            }
        },
        [client, finalizeVoice, releaseMedia, releaseResources, setVoiceState, startWaveform, stopRecorder],
    );

    const acquireVoice = useCallback((): void => {
        if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") return;
        const gen = ++genRef.current;
        // Bind mic acquisition to the session generation at REQUEST time
        // (finalize/send are already session-bound via recordingSessionGenRef).
        // A getUserMedia pending across a logout / session replacement must not
        // be adopted by the replacement session: recordingSessionGenRef
        // is set at resolve time inside startRecording, so without this guard a
        // request that resolves after the session changed would bind to the NEW
        // gen and let the note send under the wrong session.
        const acquireSessionGen = client.sessionGeneration;
        setVoiceState("requesting");
        capContextRef.current = contextKeyRef.current;
        errorMsg.current = null;
        const localTimer = setTimeout(() => {
            if (gen === genRef.current && voiceStateRef.current === "requesting") {
                if (acquireTimer.current === localTimer) acquireTimer.current = null;
                ++genRef.current;
                errorMsg.current = "Microphone request timed out — try again.";
                setVoiceState("error");
            }
        }, 20_000);
        acquireTimer.current = localTimer;
        void navigator.mediaDevices.getUserMedia({ audio: true }).then(
            (stream) => {
                clearTimeout(localTimer);
                if (acquireTimer.current === localTimer) acquireTimer.current = null;
                if (gen !== genRef.current || !mountedRef.current || client.sessionGeneration !== acquireSessionGen) {
                    stream.getTracks().forEach((track) => track.stop());
                    // A session-replaced request is cancelled, not hung: the 20 s timeout was just
                    // cleared, so without this the button would stay locked in "requesting".
                    if (gen === genRef.current && mountedRef.current) setVoiceState("idle");
                    return;
                }
                startRecording(stream);
            },
            (error: unknown) => {
                clearTimeout(localTimer);
                if (acquireTimer.current === localTimer) acquireTimer.current = null;
                if (gen !== genRef.current) return;
                const name =
                    typeof error === "object" && error !== null && "name" in error
                        ? String((error as { name: unknown }).name)
                        : "";
                errorMsg.current =
                    name === "NotAllowedError" || name === "SecurityError"
                        ? "Microphone access denied."
                        : name === "NotFoundError"
                          ? "No microphone found."
                          : "Couldn't access the microphone.";
                setVoiceState("error");
            },
        );
    }, [client, setVoiceState, startRecording]);

    const commitVoiceStop = useCallback(
        (disposition: "send" | "discard"): void => {
            stopRecorder(disposition);
            containerRef.current?.querySelectorAll<HTMLButtonElement>(".mj_VoiceRecording_action").forEach((button) => {
                button.disabled = stopInFlightRef.current;
            });
        },
        [stopRecorder],
    );

    const teardownVoice = useCallback((): void => {
        ++genRef.current;
        if (acquireTimer.current !== null) {
            clearTimeout(acquireTimer.current);
            acquireTimer.current = null;
        }
        if (voiceStateRef.current === "requesting") {
            if (mountedRef.current) setVoiceState("idle");
            return;
        }
        if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") stopRecorder("discard");
        releaseMedia();
    }, [releaseMedia, setVoiceState, stopRecorder]);

    const dismissError = useCallback((): void => {
        errorMsg.current = null;
        setVoiceState("idle");
    }, [setVoiceState]);

    const reportSendFailure = useCallback(
        (message: string): void => {
            if (mountedRef.current && voiceStateRef.current === "idle") {
                errorMsg.current = message;
                setVoiceState("error");
            }
        },
        [setVoiceState],
    );

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            teardownVoice();
        };
    }, [teardownVoice]);

    useLayoutEffect(() => {
        if (voiceContextRef.current !== contextKey) {
            teardownVoice();
            voiceContextRef.current = contextKey;
        }
    }, [contextKey, teardownVoice]);

    useLayoutEffect(() => {
        if (voiceState === "recording") {
            stopButtonRef.current?.focus();
        } else if (voiceState === "idle") {
            const shouldRestoreFocus = restoreVoiceFocusRef.current;
            restoreVoiceFocusRef.current = false;
            if (shouldRestoreFocus && capContextRef.current === contextKeyRef.current) {
                micButtonRef.current?.focus();
            }
        }
    }, [voiceState]);

    return {
        voiceState,
        voiceSupported,
        elapsedLabel,
        waveformActive,
        errorMessage: errorMsg.current,
        stopInFlight: stopInFlightRef.current,
        acquireVoice,
        commitVoiceStop,
        dismissError,
        reportSendFailure,
        containerRef,
        micButtonRef,
        stopButtonRef,
        waveformCanvasRef,
    };
}

/** The recording row: live dot, waveform, elapsed time, discard and stop-and-send. */
export function VoiceRecordingBar({
    recorder,
    sendLabel = "Stop and send voice message",
}: {
    recorder: VoiceRecorder;
    sendLabel?: string;
}): React.ReactElement {
    return (
        <div className="mj_VoiceRecording">
            <span className="mj_VoiceRecording_dot" aria-hidden="true" />
            {recorder.waveformActive ? (
                <canvas className="mj_VoiceRecording_waveform" ref={recorder.waveformCanvasRef} aria-hidden="true" />
            ) : (
                <span className="mj_VoiceRecording_waveformFallback" aria-hidden="true" />
            )}
            <span className="mj_VoiceRecording_time" aria-hidden="true">
                {recorder.elapsedLabel}
            </span>
            <span className="mj_ScreenReaderOnly" aria-live="polite">
                Recording, {recorder.elapsedLabel}
            </span>
            <button
                className="mj_VoiceRecording_action"
                type="button"
                aria-label="Discard recording"
                title="Discard recording"
                disabled={recorder.stopInFlight}
                onClick={() => recorder.commitVoiceStop("discard")}
            >
                <TrashIcon />
            </button>
            <button
                ref={recorder.stopButtonRef}
                className="mj_VoiceRecording_action mj_VoiceRecording_stop"
                type="button"
                aria-label={sendLabel}
                title={sendLabel}
                disabled={recorder.stopInFlight}
                onClick={() => recorder.commitVoiceStop("send")}
            >
                <StopIcon />
            </button>
        </div>
    );
}

/** The mic button: records on tap, a spinner while the browser asks for the microphone. */
export function VoiceMicButton({
    recorder,
    className,
    label = "Record voice message",
    disabled = false,
}: {
    recorder: VoiceRecorder;
    className: string;
    label?: string;
    disabled?: boolean;
}): React.ReactElement {
    const { voiceState, voiceSupported } = recorder;
    const inert = !voiceSupported || voiceState === "requesting" || disabled;
    return (
        <button
            ref={recorder.micButtonRef}
            type="button"
            className={className}
            title={
                voiceSupported
                    ? voiceState === "requesting"
                        ? "Requesting microphone access…"
                        : label
                    : "Voice recording isn't supported in this browser."
            }
            aria-label={voiceState === "requesting" ? "Requesting microphone access" : label}
            aria-busy={voiceState === "requesting"}
            aria-disabled={inert}
            disabled={inert}
            onClick={recorder.acquireVoice}
        >
            {voiceState === "requesting" ? <span className="mj_Spinner" aria-hidden="true" /> : <MicOnIcon />}
        </button>
    );
}

/** The recorder's error, dismissable. Nothing unless the recorder is in its error state. */
export function VoiceErrorBanner({ recorder }: { recorder: VoiceRecorder }): React.ReactElement | null {
    if (recorder.voiceState !== "error" || !recorder.errorMessage) return null;
    return (
        <div className="mj_ConnectionError mj_VoiceError">
            <span role="status">{recorder.errorMessage}</span>
            <button
                className="mj_ConnectionError_dismiss"
                type="button"
                aria-label="Dismiss recording error"
                title="Dismiss recording error"
                onClick={recorder.dismissError}
            >
                <CloseIcon />
            </button>
        </div>
    );
}
