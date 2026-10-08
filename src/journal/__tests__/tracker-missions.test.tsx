/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatronJournalClient } from "../client";
import type { AgentRosterEntry, Milestone, MissionConversation } from "../types";
import { MissionConvoRow, MissionDetail, missionConvoTopic } from "../tracker/MissionDetail";
import { MissionsList } from "../tracker/MissionsList";
import { trackerMission, trackerMissionDetail } from "./tracker-fixtures";

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

function milestone(over: Partial<Milestone> = {}): Milestone {
    return {
        id: "ml_1",
        mission_id: "ms_1",
        num: 1,
        kind: "progress",
        title: "Landed the schema",
        body: "",
        convo_id: "c1",
        seq: 4,
        device_id: 1,
        created_by: "agent",
        created_at: 3,
        ...over,
    };
}

describe("MissionsList", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    it("splits missions into an Open section and a collapsible Closed section", async () => {
        const { container } = await mount(
            <MissionsList
                missions={[
                    trackerMission({ id: "ms_1", num: 1, state: "open" }),
                    trackerMission({ id: "ms_2", num: 2, state: "closed", closed_at: 9 }),
                ]}
                onOpenMission={jest.fn()}
            />,
        );

        const headers = Array.from(container.querySelectorAll(".mj_TrackerSection_header")).map((n) => n.textContent);
        expect(headers).toContain("Open");
        // The closed section is a toggle, collapsed by default → its row is not mounted.
        expect(container.querySelector(".mj_TrackerSection_toggle")?.textContent).toContain("Closed (1)");
        expect(container.querySelectorAll(".mj_TrackerMissionRow")).toHaveLength(1);
    });

    it("expands the closed section when the toggle is clicked", async () => {
        const { container } = await mount(
            <MissionsList
                missions={[
                    trackerMission({ id: "ms_1", num: 1, state: "open" }),
                    trackerMission({ id: "ms_2", num: 2, state: "closed", closed_at: 9 }),
                ]}
                onOpenMission={jest.fn()}
            />,
        );

        await act(async () => {
            container.querySelector<HTMLButtonElement>(".mj_TrackerSection_toggle")!.click();
        });

        expect(container.querySelectorAll(".mj_TrackerMissionRow")).toHaveLength(2);
    });

    it("shows the NeedsYou badge for a mission with items awaiting the user and hides it at zero", async () => {
        const withBadge = await mount(
            <MissionsList missions={[trackerMission({ needs_you: 3 })]} onOpenMission={jest.fn()} />,
        );
        const badge = withBadge.container.querySelector(".mj_TrackerNeedsYouBadge");
        expect(badge).not.toBeNull();
        expect(badge?.querySelector(".mj_TrackerNeedsYouBadge_count")?.textContent).toBe("3");

        const noBadge = await mount(
            <MissionsList missions={[trackerMission({ needs_you: 0 })]} onOpenMission={jest.fn()} />,
        );
        expect(noBadge.container.querySelector(".mj_TrackerNeedsYouBadge")).toBeNull();
    });

    it("shows the last milestone title, or a placeholder when there are none", async () => {
        const withMilestone = await mount(
            <MissionsList
                missions={[
                    trackerMission({
                        last_milestone: { num: 4, title: "Shipped the pane", kind: "progress", created_at: 5 },
                        last_milestone_at: 5,
                    }),
                ]}
                onOpenMission={jest.fn()}
            />,
        );
        expect(withMilestone.container.querySelector(".mj_TrackerMissionRow_milestone")?.textContent).toBe(
            "Shipped the pane",
        );

        const none = await mount(
            <MissionsList missions={[trackerMission({ last_milestone: null })]} onOpenMission={jest.fn()} />,
        );
        expect(none.container.querySelector(".mj_TrackerMissionRow_milestone")?.textContent).toBe("No milestones yet");
    });

    it("calls onOpenMission with the mission number when a row is clicked", async () => {
        const onOpenMission = jest.fn();
        const { container } = await mount(
            <MissionsList missions={[trackerMission({ num: 5, state: "open" })]} onOpenMission={onOpenMission} />,
        );

        await act(async () => {
            container.querySelector<HTMLButtonElement>(".mj_TrackerMissionRow")!.click();
        });

        expect(onOpenMission).toHaveBeenCalledWith(5);
    });

    it("renders an empty state when there are no missions", async () => {
        const { container } = await mount(<MissionsList missions={[]} onOpenMission={jest.fn()} />);
        expect(container.querySelector(".mj_TrackerEmpty_title")?.textContent).toBe("No missions yet");
    });
});

