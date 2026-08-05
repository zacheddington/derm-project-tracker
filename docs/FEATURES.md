# Dermatology Project Tracker — what it does

A plain-language rundown of every feature, written for the people who will use it rather
than the people who built it. If something in here does not match what you see on screen,
the document is wrong and we want to know.

**Last updated:** 2026-08-05

---

## What this is for

A shared record of the department's scholarly work — case reports, QA/QI projects,
research, and reviews — so that "what is everyone working on, and where has it got to?"
has an answer that does not depend on anyone's memory or inbox.

It replaces the spreadsheet. It is not a manuscript editor, a citation manager, or a
patient record.

## What it will never hold

**No patient information.** Not "we try to avoid it" — the fields do not exist. There is
nowhere to put a name, a medical record number, a date of birth, or a date of service,
and there never will be. A case report carries a generated case number (`CR-2026-014`)
and nothing else; the link between that number and a patient lives in the EMR or REDCap,
where it belongs.

If you type something that looks like an identifier — a long number, a full date, the
letters "MRN" — the form quietly points it out and asks you to check. It never blocks
you, because it cannot tell a lab value from a record number, and a system that cries
wolf gets ignored.

---

## Current status: this is a working prototype

Everything described below works today and you can click through all of it. Two things
are deliberately not built yet:

- **Nothing is saved.** The prototype runs entirely in your browser. Refresh the page and
  it resets to the sample data. This is on purpose — it lets everyone try the interface
  and give feedback before we commit to how it stores things.
- **There is no sign-in.** Everyone sees everything and can edit anything.

The sample projects are invented. The names on them are real members of the department,
used so the screens can be judged at realistic size — twenty-three people behave very
differently from six in a dropdown — but **nobody listed has been consulted about, or is
associated with, any project shown.** The amber banner at the top of the page says so.

