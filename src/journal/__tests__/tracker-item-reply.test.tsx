/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The item reply box beyond plain text: staged attachments (picker and paste) in a tray above the
 * box, a mic beside send, and one comment per send carrying the typed text, a voice note first
 * when there is one, then the staged files.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatronJournalClient } from "../client";
import type { TrackerAttachment } from "../types";
import { ItemDetail } from "../tracker/ItemDetail";
import { trackerItem } from "./tracker-fixtures";

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

interface FakeClient {
    sessionGeneration: number;
    getSnapshot: jest.Mock;
    commentItem: jest.Mock;
    uploadTrackerAttachment: jest.Mock;
    closeTrackerItem: jest.Mock;
    reopenTrackerItem: jest.Mock;
    closeTrackerView: jest.Mock;
    selectConversation: jest.Mock;
    openTrackerLink: jest.Mock;
}

const uploaded = (file: File): TrackerAttachment => ({
    blob_ref: `ref-${file.name}`,
    mime: file.type,
    name: file.name,
    size: file.size,
});

function fakeClient(): FakeClient {
    return {
        sessionGeneration: 1,
        getSnapshot: jest.fn().mockReturnValue({ selectedConversationId: "c1", conversations: [] }),
        commentItem: jest.fn().mockResolvedValue(true),
        uploadTrackerAttachment: jest.fn(async (file: File) => uploaded(file)),
        closeTrackerItem: jest.fn().mockResolvedValue(true),
        reopenTrackerItem: jest.fn().mockResolvedValue(true),
        closeTrackerView: jest.fn(),
        selectConversation: jest.fn().mockResolvedValue(undefined),
        openTrackerLink: jest.fn(),
    };
}

// ── A minimal MediaRecorder: stop() hands over one chunk, then onstop. ─────────────────────────────

class MockRecorder {
    public static last: MockRecorder | undefined;
    public state: RecordingState = "inactive";
    public mimeType: string;
    public ondataavailable: ((event: BlobEvent) => unknown) | null = null;
    public onerror: ((event: Event) => unknown) | null = null;
    public onstart: ((event: Event) => unknown) | null = null;
    public onstop: ((event: Event) => unknown) | null = null;

    public constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType ?? "audio/webm";
        MockRecorder.last = this;
    }

    public static isTypeSupported(type: string): boolean {
        return type === "audio/webm;codecs=opus" || type === "audio/webm";
    }

    public start(): void {
        this.state = "recording";
    }

    public stop(): void {
        this.state = "inactive";
        setTimeout(() => {
            this.ondataavailable?.({ data: new Blob(["AUDIO"], { type: this.mimeType }) } as BlobEvent);
            this.onstop?.(new Event("stop"));
        }, 0);
    }
}

