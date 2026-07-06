# FleaStrath — Implementation Summary (Executive Briefing)

A condensed, conversational companion to `IMPLEMENTATION.md` (the full technical reference) and `VIVA_PREP.md` (the Q&A cheat sheet). Use this one when you just need the short version to explain to your supervisor or recap for yourself quickly.

**2026-07-06 update:** a full role-separation overhaul landed. Student and Vendor used to share one identical dashboard/sidebar with no real access restriction; they now have genuinely separate dashboards (`student-dashboard.html`, `vendor-dashboard.html`), a shared role-aware sidebar renderer instead of duplicated hardcoded nav blocks, real database-level (RLS) role enforcement (not just JavaScript checks), a working product-details page with real image upload, and a full suite of admin management pages (Users/Vendors/Products/Categories/Events/Announcements/Reports). See the new section below and the updated Security/Normalization sections.

---

## What Changed: Role Separation, For Real This Time

- **The root bug:** `login.html` used to send both Student and Vendor accounts to the same `marketplace.html`. Fixed via a single `dashboardFor(role)` helper — admin→`admin.html`, vendor→`vendor-dashboard.html`, student→`student-dashboard.html`.
- **The sidebar bug:** every page had an identical, hand-copied sidebar (which is exactly why `marketplace.html` still had dead `href="#"` links for Analytics/Orders/Settings months after those pages were built). Replaced with one shared `renderSidebar(profile)` function that builds the correct nav for whoever is actually logged in.
- **The security gap:** a student could previously reach the vendor's Add/Edit Product page just by typing the URL, and — worse — the *database itself* (via RLS) would have let them insert a product, since role was never checked there either, only in the UI. Both are now closed: a new `requireVendor()`/`requireRole()` gate gates the pages, and `schema-rls-hardening.sql` makes Postgres itself reject a non-vendor's product insert or a non-admin's event/announcement write.
- **The missing "View Product" step:** there was no product-details page at all — clicking a listing only fired a toast. Built `product.html`, with real image upload via Supabase Storage feeding into it.
- **Admin got a real toolset:** Users, Vendors (with approve/reject), Products (with force-delete moderation), Categories (now a real database table, not hardcoded strings), Events (full CRUD — previously admin couldn't create/edit an event at all), Announcements (full CRUD), and Reports (5 report types).

---

## Admin Login — The Actual Fix

The demo-admin login shown on `login.html` (`admin-flea@market.com` / `DemoPass123`) is a **display-only placeholder** — no such account exists in Supabase until you create it. Fastest reliable path (skips needing a real inbox for OTP entirely):

1. Supabase Dashboard → **Authentication → Users → Add user**, tick **Auto Confirm User**.
2. Do this for all 5 demo accounts listed in `seed-demo-data.sql` (1 admin, 2 vendors, 2 students).
3. Run, **in this order**: `schema-rls-hardening.sql` → `schema-categories.sql` → `schema-storage.sql` → `seed-demo-data.sql` (all in the Supabase SQL Editor).
4. Log in with `admin-flea@market.com` / `DemoPass123` — you'll now land on the real admin dashboard with the full nav (Users/Vendors/Products/Categories/Events/Announcements/Reports).

That covers "admin not working," "need pre-created accounts," "need vendors with items showcased," and now also gives you a working Categories table and Storage bucket for image uploads.

---

## Admin Login — The Actual Fix

The demo-admin login shown on `login.html` (`admin-flea@market.com` / `DemoPass123`) is a **display-only placeholder** — no such account exists in Supabase until you create it. Fastest reliable path (skips needing a real inbox for OTP entirely):

1. Supabase Dashboard → **Authentication → Users → Add user**, tick **Auto Confirm User**.
2. Do this for all 5 demo accounts listed in `seed-demo-data.sql` (1 admin, 2 vendors, 2 students).
3. Run `seed-demo-data.sql` in the SQL Editor — it sets roles/shop names and inserts ~8 sample products across the two vendor accounts (calculators, textbooks, a hoodie, etc., mixed active/sold/negotiable so the marketplace doesn't look empty).
4. Log in with `admin-flea@market.com` / `DemoPass123`.

That single script solves "admin not working," "need pre-created accounts," and "need vendors with items showcased" all at once.

---

## Database Normalization

Schema is in **1NF and 2NF cleanly** — atomic columns throughout, single-column surrogate (UUID) keys everywhere so there's no composite key to partially depend on.

**3NF holds** for `products`, `events`, `announcements`, and `orders` — every column in those tables describes only that entity.

**One honest exception worth naming to your supervisor:** `users` combines student/vendor/admin into one table with nullable role-specific columns (`shop_name`, `student_id`). This is **single-table inheritance** — a deliberate simplicity trade-off over the textbook-strict alternative (separate `vendors`/`students` subtype tables joined to `users`). Say that sentence directly if asked; it shows you understand the trade-off rather than not knowing it exists.

Referential integrity is real, not cosmetic: `products.seller_id → users.id` cascades on delete, `orders.product_id → products.id` nulls out on delete (preserving order history rather than destroying it).

---

## Security Summary

- **Password hashing** — handled entirely by Supabase Auth (bcrypt internally); this codebase never touches or stores a raw password.
- **No SQL injection risk** — every query goes through the Supabase query builder, never raw string concatenation; user input is always sent as a parameter.
- **Row Level Security (RLS)** enforced by Postgres itself, not just the UI — even a stolen anon key can only touch rows the policies allow.
- **JWT-based sessions** — stateless tokens, not server-side session storage.
- **Two-layer input validation** — client-side for instant UX feedback, database constraints (`not null`, `unique`, foreign keys) as the real, unbypassable backstop. Registration now also pre-checks for duplicate usernames with a friendly message.
- **Storage security** — uploaded product images are restricted per-vendor by folder-path RLS policies, plus a server-side 5MB size cap and image-type allowlist (not just a client-side hint).
- **Previously the one honest gap, now closed:** admin-only and vendor-only actions used to be gated only in JavaScript, not in RLS policies. `schema-rls-hardening.sql` fixed this — the database itself now checks `role` before allowing a product/event/announcement write, not just the frontend. If your report still says "access control is enforced at the application layer," update that line.

---

## Framework & API — What We Actually Used

**No custom backend framework** — no Express, Django, or Laravel. Supabase *is* the backend:

- **Hosted Postgres** — the actual database, plain SQL under the hood.
- **PostgREST** — auto-generates a full REST API straight from the table schema; we never hand-wrote a single endpoint. `.eq()`, `.order()`, `.range()` in the JS code compile down to query-string filters on these auto-generated routes.
- **GoTrue** — Supabase's authentication microservice; handles signup, login, OTP verification, password reset, and issues the JWTs that RLS then reads.
- **`supabase-js`** — the client library gluing both of the above into chainable JS calls in the browser (`sb.from('products').select(...)`, `sb.auth.signInWithPassword(...)`), loaded via CDN, no build step or bundler.
- **The only backend logic we personally authored** lives inside Postgres as SQL: the RLS policies and the `handle_new_user()` trigger in `setup.sql`.

**One-sentence summary for your supervisor:** *"We used Supabase as our backend — it gave us a hosted Postgres database, an auto-generated REST API (PostgREST) for all our CRUD operations, and a built-in authentication service (GoTrue) for signup/login/OTP, all accessed from the browser through the official `supabase-js` client library; we didn't write or host any backend server code ourselves."*
