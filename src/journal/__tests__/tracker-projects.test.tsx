/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { ProjectPage } from "../tracker/ProjectPage";
import { ProjectsDashboard } from "../tracker/ProjectsDashboard";
import { trackerMission, trackerProject, trackerProjectDetail } from "./tracker-fixtures";

async function mount(element: React.ReactElement): Promise<HTMLElement> {
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => createRoot(container).render(element));
    return container;
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("ProjectsDashboard", () => {
    it("renders one card per open project with title, needs-you pill, status and footer", async () => {
        const onOpen = jest.fn();
        const container = await mount(
            <ProjectsDashboard
                projects={[
                    trackerProject(),
                    trackerProject({ id: "pj_2", num: 2, title: "Closed one", state: "closed" }),
                ]}
                onOpenProject={onOpen}
            />,
        );
        const cards = container.querySelectorAll<HTMLButtonElement>(".mj_ProjectCard");
        expect(cards).toHaveLength(1);
        expect(cards[0].querySelector(".mj_ProjectCard_title")?.textContent).toBe("Web/Mac design unification");
        expect(cards[0].querySelector(".mj_NeedsYouPill")?.textContent).toBe("Needs you · 2");
        expect(cards[0].querySelector(".mj_ProjectCard_status")?.textContent).toContain("Phase 2 running");
        expect(cards[0].querySelector(".mj_ProjectCard_footer")?.textContent).toMatch(/^2 open missions · /);
        await act(async () => cards[0].click());
        expect(onOpen).toHaveBeenCalledWith(2645);
    });

    it("says so when a project has no status, and offers the closed ones behind a toggle", async () => {
        const container = await mount(
            <ProjectsDashboard
                projects={[
                    trackerProject({ status: null, needs_you: 0 }),
                    trackerProject({ id: "pj_2", num: 2, title: "Closed one", state: "closed" }),
                ]}
                onOpenProject={jest.fn()}
            />,
        );
        expect(container.querySelector(".mj_ProjectCard_status")?.textContent).toBe("No status yet");
        expect(container.querySelector(".mj_NeedsYouPill")).toBeNull();
        const toggle = container.querySelector<HTMLButtonElement>(".mj_ProjectsClosedToggle")!;
        expect(toggle.textContent).toBe("Closed (1)");
        await act(async () => toggle.click());
        expect(container.querySelectorAll(".mj_ProjectCard")).toHaveLength(2);
    });

    it("lists open missions that are in no project below the cards", async () => {
        const onOpenMission = jest.fn();
        const container = await mount(
            <ProjectsDashboard
                projects={[trackerProject()]}
                unfiled={[
                    trackerMission({ num: 12, title: "Loose mission", project_id: null }),
                    trackerMission({ id: "ms_9", num: 9, title: "Filed", project_id: "pj_1" }),
                    trackerMission({ id: "ms_8", num: 8, title: "Closed loose", state: "closed", project_id: null }),
                ]}
                onOpenProject={jest.fn()}
                onOpenMission={onOpenMission}
            />,
        );
        const rows = container.querySelectorAll<HTMLButtonElement>(".mj_ProjectsUnfiled .mj_ProjectMission");
        expect(container.querySelector(".mj_ProjectsUnfiled .mj_ProjectSection_title")?.textContent).toBe(
            "Not in a project",
        );
        expect(rows).toHaveLength(1);
        await act(async () => rows[0].click());
        expect(onOpenMission).toHaveBeenCalledWith(12);
    });

    it("gives an unfiled waiting mission the waiting dot, as the project page does", async () => {
        const container = await mount(
            <ProjectsDashboard
                projects={[]}
                unfiled={[trackerMission({ num: 12, project_id: null, activity: "waiting", needs_you: 0 })]}
                onOpenProject={jest.fn()}
            />,
        );
        expect(container.querySelector(".mj_ProjectsUnfiled .mj_ProjectMission_dot_waiting")).not.toBeNull();
    });

    it("names each card by its content, not a replacement label", async () => {
        const container = await mount(<ProjectsDashboard projects={[trackerProject()]} onOpenProject={jest.fn()} />);
        expect(container.querySelector(".mj_ProjectCard")?.hasAttribute("aria-label")).toBe(false);
    });

    it("shows an empty state", async () => {
        const container = await mount(<ProjectsDashboard projects={[]} onOpenProject={jest.fn()} />);
        expect(container.querySelector(".mj_TrackerEmpty_title")?.textContent).toBe("No projects yet");
    });
});

describe("ProjectPage", () => {
    it("lays out header, status, needs you, missions, milestones and sessions", async () => {
        const onOpenMission = jest.fn();
        const onOpenItem = jest.fn();
        const container = await mount(
            <ProjectPage
                detail={trackerProjectDetail()}
                onBack={jest.fn()}
                onOpenMission={onOpenMission}
                onOpenItem={onOpenItem}
            />,
        );
        expect(container.querySelector(".mj_ProjectPage_title")?.textContent).toBe("Web/Mac design unification");
        expect(container.querySelector(".mj_ProjectPage_meta")?.textContent).toMatch(
            /^2 missions · 2 sessions on 2 boxes · last activity /,
        );
        expect(container.querySelector(".mj_ProjectPage_status")?.textContent).toContain("Phase 2 running");
        const titles = [...container.querySelectorAll(".mj_ProjectSection_title")].map((el) => el.textContent);
        expect(titles).toEqual(["Needs you", "Recent milestones", "Missions", "Sessions on it now"]);
        await act(async () => container.querySelector<HTMLButtonElement>(".mj_ProjectNeedsYou_row")!.click());
        expect(onOpenItem).toHaveBeenCalledWith(3939);
        const missionRows = container.querySelectorAll<HTMLButtonElement>(".mj_ProjectMission");
        expect(missionRows).toHaveLength(2);
        expect(missionRows[0].querySelector(".mj_ProjectMission_dot_running")).not.toBeNull();
        await act(async () => missionRows[1].click());
        expect(onOpenMission).toHaveBeenCalledWith(1594);
        expect(container.querySelector(".mj_ProjectSessions")?.textContent).toContain("build-box 1");
    });

    it("omits the needs-you card when nothing waits on you", async () => {
        const container = await mount(
            <ProjectPage
                detail={trackerProjectDetail({ needs_you: [] })}
                onBack={jest.fn()}
                onOpenMission={jest.fn()}
                onOpenItem={jest.fn()}
            />,
        );
        expect(container.querySelector(".mj_ProjectNeedsYou")).toBeNull();
    });
});
