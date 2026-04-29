# Lovable Owner Switch — Default XPaths, URLs, and Delays

Seeded into `XPathSetting` on first run. Defined in the shared module
`lovable-common-xpath` and reused by `Lovable User Add`.

---

## Default XPaths

| KeyCode | Value |
|---|---|
| LoginEmailInput | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div/input` |
| ContinueButton | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div/button` |
| PasswordInput | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[1]/div[3]/input` |
| LoginButton | `/html/body/div[2]/div[1]/div/div[1]/main/div[2]/div/div/form/div/div[2]/div[1]/div[1]/button` |
| WorkspaceButton | `/html/body/div[2]/div[1]/div[2]/aside/div/div[2]/button` |
| SettingsButton | `/html/body/div[5]/div/div[2]/button[1]` |
| ProfileButton | `/html/body/div[2]/div[1]/div[2]/aside/div/div[4]/button` |
| SignOutButton | `/html/body/div[5]/div/div[7]` |

## Configurable URLs

| Key | Default |
|---|---|
| LoginUrl | `https://lovable.dev/login` |
| ApiBase | `https://api.lovable.dev` |

## Browser launch options

| Key | Default |
|---|---|
| OpenIncognito | `true` |
| Per-step delays | sourced from `XPathSetting.DelayMs` per row |

## REST endpoints used

### Promote member to Owner / Admin / Editor (member)

```
PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}
Content-Type: application/json
Authorization: Bearer <session-derived JWT>

{ "Role": "Owner" }     // or "Admin" / "Member"
```

### List memberships (for email → UserId resolution)

```
GET {ApiBase}/workspaces/{WorkspaceId}/memberships
```

### List workspaces

```
GET {ApiBase}/workspaces
```

> All header behavior (cookies, bearer, x-browser-session-id) mirrors what the
> Macro Controller already does — see verbatim transcript in `99-verbatim.md`
> for the original captured fetch examples.
