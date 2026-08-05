# Audit scratchpad

**This file is working memory for one audit, not an archive.** It exists so a long review
can be interrupted and resumed without losing its place. When the work is committed, the
findings have already landed in three better places — the fix itself, the comment above
the fix, and the scenario that would catch it again — so **clear this file back to the
template below** as part of the same commit.

Anything genuinely worth keeping does not belong here:

| What it is | Where it goes |
|---|---|
| Why the code is the way it is | `docs/DECISIONS.md`, dated |
| A question only a human can answer | `docs/DECISIONS.md` → **Still open** |
| A rule for anyone working on the repo | `CLAUDE.md` |
| A deployment or launch step | `README.md` → Going to production |
| A user-visible change | `docs/FEATURES.md` |
| What was wrong and how it was fixed | the commit message, and a test |

A finding that has been fixed, tested and explained in a comment does not need a second
description in a document nobody reads again. That is how this file reached 765 lines
covering seventeen sections of work that was already finished.

---

## Current audit

**Started:** —
**Scope:** —

| # | Section | Status |
|---|---|---|
| | *nothing in progress* | |

Use ☐ not started · ◐ in progress · ☑ done and verified. On resuming, find the first ☐
and continue there.

### Findings

*(one heading per finding: what was wrong, what was done, where, and how it is now
covered — then delete the lot when the work is committed and the durable parts have been
moved to the table above)*

---

## Before you clear this file

- [ ] Every fix has a scenario that would have caught it.
- [ ] `./scripts/preflight.sh` passes. Stop the Vite dev server first, or `npm ci` fails
      on Windows with `EPERM … rolldown-binding.win32-x64-msvc.node`.
- [ ] Anything user-visible is reflected in `docs/FEATURES.md` — preflight checks this.
- [ ] New decisions are in `docs/DECISIONS.md`; new questions are under **Still open**.
- [ ] This file is back to the template.
