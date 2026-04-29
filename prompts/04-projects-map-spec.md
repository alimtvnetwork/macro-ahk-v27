# Projects Map — User Prompt Mirror

> Verbatim user prompt + canonical spec for the **Projects Map** entry
> in the Macro Controller hamburger menu.
>
> **Canonical spec** (kept in sync with this file):
> [`spec/21-app/02-features/macro-controller/03-projects-map.md`](../spec/21-app/02-features/macro-controller/03-projects-map.md)
>
> The prompts/ folder mirrors the user's verbatim instruction; the
> spec/ folder is the implementation source of truth. Both files must
> be updated together when scope changes.

---

## Verbatim instruction

In the Macro Controller, add another UI entry to the dropdown list
called **Projects Map**. When opened, it reads all currently open
Lovable project tabs from the browser level. For every open Lovable
project tab, the Macro Controller saves the Project ID, Project Name,
and the Project Workspace information (along with the current
workspace) into IndexDB.

Namespace path for the IndexDB store:
`RiseOfAsia → Projects → MacroController` — this store must hold the
captured information.

From the saved information, when the user clicks on **Projects Map**,
they should see which project belongs to which workspace, how much
credit that workspace has remaining and available, how soon the credit
is going to expire, and the workspace category (e.g. `Pro`, `Expired`,
`Cancelled`, etc.).

---

## See spec for full detail

The detailed schema, module layout, acceptance criteria, and open
questions live in the canonical spec linked above. This file exists
only to preserve the user-facing prompt verbatim.
