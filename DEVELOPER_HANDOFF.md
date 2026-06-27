# SyDent — Developer Handoff

**Document date:** 27 June 2026
**Repo HEAD at handoff:** `3992bf6`
**Live URL:** https://sydent.app
**Status:** Functional, live, **zero real clients yet** (all data is test data). Ready for a developer to take ownership and perform pre-launch hardening.

> **Who wrote this & why:** The original owner (Dr. Ayham Ghnaim) is a dentist, not a software engineer. He built SyDent with AI assistance and is handing the entire codebase to a professional developer. This document is the orientation map: what the system is, how it runs, what state it's in, and exactly what remains to be done before onboarding the first paying client.

---

## 1. What SyDent Is

A **multi-tenant dental clinic management SaaS** for the Syrian / Arabic market. Each dentist (clinic) signs up and gets an isolated workspace. There is also a **platform admin layer** for the owner to manage all clinics (subscriptions, plans, billing).

- **UI:** Full Arabic, RTL, Cairo font, dark theme + light mode, PWA (installable).
- **Two layers:**
  - **Tenant layer** — 21 clinic-facing HTML pages, each clinic isolated by Postgres Row-Level Security (`owner_id = auth.uid()`).
  - **Platform layer** — `admin.html`, enterprise-grade SaaS management (modeled on Stripe / Microsoft Partner Center patterns).
- **Public standalone page:** `book.html` — anonymous online booking portal. **Treated as protected/standalone — never modified during fleet-wide edits.**

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | **Vanilla HTML/CSS/JS — no build tools, no framework, no bundler.** Each page is a standalone `.html` file with inline JS. |
| Shared frontend modules | `supabase-init.js`, `sidebar.js`, `theme.css` / `theme.js`, `timepicker.js` |
| Backend | **Supabase** — PostgreSQL + Row-Level Security + Auth + Storage + one Edge Function |
| Hosting / deploy | **Cloudflare Pages**, auto-deploys from GitHub `main` on every push |
| Version control | GitHub: `AyhamGhnaim/SyDent`, branch `main` |
| Email | **Resend** custom SMTP (domain `mail.sydent.app`), wired into Supabase Auth |
| Monitoring | BetterStack (uptime) + Sentry (JS errors) |
| Backups | GitHub Actions → DB dump to a private repo + patient files to Cloudflare R2 |

**Important:** The production app is the **vanilla HTML/JS** in the repo root. There is no compile step — edit the `.html`/`.js` file, push to `main`, Cloudflare Pages serves it. (See §11 for legacy artifacts that are *not* part of production.)

---

## 3. Repository Structure

```
/ (repo root)
├── *.html                  ← 22 pages (21 tenant/admin + book.html public)
├── supabase-init.js        ← shared: Supabase client init, auth gate, lock system, offline banner
├── sidebar.js              ← shared: navigation + plan-gating
├── theme.css / theme.js    ← shared: theming (dark/light)
├── timepicker.js           ← shared: custom 12h time picker
├── manifest.json, favicon.svg, robots.txt, sitemap.xml   ← PWA / SEO
├── migrations/             ← SQL migration files (see §5 — PARTIAL history, read caveat)
├── supabase/functions/admin-ops/index.ts   ← the ONLY Edge Function (privileged admin ops)
├── docs/email-templates/   ← 10 branded Arabic RTL email templates + README
├── .github/workflows/      ← backup.yml, deploy.yml, keep-alive.yml (see §4 & §11)
├── sydent/                 ← ⚠️ abandoned Next.js scaffold — NOT production (see §11)
├── server.js, package.json ← ⚠️ legacy Express "file update server" — NOT production (see §11)
└── theme-classic-backup.css, sidebar-classic-backup.js   ← pre-redesign rollback snapshots
```

### The 22 HTML pages
`index` (dashboard), `auth`, `reset-password`, `landing`, `pending`, `patients`, `patient-profile`, `appointments`, `treatments`, `inventory`, `labs`, `expenses`, `doctors`, `employees`, `payouts`, `provider-reports`, `accounting`, `audit-log`, `subscription`, `settings`, `admin` (platform), `book` (public booking).

---

## 4. How Deployment Works

1. Push a commit to `main` on GitHub.
2. **Cloudflare Pages** detects the push and auto-deploys the static files to `sydent.app`. No build, no action needed.

