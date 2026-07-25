/*
Copyright 2026 Matron Contributors.
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
*/

/* One-off full-page + region shots to verify the 10 redesign-v5 divergences
 * (header, sidebar new-session, permission, unknown, diff) against the design static.
 * Run after `pnpm build:fixtures`. Outputs under /tmp/vf/full/. */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const DIST = path.join(ROOT, ".fixtures-dist");
const OUT = "/tmp/vf/full";
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".json": "application/json",
    ".ico": "image/x-icon",
};

function serve(dir) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split("?")[0]);
            const file = path.join(dir, urlPath === "/" ? "index.html" : urlPath);
            fs.readFile(file, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end("not found");
                    return;
                }
                res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
                res.end(data);
            });
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    });
}

const REGIONS = [
    { name: "header", sel: ".mj_ChatHeader" },
    { name: "sidebar", sel: ".mx_RoomListPanel" },
    { name: "permission", sel: ".mj_PromptCard_permission" },
    { name: "unknown", sel: ".mj_Unknown" },
    { name: "diff", sel: ".mj_DiffCard" },
];

const { server, port } = await serve(DIST);
const base = `http://127.0.0.1:${port}/`;
const browser = await chromium.launch();
const shots = [];
for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    await page.goto(`${base}?theme=${theme}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const full = path.join(OUT, `full__${theme}.png`);
    await page.screenshot({ path: full, animations: "disabled" });
    shots.push(full);
    for (const r of REGIONS) {
        const loc = page.locator(r.sel).first();
        if ((await loc.count()) === 0) {
            console.log(`MISS ${r.name} (${r.sel}) @ ${theme}`);
            continue;
        }
        const file = path.join(OUT, `${r.name}__${theme}.png`);
        try {
            await loc.screenshot({ path: file, animations: "disabled" });
            shots.push(file);
        } catch (e) {
            console.log(`ERR ${r.name} @ ${theme}: ${e.message}`);
        }
    }
    await page.close();
}
await browser.close();
server.close();
console.log("SHOTS", JSON.stringify(shots));
