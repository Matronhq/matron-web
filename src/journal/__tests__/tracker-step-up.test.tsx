/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

// Buttons that need the user's approval key. This app holds no key, so it shows what is asked,
// sends the user to the iPhone or Mac app for the signed tap, and keeps every button that needs no
// signature (a consent request's Decline) working here.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { JournalApiError } from "../api";
import { commentFailureMessage, type MatronJournalClient } from "../client";
import { ItemDetail } from "../tracker/ItemDetail";
import { ItemRow } from "../tracker/ItemRow";
import { APPROVE_ON_DEVICE, needsApprovalKey } from "../tracker/format";
import type { TrackerItem } from "../types";
import { fakeSeen, trackerComment, trackerItem } from "./tracker-fixtures";

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

function fakeClient(): Record<string, unknown> {
    return {
        seen: fakeSeen(),
        getSnapshot: jest.fn().mockReturnValue({ selectedConversationId: "c1", conversations: [] }),
        commentItem: jest.fn().mockResolvedValue(true),
        postTrackerComment: jest.fn().mockResolvedValue({ ok: true }),
        closeTrackerItem: jest.fn().mockResolvedValue(true),
        reopenTrackerItem: jest.fn().mockResolvedValue(true),
        closeTrackerView: jest.fn(),
        selectConversation: jest.fn().mockResolvedValue(undefined),
        openTrackerLink: jest.fn(),
        openTrackerMission: jest.fn(),
        loadMissions: jest.fn().mockResolvedValue(undefined),
        loadItem: jest.fn().mockResolvedValue(undefined),
        spawnConsentRows: jest.fn().mockResolvedValue({ request: null, outcome: null }),
        answerSpawnConsent: jest.fn().mockResolvedValue(undefined),
        sendMessage: jest.fn().mockResolvedValue(true),
    };
}

const chatAsk = (over: Partial<TrackerItem> = {}): TrackerItem =>
    trackerItem({
        id: "it_7",
        num: 7,
        kind: "question",
        title: "box-a asks to chat with box-b — review",
        labels: ["consent"],
        links: [{ url: "matron://consent/chat/room-1/4", title: "Agent chat request" }],
        actions: ["Approve", "Decline"],
        awaiting: "user",
        consent: "chat",
        step_up: true,
        subject: { op: "chat", box: "box-b", decision: "approve" },
        ...over,
    });

const mergeQuestion = (over: Partial<TrackerItem> = {}): TrackerItem =>
    trackerItem({
        id: "it_9",
        num: 9,
        kind: "question",
        title: "Merge the release?",
        actions: ["Merge", "Hold"],
        awaiting: "user",
        step_up: true,
        subject: { op: "merge", commit: "abc1234" },
        ...over,
    });

const buttons = (container: ParentNode, selector: string): HTMLButtonElement[] => [
    ...container.querySelectorAll<HTMLButtonElement>(selector),
];
const button = (container: ParentNode, selector: string, label: string): HTMLButtonElement | undefined =>
    buttons(container, selector).find((b) => b.textContent === label);