### Cache-busting convention
Because there is no bundler, shared assets are versioned with a query string `?v=YYYYMMDD[letter]` on `<script>`/`<link>` tags. **Current token: `20260624a`.**
When you change a shared file (`supabase-init.js`, `sidebar.js`, `theme.css/js`, `timepicker.js`), you must bump the token across **all HTML files except `book.html`**, so browsers fetch the new version. This is currently done manually — automating it is a known to-do (see §9).

### `keep-alive.yml`
Supabase free tier pauses a project after 7 days with no DB query, and free tier has no auto-backup, so a paused project is risky. This workflow pings the REST API twice a week to keep the project awake during the pre-launch dormant period. The key it uses is the **public anon key** (not a secret). Keep this running until launch.

---

## 5. Database & Migrations — READ THIS CAREFULLY

**Source of truth = the live Supabase database schema, NOT the migration files.**

The `migrations/` folder contains 60 SQL files, but it is a **partial historical record**. Throughout development, many schema changes were applied **directly in the Supabase SQL Editor** and only sometimes back-filled as files. Migration numbers have gaps (e.g., 11, 12, 17–23 have no files) and some numbers were reused. **Do not assume the files reproduce the live schema.** If you need to stand up a fresh environment, dump the live schema from Supabase rather than replaying these files.

### Confirmed migration status (verified 27 June 2026 via live query)
The three most recently questioned migrations are **all applied**:

| Migration | What it adds | Applied? |
|---|---|---|
| 70 | `clinic_settings.treatments_seeded` flag | ✅ true |
| 71 | `inventory_items.expiry_date` | ✅ true |
| 72 | `inventory_batches` table (per-shipment FEFO) | ✅ true |

There are **no pending migrations** at handoff. Going forward, the next migration file number is **73**.

### Supabase project facts
- Project ref: `rycqzpdhxabpqrdgtdzg` (region EU).
- Storage bucket `patient-files` holds patient documents/images, protected by RLS.
- One Edge Function `admin-ops` holds all privileged (service-role) operations server-side — **the service-role key must never reach the browser** (this was deliberately removed from `admin.html`).

---

## 6. Secrets & Credentials — ⚠️ ROTATE ALL BEFORE FIRST CLIENT

**No live secret values are stored in this document or committed to the repo, by design.** Below is *where* each secret lives and what it's for. **Because the previous owner is non-technical and credentials were shared with an AI tool during development, you (the new developer) should rotate every secret listed here before onboarding any real client.**

### GitHub Secrets (repo → Settings → Secrets and variables → Actions) — 7 total
| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL` | DB connection string used by the daily backup |
| `BACKUP_PAT` | Fine-grained PAT scoped to the backups repo only |
| `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` | Read patient files from Supabase Storage (S3 protocol) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` | Write patient-file backups to Cloudflare R2 |

Plus a repo **variable** `BACKUP_ENABLED` (must be `true` for backups to run).

### Other credentials (stored outside the repo, in the owner's private notes)
- **GitHub PAT** for pushing code (currently a least-privilege fine-grained token named `SyDent-dev`, repo-scoped, expires June 2027). **Generate your own and revoke this one.**
- **Supabase anon/publishable key** — public by design, lives in `supabase-init.js`. Safe to expose (RLS is the real guard). No rotation needed, but understand why it's safe.
- **Supabase service-role key** — privileged; lives only in the `admin-ops` Edge Function environment (Deno.env). Never put it in frontend code.
- **Resend API key** — used as the SMTP password in Supabase Auth → SMTP settings. Rotate and re-enter.
- **Cloudflare account** — DNS + Pages + R2 + Turnstile.

### CAPTCHA (Cloudflare Turnstile) — already live
- Site Key `0x4AAAAAADr7FjcBLQHJKhcS` is **public by design**, hardcoded in `auth.html` + `settings.html` (4 call sites: login, signup, forgot-password, account-deletion re-auth).
- The Turnstile **Secret Key** lives only in Supabase (Authentication → Attack Protection). Rotate if you regenerate the widget.

---

## 7. Backup & Restore

