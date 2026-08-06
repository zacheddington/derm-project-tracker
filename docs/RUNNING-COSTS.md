# What it costs to run

Written for the question a department head will ask: *what are we signing up for?*

**Figures verified 2026-08-06 against the vendors' own pricing pages** (linked at the
bottom). Prices change — re-check before putting a number in a budget request.

---

## The short answer

**About $25–45 a month in infrastructure, or roughly $300–540 a year.**

That is the whole bill for hosting, the database, backups, and TLS. It does not change
meaningfully as the department uses it more, because the thing being stored is text and
there is very little of it.

The infrastructure is not the real cost. **The real cost is whoever maintains it**, and
the real risk is that the person who built it graduates. Both are covered below.

---

## Recommended setup

| Piece | Choice | Cost |
|---|---|---|
| Database, auth, backups | **Supabase Pro** | **$25/mo** |
| Web hosting | **Cloudflare Pages** | **$0** |
| Domain | **`derm-projects.umc.edu` subdomain from UMMC IT** | **$0** |
| TLS certificate | Included by the host | $0 |
| | **Total** | **$25/mo — $300/yr** |

**If UMMC IT will not issue a subdomain: $8.50/year.** See
[If there is no `umc.edu` subdomain](#if-there-is-no-umcedu-subdomain). Total becomes
**$308.50/yr**.

If the application ever needs server-side rendering — see [The one architectural choice
that costs money](#the-one-architectural-choice-that-costs-money) — add **Vercel Pro at
$20/user/month**, bringing it to **$45/mo, $540/yr**. Nothing in the specification needs
it today.

---

## How it connects — there is no server, and nothing in between

Worth settling first, because it is the thing that makes the rest of the bill so small,
and because the obvious assumption about it is wrong.

The reasonable expectation, from any traditional web application, is that a web server
holds an open connection to a database. That is where "does the host support database
connections?" comes from, and in a LAMP or Rails or Express application it is exactly the
right question. **This application does not work that way, and that is deliberate.**

```
Browser  ──── HTTPS ────>  Cloudflare Pages
(the app runs here)        (serves HTML/CSS/JS files — nothing else)

Browser  ──── HTTPS ────>  Supabase
                           PostgREST API  ──>  connection pooler  ──>  Postgres
                           (Supabase owns and operates all of this)
```

The static host serves files. It never touches the database and holds no connection to
it. The browser calls Supabase's API directly over HTTPS, and **Supabase runs the
connection pooling on its side** — that is what you are buying for $25.

Three consequences:

- **There is no intermediary to add.** No Heroku, no Express server, no API layer. That
  tier does not exist in this design, so there is nothing to pay for, patch, scale, or be
  woken up by. Supabase *is* the backend.
- **The web host's capabilities barely matter.** Any host that can serve static files
  works — which is why it is free, and why moving hosts later is a config change.
- **Security lives in the database, not in a middle tier.** This is the part that has to
  be said out loud, because "the browser talks straight to the database" sounds alarming.
  The browser carries the `anon` key, which is public by design and has **every grant
  revoked**. Every read and write is checked by Row Level Security policies inside
  Postgres. That is what `0002_rls.sql` is, and it is covered by 80 assertions that run
  against a real Postgres on every push. A user cannot read or write anything the policies
  do not allow, no matter what they send.

**What you give up** is genuine and worth stating: no server-side rendering, no server-side
secrets, no business logic hidden from the client. None of that is needed here — but it is
the trade, not a free lunch.

---

## Line by line

### Database and authentication — $25/month

**Supabase Pro.** This covers the Postgres database, sign-in, and daily backups.

The free tier is $0 and technically fits the data, but **it is not usable for a system of
record**, for two specific reasons:

- **Free projects pause after one week of inactivity.** A departmental tracker genuinely
  can go quiet for a week — over the winter break, between blocks, across a conference.
  The site would be down when someone finally came back to it, which is exactly the moment
  it needs to work.
- **The free tier has no backups.** For the department's record of its own scholarly
  output, that is disqualifying on its own.

Pro fixes both: projects never pause, and there are daily backups retained for 7 days. It
includes 8 GB of database storage and 100,000 monthly active users — against a department
of roughly two dozen.

### Web hosting — $0, on Cloudflare Pages

**Cloudflare Pages** is the recommendation: free, unlimited bandwidth for static assets,
500 builds/month, TLS included, and no organisational-use restriction.

**GitHub Pages is free only while the repository is public.** That is a real constraint,
not a footnote. GitHub Pages is available on public repositories with a Free account; a
private repository needs **GitHub Pro at $4/month** (personal) or Team. And even then the
*published site* is still public — restricting who can load the page requires GitHub
Enterprise Cloud.

The repository is public today and preflight enforces that it holds no secrets and no PHI,
so GitHub Pages works right now. But **whether the repo stays public is an open question**
(it is in `docs/DECISIONS.md`), and the answer should not silently decide the hosting bill.

Cloudflare Pages **deploys from a private repository on the free plan**, which removes the
coupling entirely: the department can make the repo private later without that costing
anything or forcing a migration.

> Note that the site being publicly *reachable* is fine either way. It is HTML and
> JavaScript; the data behind it is protected by sign-in and Row Level Security, not by
> the page being secret.

### Domain — $0 if UMMC IT cooperates

**Ask for a `umc.edu` subdomain first**, e.g. `derm-projects.umc.edu`. It costs nothing,
it is one DNS record for their team, and it is materially better than an external domain
for a departmental system: people trust the address, IT can point it wherever the app
lives later, and the department cannot lose it when an individual leaves.

Worth asking early — it is a quick request that tends to sit in a queue.

### If there is no `umc.edu` subdomain

**Budget $8.50/year.** Register through **Cloudflare Registrar**, which sells at the
registry's wholesale price with no markup and no introductory-rate trick — what you pay in
year one is what you pay in year five.

| Option | Per year | Notes |
|---|---|---|
| `.org` | **$8.50** | Recommended. Conventional for a departmental or academic project. |
| `.com` | $10.44 | Fine, marginally more familiar to non-technical users. |

Both include redacted WHOIS at no extra cost, so an individual's name and address do not
end up in a public registry — which matters when the alternative is a resident's home
details.

Registering at Cloudflare while hosting on Cloudflare Pages also means one vendor, one
login, and DNS that configures itself. **Total with an external domain: $308.50/year.**

Register it to a **departmental email**, not a personal one — see
[the thing to raise](#the-thing-to-raise-that-they-will-not-ask-about). A domain that
lapses because the person paying for it graduated is a worse outage than any server
failure, and it is the one thing on this list that cannot be restored from a backup.

### Storage — effectively $0, permanently

This is worth being concrete about, because "database costs" is where people expect the
number to grow.

The system stores text. A generous estimate per project — the row, its type-specific
detail, a couple of venues, authorship, and the full audit-log history of every edit — is
about **12 KB**.

At **60 new projects a year**, which would be more than two per person per year:

| Horizon | Data |
|---|---|
| 1 year | ~0.7 MB |
| 5 years | ~3.5 MB |
| 10 years | ~7 MB |

The Pro plan includes **8 GB**. Even if that estimate is wrong by a factor of a hundred,
the department would use under 1% of what it is already paying for. **Storage will never
be the reason this bill goes up.**

### Connection to the database — $0

There is no separate cost, and nothing to keep running. The application talks to Supabase
over its API; there is no server to lease, no connection pooler to license, and no VPN.

---

## The decision that already saved the most money

**This system stores no protected health information**, and that is not a policy — the
columns do not exist. Case reports carry a generated case number (`CR-2026-014`); the link
to a patient stays in the EMR.

That decision is worth **at least $7,000 a year**, and probably more.

Handling PHI would require a signed Business Associate Agreement with the hosting vendor.
With Supabase, a BAA requires the **Team plan at $599/month** *plus* a paid HIPAA add-on
on top of that. So the same application, storing dates of service, would start at
**$7,188/year before the add-on** — against **$300**.

It would also bring an IT security review, a longer procurement path, and an obligation to
keep the department on the right side of that agreement forever.

**If anyone asks to add a patient name, an MRN, or a date of service, that is not a small
feature request.** It is a change of cost bracket and a change of compliance posture.

---

## Maintenance — the cost that actually matters

Be straightforward with the department heads here: the software is cheap and the person is
not.

**What genuinely needs doing:**

| Task | How often | Roughly |
|---|---|---|
| Dependency and security updates | Quarterly | 2–4 hrs |
| Check backups actually restore | Twice a year | 1–2 hrs |
| Add/remove people, fix data | As needed | Minutes, and the coordinator does it, not a developer |
| Small changes and fixes | On request | Variable — this dominates |

**What does not need doing**, because the platform is managed: no server patching, no OS
updates, no database administration, no certificate renewals, no uptime monitoring rota.

**Realistically 2–4 hours a month in steady state**, concentrated into a few sessions a
year, plus whatever new features get requested.

What that costs depends entirely on who does it:

- **A resident or fellow with the interest** — absorbed into existing time, $0 cash. This
  is the common arrangement and it is also the fragile one.
- **Departmental IT** — absorbed, if they will take it on. Worth asking early.
- **An outside contractor** — at $75–150/hr, 3 hours a month is **$225–450/month**, which
  is roughly ten times the infrastructure.

**The honest framing:** infrastructure is $300/year. A maintainer is either free and
temporary, or paid and durable. That is the actual decision in front of the department.

---

## The one architectural choice that costs money

The production application is specified as Next.js. There are two ways to serve it:

**Statically, from Cloudflare or GitHub Pages — $0.** Works because sign-in and data
access both happen in the browser against Supabase. This is what the prototype already
does. The trade is that you permanently give up server-side rendering, API routes, and
server-side redirects.

**From Vercel — $20/user/month.** Keeps every server-side option open. Note that Vercel's
free Hobby tier is licensed *"for personal, non-commercial use"*, so a departmental
application should be on Pro rather than relying on it.

**Recommendation: start static and free.** Nothing in the specification needs a server, and
moving to Vercel later is a deployment change, not a rewrite. Do not pay $240/year for
options the application has never asked for.

---

## What would change these numbers

| If this happens | Effect |
|---|---|
| PHI is added | **$7,188+/yr**, plus a BAA and a security review |
| The app needs server-side rendering | +$240/yr (Vercel Pro) |
| UMMC IT will not give a subdomain | **+$8.50/yr** (`.org` at Cloudflare Registrar) |
| The repository is made private | **$0 on Cloudflare Pages**; +$48/yr if staying on GitHub Pages |
| Longer backup retention is required | Team plan, $599/mo — likely negotiable via Enterprise |
| Usage grows 100× | No change. Two dozen users against a 100,000-user allowance. |
| Server-side code is wanted later | Still $0 — Cloudflare Pages Functions includes 100,000 requests/day, against a department that will make a few hundred |

---

## The thing to raise that they will not ask about

Ownership, not cost.

Today the repository and the hosting accounts sit on a personal account. Residents
graduate. If the department is going to depend on this, the accounts need to belong to a
departmental email with a named successor — otherwise the $25/month is fine right up until
the month nobody can log in to pay it.

That is free to fix now and expensive to fix later. It is the first item on the launch
checklist in the README, and it is worth putting in front of the department heads while
they are already thinking about what they are signing up for.

---

## Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase HIPAA compliance](https://supabase.com/docs/guides/security/hipaa-compliance)
- [Vercel pricing](https://vercel.com/pricing)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare Pages — Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) (private repositories supported)
- [Cloudflare Registrar](https://developers.cloudflare.com/registrar/) (at-cost pricing)
- [GitHub's plans](https://docs.github.com/get-started/learning-about-github/githubs-products) (Pages on private repos)
