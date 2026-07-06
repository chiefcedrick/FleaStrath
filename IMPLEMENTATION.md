# FleaStrath — Implementation Documentation

This document explains **what actually happens behind the scenes** (in the database/backend) each time a user interacts with the FleaStrath website. It is written to be used alongside the project report and during the viva/demonstration.

**2026-07-06 note:** this document was substantially rewritten after a full role-separation overhaul. Previously, Student and Vendor accounts shared one identical dashboard/sidebar with no real access restriction — that has been replaced with genuinely distinct dashboards, navigation, and database-level (RLS) role enforcement per role. See §4, §5, and §7 for what changed.

---

## 1. Architecture Overview

FleaStrath does **not** have a custom-written backend server (no Node/Express/Django/PHP process). Instead it uses **Supabase** as a Backend-as-a-Service:

```
Browser (HTML/CSS/JS pages)
        │
        │  supabase-js client library (loaded from CDN)
        ▼
Supabase Project
   ├── Auth          → handles signup/login/sessions/password reset/OTP
   ├── Storage        → hosts uploaded product images
   ├── Postgres DB   → users, products, events, announcements, orders, categories tables
   └── Row Level Security (RLS) → database-level permission rules, incl. role checks
```

Every page includes two scripts:
1. `@supabase/supabase-js` (CDN) — the client library.
2. `js/supabase.js` — creates the single shared client (`sb`) and defines helper functions reused across pages: `getSession()`, `getProfile()`, `requireAuth()`, `requireRole()`/`requireAdmin()`/`requireVendor()`/`requireStudent()`, `dashboardFor()`, `logout()`, `populateSidebar()`/`renderSidebar()`, `getCategories()`, plus card/formatting templates.

There is no separate "API" you call — each page's inline `<script>` block talks **directly** to the Supabase database using the client library, and Supabase itself enforces who is allowed to read/write which rows via RLS policies (defined across `setup.sql`, `schema-rls-hardening.sql`, `schema-categories.sql`, and `schema-storage.sql`). This is the modern equivalent of "the backend" for this project: **Postgres + Auth + Storage + RLS = the backend logic**, even though there's no traditional server-side code you wrote by hand.

`js/main.js` handles generic UI behavior (mobile hamburger drawer, toasts, tab/pill switching for the public top-navbar pages) and never touches the database. Sidebar rendering/highlighting moved into `js/supabase.js` (see §4) since it depends on the logged-in user's role.

---

## 2. Database Schema

