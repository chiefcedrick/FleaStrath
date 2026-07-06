# FleaStrath — Implementation Summary (Executive Briefing)

A condensed, conversational companion to `IMPLEMENTATION.md` (the full technical reference) and `VIVA_PREP.md` (the Q&A cheat sheet). Use this one when you just need the short version to explain to your supervisor or recap for yourself quickly.

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
- **Two-layer input validation** — client-side for instant UX feedback, database constraints (`not null`, `unique`, foreign keys) as the real, unbypassable backstop.
- **One honest gap, stated plainly (not hidden):** admin-only and vendor-only actions are currently gated in JavaScript, not in RLS policies — worth one sentence in your report acknowledging this rather than claiming complete database-enforced role separation.

---

## Framework & API — What We Actually Used

**No custom backend framework** — no Express, Django, or Laravel. Supabase *is* the backend:

- **Hosted Postgres** — the actual database, plain SQL under the hood.
- **PostgREST** — auto-generates a full REST API straight from the table schema; we never hand-wrote a single endpoint. `.eq()`, `.order()`, `.range()` in the JS code compile down to query-string filters on these auto-generated routes.
- **GoTrue** — Supabase's authentication microservice; handles signup, login, OTP verification, password reset, and issues the JWTs that RLS then reads.
- **`supabase-js`** — the client library gluing both of the above into chainable JS calls in the browser (`sb.from('products').select(...)`, `sb.auth.signInWithPassword(...)`), loaded via CDN, no build step or bundler.
- **The only backend logic we personally authored** lives inside Postgres as SQL: the RLS policies and the `handle_new_user()` trigger in `setup.sql`.

**One-sentence summary for your supervisor:** *"We used Supabase as our backend — it gave us a hosted Postgres database, an auto-generated REST API (PostgREST) for all our CRUD operations, and a built-in authentication service (GoTrue) for signup/login/OTP, all accessed from the browser through the official `supabase-js` client library; we didn't write or host any backend server code ourselves."*
