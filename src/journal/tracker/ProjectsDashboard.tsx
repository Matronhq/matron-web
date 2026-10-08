/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The Projects home (unify step 7): the Mac's card dashboard (MacProjectsHome / ProjectCardView).
 * One card per open project — title, a red "Needs you · n" pill, the status preview (or "No status
 * yet"), and a footer with the open-mission count and the last activity. Closed projects sit behind
 * a toggle. Presentational: the pane owns loading and routing.
 */

import React, { useState } from "react";

import type { Mission, Project } from "../types";
import { formatRelativeTime, oneLine } from "./format";

/** The row dot both project views use: running, waiting (a waiting rollup or anything needing you), or idle. */
export function activityClass(activity: string | undefined, needsYou: number, open: boolean): string {
    if (!open) return "idle";
    if (activity === "running") return "running";
    if (activity === "waiting" || needsYou > 0) return "waiting";
    return "idle";
}

export function NeedsYouPill({ count }: { count: number }): React.ReactElement | null {
    if (count <= 0) return null;
    return <span className="mj_NeedsYouPill">Needs you · {count}</span>;
}

export function openMissionCount(project: Project): number {
    const { running, waiting, idle, quiet } = project.missions;
    return running + waiting + idle + quiet;
}

export function plural(count: number, noun: string, nounPlural = `${noun}s`): string {
    return `${count} ${count === 1 ? noun : nounPlural}`;
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: (num: number) => void }): React.ReactElement {
    const status = project.status ? oneLine(project.status) : null;
    return (
        <button
            type="button"
            className={`mj_ProjectCard${project.state === "closed" ? " mj_ProjectCard_closed" : ""}`}
            onClick={() => onOpen(project.num)}
        >
            <span className="mj_ProjectCard_head">
                <span className="mj_ProjectCard_title">{project.title}</span>
                <NeedsYouPill count={project.needs_you} />
            </span>
            <span className={`mj_ProjectCard_status${status ? "" : " mj_ProjectCard_status_empty"}`}>
                {status ?? "No status yet"}
            </span>
            <span className="mj_ProjectCard_footer">
                {plural(openMissionCount(project), "open mission")} · last activity{" "}
                {formatRelativeTime(project.last_activity_at)}
            </span>
        </button>
    );
}

export function ProjectsDashboard({
    header,
    projects,
    unfiled = [],
    onOpenProject,
    onOpenMission = () => undefined,
}: {
    /** Heads the dashboard above the cards (the Coordinator's latest briefing card). */
    header?: React.ReactNode;
    projects: Project[];
    /** All loaded missions; the open ones in no project are listed below the cards (Mac "Unfiled"). */
    unfiled?: Mission[];
    onOpenProject: (num: number) => void;
    onOpenMission?: (num: number) => void;
}): React.ReactElement {
    const [showClosed, setShowClosed] = useState(false);
    const open = projects.filter((project) => project.state === "open");
    // Merged projects are closed into another; their missions moved, so they are not listed.
    const closed = projects.filter((project) => project.state !== "open" && project.merged_into_num == null);
    const loose = unfiled.filter((mission) => mission.state === "open" && !mission.project_id);

    if (projects.length === 0 && loose.length === 0) {
        const empty = (
            <div className="mj_TrackerEmpty">
                <p className="mj_TrackerEmpty_title">No projects yet</p>
                <p className="mj_TrackerEmpty_hint">Agents file their missions into projects as they start work.</p>
            </div>
        );
        return header ? (
            <div className="mj_ProjectsDashboard">
                {header}
                {empty}
            </div>
        ) : (
            empty
        );
    }

    return (
        <div className="mj_ProjectsDashboard">
            {header}
            <div className="mj_ProjectsGrid">
                {open.map((project) => (
                    <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
                ))}
                {showClosed &&
                    closed.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />)}
            </div>
            {loose.length > 0 && (
                <section className="mj_ProjectCardSection mj_ProjectsUnfiled">
                    <h2 className="mj_ProjectSection_head">
                        <span className="mj_ProjectSection_title">Not in a project</span>
                        <span className="mj_ProjectSection_count">{loose.length}</span>
                    </h2>
                    {loose.map((mission) => (
                        <button
                            key={mission.id}
                            type="button"
                            className="mj_ProjectMission"
                            onClick={() => onOpenMission(mission.num)}
                        >
                            <span
                                className={`mj_ProjectMission_dot mj_ProjectMission_dot_${activityClass(mission.activity, mission.needs_you, true)}`}
                                aria-hidden="true"
                            />
                            <span className="mj_ProjectNum">#{mission.num}</span>
                            <span className="mj_ProjectMission_main">
                                <span className="mj_ProjectMission_title">{mission.title}</span>
                                <span className="mj_ProjectMission_status">
                                    {mission.last_milestone
                                        ? oneLine(mission.last_milestone.title)
                                        : "No milestones yet"}
                                </span>
                            </span>
                            <NeedsYouPill count={mission.needs_you} />
                        </button>
                    ))}
                </section>
            )}
            {closed.length > 0 && (
                <button
                    type="button"
                    className="mj_TrackerTextButton mj_ProjectsClosedToggle"
                    aria-expanded={showClosed}
                    onClick={() => setShowClosed((value) => !value)}
                >
                    {showClosed ? "Hide closed" : `Closed (${closed.length})`}
                </button>
            )}
        </div>
    );
}
