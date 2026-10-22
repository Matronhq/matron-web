/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Password reset by email (journal docs/protocol.md "Password reset by email").
 *
 * - ForgotPasswordForm is the sign-in screen's "Forgot password?" step, offered only when the
 *   server typed there says it can send mail. It asks for a username or email address and always
 *   gives the same answer, so it never says whether an account exists.
 * - ResetPasswordPage is /app/reset-password#token=…, the link in that mail. It works signed out,
 *   and signed in: the journal signs out every browser and app of the account, so this one signs
 *   itself out too when it was signed in to the same journal.
 *
 * The token is read from the address once and removed from it at once, so it is not left in the
 * browser's history.
 */

import React, { useEffect, useState } from "react";

import { JournalApiError } from "./api";
import { newPasswordProblem } from "./ChangePassword";
import { errorMessage, type MatronJournalClient } from "./client";

/** How long the sign-in screen waits after the last keystroke in Server before asking it. */
export const FORGOT_CHECK_DEBOUNCE_MS = 400;

const RESET_PATH = /(?:^|\/)reset-password\/?$/;

/** The sentence for a refused forgot-password or reset ask. */
export function resetFailure(error: unknown): string {
    if (error instanceof JournalApiError) {
        if (error.code === "rate_limited") return "Too many requests. Try again in a few minutes.";
        if (error.status === 0) return "Couldn't reach the journal. Check your connection and try again.";
    }
    return errorMessage(error);
}

// ── The reset link ───────────────────────────────────────────────────────────────────────────

let taken: { token: string } | null | undefined;

/**
 * The reset link this page was opened with, or null when it is not the reset page. The first
 * call reads the token and strips it from the address bar; later calls answer the same.
 */
export function takeResetLink(): { token: string } | null {
    if (taken !== undefined) return taken;
    if (!RESET_PATH.test(window.location.pathname)) {
        taken = null;
        return taken;
    }
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? "";
    if (window.location.hash) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    taken = { token };
    return taken;
}

/** Leave the reset page for the app's own address (…/app/reset-password → …/app/). */
export function leaveResetPage(): void {
    taken = null;
    const base = window.location.pathname.replace(RESET_PATH, "/");
    window.history.replaceState(window.history.state, "", base);
}

/** Tests only: forget what takeResetLink read. */
export function resetTakenLinkForTests(): void {
    taken = undefined;
}

// ── Sign-in screen: Forgot password? ─────────────────────────────────────────────────────────

/** Whether `server` mails reset links. Asked again (debounced) as the address changes; off until it answers. */
export function useForgotPasswordEnabled(client: MatronJournalClient, server: string): boolean {
    const [enabled, setEnabled] = useState<{ server: string; enabled: boolean }>();
    useEffect(() => {
        const target = server.trim();
        if (!target) return;
        let live = true;
        const timer = window.setTimeout(() => {
            client.forgotPasswordEnabled(target).then(
                (yes) => {
                    if (live) setEnabled({ server: target, enabled: yes });
                },
                () => {
                    if (live) setEnabled({ server: target, enabled: false });
                },
            );
        }, FORGOT_CHECK_DEBOUNCE_MS);
        return () => {
            live = false;
            window.clearTimeout(timer);
        };
    }, [client, server]);
    return enabled?.server === server.trim() && enabled.enabled;
}

export const RESET_LINK_SENT =
    "If that account has an email address, we've sent a link to reset its password. It works once, for 30 minutes.";

export function ForgotPasswordForm({
    client,
    server,
    initialIdentifier,
    onBack,
}: {
    client: MatronJournalClient;
    server: string;
    initialIdentifier: string;
    onBack: () => void;
}): React.ReactElement {
    const [identifier, setIdentifier] = useState(initialIdentifier);
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string>();

    const submit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (busy || !identifier.trim()) return;
        setBusy(true);
        setError(undefined);
        try {
            await client.forgotPassword(server, identifier);
            setSent(true);
        } catch (failure) {
            setError(resetFailure(failure));
        }
        setBusy(false);
    };

    if (sent) {
        return (
            <div className="mj_LoginForm mj_TwoFactorStep" data-forgot-step="sent">
                <p className="mj_TwoFactorStep_text" role="status">
                    {RESET_LINK_SENT}
                </p>
                <button className="mj_LoginSubmit" type="button" data-autofocus onClick={onBack}>
                    Back to sign in
                </button>
            </div>
        );
    }

    return (
        <form className="mj_LoginForm mj_TwoFactorStep" data-forgot-step="ask" onSubmit={(e) => void submit(e)}>
            <label className="mj_LoginField" htmlFor="mj_LoginForm_identifier">
                <span className="mj_LoginField_label">Username or email</span>
                <input
                    id="mj_LoginForm_identifier"
                    type="text"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                    autoCorrect="off"
                    autoCapitalize="none"
                    autoFocus
                    required
                />
            </label>
            {error && (
                <div className="mj_Error mj_Login_error" role="alert">
                    {error}
                </div>
            )}
            <button className="mj_LoginSubmit" type="submit" disabled={busy || !identifier.trim()}>
                {busy ? "Sending…" : "Send reset link"}
            </button>
            <button className="mj_TwoFactorStep_back" type="button" onClick={onBack}>
                Back to sign in
            </button>
        </form>
    );
}