Defined across four SQL files, all meant to be run once each in the Supabase SQL Editor, in this order: `setup.sql` → `schema-rls-hardening.sql` → `schema-categories.sql` → `schema-storage.sql` → `seed-demo-data.sql`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Profile data for every account (extends Supabase's built-in `auth.users`) | `id` (=auth user id), `email`, `full_name`, `username`, `phone`, `role` (`student`/`vendor`/`admin`), `verified`, `student_id`, `shop_name` |
| `products` | Marketplace listings | `id`, `seller_id` (FK→users), `title`, `description`, `category`, `price`, `status` (`active`/`sold`/`pending`/`inactive`), `is_negotiable`, `image_url`, `created_at` |
| `events` | Flea market events | `id`, `name`, `location`, `event_date`, `start_time`, `end_time`, `description`, `status`, `is_featured` |
| `announcements` | Admin news/notices | `id`, `title`, `body`, `tag` (`policy`/`event`/`alert`/`tips`/`success`), `author_id` (FK→users) |
| `orders` | Buyer transactions | `id`, `buyer_id` (FK→users), `product_id` (FK→products), `status` (`pending`/`completed`/`cancelled`) |
| `categories` | Canonical list of product categories (added in `schema-categories.sql`) | `id`, `name`, `slug` (unique), `icon` |

**Referential integrity:** `products.seller_id` and `orders.buyer_id`/`product_id` are foreign keys with `on delete cascade` / `on delete set null` respectively — so deleting a user cascades to their products, and deleting a product just nulls out the reference on any historical order rather than breaking it. `products.category` is deliberately **plain text, not a foreign key** to `categories` — this means deleting a category can never orphan or corrupt an existing product row (directly satisfies "deleting a category should be handled carefully"); it only removes that name from future add/edit dropdowns.

Supabase **Storage** (`schema-storage.sql`) adds one bucket, `product-images` (public read, 5MB limit, png/jpeg/webp only), with upload/update/delete restricted to each vendor's own folder (`product-images/<their-uid>/...`).

### Auto-provisioning on signup
A Postgres trigger, `handle_new_user()`, fires automatically whenever a new row is inserted into Supabase's internal `auth.users` table (i.e. the moment someone signs up). It inserts a matching row into `public.users` with just `id` and `email` filled in. This guarantees every authenticated account has a profile row **even before** the registration form's own insert runs.

---

## 3. Authentication & Registration

### Registration + Email OTP Verification (`register.html` → `verify-otp.html`)
Registration no longer logs the user in immediately — it requires email verification first:
1. **Client-side validation** runs first: passwords must match, all required fields must be filled, password must be ≥8 characters, terms checkbox must be checked, and a best-effort **duplicate-username check** (`sb.from('users').select('id').eq('username', username).maybeSingle()`) runs before signup is attempted, giving a friendly message instead of a raw Postgres unique-constraint error.
2. `sb.auth.signUp({ email, password, options: { data: {...profile fields} } })` — Supabase Auth creates the (unconfirmed) account. The profile fields (`full_name`, `username`, `phone`, `role`, `shop_name`) ride along as `user_metadata` on the auth user rather than being written to `public.users` yet, because no session exists at this point to satisfy the `users` table's RLS insert policy.
3. Supabase's mailer sends the account's institutional email a **6-digit numeric OTP** (this is Supabase's native "Confirm signup" email, configured to embed `{{ .Token }}` — see the setup checklist below). Supabase stores the code and its expiry server-side; FleaStrath never persists it in its own database.
4. The browser stores the pending email in `sessionStorage` and redirects to `verify-otp.html`. An optional `?type=vendor` or `?type=student` query param (used by the homepage's two CTA buttons — see §5) pre-selects the correct registration tab.
5. On `verify-otp.html`, submitting the 6-digit code calls `sb.auth.verifyOtp({ email, token, type: 'signup' })`. Supabase checks the code and expiry itself:
   - **Match + not expired:** returns a short-lived session for the now-confirmed user. That session is used once to `sb.from('users').upsert({...})` — writing the full profile (pulled back out of `user_metadata`) into `public.users`. If that write itself fails, the error is now **surfaced to the user** ("Your email was verified, but saving your profile failed...") rather than silently proceeding — otherwise `sb.auth.signOut()` runs and the user is redirected to `login.html`.
   - **Wrong code or expired:** `error` is returned; the page shows "Invalid or expired code. Please try again or resend." A "Resend Code" link calls `sb.auth.resend({ type: 'signup', email })`.
6. On signUp failure (e.g., duplicate email — rejected at the `auth.users` level): the error message is shown inline on `register.html`, no OTP is sent.

**Required one-time Supabase Dashboard configuration** (cannot be done from this codebase — it's project-level Auth config):
- Authentication → Providers → Email → enable **"Confirm email"**.
- Authentication → Email Templates → **Confirm signup** → edit the template body to include `{{ .Token }}`.
- Authentication → Settings → set the **OTP expiry** to `300` seconds (5 minutes).

### Login (`login.html`)
1. `sb.auth.signInWithPassword({ email, password })` authenticates against Supabase Auth.
2. On success, the app queries `sb.from('users').select('role').eq('id', user.id).single()` to find out the account's role.
3. **Redirect by role**, via the shared `dashboardFor(role)` helper: `admin` → `admin.html`; `vendor` → `vendor-dashboard.html`; `student` (or anything else) → `student-dashboard.html`. Previously vendor and student both landed on the same `marketplace.html` — this was the root cause of "every role has the same access," now fixed.
4. On failure: Supabase's own error message is shown (e.g. "Invalid login credentials" if the account doesn't exist or the password is wrong, "Email not confirmed" if OTP verification wasn't completed).
5. **Forgot Password:** `sb.auth.resetPasswordForEmail(email, {...})` sends a password-reset email via Supabase Auth.
6. The Student/Vendor/Admin **role dropdown** is cosmetic only — the actual role is always determined from the database after authentication. Selecting "Admin / Support" reveals a demo-credentials hint box (a deliberate fake placeholder — see §7).
7. If already logged in and `login.html`/`register.html` is revisited, the redirect also goes through `dashboardFor(role)` rather than a fixed page.

### Logout
`logout()` (shared helper) calls `sb.auth.signOut()`, then redirects to `login.html`. Any page that calls `requireAuth()`/`requireRole()` on load will immediately bounce back to the login page if the browser Back button is used afterward.

---

## 4. Role-Based Access Control (How Roles Are Now Enforced)

This is the section that changed most. There are two layers, and **both** now check the actual role, not just "is logged in":

### Client-side gates (`js/supabase.js`)
- `requireAuth()` — session-only check, used by pages any authenticated role may view: `marketplace.html`, `orders.html`, `settings.html`, `product.html`.
- `requireRole(expectedRole)` — the new generic gate. Fetches the profile; if there's no session, redirects to `login.html`; if the role doesn't match, redirects to **the caller's own correct dashboard** via `dashboardFor(profile.role)` — never a one-size-fits-all fallback. `requireAdmin()`, `requireVendor()`, `requireStudent()` are thin wrappers around it.
- Role-exclusive pages and their gate: `student-dashboard.html` → `requireRole('student')`; `vendor-dashboard.html` and `my-shop.html` → `requireRole('vendor')`; `admin.html` and every `admin-*.html` page → `requireRole('admin')` (via `requireAdmin()`).

### Dynamic, role-aware sidebar
Every sidebar page now renders an **empty** `<nav id="sidebarNav">` instead of a hardcoded list of links. `renderSidebar(profile)` (called from inside `populateSidebar()`, which every page already awaits) fills it in from one shared per-role array:

- **Student:** Dashboard, Products, Categories, Events, Announcements, Profile, Logout.
- **Vendor:** Dashboard, My Products, Add Product, Edit Product, Profile, Logout. ("Add Product" deep-links to `my-shop.html?action=add`, which auto-opens the Add modal on load; "Edit Product" and "My Products" both point at the same page since editing requires picking a specific item from the table first — there's no meaningful standalone "edit" page without that selection step.)
- **Admin:** Dashboard, Users, Vendors, Products, Categories, Events, Announcements, Reports, Settings, Logout.

This single shared definition is why `marketplace.html`, `orders.html`, and `settings.html` (reachable by any role) now correctly show a *different* sidebar depending on who's actually logged in, and why there's no more risk of one page's nav silently going stale (which is exactly how `marketplace.html` previously ended up with dead `href="#"` links for Analytics/Orders/Settings that were never updated when those pages were added).

### Database-side rules (Row Level Security)
`schema-rls-hardening.sql` tightens the original, more permissive policies:
- `events` / `announcements`: write access now requires `role = 'admin'` (checked via a join against `public.users`), not merely `auth.role() = 'authenticated'` as before.
- `products`: insert now requires `role in ('vendor', 'admin')`, not just "any logged-in user."
- `products`: a new admin-override delete policy lets admins remove/moderate **any** listing, in addition to the existing "sellers can delete their own" policy.

This closes what the previous version of this document called "the #1 known limitation (CWE-284, improper access control)" — role restrictions are no longer enforced only in JavaScript. If a student bypassed the UI and called the Supabase REST API directly with a valid session token, the database itself would now reject an attempt to insert a product or create an announcement.

---

## 5. Page-by-Page Backend Behaviour

### `index.html` — Public Landing Page
No login required. Loads featured products, upcoming events, and campus news in parallel (unchanged). The hero now has a prominent **Sign In / Create Free Account** button pair (or, if already logged in, a "Go to My Dashboard" button routed through `dashboardFor()`), addressing the earlier issue where the only account-related call-to-action was "Become a Vendor," implying vendor was the only role. The bottom CTA section was renamed "Ready to Get Started?" with two equal buttons — "Shop as a Student" and "Sell as a Vendor" — both linking to `register.html` with a `?type=` param that pre-selects the matching tab.

### `login.html` / `register.html` / `verify-otp.html`
Covered in §3. Both `login.html` and `register.html` now render with **no top navigation bar** at all (removed at request) — just the centered auth card.

### `student-dashboard.html` (new)
Gated `requireRole('student')`. The real Student Dashboard: four summary cards (Available Products, Upcoming Events, Announcements, Newest Listings — all live counts), a category quick-nav (from `getCategories()`), a Newest Listings grid, and Announcements/Events preview panels. Replaces the previous `home-student.html`, which was an orphaned, unlinked, mobile-only page reachable by anyone with no auth guard at all.

### `vendor-dashboard.html` (new)
Gated `requireRole('vendor')`. Stats: Total Products, Available (Active) Products, Sold Products, Upcoming Events, Announcements — all scoped to the logged-in vendor's own listings where relevant. A Recent Listings table and an Upcoming Market Events panel.

### `marketplace.html` — Product Browsing, Search, Filtering
Gated by `requireAuth()` (any role). Category pills now load from `getCategories()` instead of a hardcoded list. The "+ List an Item" button in the topbar is now **conditionally shown only to vendors** (previously visible to every role, misleadingly implying anyone could list an item). Search/filter/pagination logic is unchanged: `.eq('category', selected)`, `.ilike('title', '%searchTerm%')`, `.range()` for pagination.

### `product.html` — Product Details (new)
The single biggest functional gap this overhaul fixed: previously, clicking a product anywhere in the app only fired a decorative toast — there was **no way to actually view a product's full details**, breaking the mandated demo-flow step "View Product." Gated `requireAuth()` (any role can view). Takes `?id=`, joins the product with its seller (`full_name`, `shop_name`, `email`, `verified`), and shows: a large image (real `image_url` if the vendor uploaded one, else a category-emoji placeholder), description, price, category, availability badge, a Seller Information card, the formatted posting date, a **Contact Vendor** button (a `mailto:` link — the deliberate, documented substitute for a full in-app messaging/checkout system, which remains out of scope), and a Back button. Every product card across the site (`productGridCard`, `productStackCard`) now links here via a real "View Details" button.

### `my-shop.html` — Vendor Product Management
Gate upgraded from `requireAuth()` to `requireRole('vendor')` — previously any logged-in student could reach this page and its Add/Edit Product form. Category select now loads from `getCategories()`. Add/edit validation was expanded to match the full requirement set: **missing name, negative price, empty description, and no category are all now rejected** (previously only title/price were checked). A **"Sold"** status option was added to the dropdown (previously the only way to reach `sold` status was directly in the database — there was no UI path to "Mark as Sold" at all). A file input now supports real image upload: selecting a file uploads to `product-images/<vendor-uid>/<filename>` in Supabase Storage, then the returned public URL is saved as the product's `image_url`. Visiting `my-shop.html?action=add` auto-opens the Add modal (used by the "Add Product" sidebar link and the vendor dashboard's quick-add button).

### `orders.html` / `settings.html`
Gated by `requireAuth()` (any role — a vendor or admin can also be a buyer). Unchanged functionally from the previous version: `orders.html` shows the logged-in user's own purchase history; `settings.html` handles profile editing and (for students/vendors) completed-transaction history. Both now render the correct role-specific sidebar automatically.

### `admin.html` — Admin Dashboard
Gated `requireRole('admin')` (via `requireAdmin()`). Stat cards expanded from 4 to the full spec set: Total Users, Total Vendors, Total Products, Total Categories, Total Events, Announcements. The old "Pending Verifications" management table and "Recent Activity" feed were replaced with **Recent Registrations** (newest signups, any role) and **Recent Listings** (newest products, any seller) — genuine overview widgets, with the actual vendor-approval workflow moved to its own dedicated page (see below), matching how a real admin dashboard separates "at-a-glance" from "manage." The Broadcast modal (quick announcement creation) remains as a fast-path shortcut alongside the full `admin-announcements.html` CRUD page.

### `admin-users.html` (new)
All registered users, any role, in a searchable/filterable table.

### `admin-vendors.html` (new)
All vendor accounts (verified and pending), with **Approve**/**Reject** actions — this is where the vendor-verification workflow formerly on `admin.html` now lives permanently.

### `admin-products.html` (new)
Every product listing across every seller, with status filtering and an **admin force-delete** action (backed by the new admin-override RLS delete policy from §4) — this is the actual moderation tool the requirements describe ("Admin should manage: Products").

### `admin-categories.html` (new)
CRUD on the `categories` table. Deleting a category shows a warning with the current usage count (how many products reference that slug) but — because `products.category` is plain text with no foreign key — deleting it can never corrupt or orphan those existing product rows.

### `admin-events.html` (new)
Full CRUD (create/edit/delete) on `events` — name, location, date, start/end time, description, status, featured flag. Previously there was **no admin-facing way to create or edit an event at all**; `events.html` was read-only and public.

### `admin-announcements.html` (new)
List + create/edit/delete on `announcements`, absorbing and extending the previous create-only Broadcast modal.

### `admin-reports.html` (new)
The five reports the requirements call for: **Products by Category** (client-side grouped count + a simple CSS bar chart — no external chart library, consistent with the project's no-build-tool approach), **Registered Vendors** (table), **Active Listings** (count), **Upcoming Events** (table), **System Statistics** (the same counts as the dashboard, in a summary table).

### `events.html` / `news.html` (public)
Unchanged functionally — still public, top-navbar pages (no sidebar), read-only for everyone. A logged-in student clicking "Events" or "Announcements" from their dashboard sidebar deliberately lands on these existing public pages rather than a sidebar-wrapped duplicate — a scope-containment decision, not an oversight.

### `legal.html` (new)
A single page with Terms of Service / Privacy Policy / Help Center tabs, replacing roughly 30 dead `href="#"` footer links across the entire site. "Contact Admin"/"Contact IT Support" links now point to a real `mailto:` address.

---

## 6. Error Handling Patterns

Every data-loading function follows the same three-state pattern (unchanged, and now applied consistently to every new admin page too):
1. **Loading:** a spinner + "Loading…" message is shown while the query is in flight.
2. **Empty:** if the query succeeds but returns zero rows, a friendly message is shown instead of a blank page.
3. **Error:** if the query itself fails, a red alert box shows a friendly message rather than a raw stack trace or console error.

---

## 7. Known Limitations (read before your viva)

Most of the limitations previously listed here have now been **fixed** by this overhaul — they're kept below, marked, so your report can accurately describe what changed and why, rather than silently deleting the history:

1. ~~No image upload~~ — **Fixed.** Real upload via Supabase Storage (§2, §5 `my-shop.html`).
2. **No checkout/"Buy" flow — still out of scope, by design.** `orders.html` and `settings.html`'s transaction history both read from `orders`, but nothing inserts a row into it during normal use; the 🛒 "add to cart" icons remain decorative toasts. `product.html`'s "Contact Vendor" `mailto:` link is the deliberate substitute — a real purchase/payment flow was never part of the demo-flow requirement and would be genuinely out of scope for this project's timeline.
3. ~~Role gating is client-side only~~ — **Fixed.** `schema-rls-hardening.sql` now enforces role at the database layer for products/events/announcements (§4).
4. ~~Vendor verification is cosmetic for listing purposes~~ — **Partially addressed.** RLS now requires `role in ('vendor','admin')` to insert a product, so a student can no longer list an item at all (previously any authenticated user could). Being *unverified* (pending admin approval) still doesn't block a vendor from listing — `verified` still only gates the "Verified" badge shown to buyers on `product.html`. Whether unverified vendors should be blocked from selling entirely is a product decision, not a bug; worth one sentence in your report either way.
5. **`verify-otp.html` no longer silently swallows the post-verification profile-upsert error** — now surfaced to the user with a support-contact message.
6. **The admin-role login hint box is intentionally a placeholder, not a real credential.** See `seed-demo-data.sql` for how to make it (and the rest of your demo accounts) real, via Dashboard → Authentication → Users → "Add user" with **Auto Confirm User** ticked. Do not swap in real production admin credentials here — that would be a hardcoded-credential vulnerability (CWE-798).
7. **Navbar scope:** the top navbar (logo left, links right, hamburger→drawer on mobile) applies to `index.html`, `events.html`, `news.html`, `verify-otp.html`. `login.html`/`register.html` intentionally have no top nav. The sidebar-based dashboard pages keep their existing left-sidebar layout (now dynamically role-aware, per §4).
8. **Categories are a real table now, but `products.category` itself has no foreign key to it** — a deliberate choice (§2, §5 `admin-categories.html`) so category deletion can never corrupt existing products, at the cost of not having strict referential integrity on that one column.

None of these remaining items block the mandatory demo flow (register → verify email → login by role, landing on the correct dashboard → vendor adds a product with an image → edits it → logs out → student browses/searches/filters → views full product details and vendor info → views announcements/events → logs out → admin sees the new vendor/product → creates an announcement → creates/updates an event → views reports → logs out) — that full path is now implemented end-to-end and role-separated.

---

## 8. Database Normalization

**1NF (atomic values, no repeating groups):** every column in every table — including the new `categories` table — holds a single indivisible value. ✅ Satisfied throughout.

**2NF:** every table uses a single-column surrogate key (`id uuid`), so there's no composite key to partially depend on — satisfied automatically. ✅

**3NF:** mostly satisfied, with one deliberate, already-documented exception: `users` combines student/vendor/admin into one table via **single-table inheritance** (a `role` discriminator column plus nullable role-specific columns like `shop_name`/`student_id`), rather than the textbook-correct table-per-subtype design. This is a deliberate simplicity trade-off, not an oversight — say so directly if asked. The new `categories` table is fully normalized on its own (id, name, slug, icon — no transitive dependencies).

**Referential integrity:** unchanged from before, plus the new admin-override delete policy on `products` (§4) and the deliberate *lack* of a foreign key from `products.category` to `categories.slug` (§2) — a considered normalization trade-off in the opposite direction: strict referential integrity was sacrificed specifically to prevent category deletion from ever cascading into product data loss.

**No redundant/duplicated data:** unchanged — products still only store `seller_id` and join for seller details; categories are now also referenced by slug rather than duplicated as free-standing strings across 8+ files.

---

## 9. Security Summary

1. **Password hashing:** handled entirely by Supabase Auth (GoTrue) — unchanged.
2. **SQL injection protection:** the Supabase query builder — unchanged.
3. **Row Level Security (RLS):** now meaningfully stronger than before. Every table has RLS enabled, and as of `schema-rls-hardening.sql`, **role itself** is checked at the database layer for the write operations that matter most (creating products, events, announcements), not just "is this request authenticated."
4. **Session management:** unchanged — Supabase JWTs, `requireAuth()`/`requireRole()` gate page access.
5. **Input validation:** now more complete on the two forms that matter most — `register.html` adds a duplicate-username pre-check, and `my-shop.html`'s Add/Edit Product form now validates all four cases the requirements call for (missing name, negative price, empty description, no category), not just title/price.
6. **Storage security:** the new `product-images` bucket restricts uploads to each authenticated vendor's own folder (`(storage.foldername(name))[1] = auth.uid()::text`), enforced by `storage.objects` RLS policies, with a server-side 5MB file-size cap and an image-type allowlist (png/jpeg/webp) — not just a client-side `accept=` hint, which could otherwise be trivially bypassed.
7. **Previously the #1 flagged gap, now closed:** role-based restrictions on *which* authenticated user can do *what* are enforced by RLS, not only in JavaScript (see §4). If your report previously included the caveat "access control is enforced at the application layer" — update it; that's no longer the full picture.

---

## 10. Framework, Database Connection & API — What We Actually Used

Unchanged from the previous version of this document — still no traditional backend framework. Supabase provides the hosted Postgres database, the auto-generated REST API (**PostgREST**), the authentication service (**GoTrue**), and now also **Storage** for uploaded images, all accessed from the browser through the official `supabase-js` client library. The only backend logic authored directly by this project lives inside Postgres as SQL: the RLS policies, the `handle_new_user()` trigger, and the category-seeding script.

**One-sentence summary for your supervisor:** "We used Supabase as our backend — hosted Postgres, an auto-generated REST API (PostgREST) for all CRUD operations, a built-in authentication service (GoTrue) for signup/login/OTP, and Storage for product images, all accessed from the browser through the official `supabase-js` client library, with role-based access enforced at both the application layer and, since this overhaul, the database layer via Row Level Security; we didn't write or host any backend server code ourselves."
