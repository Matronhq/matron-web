/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Plain-English phrases for one agent tool step ("Read paths.py", "Ran the tests").
 *
 * A shell command is split into its stages (`&&`, `;`, `|`, newlines), wrappers (`cd x &&`,
 * `VAR=…`, `bash -c`) are peeled, each stage is matched against a short table, and the stage
 * that says the most wins (a test run beats the `cd` before it). Nothing here returns raw
 * command text: an unrecognised command becomes "Ran <program>", and the only agent-supplied
 * fragments are a file's basename, a quoted search term, a host and a helper's description.
 */

/** The part of an agent tool step this module reads. */
export interface Step {
    /** Tool name as the agent reported it: Bash, Read, Edit, Write, shell, … */
    tool: string;
    input: { path?: string; command?: string; pattern?: string; url?: string; description?: string };
    /** A Write step created the file rather than overwriting it. */
    newFile?: boolean;
}

export interface Phrase {
    /** Past tense ("Read paths.py"). */
    past: string;
    /** Present progressive, no ellipsis ("Reading paths.py"). */
    live: string;
    /** The step was not recognised; the caller may prefer the raw text. */
    fallback?: boolean;
}

/** [past, live]; `{}` is replaced by what the step is about. */
type Template = [past: string, live: string];

const make = (t: Template, subject = "", fallback?: boolean): Phrase => ({
    past: t[0].replace("{}", subject),
    live: t[1].replace("{}", subject),
    ...(fallback ? { fallback } : {}),
});

const short = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const quoted = (text: string): string => `“${short(text.trim(), 40)}”`;
const file = (path = ""): string => path.split(/[\\/]/).filter(Boolean).pop() || "a file";
const host = (url = ""): string => {
    try {
        return new URL(url).host;
    } catch {
        return "";
    }
};
const forTerm = (term?: string): string => (term ? ` for ${quoted(term)}` : "");

/** Shell stages, most telling first: of the stages in a command, the one matching the earliest rule wins. */
const COMMANDS: [RegExp, Template][] = [
    [/^(git\s+push|gh\s+pr\s+merge)\b/, ["Pushed changes", "Pushing changes"]],
    [/^gh\s+pr\b/, ["Opened a PR", "Opening a PR"]],
    [/^git\s+commit\b/, ["Saved a commit", "Saving a commit"]],
    [
        /^(npm|pnpm|yarn)\s+(run\s+)?(test|jest)\b|^(npx\s+)?(jest|vitest|pytest|mocha)\b|^(python3?\s+-m\s+pytest|go\s+test|cargo\s+test)\b/,
        ["Ran the tests", "Running the tests"],
    ],
    [/^(npx\s+)?tsc\b|^(npm|pnpm|yarn)\s+(run\s+)?lint:types\b|^mypy\b/, ["Checked the types", "Checking the types"]],
    [
        /^(npx\s+)?(prettier|eslint|ruff|black)\b|^(npm|pnpm|yarn)\s+(run\s+)?(lint|format)\b/,
        ["Checked the formatting", "Checking the formatting"],
    ],
    [
        /^(npm|pnpm|yarn)\s+(run\s+)?build\b|^(npx\s+)?webpack\b|^(make|cargo\s+build|docker\s+build)\b/,
        ["Built the project", "Building the project"],
    ],
    [/^(npm|pnpm|yarn)\s+(install|add|ci)\b|^pip3?\s+install\b/, ["Installed packages", "Installing packages"]],
    [/^git\s+(status|diff|log|show|blame)\b/, ["Looked at the git history", "Looking at the git history"]],
    [/^git\s/, ["Ran git", "Running git"]],
    [/^(systemctl|service)\s+(restart|reload|start|stop)\b/, ["Restarted a service", "Restarting a service"]],
    [/^(sqlite3|psql|mysql)\b/, ["Queried a database", "Querying a database"]],
    [/^(python3?|node)\s/, ["Ran a script", "Running a script"]],
    [/^(curl|wget)\b/, ["Made a web request", "Making a web request"]],
    [/^sleep\b/, ["Waited", "Waiting"]],
    [/^(cat|head|tail|less|sed\s+-n|bat)\b/, ["Read {}", "Reading {}"]],
    [/^(rg|grep|egrep|ag)\b/, ["Searched the code{}", "Searching the code{}"]],
    [/^(find|fd)\b/, ["Looked for files", "Looking for files"]],
    [/^ls\b/, ["Listed files", "Listing files"]],
];