const track = { stop: jest.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;

async function mount(element: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
    const container = document.createElement("div");
    document.body.append(container);
    let root!: Root;
    await act(async () => {
        root = createRoot(container);
        root.render(element);
    });
    return { container, root };
}

async function renderItem(client: FakeClient): Promise<HTMLDivElement> {
    const { container } = await mount(
        <ItemDetail
            item={trackerItem({ num: 12 })}
            comments={[]}
            client={client as unknown as MatronJournalClient}
            onBack={jest.fn()}
        />,
    );
    return container;
}

const input = (container: HTMLElement): HTMLTextAreaElement =>
    container.querySelector<HTMLTextAreaElement>(".mj_TrackerComposer_input")!;

async function type(container: HTMLElement, text: string): Promise<void> {
    const textarea = input(container);
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
        setValue.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function pick(container: HTMLElement, files: File[]): Promise<void> {
    const picker = container.querySelector<HTMLInputElement>(".mj_TrackerComposer_file")!;
    Object.defineProperty(picker, "files", { configurable: true, value: files });
    await act(async () => {
        picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

async function click(button: HTMLElement | null): Promise<void> {
    await act(async () => {
        button!.click();
    });
}

const sendButton = (container: HTMLElement): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>(".mj_TrackerComposer_send")!;

const chips = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll(".mj_TrackerComposer_chip")).map(
        (chip) => chip.querySelector(".mj_TrackerComposer_chipName")?.textContent ?? "",
    );

/** Records a voice note and stops it with "send"; resolves once the recorder has finalized. */
async function recordVoiceNote(container: HTMLElement): Promise<void> {
    await click(container.querySelector<HTMLButtonElement>(".mj_TrackerComposer_mic"));
    expect(container.querySelector(".mj_VoiceRecording")).not.toBeNull();
    await click(container.querySelector<HTMLButtonElement>(".mj_VoiceRecording_stop"));
    await act(async () => {
        await new Promise((done) => setTimeout(done, 5));
    });
}

describe("ItemDetail reply box", () => {
    const realMediaDevices = navigator.mediaDevices;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    beforeEach(() => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
        });
        (window as unknown as { MediaRecorder: unknown }).MediaRecorder = MockRecorder;
    });

    afterEach(() => {
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: realMediaDevices });
        delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
        document.body.innerHTML = "";
    });

    it("has an attach button, and a mic beside send whether or not there is text", async () => {
        const container = await renderItem(fakeClient());
        expect(container.querySelector(".mj_TrackerComposer_attach")).not.toBeNull();
        expect(container.querySelector(".mj_TrackerComposer_mic")).not.toBeNull();
        await type(container, "some words");
        expect(container.querySelector(".mj_TrackerComposer_mic")).not.toBeNull();
        expect(sendButton(container)).not.toBeNull();
    });

    it("stages picked files in a tray above the box, each removable", async () => {
        const container = await renderItem(fakeClient());
        expect(container.querySelector(".mj_TrackerComposer_tray")).toBeNull();

        await pick(container, [new File(["a"], "a.png", { type: "image/png" }), new File(["bb"], "notes.txt")]);
        expect(chips(container)).toEqual(["a.png", "notes.txt"]);

        await click(container.querySelector<HTMLButtonElement>('[aria-label="Remove a.png"]'));
        expect(chips(container)).toEqual(["notes.txt"]);
    });

    it("stages files pasted into the box", async () => {
        const container = await renderItem(fakeClient());
        const paste = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(paste, "clipboardData", {
            value: { files: [new File(["img"], "image.png", { type: "image/png" })] },
        });
        await act(async () => {
            input(container).dispatchEvent(paste);
        });
        expect(chips(container)).toEqual(["image.png"]);
        expect(paste.defaultPrevented).toBe(true);
    });

    it("sends the text and the staged files as one comment, uploading each first", async () => {
        const client = fakeClient();
        const container = await renderItem(client);
        const shot = new File(["a"], "a.png", { type: "image/png" });
        const notes = new File(["bb"], "notes.txt", { type: "text/plain" });
        await pick(container, [shot, notes]);
        await type(container, "here are the files");

        await click(sendButton(container));

        expect(client.uploadTrackerAttachment.mock.calls.map((call) => call[0])).toEqual([shot, notes]);
        expect(client.commentItem).toHaveBeenCalledTimes(1);
        expect(client.commentItem).toHaveBeenCalledWith(
            12,
            { body: "here are the files", attachments: [uploaded(shot), uploaded(notes)] },
            expect.any(String),
        );
        expect(input(container).value).toBe("");
        expect(chips(container)).toEqual([]);
    });

    it("sends staged files with no text, and Cmd/Ctrl+Enter sends too", async () => {
        const client = fakeClient();
        const container = await renderItem(client);
        const shot = new File(["a"], "a.png", { type: "image/png" });
        await pick(container, [shot]);
        expect(sendButton(container).disabled).toBe(false);

        await act(async () => {
            input(container).dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }),
            );
        });

        expect(client.commentItem).toHaveBeenCalledWith(12, { attachments: [uploaded(shot)] }, expect.any(String));
    });

    it("keeps the draft and tray when an upload fails, and posts nothing", async () => {
        const client = fakeClient();
        client.uploadTrackerAttachment.mockResolvedValueOnce(null);
        const container = await renderItem(client);
        await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
        await type(container, "with a picture");

        await click(sendButton(container));

        expect(client.commentItem).not.toHaveBeenCalled();
        expect(input(container).value).toBe("with a picture");
        expect(chips(container)).toEqual(["a.png"]);
    });

    it("a retry after a failed post reuses the uploads and the idempotency key", async () => {
        const client = fakeClient();
        client.commentItem.mockResolvedValueOnce(false);
        const container = await renderItem(client);
        await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
        await type(container, "retry me");

        await click(sendButton(container));
        await click(sendButton(container));

        expect(client.uploadTrackerAttachment).toHaveBeenCalledTimes(1);
        expect(client.commentItem).toHaveBeenCalledTimes(2);
        expect(client.commentItem.mock.calls[0][1]).toEqual(client.commentItem.mock.calls[1][1]);
        expect(client.commentItem.mock.calls[0][2]).toBe(client.commentItem.mock.calls[1][2]);
    });

    describe("voice note", () => {
        it("sends one comment: the typed text as body, the voice note first, then the staged files", async () => {
            const client = fakeClient();
            const container = await renderItem(client);
            const shot = new File(["a"], "a.png", { type: "image/png" });
            await pick(container, [shot]);
            await type(container, "listen to this");
            const upload = deferred<TrackerAttachment | null>();
            client.uploadTrackerAttachment.mockImplementationOnce(() => upload.promise);

            await recordVoiceNote(container);

            // The draft and the tray clear as the send starts, before the upload settles.
            expect(input(container).value).toBe("");
            expect(chips(container)).toEqual([]);

            const voice = client.uploadTrackerAttachment.mock.calls[0][0] as File;
            expect(voice.name).toBe("voice-note.webm");
            expect(voice.type).toBe("audio/webm;codecs=opus");
            expect(client.uploadTrackerAttachment.mock.calls[1][0]).toBe(shot);

            const voiceAttachment = { blob_ref: "ref-voice", mime: voice.type, name: voice.name, size: voice.size };
            await act(async () => {
                upload.resolve(voiceAttachment);
            });

            expect(client.commentItem).toHaveBeenCalledTimes(1);
            expect(client.commentItem).toHaveBeenCalledWith(
                12,
                { body: "listen to this", attachments: [voiceAttachment, uploaded(shot)] },
                expect.any(String),
            );
            expect(container.querySelector(".mj_VoiceRecording")).toBeNull();
        });

        it("with an empty draft is a voice-only comment", async () => {
            const client = fakeClient();
            const container = await renderItem(client);

            await recordVoiceNote(container);

            expect(client.commentItem).toHaveBeenCalledTimes(1);
            const [num, write] = client.commentItem.mock.calls[0];
            expect(num).toBe(12);
            expect(write).toEqual({ attachments: [expect.objectContaining({ name: "voice-note.webm" })] });
        });

        it("restores the draft and tray when the send fails, and says so", async () => {
            const client = fakeClient();
            client.commentItem.mockResolvedValue(false);
            const container = await renderItem(client);
            await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
            await type(container, "do not lose me");

            await recordVoiceNote(container);

            expect(input(container).value).toBe("do not lose me");
            // The recording comes back too, first in the tray, so it can be sent again.
            expect(chips(container)).toEqual(["voice-note.webm", "a.png"]);
            expect(container.querySelector(".mj_VoiceError")?.textContent).toContain("Couldn't send the voice note");
        });

        it("does not overwrite text typed while the failed send was in flight", async () => {
            const client = fakeClient();
            const post = deferred<boolean>();
            client.commentItem.mockImplementationOnce(() => post.promise);
            const container = await renderItem(client);
            await type(container, "first thought");

            await recordVoiceNote(container);
            expect(input(container).value).toBe("");
            await type(container, "second thought");
            await act(async () => {
                post.resolve(false);
            });

            expect(input(container).value).toBe("second thought");
            expect(container.querySelector(".mj_VoiceError")).not.toBeNull();
        });

        it("goes alone, keeping the draft and tray, when the tray is already full", async () => {
            const client = fakeClient();
            const container = await renderItem(client);
            const files = Array.from({ length: 20 }, (_, i) => new File(["a"], `f${i}.png`, { type: "image/png" }));
            await pick(container, files);
            await type(container, "still here");

            await recordVoiceNote(container);

            expect(client.commentItem).toHaveBeenCalledTimes(1);
            expect(client.commentItem.mock.calls[0][1]).toEqual({
                attachments: [expect.objectContaining({ name: "voice-note.webm" })],
            });
            expect(input(container).value).toBe("still here");
            expect(chips(container)).toHaveLength(20);
        });

        it("a full tray that fails to take the note keeps every staged file and holds the note to retry", async () => {
            const client = fakeClient();
            client.commentItem.mockResolvedValueOnce(false);
            const container = await renderItem(client);
            const files = Array.from({ length: 20 }, (_, i) => new File(["a"], `f${i}.png`, { type: "image/png" }));
            await pick(container, files);

            await recordVoiceNote(container);

            // No staged file is dropped to make room: the tray is exactly as it was.
            expect(chips(container)).toEqual(files.map((file) => file.name));
            const held = container.querySelector(".mj_TrackerComposer_heldVoice");
            expect(held?.textContent).toContain("Voice note not sent");
            expect(container.querySelector(".mj_VoiceError")?.textContent).toContain("Couldn't send the voice note");

            const uploads = client.uploadTrackerAttachment.mock.calls.length;
            await click(container.querySelector<HTMLButtonElement>('[aria-label="Retry the voice note"]'));

            // The retry is the same comment: same payload, same key, the recording not uploaded again.
            expect(client.commentItem).toHaveBeenCalledTimes(2);
            expect(client.commentItem.mock.calls[1][1]).toEqual(client.commentItem.mock.calls[0][1]);
            expect(client.commentItem.mock.calls[1][2]).toBe(client.commentItem.mock.calls[0][2]);
            expect(client.uploadTrackerAttachment.mock.calls.length).toBe(uploads);
            expect(container.querySelector(".mj_TrackerComposer_heldVoice")).toBeNull();
            expect(chips(container)).toHaveLength(20);
        });

        it("a held voice note can be discarded", async () => {
            const client = fakeClient();
            client.commentItem.mockResolvedValueOnce(false);
            const container = await renderItem(client);
            await pick(
                container,
                Array.from({ length: 20 }, (_, i) => new File(["a"], `f${i}.png`, { type: "image/png" })),
            );

            await recordVoiceNote(container);
            await click(container.querySelector<HTMLButtonElement>('[aria-label="Discard the voice note"]'));

            expect(container.querySelector(".mj_TrackerComposer_heldVoice")).toBeNull();
            expect(client.commentItem).toHaveBeenCalledTimes(1);
        });

        it("restoring a failed note never drops files, and blocks send while over the limit", async () => {
            const client = fakeClient();
            const post = deferred<boolean>();
            client.commentItem.mockImplementationOnce(() => post.promise);
            const container = await renderItem(client);
            const first = Array.from({ length: 19 }, (_, i) => new File(["a"], `a${i}.png`, { type: "image/png" }));
            await pick(container, first);

            await recordVoiceNote(container);
            // While the note is in flight the cleared tray fills up again.
            const later = Array.from({ length: 20 }, (_, i) => new File(["b"], `b${i}.png`, { type: "image/png" }));
            await pick(container, later);
            await act(async () => {
                post.resolve(false);
            });

            expect(chips(container)).toEqual([
                "voice-note.webm",
                ...first.map((file) => file.name),
                ...later.map((file) => file.name),
            ]);
            expect(sendButton(container).disabled).toBe(true);
            expect(container.querySelector(".mj_TrackerComposer_limit")?.textContent).toContain("remove 20");
        });

        it("a retry with Send after a failed note reuses its upload and its idempotency key", async () => {
            const client = fakeClient();
            client.commentItem.mockResolvedValueOnce(false);
            const container = await renderItem(client);
            await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
            await type(container, "say it again");

            await recordVoiceNote(container);
            expect(client.uploadTrackerAttachment).toHaveBeenCalledTimes(2);

            await click(sendButton(container));

            expect(client.uploadTrackerAttachment).toHaveBeenCalledTimes(2);
            expect(client.commentItem).toHaveBeenCalledTimes(2);
            expect(client.commentItem.mock.calls[1][1]).toEqual(client.commentItem.mock.calls[0][1]);
            expect(client.commentItem.mock.calls[1][2]).toBe(client.commentItem.mock.calls[0][2]);
            expect(chips(container)).toEqual([]);
        });
    });

    describe("thumbnails", () => {
        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;
        afterEach(() => {
            URL.createObjectURL = realCreate;
            URL.revokeObjectURL = realRevoke;
        });

        it("shows an image's blob: preview", async () => {
            URL.createObjectURL = jest.fn(() => "blob:https://matron.test/1234");
            URL.revokeObjectURL = jest.fn();
            const container = await renderItem(fakeClient());
            await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
            expect(container.querySelector<HTMLImageElement>(".mj_TrackerComposer_thumb")?.src).toBe(
                "blob:https://matron.test/1234",
            );
        });

        it("draws no thumbnail for a preview that is not a blob: URL", async () => {
            URL.createObjectURL = jest.fn(() => "javascript:alert(1)");
            URL.revokeObjectURL = jest.fn();
            const container = await renderItem(fakeClient());
            await pick(container, [new File(["a"], "a.png", { type: "image/png" })]);
            expect(chips(container)).toEqual(["a.png"]);
            expect(container.querySelector(".mj_TrackerComposer_thumb")).toBeNull();
        });
    });
});
