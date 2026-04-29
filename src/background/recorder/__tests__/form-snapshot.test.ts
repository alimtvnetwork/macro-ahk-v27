/**
 * Tests for `form-snapshot.ts` — capture, masking, and verbose gating.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    captureFormSnapshot,
    isSubmitTarget,
} from "../form-snapshot";

const FIXED = () => new Date("2026-04-26T08:00:00.000Z");

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("captureFormSnapshot — non-verbose", () => {
    it("returns null when target is null", () => {
        expect(captureFormSnapshot(null)).toBeNull();
    });

    it("returns null when no form-like container is reachable", () => {
        document.body.innerHTML = `<button id="lonely">Hi</button>`;
        const btn = document.getElementById("lonely")!;
        expect(captureFormSnapshot(btn)).toBeNull();
    });

    it("captures field metadata but no values when verbose=false", () => {
        document.body.innerHTML = `
            <form id="login" action="/auth" method="post">
                <input name="email" type="email" required value="alice@x.com" />
                <input name="password" type="password" value="hunter2" />
                <button type="submit">Go</button>
            </form>
        `;
        const submit = document.querySelector("button")!;
        const snap = captureFormSnapshot(submit, { Verbose: false, Now: FIXED })!;
        expect(snap).not.toBeNull();
        expect(snap.Form.Tag).toBe("form");
        expect(snap.Form.Id).toBe("login");
        expect(snap.Form.Action).toBe("/auth");
        expect(snap.Form.Method).toBe("POST");
        expect(snap.Verbose).toBe(false);
        expect(snap.Values).toBeNull();
        expect(snap.Fields.map((f) => f.Name)).toEqual(["email", "password"]);
        const pw = snap.Fields.find((f) => f.Name === "password")!;
        expect(pw.Sensitive).toBe(true);
        expect(pw.Type).toBe("password");
        const email = snap.Fields.find((f) => f.Name === "email")!;
        expect(email.Required).toBe(true);
    });
});

describe("captureFormSnapshot — verbose", () => {
    it("populates values and masks sensitive fields", () => {
        document.body.innerHTML = `
            <form>
                <input name="email" type="email" value="alice@x.com" />
                <input name="password" type="password" value="hunter2" />
                <input name="csrfToken" type="hidden" value="abc123def" />
                <input name="agree" type="checkbox" checked />
                <textarea name="bio">hi there</textarea>
                <select name="role"><option value="admin" selected>Admin</option></select>
            </form>
        `;
        const form = document.querySelector("form")!;
        const snap = captureFormSnapshot(form.querySelector("input")!, { Verbose: true, Now: FIXED })!;
        expect(snap.Verbose).toBe(true);
        expect(snap.Values).not.toBeNull();
        const byName = new Map(snap.Values!.map((v) => [v.Name, v]));
        expect(byName.get("email")!.Value).toBe("alice@x.com");
        expect(byName.get("email")!.Masked).toBe(false);
        expect(byName.get("password")!.Masked).toBe(true);
        expect(byName.get("password")!.Value).toBe("*".repeat("hunter2".length));
        expect(byName.get("csrfToken")!.Masked).toBe(true);  // matches /token/i
        expect(byName.get("agree")!.Value).toBe("true");
        expect(byName.get("bio")!.Value).toBe("hi there");
        expect(byName.get("role")!.Value).toBe("admin");
    });

    it("masks via autocomplete=cc-number even when name is innocuous", () => {
        document.body.innerHTML = `
            <form><input name="card" autocomplete="cc-number" value="4111111111111111" /></form>
        `;
        const input = document.querySelector("input")!;
        const snap = captureFormSnapshot(input, { Verbose: true })!;
        expect(snap.Values![0].Masked).toBe(true);
    });

    it("falls back to a non-form container when target sits outside any <form>", () => {
        document.body.innerHTML = `
            <div id="wrapper">
                <input name="q" value="lookup" />
                <button id="go">Search</button>
            </div>
        `;
        const btn = document.getElementById("go")!;
        const snap = captureFormSnapshot(btn, { Verbose: true })!;
        expect(snap).not.toBeNull();
        expect(snap.Form.Tag).toBe("container");
        expect(snap.Fields).toHaveLength(1);
        expect(snap.Values![0].Value).toBe("lookup");
    });
});

describe("isSubmitTarget", () => {
    it("recognises submit buttons and inputs", () => {
        document.body.innerHTML = `
            <button id="b1" type="submit">Go</button>
            <button id="b2">Plain</button>
            <button id="b3" type="button">Cancel</button>
            <input id="i1" type="submit" />
            <input id="i2" type="image" />
            <input id="i3" type="text" />
        `;
        expect(isSubmitTarget(document.getElementById("b1"))).toBe(true);
        expect(isSubmitTarget(document.getElementById("b2"))).toBe(true); // default type=submit
        expect(isSubmitTarget(document.getElementById("b3"))).toBe(false);
        expect(isSubmitTarget(document.getElementById("i1"))).toBe(true);
        expect(isSubmitTarget(document.getElementById("i2"))).toBe(true);
        expect(isSubmitTarget(document.getElementById("i3"))).toBe(false);
        expect(isSubmitTarget(null)).toBe(false);
    });
});