The production version adds sign-in through your UMMC account and saves your work. What
that changes for you is described under [Coming in the production version](#coming-in-the-production-version).

---

## The main screen

### The count tiles

Five tiles across the top: a total, then one for each project type. They are not just
counters — **clicking one filters the table below it**, and clicking it again clears the
filter. The number on a tile always matches the number of rows you get when you click it,
including when you are looking at the archive.

**A tile is a fresh start, not another filter on the pile.** Clicking "Research" clears
the search box and the status, author and year dropdowns, so you get *all* the research
projects rather than the research projects that also match whatever you narrowed to four
minutes ago. Being three filters deep and getting two rows back leaves you working out
which control is still holding things down.

The one thing a tile leaves alone is whether you are looking at active, archived, or
both. The tiles count within that scope, so resetting it would change the numbers on the
tiles at the very moment you clicked one.

### Capturing a new project

The green bar — *"Jot down a new project idea…"* — is the fastest path in. It asks for
three things and nothing else:

- **Title**
- **Type** — Case report, QA/QI, Research, or Review
- **Author(s)** — at least one

That is the whole form. Everything else can wait until you come back to it. The intent is
that an idea mentioned at journal club gets recorded before the conversation moves on.

A few deliberate details:

- **The author list starts empty.** It does not assume the project is yours, because
  coordinators routinely enter projects on behalf of residents, and a wrong author that
  arrives silently is worse than no author at all.
- **Picking the type wrong is not a problem.** You can change it later without recreating
  anything, and nothing you have typed is lost.
- **Case reports get their case number automatically** — `CR-2026-014`, numbered within
  the academic year. Once issued, a number is never reused or renumbered, even if the
  project is archived, so the sequence stays an honest count of what was opened that year.
- **IRB status starts at "Not applicable"** for every new project, whatever its type. A
  status nobody has chosen should claim as little as possible: most QA/QI work and every
  literature review never goes near an IRB, and starting them at "Not yet submitted"
  asserted a submission was coming.

### Finding things

**The search box** looks at everything: titles, project types, statuses, author names,
venues, purposes, notes, diagnoses, and case numbers. If a word is visible on the table
you can search for it, and several useful things that are *not* on the table — the
purpose, the notes, the diagnosis — are searchable too. That means a search can match a
row without showing you why, which is a fair trade for being able to find "the gliptin
one" from memory.

**The filters** narrow by type, work status, author, and academic year. Authors are
listed alphabetically; academic years newest first; statuses stay in workflow order —
Idea through Complete, with On hold and Abandoned after — because alphabetical would open
with "Abandoned, Analyzing, Collecting…", which describes no process.

**The archive button cycles through three states:** Active → Archived → Both. Three
rather than two, so "everything this person has ever done" is a question you can actually
ask.

**Clear filters** appears only when something is filtered.

### The table

Six columns — Project, Type, Status, Authors, Venues, Updated — and **every one sorts**.
Click once to sort, again to reverse, a third time to go back to the default order. Dates
lead with the most recent; everything else starts A–Z. The Project column also shows the
case number and the next action underneath the title.

Twenty projects per page, with a count that tells you where you are. On a phone the table
becomes a list of cards with the same information.

---

## Opening a project

Clicking any row opens a panel with three tabs.

### Overview

- **Title**
- **Type** — changeable here; an already-issued case number is kept
- **Work status** — Idea, Planning, Collecting data, Researching/analyzing, Rough draft,
  In edit, Complete, On hold, Abandoned
- **IRB status** — Not applicable, Not yet submitted, Submitted, Approved, Exempt
  determination
- **Author(s)** — add or remove anyone; new people can be added to the roster without
  leaving the form
- **Purpose** — the goal, or why this matters
- **Next action** and a **due date**

Then a section that changes with the project type:

| Type | Fields |
|---|---|
| **Case report** | Diagnosis · Why it is unique · Attending · Year seen · Patient consent |
| **QA/QI** | Description · Aim statement · Measure |
| **Research** | Description · Study design · Data source |
| **Review** | Description · Review type · Research question |

Two notes on case reports. **Year seen is a year, never a full date** — a date of service
is a patient identifier and a year is not. **The attending list offers attendings only**,
and you can add a new one inline; if the attending on an old case report has since left
or changed role, they stay listed rather than silently vanishing.

### Venues

A project can be headed to several places at once, at different stages — a poster already
accepted while the manuscript is still in review. Each venue records where it is going,
what kind of thing it is, its submission status, a target date, and notes.

Venues are the one thing that is genuinely deleted rather than archived, so removing one
asks first.

### Notes

A free-text notepad. Anything except patient identifiers.

---

## Saving, and not losing work

Changes are held until you press **Save changes**, and the panel tells you whether you
have unsaved work.

- **Trying to leave with unsaved changes asks first**, and offers to save for you rather
  than sending you back to do it yourself.
- **Undoing an edit by hand counts as no change.** Typing a character and deleting it
  does not leave the form insisting you have unsaved work. The same is true of the type
  buttons: switch a project to Review, change your mind, switch it back, and there is
  nothing to save — an already-issued case number survives the round trip either way.
- **A project cannot be saved without a title, or without at least one author.** You can
  still remove the last author while editing — you have to be able to take the wrong name
  off before putting the right one on — but saving that way is refused, with an
  explanation.
- **A venue cannot be saved without a name.**
- **A half-typed date is refused rather than silently dropped.** Dates are typed straight
  through as `08/04/2026`; the slashes appear for you.
- **Enter saves.** In the roster's edit form and the add-someone form, pressing Enter in
  any field does the same thing the Save button does. It previously worked in the name
  box and nowhere else, so pressing it after typing an end date appeared to do nothing.
  Enter will not save a date that is only half typed — the message explaining why stays
  on screen instead.

## Archiving

**Delete does not exist.** Finishing with a project archives it: it disappears from the
default view, and everything is kept. Restore it from the Archived filter at any time.

---

## The roster

The **Roster** button, top right.

**Two views, not one list.** Current staff and Former staff are separate tabs, with a
count on the former. Mixing them together and greying out the leavers reads as a
rendering glitch and makes "who has left?" unanswerable.

**Everyone shows their workload** — *"Resident · 2 projects active · 1 project archived"*
— including the zeros, because **finding the people with nothing on is most of what the
roster is for**. Sort by **Least work first** to put them at the top. Both counts are
links straight to that person's projects, and clicking a name shows everything they have
ever done, active and archived together.

You can also **search by name or position**, and **filter by position**.

**Renaming someone is safe.** People marry, divorce, and change names. Every project
they have ever authored follows the change automatically, because projects are linked to
the person and not to the spelling of their name.

**Nobody is ever deleted.** Residents graduate; their name has to stay on the work they
did. Leaving is an **end date**, which removes them from the dropdowns for new work while
keeping every past attribution intact. A date in the future means someone who has given
notice and is still here.

Adding someone to the roster can be done from the roster itself, or inline from any
author or attending picker, without losing your place.

---

## Getting the data out

**Export CSV** downloads what you are looking at — the same rows the filters left behind,
in the same order, with the columns you can see:

> Title · Case number · Next action · Type · Work status · Authors · Venues · Last updated

A download that quietly contains more than the list in front of you is a different
document with the same name, so it does not do that. The file is named with the date you
exported it, and it opens cleanly in Excel — including titles with commas in them, which
is the usual way a spreadsheet export corrupts itself.

The export is also deliberately hardened against a spreadsheet trick where text beginning
with `=` is treated as a live formula. Anything of that shape is neutralised before it
reaches the file.

---

## Accessibility

Not an afterthought, and it will be asked about.

- Every control can be reached and operated from the keyboard, with a visible focus ring.
- In the author picker, two or three characters plus Enter or Tab takes the top match —
  no reaching for the mouse.
- Screen readers get the real names of controls, the selected state of buttons, and
  proper list and dialog semantics.
- Every dialog closes with Escape.
- Animation is reduced automatically if your system asks for that.
- The layout works on a phone.

---

## Coming in the production version

- **Sign in with your UMMC account.** Only UMMC addresses can get in.
- **Your work is saved**, shared with the department, and available from any device.
- **A full history of every change** — who changed what, and when. This is what makes it
  safe for anyone to edit anyone's project, which is what the department asked for: a
  resident correcting an attending's typo is a feature, not a risk.
- **Administrators** can edit the status vocabularies without a code change, merge
  duplicate people, and permanently delete when something really has to go.
- **An ACGME scholarly-activity report** built from the data already here. The exact
  columns need confirming against what the program coordinator assembles by hand today.
- **The department's own colours.** Every colour comes from one place, so the real brand
  values drop straight in.

---

## Keeping this document true

This file is part of the release procedure, not documentation someone remembers to
update. `scripts/preflight.sh` fails a push that changes the interface without touching
this file.

When you change what people can do:

- **Removed something?** Delete it from here. A feature list describing a button that is
  gone is worse than no feature list.
- **Changed something?** Change the description, not just the code.
- **Added something?** Write it up here, in the same plain language, from the point of
  view of somebody using it rather than somebody building it.

Then move the **Last updated** date at the top.
