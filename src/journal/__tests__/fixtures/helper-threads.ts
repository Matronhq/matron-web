/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Synthetic helper traffic in the shapes the bridge publishes: a Claude subagent's tool-indicator
 * lines (with payload.step), its diffs and narration, and a Codex run's tool_output events.
 * HELPER_THREADS are three whole helper threads (a script-heavy investigation, an edit-and-test
 * run, a Codex review); HELPER_SHAPES is one of each common command shape. Commands are cut at
 * 100 characters with an ellipsis, as the bridge cuts them.
 */

import type { JournalEvent } from "../../types";

const T0 = 1_790_400_000_000;
let seq = 1000;
let convo = "";

function event(type: string, payload: Record<string, unknown>): JournalEvent {
    seq += 1;
    return { seq, ts: T0 + seq * 4000, convo_id: convo, sender: "agent:claude", type, payload };
}
const cut = (command: string): string => (command.length > 100 ? `${command.slice(0, 100)}…` : command);
/** A Claude tool-indicator line with its structured step. */
const run = (command: string): JournalEvent =>
    event("text", { body: `🔧 \`${cut(command)}\``, from: "assistant", step: { tool: "Bash", command: cut(command) } });
const read = (path: string): JournalEvent =>
    event("text", { body: `📖 ${path}`, from: "assistant", step: { tool: "Read", path } });
const grep = (pattern: string): JournalEvent =>
    event("text", { body: `🔍 ${pattern}`, from: "assistant", step: { tool: "Grep", pattern } });
const indicator = (body: string, step: Record<string, string>): JournalEvent =>
    event("text", { body, from: "assistant", step });
const say = (body: string): JournalEvent => event("text", { body, from: "assistant" });
const diff = (path: string, added: number, removed: number, tool: string, newFile = false): JournalEvent =>
    event("diff", {
        file_path: path,
        display_path: path,
        tool,
        added,
        removed,
        ...(newFile ? { new_file: true } : {}),
    });
/** A completed command (Codex publishes each command when it ends). */
const out = (command: string, exitCode: number, output?: string): JournalEvent =>
    event("tool_output", {
        command: cut(command),
        exit_code: exitCode,
        status: exitCode === 0 ? "completed" : "failed",
        ...(output === undefined ? {} : { output }),
    });
const codex = (command: string): JournalEvent => out(`/bin/bash -lc "${command}"`, 0);

function threadOf(id: string, build: () => JournalEvent[]): JournalEvent[] {
    convo = id;
    return build();
}

