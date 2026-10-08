/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * A project page (unify step 7), after the Mac's MacProjectPage: header (title, needs-you pill,
 * description, meta line), a Status card, then two columns of section cards — Needs you and
 * Recent milestones on the left, Missions and Sessions on the right. Built from GET /projects/:id;
 * the Mac's Decisions, Files and Other open items need the project feed and are follow-ups.
 */

import React from "react";

import type { ProjectDetail } from "../types";
import { formatRelativeTime, oneLine } from "./format";
import { TrackerGlyph } from "./glyphs";
import { activityClass, NeedsYouPill, plural } from "./ProjectsDashboard";

export function ProjectPage({
    detail,
    onBack,
    onOpenMission,
    onOpenItem,
}: {
    detail: ProjectDetail;
    onBack: () => void;
    onOpenMission: (num: number) => void;
    onOpenItem: (num: number) => void;
}): React.ReactElement {
    const { project, missions, needs_you: needsYou, recent_milestones: milestones, sessions_by_box: boxes } = detail;
    const boxEntries = Object.entries(boxes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const sessionCount = boxEntries.reduce((total, [, count]) => total + count, 0);
    const openMissions = missions.filter((mission) => mission.state === "open");
    const closedMissions = missions.filter((mission) => mission.state !== "open");

    return (
        <div className="mj_TrackerDetail mj_ProjectPage">
            <div className="mj_TrackerDetail_head">
                <button type="button" className="mj_TrackerTextButton" onClick={onBack}>
                    ‹ Projects
                </button>
            </div>
            <div className="mj_ProjectPage_scroll">
                <header className="mj_ProjectPage_header">
                    <div className="mj_ProjectPage_heading">
                        <h1 className="mj_ProjectPage_title">{project.title}</h1>
                        <NeedsYouPill count={needsYou.length} />
                    </div>
                    {project.body ? <p className="mj_ProjectPage_body">{oneLine(project.body)}</p> : null}
                    <p className="mj_ProjectPage_meta">
                        {plural(missions.length, "mission")} · {plural(sessionCount, "session")} on{" "}
                        {plural(boxEntries.length, "box", "boxes")} · last activity{" "}
                        {formatRelativeTime(project.last_activity_at)}
                    </p>
                </header>
                <section className="mj_ProjectCardSection mj_ProjectPage_status" aria-label="Status">
                    <div className="mj_ProjectPage_statusHead">
                        <span className="mj_ProjectPage_statusLabel">Status</span>
                        {project.status_updated_at ? (
                            <span className="mj_ProjectPage_statusBy">
                                Updated {formatRelativeTime(project.status_updated_at)} by{" "}
                                {project.status_by === "user" ? "you" : "an agent"}
                            </span>
                        ) : null}
                    </div>
                    <p className="mj_ProjectPage_statusText">{project.status ?? "No status yet."}</p>
                </section>
                <div className="mj_ProjectPage_columns">
                    <div className="mj_ProjectPage_column">
                        {needsYou.length > 0 && (
                            <section className="mj_ProjectCardSection mj_ProjectNeedsYou">
                                <h2 className="mj_ProjectSection_head">
                                    <span className="mj_ProjectSection_title">Needs you</span>
                                    <span className="mj_ProjectSection_count">{needsYou.length}</span>
                                </h2>
                                {needsYou.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className="mj_ProjectNeedsYou_row"
                                        onClick={() => onOpenItem(item.num)}
                                    >
                                        <TrackerGlyph kind={item.kind} aria-hidden="true" />
                                        <span className="mj_ProjectNeedsYou_title">{item.title}</span>
                                        <span className="mj_ProjectNum">#{item.num}</span>
                                    </button>
                                ))}
                            </section>
                        )}
                        <section className="mj_ProjectCardSection">
                            <h2 className="mj_ProjectSection_head">
                                <span className="mj_ProjectSection_title">Recent milestones</span>
                                <span className="mj_ProjectSection_count">{milestones.length}</span>
                            </h2>
                            {milestones.length === 0 ? (
                                <p className="mj_TrackerCaption">No milestones yet.</p>
                            ) : (
                                <ul className="mj_ProjectMilestones">
                                    {milestones.map((milestone) => (
                                        <li key={milestone.id} className="mj_ProjectMilestone">
                                            <span
                                                className={`mj_ProjectMilestone_dot mj_ProjectMilestone_dot_${milestone.kind}`}
                                                aria-hidden="true"
                                            />
                                            <span className="mj_ProjectMilestone_title">{milestone.title}</span>
                                            <button
                                                type="button"
                                                className="mj_ProjectNum mj_ProjectNum_link"
                                                onClick={() => onOpenMission(milestone.mission_num)}
                                            >
                                                #{milestone.mission_num}
                                            </button>
                                            <span className="mj_ProjectMilestone_time">
                                                {formatRelativeTime(milestone.created_at)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                    <div className="mj_ProjectPage_column">
                        <section className="mj_ProjectCardSection">
                            <h2 className="mj_ProjectSection_head">
                                <span className="mj_ProjectSection_title">Missions</span>
                                <span className="mj_ProjectSection_count">
                                    {openMissions.length} open
                                    {closedMissions.length ? ` · ${closedMissions.length} closed` : ""}
                                </span>
                            </h2>
                            {[...openMissions, ...closedMissions].map((mission) => (
                                <button
                                    key={mission.id}
                                    type="button"
                                    className={`mj_ProjectMission${mission.state === "open" ? "" : " mj_ProjectMission_closed"}`}
                                    onClick={() => onOpenMission(mission.num)}
                                >
                                    <span
                                        className={`mj_ProjectMission_dot mj_ProjectMission_dot_${activityClass(mission.activity, mission.needs_you, mission.state === "open")}`}
                                        aria-hidden="true"
                                    />
                                    <span className="mj_ProjectNum">#{mission.num}</span>
                                    <span className="mj_ProjectMission_main">
                                        <span className="mj_ProjectMission_title">{mission.title}</span>
                                        <span className="mj_ProjectMission_status">
                                            {mission.status ? oneLine(mission.status) : "No status"}
                                        </span>
                                    </span>
                                    <NeedsYouPill count={mission.needs_you} />
                                </button>
                            ))}
                        </section>
                        <section className="mj_ProjectCardSection">
                            <h2 className="mj_ProjectSection_head">
                                <span className="mj_ProjectSection_title">Sessions on it now</span>
                                <span className="mj_ProjectSection_count">{sessionCount}</span>
                            </h2>
                            {boxEntries.length === 0 ? (
                                <p className="mj_TrackerCaption">No sessions are working on it.</p>
                            ) : (
                                <p className="mj_ProjectSessions">
                                    {boxEntries.map(([box, count]) => (
                                        <span key={box} className="mj_ProjectSessions_box">
                                            {box} {count}
                                        </span>
                                    ))}
                                </p>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