// ── /app/reset-password ──────────────────────────────────────────────────────────────────────

export const PASSWORD_RESET_DONE =
    "Your password has been reset. You've been signed out everywhere; sign in with your new password.";
export const RESET_LINK_INVALID = "This link has expired or has already been used. Ask for a new one.";

export function ResetPasswordPage({
    client,
    server,
    token,
    brand,
    logo,
    signedIn,
    onLeave,
}: {
    client: MatronJournalClient;
    /** The journal the link came from. */
    server: string;
    token: string;
    brand: string;
    logo: string;
    /** Whether this browser is signed in (then the page offers a way back instead of Forgot password?). */
    signedIn: boolean;
    /** Leave the page: for the sign-in screen, or its Forgot password? step. */
    onLeave: (next: "sign-in" | "forgot") => void;
}): React.ReactElement {
    const [phase, setPhase] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const submit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (busy || !next || !confirm) return;
        const problem = newPasswordProblem(next, confirm);
        if (problem) {
            setError(problem);
            return;
        }
        setBusy(true);
        setError(undefined);
        try {
            await client.resetPassword(server, token, next);
            setNext("");
            setConfirm("");
            setPhase("done");
        } catch (failure) {
            if (failure instanceof JournalApiError && failure.code === "invalid_token") {
                setNext("");
                setConfirm("");
                setPhase("invalid");
            } else {
                setError(
                    failure instanceof JournalApiError && failure.code === "weak_password"
                        ? "Use at least 8 characters."
                        : resetFailure(failure),
                );
            }
        }
        setBusy(false);
    };

    return (
        <div className="mj_Login" data-reset-password={phase}>
            <main className="mj_Login_column">
                <img className="mj_Login_logo" src={logo} alt={brand} />
                <h1 className="mj_Login_title">Reset your password</h1>
                {phase === "form" && (
                    <form className="mj_LoginForm" onSubmit={(e) => void submit(e)}>
                        <label className="mj_LoginField" htmlFor="mj_ResetPassword_new">
                            <span className="mj_LoginField_label">New password</span>
                            <input
                                id="mj_ResetPassword_new"
                                type="password"
                                value={next}
                                onChange={(event) => setNext(event.target.value)}
                                autoComplete="new-password"
                                autoFocus
                                required
                            />
                        </label>
                        <label className="mj_LoginField" htmlFor="mj_ResetPassword_confirm">
                            <span className="mj_LoginField_label">Confirm new password</span>
                            <input
                                id="mj_ResetPassword_confirm"
                                type="password"
                                value={confirm}
                                onChange={(event) => setConfirm(event.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </label>
                        {error && (
                            <div className="mj_Error mj_Login_error" role="alert">
                                {error}
                            </div>
                        )}
                        <button className="mj_LoginSubmit" type="submit" disabled={busy || !next || !confirm}>
                            {busy ? "Resetting…" : "Reset password"}
                        </button>
                    </form>
                )}
                {phase === "done" && (
                    <div className="mj_LoginForm mj_TwoFactorStep">
                        <p className="mj_TwoFactorStep_text" role="status">
                            {PASSWORD_RESET_DONE}
                        </p>
                        <button className="mj_LoginSubmit" type="button" onClick={() => onLeave("sign-in")}>
                            Sign in
                        </button>
                    </div>
                )}
                {phase === "invalid" && (
                    <div className="mj_LoginForm mj_TwoFactorStep">
                        <p className="mj_TwoFactorStep_text" role="alert">
                            {RESET_LINK_INVALID}
                        </p>
                        {signedIn ? (
                            <button className="mj_LoginSubmit" type="button" onClick={() => onLeave("sign-in")}>
                                Back to {brand}
                            </button>
                        ) : (
                            <>
                                <button className="mj_LoginSubmit" type="button" onClick={() => onLeave("forgot")}>
                                    Forgot password?
                                </button>
                                <button
                                    className="mj_TwoFactorStep_back"
                                    type="button"
                                    onClick={() => onLeave("sign-in")}
                                >
                                    Back to sign in
                                </button>
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
