# Lovable User Add — Verbatim User Transcript (v2 brief)

Captured 2026-04-24 from the user's session message that originated this spec
revision. The original captured XPaths and REST examples are shared with the
Owner Switch verbatim — see `../70-lovable-owner-switch/99-verbatim.md`.
This file holds the User Add-specific brief.

---

## v2 amendment (chat instruction prefix)

> Write this into memory and the spec folder properly. Do not act on it. Also
> insert it into the plan tasks: as a to-do if it has not been done, and as a
> review item if it has been done, **for the user add remember to add first
> as editor or member then as owner change it using the api so refer user
> role switch spec which doesn't need apply all but just do another REST
> after the user is added as member**.

This is the controlling instruction for Step B (Owner promotion) of this
spec. The implementation MUST:

1. POST the new membership as `Member` (Editor) when the requested role is
   `Owner` — Lovable's invite endpoint cannot directly assign `Owner`.
2. After the POST succeeds, resolve the new user's `UserId` by listing the
   workspace memberships and matching `InviteEmail`.
3. Issue the Owner-promotion `PUT` exactly as documented in the
   `Lovable Owner Switch` REST contract — sharing the same
   `LovableApiClient.promoteToOwner(...)` method, not a duplicate.

---

## Verbatim narrative

> # Lovable User Add Chrome Extension Instruction
>
> ## Verbatim
>
> This is the second of the two Chrome extension projects derived from the
> same source brief. It lives inside the macro project. The project name is
> **Lovable User Add**.
>
> The flow is almost identical to `Lovable Owner Switch`. The only difference
> is what we do after we are logged in: instead of resolving an existing user
> and promoting them to Owner, we add a new user to the workspace by email
> with a chosen role (`Admin`, `Editor`/`Member`).
>
> Reuse the shared `Lovable Common XPath` TypeScript module across both
> projects. Reuse the same Upload / File Manager / popup UI / SQLite
> migration / logging / caching / sign-out conventions.
>
> The endpoint used here is:
>
> `POST https://api.lovable.dev/workspaces/{WorkspaceId}/memberships`
>
> with body `{"Email":"...","Role":"..."}` where `Role` is one of `Admin`,
> `Member` (Editor), or `Owner` (rare).
>
> If you have any question and confusion, feel free to ask during the
> implementation.

The full content of the v2 brief — Project Identity, File System References,
Backend / Extension Core (Upload + File Picker, Required CSV Columns, SQLite
Schema with `MembershipRole` lookup + `DefaultRoleId`, Default XPaths,
Configurable URLs, Browser Launch Options, Execution Flow, Execution
Diagram, Caching), Frontend (Popup UI), Coding Guidelines (recap), and
Acceptance Criteria — has been transcribed into the structured spec files
(`01-overview.md` and `02-acceptance-criteria.md`) without paraphrasing
material requirements. The narrative here preserves the controlling
amendment for Step B Owner promotion verbatim.

---

## Captured REST examples (shared)

For the actual `POST .../memberships` (add) and `PUT .../memberships/{UserId}`
(promote) fetch examples captured from DevTools, see
`../70-lovable-owner-switch/99-verbatim.md` §"Captured REST examples".

> Tokens in those examples are short-lived Firebase ID tokens already
> expired. Do **not** reuse. Implementation derives a fresh bearer from the
> Lovable session cookie at runtime per
> `mem://auth/unified-auth-contract`.
