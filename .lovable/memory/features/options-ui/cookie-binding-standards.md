# Memory: features/options-ui/cookie-binding-standards
Updated: 2026-03-26

## Cookie Binding Model

The canonical cookie binding type is `CookieBinding` (from `src/shared/project-types.ts`):

```ts
interface CookieBinding {
  cookieName: string;  // exact cookie name
  url: string;         // domain URL for access
  role: "session" | "refresh" | "custom";
  description?: string;
}
```

Stored on `StoredProject.cookies[]`. The legacy `cookieRules[]` (name/domain/matchStrategy/bindTo) is deprecated.

## SDK Access Patterns

The per-project namespace (`RiseupAsiaMacroExt.Projects.<CodeName>.cookies`) provides:

- `cookies.getByRole("session")` — role-based lookup (recommended)
- `cookies.getSessionToken()` — shortcut for session role
- `cookies.get("cookieName")` — literal cookie name lookup (falls back if no role match)
- `cookies.getAll()` — all cookies via extension bridge
- `cookies.bindings` — frozen array of declared bindings

Role-based lookup resolves the `role` field to find the matching `cookieName`, then delegates to `window.marco.cookies.get(cookieName)`.

## UI (CookiesPanel)

The Cookies tab in ProjectDetailView uses `CookiesPanel` with:
- Fields: Cookie Name, URL, Role (select: session/refresh/custom), Description
- Inline SDK Access Guide showing copy-pasteable code examples
- Legacy migration notice if old `cookieRules[]` exist