describe("MissionDetail (smoke)", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    it("renders the header, milestones and the close-mission affordance for an open mission", async () => {
        const client = { getSnapshot: jest.fn().mockReturnValue({ trackerView: {} }) };
        const { container } = await mount(
            <MissionDetail
                detail={trackerMissionDetail({
                    mission: trackerMission({ num: 5, title: "Ship the tracker", state: "open" }),
                    milestones: [milestone({ title: "Landed the schema" })],
                })}
                client={client as unknown as MatronJournalClient}
                onOpenItem={jest.fn()}
                onBack={jest.fn()}
            />,
        );

        expect(container.querySelector(".mj_TrackerMissionHead_name")?.textContent).toBe("Ship the tracker");
        const headers = Array.from(container.querySelectorAll(".mj_TrackerSection_header")).map((n) => n.textContent);
        expect(headers).toContain("Milestones");
        expect(headers).toContain("Close mission");
        expect(container.querySelector(".mj_TrackerMilestoneRow_title")?.textContent).toContain("Landed the schema");
    });
});

describe("Mission conversation rows", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    const convo = (over: Partial<MissionConversation> = {}): MissionConversation => ({
        id: "c1",
        title: "[ab] Ship the tracker",
        state: "running",
        box: "maple",
        ...over,
    });
    const roster: AgentRosterEntry[] = [
        { device_id: 1, name: "maple", tag_char: "M" },
        { device_id: 2, name: "dev-z", tag_char: null },
    ];

    it("shows the [xx] short as the session tag, not as raw text", async () => {
        const { container } = await mount(<MissionConvoRow convo={convo()} agents={roster} />);
        const title = container.querySelector(".mj_TrackerConvoRow_title");
        expect(title?.textContent).toBe("M:ab Ship the tracker");
        expect(title?.querySelector(".mj_SessionTag_short")?.textContent).toBe("ab");
        expect(container.textContent).not.toContain("[ab]");
    });

    it("drops the raw short with a single box (no tag to show)", async () => {
        const { container } = await mount(<MissionConvoRow convo={convo()} agents={[roster[0]]} />);
        expect(container.querySelector(".mj_TrackerConvoRow_title")?.textContent).toBe("Ship the tracker");
        expect(container.querySelector(".mj_SessionTag")).toBeNull();
    });

    it("shows the generated topic as the main line, peeled of its [xx] short, with no second line", async () => {
        const { container } = await mount(
            <MissionConvoRow convo={convo({ auto_title: "[ab] fix the login redirect" })} agents={roster} />,
        );
        const title = container.querySelector(".mj_TrackerConvoRow_title");
        expect(title?.textContent).toBe("M:ab fix the login redirect");
        expect(title?.querySelector(".mj_SessionTag_short")?.textContent).toBe("ab");
        expect(container.textContent).not.toContain("Ship the tracker");
        expect(container.querySelector(".mj_TrackerConvoRow_subtitle")).toBeNull();
        // Box label and state stay.
        expect(container.querySelector(".mj_TrackerConvoRow_box")?.textContent).toBe("maple");
        expect(container.querySelector(".mj_TrackerConvoRow_state")?.textContent).toBe("running");
    });

    it("falls back to the title when auto_title is absent, null or blank", async () => {
        for (const auto_title of [undefined, null, "", "   "]) {
            const { container } = await mount(<MissionConvoRow convo={convo({ auto_title })} agents={roster} />);
            expect(container.querySelector(".mj_TrackerConvoRow_title")?.textContent).toBe("M:ab Ship the tracker");
            expect(container.querySelector(".mj_TrackerConvoRow_subtitle")).toBeNull();
        }
    });

    it("missionConvoTopic prefers the display form of auto_title, keeping a room marker", () => {
        expect(missionConvoTopic({ id: "c1", title: "[ab] Mission", auto_title: "🐣 [ab] child topic" })).toBe(
            "🐣 child topic",
        );
        expect(missionConvoTopic({ id: "c1", title: "[ab] Mission", auto_title: null })).toBe("Mission");
        expect(missionConvoTopic({ id: "c1", title: "plain" })).toBe("plain");
        expect(missionConvoTopic({ id: "c1", title: "" })).toBe("c1");
    });

    it("falls back to the id for an untitled conversation", async () => {
        const { container } = await mount(<MissionConvoRow convo={convo({ title: "" })} agents={roster} />);
        expect(container.querySelector(".mj_TrackerConvoRow_title")?.textContent).toBe("c1");
    });

    it("MissionDetail lists its conversations through the tagged row", async () => {
        const client = { getSnapshot: jest.fn().mockReturnValue({ trackerView: {} }) };
        const { container } = await mount(
            <MissionDetail
                detail={trackerMissionDetail({
                    conversations: [convo({ auto_title: "[ab] the topic" }), convo({ id: "c2", box: "dev-z" })],
                })}
                client={client as unknown as MatronJournalClient}
                agents={roster}
                onOpenItem={jest.fn()}
                onBack={jest.fn()}
            />,
        );
        const rows = container.querySelectorAll(".mj_TrackerConvoRow");
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector(".mj_TrackerConvoRow_title")?.textContent).toBe("M:ab the topic");
        expect(rows[0].querySelector(".mj_TrackerConvoRow_subtitle")).toBeNull();
        expect(rows[1].querySelector(".mj_TrackerConvoRow_title")?.textContent).toBe("D:ab Ship the tracker");
    });
});