- **Database:** GitHub Actions `backup.yml` runs daily (2 AM), dumps the DB (roles + schema + data, including the `auth` schema so login accounts are preserved) into the private `AyhamGhnaim/SyDent-backups` repo, in a dated folder.
- **Patient files:** synced daily from Supabase Storage (`patient-files`) to Cloudflare R2 bucket `sydent-backups` via rclone (same workflow).
- **Restore:** documented separately in `SyDent_DR_Runbook.md` (in the owner's context files). **A full restore test has never been performed — do this early as the new owner** to confirm the backups are actually restorable.

---

## 8. Monitoring

- **Uptime:** BetterStack — two monitors (`sydent.app` every 5 min, `book.html` every 3 min), email + SMS alerts.
- **JS errors:** Sentry browser SDK loaded on all 22 pages (EU region, error-only). One leftover test error `SYDENT-WEB-1` should be resolved in the Sentry dashboard (cosmetic).
- **Cost control:** Supabase spend cap is enabled (no surprise bills) + automatic email alert at 20% of any limit.

---

## 9. Pre-Launch Hardening Roadmap (the "6 axes")

The owner organized remaining production-readiness work into six axes. Status at handoff:

| Axis | Status | Notes |
|---|---|---|
| 1. Disaster Recovery | ✅ Done | Daily DB + patient-file backups live. Restore test still pending. |
| 2. Monitoring | ✅ Done | BetterStack + Sentry + Supabase alerts live. |
| 3. Launch Security | 🟡 Mostly done | Secrets rotation pattern + CAPTCHA + custom email all done. **DMARC graduation and key rotation remain (see §10).** |
| 4. Code hygiene | ⏳ Not started | XSS hardening, backup PAT expiry, etc. (§10) |
| 5. Automation | ⏳ Not started | One-command cache-bust script; CI guards. (§10) |
| 6. Documentation / bus-factor | 🟡 In progress | This document is part of axis 6. |

---

## 10. Outstanding Work — Categorized

### 🔴 MANDATORY before first real client
1. **Rotate ALL secrets** (§6). They were shared with AI tooling during development. This includes the GitHub PAT, Resend API key, Supabase service-role key, and the S3/R2 backup keys.
2. **Graduate DMARC.** Email is live via Resend; DMARC is currently at `p=none` (monitoring only) on the DNS record `_dmarc.mail.sydent.app`. After confirming DMARC aggregate reports show all legitimate mail passing, tighten to `p=quarantine`, then `p=reject` (Cloudflare DNS, TXT record). This prevents your mail from being spoofed/spam-filtered.
3. **Email throughput decision.** Supabase Auth email rate limit is set to **4/hour** to match Resend's **free** tier (100/day). This is fine for a handful of clinics but will throttle concurrent signups at scale. Before onboarding many clients, upgrade Resend (Pro ≈ $20/mo = 50k emails) and raise the Supabase rate limit accordingly.
4. **Perform a backup restore test** (§7) — never been done.

### 🟡 Improvements / decisions
- **Resend region:** currently US East (EU region required a paid plan when set up). Reconsider for latency/compliance if relevant.
- **Sentry tunnel:** ad-blockers (e.g. Brave) block Sentry's CDN; proxying events through the SyDent domain would give 100% error coverage. Optional.
- **`admin.html` uses `alert()` ~151 times** — works, but converting to toast notifications is a cosmetic polish.

### 🧹 Code hygiene / cleanup
- **`sydent/backup` PAT has no expiry** — replace with a least-privilege, expiring token.
- **H2 (theoretical XSS):** patient names are interpolated into template literals in `appointments.html` (`renderList`/`renderDay`). Other render paths already escape via `escapeHtml`; these two should be audited and hardened. Theoretical risk; no known exploit.
- **Resolve the `SYDENT-WEB-1` test error** in Sentry (cosmetic).
- **Legacy files to review/remove** (see §11).

### 🤖 Automation (axis 5)
- A **single script to bump the cache-bust token** across all HTML files (currently manual across ~21 files).
- CI guards for the development invariants (JS syntax check, div balance, CDN-order, secrets scan) that were run manually during development.

### 🧪 Pending live-tests (low risk, behavior-verification only)
- Migration 70 auto-seed: new empty account → treatments page → default catalogue auto-populates at price 0.
- Offline banner: DevTools → Network → Offline → red banner appears; Online → disappears.
- "Bug #1" (Income Transfer Manager) live test: needs a real no-show + unearned-payment scenario.

---

## 11. Repo Hygiene — Legacy / Non-Production Artifacts (review, don't assume)

These exist in the repo but are **not part of the running product**. Review and likely remove:

1. **`sydent/` folder** — an abandoned Next.js scaffold (default `page.tsx`/`layout.tsx`, `CLAUDE.md`, `AGENTS.md`). Appears to be an experimental rewrite that was never adopted. Production is the vanilla HTML in the root.
2. **`server.js` + `package.json` ("sydent-server")** — a legacy Express "file update server via GitHub API." There is a Render web service tab in the owner's browser tied to this. It was an old editing mechanism; not used by the live static site. Confirm it's safe to retire.
3. **`.github/workflows/deploy.yml`** — a legacy "Deploy to GitHub Pages" workflow that overwrites `index.html` via `workflow_dispatch` with a bot identity ("DentSyr Bot" / "Update via Claude"). **The real deploy is Cloudflare Pages auto-deploy — this workflow is dead and dangerous if ever triggered** (it would clobber `index.html`). Recommend deleting after confirmation. (A similarly orphaned workflow was already removed during development.)
4. **Stray root files:** `49_subscription_events_append_only.sql`, `rls_audit_diagnostic.sql`, `rls_audit_unified.sql`, `context_delta_v78.md` — loose dev artifacts at repo root; move into a folder or remove.

---

## 12. Known Issues (the "H-bundle")

- **H1** — a missing option in a status dropdown; by-design after a deliberate revert (no fix needed).
- **H2** — theoretical XSS in patient-name template literals (see §10 cleanup).
- **H3** — patient cache can be stale after adding a new patient without reload (mitigated by a refresh flag).
- **H4** — an appointment later today is occasionally classified "upcoming" instead of "late" in one reminder classifier.

None are blocking; H2 is the only security-relevant one.

---

## 13. Key Domain Concepts (so you don't break the finances)

- **Accounting is cash-basis.** A payment "split" counts as earned revenue only if it is `is_unearned = false` AND attached to a **completed** session. There are conservation invariants and a built-in self-test (Ctrl+Shift+D on accounting surfaces).
- **The financial/accounting logic is the most sensitive part of the system.** It was audited heavily. Do not modify it without deep analysis — payment allocation (FIFO) logic is duplicated across three files (`patient-profile.html`, `appointments.html`, `settings.html`) and they must stay in sync. The atomic save path goes through the `realloc_patient_splits` RPC.
- **Security model:** per-tenant RLS (`owner_id = auth.uid()`). `book.html` is the only anonymous surface and writes only through three `SECURITY DEFINER` RPCs with abuse limits; its table is otherwise deny-all to anonymous users.

---

## 14. Development Conventions Used So Far

If you continue in the same vanilla style:
- Edit the target `.html`/`.js` file directly; push to `main`; Cloudflare Pages deploys.
- After changing a shared asset, bump the cache-bust token everywhere **except `book.html`**.
- `book.html` is never touched in fleet-wide sweeps.
- Migrations are applied in the Supabase SQL Editor; save the SQL as a numbered file in `migrations/` for the record.
- The owner kept a detailed running context file (`SyDent_Context_knew_md_*.md`) and numbered "rules" (#1–#191) capturing every hard-won lesson. **These context files are the deepest reference** — ask the owner for them; they contain the full history, all the gotchas, and the rationale behind every architectural decision. They are intentionally **not committed to git** (they contain credentials).

---

## 15. First-Week Checklist for the New Developer

1. Get access: GitHub repo, Supabase project, Cloudflare account, Resend, BetterStack, Sentry.
2. Read the owner's `SyDent_Context_knew_md_*.md` context file end-to-end.
3. **Rotate every secret** (§6) and update GitHub Secrets + Supabase + Cloudflare accordingly.
4. **Run a backup restore test** into a throwaway Supabase project (§7).
5. Dump the live DB schema as the true baseline (§5).
6. Triage §11 legacy artifacts (remove `deploy.yml`, decide on `sydent/` and `server.js`).
7. Plan DMARC graduation + email throughput (§10) ahead of first client.

---

*End of handoff. Live product, clean HEAD `3992bf6`, no pending migrations, zero real clients. The system works; what remains is professional hardening before launch.*