export const HELPER_THREADS: Record<"claude-heredoc" | "claude-tests" | "codex-review", JournalEvent[]> = {
    "claude-heredoc": threadOf("fx:sub:heredoc", () => [
        run("ls -la /home/dev/project/notes/; cat /home/dev/project/notes/brief.md"),
        run("cd /home/dev/project/notes && find . -type f | head -80; cat msg/* 2>/dev/null | head -40"),
        run("cd /home/dev/project/app && git status | head -5 && git log --oneline -8 && git fetch -q origin"),
        run("W=/home/dev/project/app; git -C $W pull -q --ff-only; git -C $W worktree add -q -b feat/headlines /t…"),
        run("D=/tmp/wt-headlines/src; wc -l $D/activity.ts $D/grouping.ts $D/card.tsx $D/list.tsx"),
        run("cat /tmp/wt-headlines/src/grouping.ts"),
        run("cat /tmp/wt-headlines/src/card.tsx"),
        run("sed -n 1,260p /tmp/wt-headlines/src/assembly.ts"),
        run("ls /srv/journal; ls /srv/journal/data 2>/dev/null; find /srv/journal -maxdepth 2 -name '*.db'"),
        run("mkdir -p /tmp/audit; sqlite3 /srv/journal/data/journal.db '.backup /tmp/audit/journal.db'"),
        run("python3 - <<'EOF'\nimport sqlite3\nsrc=sqlite3.connect('file:/srv/journal/data/journal.db?mode=ro', ur…"),
        run("python3 - <<'EOF'\nimport sqlite3,json,collections\nc=sqlite3.connect('/tmp/audit/journal.db')\nrows=c.…"),
        run('W=/tmp/wt-headlines; node --version; grep -n "renderNarration\\|narration" $W/src/card.tsx | head -20'),
        run("sed -n 260,720p /tmp/wt-headlines/src/card.tsx"),
        run("python3 - <<'EOF'\nimport sqlite3,json,re\nc=sqlite3.connect('/tmp/audit/journal.db')\nfor (p,) in c.ex…"),
        run("python3 - <<'EOF'\nimport sqlite3,json,re\nc=sqlite3.connect('/tmp/audit/journal.db')\nprint(c.execute(…"),
        run('W=/tmp/wt-headlines; grep -n "workerKind" -A25 $W/src/client.ts | head -50'),
        say("Now build the corpus extractor."),
        run("ls ~/.cache/agent/transcripts | head; find ~/.cache/agent/transcripts -name '*.jsonl' | wc -l"),
        diff("/tmp/audit/extract.py", 64, 0, "Write", true),
        run('python3 /tmp/audit/extract.py && ls -la /tmp/audit/ && python3 -c "import json; print(sum(1 for _ in…'),
        run(
            "python3 -c \"\nimport json,collections\nc=collections.Counter()\nfor l in open('/tmp/audit/corpus.jsonl'…",
        ),
        run('cat /tmp/wt-headlines/test/setup.cjs | head -30; grep -n "export" /tmp/wt-headlines/src/plain-text.t…'),
        run("python3 - <<'EOF'\nimport json\na=json.load(open('/tmp/audit/audit-before.json'))\nprint({k:a[k] for k …"),
        run('W=/tmp/wt-headlines/src; grep -rn "mj_SrOnly" $W/*.pcss | head'),
        run("W=/tmp/wt-headlines/src; sed -n 665,685p $W/journal.pcss"),
        run('W=/tmp/wt-headlines/src; grep -n "meta\\|SrOnly" $W/helpers.pcss | head -30'),
        say("Now I'll write the new categoriser module."),
        diff("/tmp/wt-headlines/src/phrases.ts", 410, 0, "Write", true),
        run(
            "python3 - <<'EOF'\np='/tmp/wt-headlines/src/activity.ts'\ns=open(p).read()\ns=s.replace('old','new')\nop…",
        ),
        run("python3 - <<'EOF'\np='/tmp/wt-headlines/src/phrases.ts'\ns=open(p).read()\nopen(p,'w').write(s.rstrip()…"),
        diff("/tmp/wt-headlines/src/headlines.ts", 188, 0, "Write", true),
        run('grep -n "function parseShell" -A110 /tmp/wt-headlines/src/phrases.ts | head -150'),
        run("npx jest --runInBand src/__tests__/headlines.test.ts 2>&1 | tail -20"),
        diff("/tmp/wt-headlines/src/list.tsx", 96, 0, "Write", true),
        run("cat >> /tmp/wt-headlines/src/helpers.pcss <<'EOF'\n\n/* helper thread: headlines */\n.mj_Headlines { di…"),
        run('echo "node_modules" >> $(git -C /tmp/wt-headlines rev-parse --git-common-dir)/info/exclude; git -C /…'),
    ]),
    "claude-tests": threadOf("fx:sub:tests", () => [
        run("cat /home/dev/project/notes/shop-perf.md; echo ----; cat /home/dev/project/notes/shop-budget.md"),
        run("cd /home/dev/project/shop && git status | head -5 && git log --oneline -5 && git worktree list"),
        run("cd /home/dev/project/shop && git fetch -q && git worktree add -b perf/lazy-pdf /tmp/shop-wt origin/m…"),
        read("/tmp/shop-wt/src/components/pdf/download-button.tsx"),
        run('cd /tmp/shop-wt && grep -rln "download-button\\|DownloadButton" src | head'),
        run("cd /tmp/shop-wt && cat .github/workflows/ci.yml"),
        run("cd /tmp/shop-wt && time (npx next build > /tmp/shop-build-base.log 2>&1)"),
        say("Writing a measurement script (outside the repo, in tmp)."),
        diff("/tmp/shop-wt/src/components/pdf/download-button.tsx", 18, 7, "Edit"),
        diff("/tmp/shop-wt/src/components/chat-bubble.tsx", 12, 4, "Edit"),
        run("cd /tmp/shop-wt && (npx next build > /tmp/shop-build-q1.log 2>&1; echo exit=$?)"),
        diff("/tmp/shop-wt/src/__tests__/perf/lazy-imports.test.ts", 44, 0, "Write", true),
        out(
            "cd /tmp/shop-wt && npx vitest run src/__tests__/perf",
            0,
            " Test Files  1 passed (1)\n      Tests  3 passed (3)",
        ),
        say("Now the budget script, then a build without the real env to see if CI can build."),
        diff("/tmp/shop-wt/scripts/check-bundle-budget.mjs", 52, 0, "Write", true),
        run('grep -n "Error\\|missing\\|required" /tmp/shop-build-noenv.log | head -10'),
        diff("/tmp/shop-wt/.github/workflows/ci.yml", 6, 1, "Edit"),
        out(
            "cd /tmp/shop-wt && npx vitest run",
            1,
            " Test Files  1 failed | 41 passed (42)\n      Tests  1 failed | 312 passed (313)",
        ),
        diff("/tmp/shop-wt/src/components/chat-bubble.tsx", 3, 2, "Edit"),
        out("cd /tmp/shop-wt && npx vitest run", 0, " Test Files  42 passed (42)\n      Tests  313 passed (313)"),
        run("cd /tmp/shop-wt && npx tsc --noEmit && npm run lint >/dev/null 2>&1 && echo lint-ok"),
        say("Delta-scoped confirming review on the fix commit."),
        run("cd /tmp/shop-wt && git add src/components/chat-bubble.tsx src/__tests__/perf && git commit -qm 'perf…"),
        run("cd /tmp/shop-wt && git fetch -q origin && git rebase origin/main 2>&1 | tail -1 && git push -q -u or…"),
        run('cd /tmp/shop-wt && grep -rn "auth.getUser()" src/app --include=*.tsx | wc -l'),
        read("/tmp/shop-wt/src/lib/auth/session.ts"),
        diff("/tmp/shop-wt/src/lib/auth/session.ts", 38, 0, "Write", true),
        diff("/tmp/shop-wt/src/app/(dashboard)/layout.tsx", 5, 9, "Edit"),
        diff("/tmp/shop-wt/src/app/(portal)/layout.tsx", 4, 8, "Edit"),
        diff("/tmp/shop-wt/src/lib/auth/__tests__/session.test.ts", 61, 0, "Write", true),
        out(
            "cd /tmp/shop-wt && npx vitest run src/lib/auth",
            0,
            " Test Files  1 passed (1)\n      Tests  7 passed (7)",
        ),
        run("cd /tmp/shop-wt && npx eslint src/app src/lib/auth src/proxy.ts"),
        run("cd /tmp/shop-wt && git add src/lib/auth src/app && git commit -qm 'perf: read claims locally' && git…"),
    ]),
    "codex-review": threadOf("fx:codex:review", () => [
        codex("cat src/upload.js"),
        codex("nl -ba src/guard.js | sed -n '580,715p'"),
        codex("nl -ba src/upload-http.js | sed -n '125,185p;260,310p'"),
        codex("ls -la"),
        codex("cat src/idem.js"),
        codex("nl -ba src/http-body.js | sed -n '1,83p'"),
        codex("cat test/helpers.js"),
        codex("cat src/server.js"),
        codex("rg -n -w 'writeFileAtomic' src test --glob '*.js'"),
        codex("rg -n -w 'openGuarded' src test --glob '*.js'"),
        codex("rg -n -w 'metaGuarded' src test --glob '*.js'"),
        codex("rg -n -w 'listDirGuarded' src test --glob '*.js'"),
        codex("rg -n -w 'appendAudit' src test --glob '*.js'"),
        codex("rg -n -w 'makeIdemStore' src test --glob '*.js'"),
        codex("rg -n -w 'sanitizeName' src test --glob '*.js'"),
        codex("rg -n -w 'moveGuarded' src test --glob '*.js'"),
        codex("rg -n -w 'trashGuarded' src test --glob '*.js'"),
        codex("rg -n -w 'auditPathFor' src test --glob '*.js'"),
        codex("rg -n -w 'denialToStatus' src test --glob '*.js'"),
        codex("rg -n -w 'pinRoots' src test --glob '*.js'"),
        codex("rg -n 'MAX_VIEW_BYTES|MAX_LIST_ENTRIES' src test --glob '*.js'"),
        codex("rg -n -F 'startServer(' src test --glob '*.js'"),
        say(
            "## Verdict\nChanges requested\n\n## Blockers\n\n1. **A concurrent create can be overwritten without a backup.** The overwrite path takes a backup only when the target existed at its first check.\n\n## Minors\n\n1. The audit line omits the byte count.",
        ),
    ]),
};

