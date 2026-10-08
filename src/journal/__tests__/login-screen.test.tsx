/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextEncoder as NodeTextEncoder } from "node:util";

import { MatronJournalClient } from "../client";
import { MatronApp } from "../components";
import type { ClientState, MatronConfig } from "../types";

jest.mock("../../../res/matron-logo-simple.svg", () => "matron-logo.svg");

function signedOutClient(config: MatronConfig = {}): MatronJournalClient {
    const client = new MatronJournalClient();
    (client as unknown as { state: ClientState }).state = {
        ...client.getSnapshot(),
        phase: "signed-out",
        config,
    };
    return client;
}

function type(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("LoginScreen", () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        Object.defineProperty(globalThis, "TextEncoder", { value: NodeTextEncoder, configurable: true });
    });

    beforeEach(() => {
        localStorage.clear();
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        jest.restoreAllMocks();
    });

    async function render(client: MatronJournalClient): Promise<void> {
        await act(async () => root.render(<MatronApp client={client} />));
    }

    const field = (id: string): HTMLInputElement | null => container.querySelector<HTMLInputElement>(`#${id}`);
    const submit = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const submitForm = async (): Promise<void> => {
        await act(async () => {
            container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
    };

    it("shows the server field with a label above it when config does not fix the server", async () => {
        await render(signedOutClient());
        const server = field("mj_LoginForm_server");
        expect(server).not.toBeNull();
        expect(server!.placeholder).toBe("https://your-server.example.com");
        expect(container.querySelector("label[for=mj_LoginForm_server]")?.textContent).toContain("Server");
        expect(container.querySelector(".mj_LoginServerNote")).toBeNull();
        expect(document.activeElement).toBe(server);
    });

    it("hides the server field and names the host when config fixes the server", async () => {
        await render(signedOutClient({ journal_server_url: "https://chat.example.com" }));
        expect(field("mj_LoginForm_server")).toBeNull();
        expect(container.querySelector(".mj_LoginServerNote")?.textContent).toBe("Signing in to chat.example.com");
        expect(document.activeElement).toBe(field("mj_LoginForm_username"));
    });

    it("names the deployment's own host when config fixes a relative server URL", async () => {
        await render(signedOutClient({ journal_server_url: "/" }));
        expect(container.querySelector(".mj_LoginServerNote")?.textContent).toBe("Signing in to localhost");
        await act(async () => root.unmount());
        root = createRoot(container);
        await render(signedOutClient({ journal_server_url: "/journal" }));
        expect(container.querySelector(".mj_LoginServerNote")?.textContent).toBe("Signing in to localhost");
    });

    it("announces errors once: no live region wraps the whole column", async () => {
        await render(signedOutClient());
        expect(container.querySelector("main[aria-live]")).toBeNull();
    });

    it("keeps submit disabled until every visible field has a non-blank value", async () => {
        await render(signedOutClient());
        expect(submit().disabled).toBe(true);
        await act(async () => type(field("mj_LoginForm_server")!, "https://chat.example"));
        await act(async () => type(field("mj_LoginForm_username")!, "   "));
        await act(async () => type(field("mj_LoginForm_password")!, "pw"));
        expect(submit().disabled).toBe(true);
        await act(async () => type(field("mj_LoginForm_username")!, "alice"));
        expect(submit().disabled).toBe(false);
    });

    it("submits the config server when the field is hidden", async () => {
        const client = signedOutClient({ journal_server_url: "https://chat.example.com" });
        const login = jest.spyOn(client, "login").mockResolvedValue(undefined);
        await render(client);
        await act(async () => type(field("mj_LoginForm_username")!, "alice"));
        await act(async () => type(field("mj_LoginForm_password")!, "pw"));
        await submitForm();
        expect(login).toHaveBeenCalledWith("https://chat.example.com", "alice", "pw");
    });

    it("shows a login error and re-enables submit", async () => {
        const client = signedOutClient({ journal_server_url: "https://chat.example.com" });
        jest.spyOn(client, "login").mockRejectedValue(new Error("Wrong password"));
        await render(client);
        await act(async () => type(field("mj_LoginForm_username")!, "alice"));
        await act(async () => type(field("mj_LoginForm_password")!, "pw"));
        await submitForm();
        expect(container.querySelector("[role=alert]")?.textContent).toBe("Wrong password");
        expect(submit().disabled).toBe(false);
        // Editing after a failure keeps the error until the next submit.
        await act(async () => type(field("mj_LoginForm_password")!, "pw2"));
        expect(container.querySelector("[role=alert]")?.textContent).toBe("Wrong password");
    });
});
