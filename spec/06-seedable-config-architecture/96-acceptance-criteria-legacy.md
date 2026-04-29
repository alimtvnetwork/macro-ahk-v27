# Seedable Config Architecture — Acceptance Criteria (Legacy)

> **Originally filed at slot 97 — renumbered to slot 96 on 2026-04-22 to remove duplicate-prefix collision with the canonical GIVEN/WHEN/THEN file at slot 97.** Kept for traceability; the v3.2 file at `97-acceptance-criteria.md` is the active source of truth.

**Version:** 3.2.0  
**Last Updated:** 2026-04-16

---

## AC-01: Configuration Seeding

- [ ] Initial seed data populates all required configuration on first run
- [ ] Seed files use JSON format with schema validation
- [ ] Seeding is idempotent — re-running does not duplicate data

## AC-02: Changelog Versioning

- [ ] Configuration changes generate automatic changelog entries
- [ ] Version numbers follow semantic versioning (major.minor.patch)
- [ ] Rollback restores previous configuration state cleanly

---

## Cross-References

- [Overview](./00-overview.md)