/** One of each common command shape, as a tool-indicator line and as a completed command. */
const SHAPE_COMMANDS = [
    "git status --short",
    "git log --oneline -10",
    "git diff --stat origin/main",
    "git show HEAD~1 --stat",
    "git blame -L 10,40 src/a.ts",
    "git commit -qm 'fix: guard empty rows'",
    "git push -q -u origin HEAD",
    "git pull --ff-only",
    "git fetch -q origin",
    "git add src/a.ts test/a.test.ts",
    "git checkout -b feat/x origin/main",
    "git switch main",
    "git rebase origin/main",
    "git merge --no-ff feat/x",
    "git cherry-pick abc1234",
    "git stash push -q",
    "git reset --hard origin/main",
    "git worktree add /tmp/wt-x -b feat/x",
    "git rev-parse HEAD",
    "git ls-files src | wc -l",
    "gh pr create --fill",
    "gh pr view 12 --json state",
    "gh pr checks 12",
    "gh pr merge 12 --squash",
    "gh pr diff 12",
    "npm test",
    "npm run build",
    "npm run lint",
    "npm ci",
    "pnpm install --frozen-lockfile",
    "pnpm test -- --runInBand",
    "pnpm run typecheck",
    "yarn test",
    "npx vitest run",
    "npx vitest run src/a.test.ts",
    "npx jest --runInBand",
    "npx playwright test",
    "pytest -q",
    "pytest tests/test_a.py -k slow",
    "go test ./...",
    "cargo test",
    "cargo build --release",
    "make build",
    "npx tsc --noEmit",
    "npx eslint src",
    "ruff check .",
    "mypy src",
    "npx prettier --check src",
    "cat src/a.ts",
    "head -40 README.md",
    "tail -n 50 /var/log/app.log",
    "sed -n 1,80p src/b.ts",
    "wc -l src/*.ts",
    "less docs/guide.md",
    "rg -n 'TODO' src",
    "grep -rn 'useEffect' src/components",
    "find . -name '*.test.ts' | head",
    "ls -la src",
    "fd -e tsx components",
    "tree -L 2 src",
    "mkdir -p tmp/out",
    "cp a.json b.json",
    "mv old.ts new.ts",
    "rm -rf dist",
    "touch .keep",
    "chmod +x scripts/run.sh",
    "ln -s ../shared shared",
    "python3 scripts/report.py",
    "python3 -c \"import json; print(json.load(open('a.json'))['v'])\"",
    "node scripts/build.mjs",
    "node -e 'console.log(process.version)'",
    "psql \"$DATABASE_URL\" -c 'select count(*) from users'",
    "sqlite3 data/app.db 'select count(*) from events'",
    "redis-cli ping",
    "curl -s https://api.example.com/health",
    "curl -sI https://example.com",
    "wget -q https://example.com/file.tar.gz",
    "docker ps",
    "docker compose up -d",
    "docker logs web --tail 50",
    "systemctl status nginx",
    "journalctl -u app --since '10 min ago'",
    "ps aux | grep node",
    "pgrep -af node",
    "kill 12345",
    "df -h",
    "du -sh node_modules",
    "free -m",
    "uptime",
    "tar -czf out.tar.gz dist",
    "unzip -o bundle.zip",
    "sleep 5",
    "ffmpeg -i in.mov -vf scale=640:-1 out.mp4",
    "convert in.png -resize 50% out.png",
    "vercel deploy --prod",
    "ssh deploy@host 'uptime'",
    "rsync -av dist/ host:/srv/app/",
    "brew install jq",
    "pip install -r requirements.txt",
    "until curl -sf localhost:3000; do sleep 1; done",
    "for f in src/*.ts; do wc -l $f; done",
    "cd app && npm test",
    "export NODE_ENV=test && npx jest",
    "codex exec 'review the diff'",
    "claude -p 'summarize'",
];

export const HELPER_SHAPES: JournalEvent[] = threadOf("fx:shapes", () => [
    ...SHAPE_COMMANDS.flatMap((command) => [run(command), out(command, 0)]),
    read("/home/dev/project/src/a.ts"),
    read("/home/dev/project/README.md"),
    read("/home/dev/project/package.json"),
    read("/home/dev/project/docs/guide.md"),
    grep("TODO"),
    grep("useEffect"),
    grep("**/*.test.ts"),
    grep("function render"),
    diff("/home/dev/project/src/a.ts", 4, 2, "Edit"),
    diff("/home/dev/project/src/new.ts", 30, 0, "Edit"),
    indicator("🌐 matron release notes", { tool: "WebSearch", pattern: "matron release notes" }),
    indicator("🌐 https://example.com/docs", { tool: "WebFetch", url: "https://example.com/docs" }),
    indicator("🔀 Subtask: check the retention diff", { tool: "Task", description: "check the retention diff" }),
]);
