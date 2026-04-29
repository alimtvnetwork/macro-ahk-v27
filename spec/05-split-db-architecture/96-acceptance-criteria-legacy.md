# Split Database Architecture — Acceptance Criteria (Legacy)

> **Originally filed at slot 97 — renumbered to slot 96 on 2026-04-22 to remove duplicate-prefix collision with the canonical GIVEN/WHEN/THEN file at slot 97.** Kept for traceability; the v2.0 file at `97-acceptance-criteria.md` is the active source of truth.

**Version:** 1.0.0  
**Last Updated:** 2026-03-20

---

## AC-01: Database Partitioning

- [ ] SQLite databases split correctly by domain (main, config, analytics)
- [ ] Cross-database queries use proper attach/detach patterns
- [ ] Migration system handles schema changes per database partition

## AC-02: Data Integrity

- [ ] Foreign key relationships maintained within each database
- [ ] Backup and restore operations handle all database partitions
- [ ] Connection pooling manages multiple SQLite file handles efficiently

---

## Cross-References

- [Overview](./00-overview.md)