describe("Buttons that need the approval key", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("needs the key for every button of a step-up item, and only for the yes of a consent request", () => {
        expect(needsApprovalKey(mergeQuestion(), "Merge")).toBe(true);
        expect(needsApprovalKey(mergeQuestion(), "Hold")).toBe(true);
        expect(needsApprovalKey(chatAsk(), "Approve")).toBe(true);
        expect(needsApprovalKey(chatAsk(), "Decline")).toBe(false);
        expect(needsApprovalKey(chatAsk({ consent: "spawn", actions: ["Approve", "Decline"] }), "Decline")).toBe(false);
        // An unmarked item, and a journal that predates the mark.
        expect(needsApprovalKey(mergeQuestion({ step_up: false }), "Merge")).toBe(false);
        expect(needsApprovalKey(mergeQuestion({ step_up: undefined }), "Merge")).toBe(false);
        // A step-up follow-up question on an ordinary item, and any follow-up on a step-up item.
        const plain = mergeQuestion({ step_up: false });
        expect(needsApprovalKey(plain, "Yes", trackerComment({ step_up: true }))).toBe(true);
        expect(needsApprovalKey(plain, "Yes", trackerComment({ step_up: false }))).toBe(false);
        expect(needsApprovalKey(mergeQuestion(), "Yes", trackerComment({ step_up: false }))).toBe(true);
    });

    it("keeps a step-up consent request's Decline on its For you row, and says where to approve", async () => {
        const onAnswer = jest.fn();
        const { container } = await mount(
            <ItemRow item={chatAsk()} scope="all" onOpen={jest.fn()} onAnswer={onAnswer} />,
        );
        expect(button(container, ".mj_TrackerItemRow_answers button", "Approve")).toBeUndefined();
        expect(container.querySelector(".mj_TrackerItemRow_keyNote")?.textContent).toBe(APPROVE_ON_DEVICE);
        await act(async () => button(container, ".mj_TrackerItemRow_answers button", "Decline")!.click());
        expect(onAnswer).toHaveBeenCalledWith(7, "Decline");
    });

    it("draws an unmarked consent request's row as before", async () => {
        const { container } = await mount(
            <ItemRow item={chatAsk({ step_up: false, subject: null })} onOpen={jest.fn()} onAnswer={jest.fn()} />,
        );
        expect(button(container, ".mj_TrackerItemRow_answers button", "Approve")).toBeDefined();
        expect(container.querySelector(".mj_TrackerItemRow_keyNote")).toBeNull();
    });

    it("shows a step-up item's buttons but cannot tap them, and says why", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <ItemDetail
                item={mergeQuestion()}
                comments={[]}
                client={client as unknown as MatronJournalClient}
                onBack={jest.fn()}
            />,
        );
        const merge = button(container, ".mj_TrackerItemActions button", "Merge")!;
        const hold = button(container, ".mj_TrackerItemActions button", "Hold")!;
        expect(merge.disabled).toBe(true);
        expect(hold.disabled).toBe(true);
        expect(merge.title).toBe(APPROVE_ON_DEVICE);
        expect(container.querySelector(".mj_TrackerActions_keyNote")?.textContent).toBe(
            "This needs your approval key. Answer it on your iPhone or Mac.",
        );
        await act(async () => merge.click());
        expect(client.commentItem).not.toHaveBeenCalled();
    });

    it("keeps the Decline of a step-up consent item tappable in its detail", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <ItemDetail
                item={chatAsk()}
                comments={[]}
                client={client as unknown as MatronJournalClient}
                onBack={jest.fn()}
            />,
        );
        expect(button(container, ".mj_TrackerItemActions button", "Approve")!.disabled).toBe(true);
        expect(button(container, ".mj_TrackerItemActions button", "Decline")!.disabled).toBe(false);
        expect(container.querySelector(".mj_TrackerActions_keyNote")?.textContent).toBe(
            "Approving needs your approval key. Approve on your iPhone or Mac, or decline here.",
        );
    });

    it("blocks a step-up follow-up question's buttons", async () => {
        const question = trackerComment({
            id: "c_q",
            author: "agent",
            body: "Deploy now?",
            actions: ["Deploy", "Wait"],
            step_up: true,
            subject: { op: "deploy" },
        });
        const { container } = await mount(
            <ItemDetail
                item={trackerItem({ actions: [] })}
                comments={[question]}
                client={fakeClient() as unknown as MatronJournalClient}
                onBack={jest.fn()}
            />,
        );
        const deploy = button(container, ".mj_TrackerThread .mj_TrackerActions button", "Deploy")!;
        expect(deploy.disabled).toBe(true);
        expect(container.querySelector(".mj_TrackerThread .mj_TrackerActions_keyNote")).not.toBeNull();
    });

    it("says what to do when the journal refuses a tap for want of a signature", () => {
        const required = new JournalApiError(
            "This needs your approval key. Approve it on your iPhone or Mac.",
            403,
            "approval_required",
            undefined,
            { error: "approval_required" },
        );
        expect(commentFailureMessage(required)).toBe("This needs your approval key. Approve it on your iPhone or Mac.");
        const invalid = new JournalApiError(
            "Your approval didn't check out. Approve it again on your iPhone or Mac.",
            400,
            "approval_invalid",
            undefined,
            { error: "approval_invalid", reason: "mismatch" },
        );
        expect(commentFailureMessage(invalid)).toBe(
            "Your approval didn't check out. Approve it again on your iPhone or Mac.",
        );
    });
});