/** The stages of a command line: wrappers peeled, heredoc bodies and long quoted strings dropped. */
function stages(command: string): string[] {
    return command
        .split(/<<-?\s*['"]?\w+['"]?/)[0]
        .replace(/(["'])(?:\\.|(?!\1).)*\1/g, (q) => (q.length > 40 ? "''" : q))
        .split(/&&|\|\||;|\||\n/)
        .map((stage) =>
            stage
                .trim()
                .replace(/^((ba|z)?sh\s+-l?c\s+|sudo\s+|time\s+|timeout\s+\d+\s+|[A-Za-z_]\w*=\S*\s+)+/, "")
                .replace(/^git\s+-C\s+\S+/, "git"),
        )
        .filter((stage) => stage && !/^(cd|export|set|echo|true|:)\b/.test(stage));
}

/** The phrase for a shell command line. */
export function describeCommand(command: string): Phrase {
    let best = COMMANDS.length;
    let chosen = "";
    const list = stages(command);
    for (const stage of list) {
        const rank = COMMANDS.findIndex(([re]) => re.test(stage));
        if (rank !== -1 && rank < best) [best, chosen] = [rank, stage];
    }
    if (best === COMMANDS.length) {
        const program = /^[\w./-]{1,30}/
            .exec(list[0] ?? "")?.[0]
            .split("/")
            .pop();
        return program
            ? make(["Ran {}", "Running {}"], program, true)
            : make(["Ran a command", "Running a command"], "", true);
    }
    const template = COMMANDS[best][1];
    const args = chosen
        .split(/\s+/)
        .slice(1)
        .filter((arg) => !arg.startsWith("-"));
    if (template[0].startsWith("Read")) return make(template, file(args[args.length - 1]));
    if (template[0].startsWith("Searched")) return make(template, forTerm(args[0]));
    return make(template);
}

const ALIAS: Record<string, string> = {
    NotebookRead: "Read",
    read_file: "Read",
    MultiEdit: "Edit",
    NotebookEdit: "Edit",
    apply_patch: "Edit",
    file_change: "Edit",
    edit_file: "Edit",
    Search: "Grep",
    grep_search: "Grep",
    LS: "Glob",
    list_dir: "Glob",
    web_search: "WebSearch",
    Agent: "Task",
    update_plan: "TodoWrite",
};

/** The phrase for one step. */
export function describeStep(step: Step): Phrase {
    const { input } = step;
    if (["Bash", "shell", "local_shell", "exec_command", "container.exec"].includes(step.tool)) {
        return input.command?.trim()
            ? describeCommand(input.command)
            : make(["Ran a command", "Running a command"], "", true);
    }
    const tool = ALIAS[step.tool] ?? step.tool;
    switch (tool) {
        case "Read":
            return make(["Read {}", "Reading {}"], file(input.path));
        case "Edit":
        case "Write": {
            if (!input.path) return make(["Edited files", "Editing files"]);
            const created = tool === "Write" && step.newFile !== false;
            return make(created ? ["Created {}", "Creating {}"] : ["Edited {}", "Editing {}"], file(input.path));
        }
        case "Grep":
            return make(["Searched the code{}", "Searching the code{}"], forTerm(input.pattern));
        case "Glob":
            return make(["Looked for files{}", "Looking for files{}"], forTerm(input.pattern));
        case "WebSearch":
            return make(["Searched the web{}", "Searching the web{}"], forTerm(input.pattern));
        case "WebFetch":
            return host(input.url)
                ? make(["Opened {}", "Opening {}"], host(input.url))
                : make(["Opened a web page", "Opening a web page"]);
        case "Task":
            return make(
                ["Started a helper{}", "Starting a helper{}"],
                input.description ? `: ${short(input.description, 60)}` : "",
            );
        case "TodoWrite":
            return make(["Updated the to-do list", "Updating the to-do list"]);
        default:
    }
    if (tool.startsWith("mcp__")) {
        const server = (/^mcp__(.+?)__/.exec(tool)?.[1] ?? "a tool").replace(/^claude_ai_/, "").replace(/[-_]/g, " ");
        return make(["Used {}", "Using {}"], server, true);
    }
    return make(["Worked on a step", "Working on a step"], "", true);
}

/** Past-tense phrase of one step ("Read paths.py", "Queried a database"). */
export const stepHeadline = (step: Step): string => describeStep(step).past;

/** Present-progressive phrase of one step, with the ellipsis ("Reading paths.py…"). */
export const stepLiveHeadline = (step: Step): string => `${describeStep(step).live}…`;
