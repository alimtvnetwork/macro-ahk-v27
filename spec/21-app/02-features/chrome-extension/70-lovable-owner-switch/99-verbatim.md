# Lovable Owner Switch — Verbatim User Transcript

Captured 2026-04-24 from the user's session message that originated this spec.
Stored verbatim per `mem://workflow/15-session-2026-04-24-installer-contract-and-banner-hider-rca`
+ Write-Memory v3.0 protocol step 11 ("recent specs properly and verbatims
properly into file system").

---

## Captured XPaths (Lovable site)

| Element | XPath |
|---|---|
| Email input | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div/input` |
| Continue 1 button | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div/button` |
| Password input | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div[3]/input` |
| Login button | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div[1]/button` |
| Workspace | `/html/body/div[2]/div[1]/div[2]/aside/div/div[2]/button` |
| Settings | `/html/body/div[5]/div/div[2]/button[1]` |
| Profile | `/html/body/div[2]/div[1]/div[2]/aside/div/div[4]/button` |
| Sign out | `/html/body/div[5]/div/div[7]` |

---

## Captured REST examples

> Tokens preserved verbatim **for shape reference only** — they are short-lived
> Firebase ID tokens and have already expired by the time this file is read.
> Do **not** reuse them. The implementation must derive a fresh bearer from the
> Lovable session cookie at runtime per `mem://auth/unified-auth-contract`.

### Promote to Admin

```js
fetch("https://api.lovable.dev/workspaces/PEyOI0U7YaIzveuzgECA/memberships/FP3OOftEhoZ8ebYFGQDXhsaG6Bd2", {
  "headers": {
    "accept": "*/*",
    "authorization": "Bearer <REDACTED-EXPIRED-JWT>",
    "content-type": "application/json",
    "x-browser-session-id": "bsess_01kpzccvk5fk0b6m4a68a81bgd",
    "x-client-git-sha": "22747006d2996f248a6403cf8b60839535a53631"
  },
  "referrer": "https://lovable.dev/",
  "body": "{\"role\":\"admin\"}",
  "method": "PUT",
  "mode": "cors",
  "credentials": "include"
});
```

### Promote to Owner

```js
fetch("https://api.lovable.dev/workspaces/PEyOI0U7YaIzveuzgECA/memberships/FP3OOftEhoZ8ebYFGQDXhsaG6Bd2", {
  "method": "PUT",
  "headers": { "content-type": "application/json", "authorization": "Bearer <REDACTED-EXPIRED-JWT>" },
  "body": "{\"role\":\"owner\"}",
  "credentials": "include"
});
```

### Demote to Member / Editor

```js
fetch("https://api.lovable.dev/workspaces/PEyOI0U7YaIzveuzgECA/memberships/lVwabEyDPcRcQylQnBaYS6AZIRv2", {
  "method": "PUT",
  "headers": { "content-type": "application/json", "authorization": "Bearer <REDACTED-EXPIRED-JWT>" },
  "body": "{\"role\":\"member\"}",
  "credentials": "include"
});
```

### Add member (Admin role) — covered fully in companion spec `Lovable User Add`

```js
fetch("https://api.lovable.dev/workspaces/w1hC8aEl9NdHPgxy5qPz/memberships", {
  "method": "POST",
  "headers": { "content-type": "application/json", "authorization": "Bearer <REDACTED-EXPIRED-JWT>" },
  "body": "{\"email\":\"loveable.engineer.v009@attobondcleaning.store\",\"role\":\"admin\"}",
  "credentials": "include"
});
```

### Add member (Member role)

```js
fetch("https://api.lovable.dev/workspaces/w1hC8aEl9NdHPgxy5qPz/memberships", {
  "method": "POST",
  "headers": { "content-type": "application/json", "authorization": "Bearer <REDACTED-EXPIRED-JWT>" },
  "body": "{\"email\":\"loveable.engineer.v011@attobondcleaning.store\",\"role\":\"member\"}",
  "credentials": "include"
});
```

---

## Verbatim narrative (lightly de-duplicated, content unchanged)

> I have given you most of the information. From this, I want you to create
> two separate specifications. These should be put in the spec folder for the
> Chrome extension. They are two separate Chrome extension projects, and you
> can decide the name of each project. Also put a note into Lovable memory
> that these are pending to do — we will do them later.
>
> This will sit inside the macro project. The new project for this spec is
> **Lovable Owner Switch**. The other project is **Lovable User Add**
> (covered in a separate spec).
>
> The way it will work: the user hovers over to this script (script/project
> name = `Lovable Owner Switch`) and proceeds. In both projects we share a
> common TypeScript module of XPaths, reused across both. Name it
> `Lovable Common XPath`.
>
> For ownership change, the target user is already added to the workspace,
> and the goal is to promote that user to **Owner**. The flow:
>
> 1. The user clicks on this script in the Chrome extension.
> 2. Inside the Chrome extension, when we switch to this project, we need an
>    additional option for the file system: **Upload File**. When a file is
>    uploaded, it is saved inside the project folder under `uploads/`, with
>    the filename converted to a friendly slug. Each file is saved as `01`,
>    `02`, etc. with a sequence prefix.
> 3. The user can pick from existing files via a file manager that lists only
>    the files in that project's `uploads/` folder. Single or multiple
>    selection. Allowed file types: JSON, PDF, TXT, CSV, DB, JS.
> 4. For this project, the user provides a CSV file with the following
>    columns: login email, password (used to log in to Lovable), one or two
>    target Owner emails, and an optional notes column.
> 5. The script can enforce constraints: only accept CSV files that contain
>    the required columns. Alternatively pick from the existing file system.
> 6. The password column is optional — there is also a text box where the
>    user can provide a common password used when the CSV password is blank.
>    Providing it inside the CSV is preferred.
> 7. Once a file is selected, the task starts. A SQLite master table records
>    the task with an auto-increment primary key. The task name can be
>    auto-derived from the filename and customized by the user via another
>    input in the popup.
> 8. A foreign-key child table holds the per-row data: email, password,
>    owner email(s), notes, IsDone, HasError. Use IsDone (the inverse of
>    pending — pending is computed in code as `!IsDone`).
> 9. On component load, the extension runs a migration via the core SDK to
>    create the table if it does not exist.
> 10. When executing a row, open Chrome (incognito by default, with a flag
>     to disable). Navigate to the Lovable login URL (customizable from the
>     UI), fill email by XPath, click Continue, fill password by XPath,
>     click Login.
> 11. Wait for the workspace XPath to confirm login. Retry until visible.
> 12. Read the Lovable session cookie to obtain the bearer token (same
>     approach as Macro Controller).
> 13. Fetch the workspace memberships, find the target user by email,
>     resolve the user ID, and cache it in IndexedDB via the root SDK
>     (Riseup SDK / Macro SDK caching: add/read/remove).
> 14. Issue
>     `PUT https://api.lovable.dev/workspaces/{WorkspaceId}/memberships/{UserId}`
>     with `{"Role":"Owner"}`.
> 15. On success, sign out: click Profile button, wait for Sign Out button
>     XPath, click Sign Out, wait.
> 16. Each step has its own configurable delay. XPaths and delays are stored
>     alongside each other and are user-editable. On first run they are
>     seeded into SQLite from defaults; subsequent runs read from SQLite.
>     Reset restores defaults from code.
>
> Coding rules:
>
> 1. Class-based segments. No file over 100 lines.
> 2. UI, CSS, and logic must be separated.
> 3. Use Enums and constants — never magic strings.
> 4. Prefer positive `if` conditions; follow project naming conventions.
> 5. Functions ≤ 8 lines (max 12–15).
> 6. Use injection / traits / static reusable classes; statics scoped to the
>    namespace, nothing leaks.
> 7. Strict typing — no `any`, no `unknown`.
> 8. Every try/catch logs properly. All steps emit logs that can be shared
>    with the AI for debugging.
>
> This is the standard process of promoting a user to Owner. The Add User
> flow is similar and is covered in the separate spec.
