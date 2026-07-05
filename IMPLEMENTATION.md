# FleaStrath — Implementation Documentation

This document explains **what actually happens behind the scenes** (in the database/backend) each time a user interacts with the FleaStrath website. It is written to be used alongside the project report and during the viva/demonstration.

---

## 1. Architecture Overview

FleaStrath does **not** have a custom-written backend server (no Node/Express/Django/PHP process). Instead it uses **Supabase** as a Backend-as-a-Service:

```
Browser (HTML/CSS/JS pages)
        │
        │  supabase-js client library (loaded from CDN)
        ▼
Supabase Project
   ├── Auth          → handles signup/login/sessions/password reset
   ├── Postgres DB   → users, products, events, announcements, orders tables
   └── Row Level Security (RLS) → database-level permission rules
```

Every page includes two scripts:
1. `@supabase/supabase-js` (CDN) — the client library.
2. `js/supabase.js` — creates the single shared client (`sb`) and defines helper functions reused across pages (`getSession()`, `getProfile()`, `requireAuth()`, `requireAdmin()`, `logout()`, `populateSidebar()`, plus card/formatting templates).

There is no separate "API" you call — each page's inline `<script>` block talks **directly** to the Supabase database using the client library, and Supabase itself enforces who is allowed to read/write which rows via RLS policies (defined in `setup.sql`). This is the modern equivalent of "the backend" for this project: **Postgres + Auth + RLS = the backend logic**, even though there's no traditional server-side code you wrote by hand.

`js/main.js` is purely cosmetic (sidebar toggle, toasts, tab/pill switching) and never touches the database.

---

## 2. Database Schema

Defined in `setup.sql`. Five tables:

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Profile data for every account (extends Supabase's built-in `auth.users`) | `id` (=auth user id), `email`, `full_name`, `username`, `phone`, `role` (`student`/`vendor`/`admin`), `verified`, `student_id`, `shop_name` |
| `products` | Marketplace listings | `id`, `seller_id` (FK→users), `title`, `description`, `category`, `price`, `status` (`active`/`sold`/`pending`/`inactive`), `is_negotiable`, `image_url`, `created_at` |
| `events` | Flea market events | `id`, `name`, `location`, `event_date`, `start_time`, `end_time`, `description`, `status`, `is_featured` |
| `announcements` | Admin news/notices | `id`, `title`, `body`, `tag` (`policy`/`event`/`alert`/`tips`/`success`), `author_id` (FK→users) |
| `orders` | Buyer transactions | `id`, `buyer_id` (FK→users), `product_id` (FK→products), `status` (`pending`/`completed`/`cancelled`) |

**Referential integrity:** `products.seller_id` and `orders.buyer_id`/`product_id` are foreign keys with `on delete cascade` / `on delete set null` respectively — so deleting a user cascades to their products, and deleting a product just nulls out the reference on any historical order rather than breaking it.

### Auto-provisioning on signup
A Postgres trigger, `handle_new_user()`, fires automatically whenever a new row is inserted into Supabase's internal `auth.users` table (i.e. the moment someone signs up). It inserts a matching row into `public.users` with just `id` and `email` filled in. This guarantees every authenticated account has a profile row **even before** the registration form's own insert runs.

---

## 3. Authentication & Registration

### Registration + Email OTP Verification (`register.html` → `verify-otp.html`)
Registration no longer logs the user in immediately — it requires email verification first:
1. **Client-side validation** runs first: passwords must match, all required fields must be filled, password must be ≥8 characters, terms checkbox must be checked.
2. `sb.auth.signUp({ email, password, options: { data: {...profile fields} } })` — Supabase Auth creates the (unconfirmed) account. The profile fields (`full_name`, `username`, `phone`, `role`, `shop_name`) ride along as `user_metadata` on the auth user rather than being written to `public.users` yet, because no session exists at this point to satisfy the `users` table's RLS insert policy.
3. Supabase's mailer sends the account's institutional email a **6-digit numeric OTP** (this is Supabase's native "Confirm signup" email, configured to embed `{{ .Token }}` — see the setup checklist below). Supabase stores the code and its expiry server-side; FleaStrath never persists it in its own database.
4. The browser stores the pending email in `sessionStorage` and redirects to `verify-otp.html`.
5. On `verify-otp.html`, submitting the 6-digit code calls `sb.auth.verifyOtp({ email, token, type: 'signup' })`. Supabase checks the code and expiry itself:
   - **Match + not expired:** returns a short-lived session for the now-confirmed user. That session is used once to `sb.from('users').upsert({...})` — writing the full profile (pulled back out of `user_metadata`) into `public.users` — then immediately `sb.auth.signOut()`, and the user is redirected to `login.html`.
   - **Wrong code or expired:** `error` is returned; the page shows "Invalid or expired code. Please try again or resend." A "Resend Code" link calls `sb.auth.resend({ type: 'signup', email })`.
6. On signUp failure (e.g., duplicate email — rejected at the `auth.users` level): the error message is shown inline on `register.html`, no OTP is sent.

**Required one-time Supabase Dashboard configuration** (cannot be done from this codebase — it's project-level Auth config):
- Authentication → Providers → Email → enable **"Confirm email"**.
- Authentication → Email Templates → **Confirm signup** → edit the template body to include `{{ .Token }}` (Supabase's default template links to a URL instead of showing a code; swapping in the token turns it into the 6-digit OTP flow this app expects).
- Authentication → Settings → set the **OTP expiry** to `300` seconds (5 minutes) — this is what actually enforces the 5-minute expiry; the frontend has no control over it.

**Note on validation gaps:** duplicate **username** is not explicitly checked client-side, though the `users.username` column has a `unique` database constraint, so a duplicate username will still fail — just via a raw Postgres error message rather than a friendly one.

### Login (`login.html`)
1. `sb.auth.signInWithPassword({ email, password })` authenticates against Supabase Auth. If "Confirm email" is enabled (per above) and the account hasn't completed OTP verification yet, Supabase itself rejects the login attempt with an "Email not confirmed" error — the app doesn't need to check this separately.
2. On success, the app queries `sb.from('users').select('role').eq('id', user.id).single()` to find out the account's role.
3. **Redirect by role:** `role === 'admin'` → `admin.html`; everyone else (`student`/`vendor`) → `marketplace.html`.
4. On failure: "Incorrect email or password" style message shown in the alert box; the login button re-enables.
5. **Forgot Password:** `sb.auth.resetPasswordForEmail(email, {...})` sends a password-reset email via Supabase Auth.
6. The Student/Vendor/Admin **role dropdown** on the login page is **cosmetic only** — it doesn't change which credentials are checked. The actual role is always determined from the database after authentication, not from the dropdown selection. Selecting "Admin / Support" additionally reveals a demo-credentials hint box at the bottom of the card (see §8, Known Limitations, for why this is a placeholder rather than a real credential).

### Logout
`logout()` (shared helper) calls `sb.auth.signOut()`, which invalidates the session/token, then redirects to `login.html`. Because the session token is gone, any page that calls `requireAuth()` on load will immediately bounce back to the login page if the browser Back button is used afterward — satisfying the "prevent Back button from reopening dashboard" requirement.

---

## 4. Role-Based Access Control (How Roles Are Enforced)

There are two layers where "who can do what" is enforced:

1. **Client-side gates** (in the JS on each page):
   - `requireAuth()` — redirects to `login.html` if there's no active session. Used on every logged-in page (`marketplace.html`, `my-shop.html`, `orders.html`, `settings.html`, `admin.html`).
   - `requireAdmin()` — additionally checks `profile.role === 'admin'` and redirects to `marketplace.html` if not. **This check exists only on `admin.html`.**

2. **Database-side rules (Row Level Security)** in `setup.sql`, which Postgres enforces no matter what the frontend does:
   - `users`: anyone can read all profiles; a user can only insert/update **their own** row.
   - `products`: anyone can read `active` listings, or their own listings regardless of status; only the seller (`auth.uid() = seller_id`) can insert/update/delete their own products.
   - `events` / `announcements`: readable by anyone; writable by **any authenticated user** (`auth.role() = 'authenticated'`), not specifically admins.
   - `orders`: a user can only see orders where they are the buyer or the seller of the referenced product; only the buyer can create an order for themselves.

**Important gap to know for the viva:** because the RLS policy for `events`/`announcements` only checks "is this user logged in," the *admin-only* restriction on creating events/announcements is currently enforced only by `requireAdmin()` in `admin.html`'s JavaScript — not by the database. A logged-in student could in theory call the same Supabase insert directly from the browser console and it would succeed. Similarly, any authenticated user (not just verified vendors) can insert into `products` from `my-shop.html`, since RLS only checks that `seller_id` matches the logged-in user, not their `role` or `verified` flag. If your report claims strict role separation is enforced at every layer, this is the one place implementation and documentation could be seen as inconsistent — worth mentioning as a "future work" item if asked.

---

## 5. Page-by-Page Backend Behaviour

### `index.html` — Public Landing Page
No login required. On page load, three independent queries run in parallel:
- Featured products: latest 4 rows from `products` where `status = 'active'`.
- Upcoming events: rows from `events` where `status` is `upcoming` or `ongoing`, soonest first, limited to 3.
- Campus news: latest 3 rows from `announcements`.

The hero search bar does not query the database itself — it just redirects to `marketplace.html?q=<term>`, where the real search happens. The 🛒 "add to cart" icon only shows a toast notification; it does not write anything to the database (see §7).

### `login.html` / `register.html`
Covered in §3.

### `marketplace.html` — Product Browsing, Search, Filtering
Gated by `requireAuth()`. On load, and every time the user types in the search box (debounced 400ms), clicks a category pill, or changes page:
- Query: `products` where `status = 'active'`, optionally `.eq('category', selected)` and/or `.ilike('title', '%searchTerm%')`, ordered newest-first, paginated with `.range()`.
- Total count is fetched alongside results (`count: 'exact'`) to drive the pagination controls.
- Empty results show "No listings found."; a database error shows "Failed to load products."

### `my-shop.html` — Vendor Product Management
Gated by `requireAuth()`. This is where CRUD on `products` happens:
- **List:** fetches only the logged-in user's own products (`.eq('seller_id', currentUserId)`), paginated.
- **Add:** validates `title` and `price` are present client-side, then `INSERT` into `products` with `seller_id` set to the current user, `status` defaulting to `active`.
- **Edit:** same form, but runs `UPDATE ... WHERE id = editId` instead of insert.
- **Delete:** asks for confirmation (`confirm()` dialog), then `DELETE FROM products WHERE id = id`.
- **Mark as Sold:** handled via the same update path by setting `status = 'sold'`.
- Because RLS restricts updates/deletes to `auth.uid() = seller_id`, a vendor physically **cannot** modify or delete another vendor's row — even if they tampered with the request, Postgres would reject it.
- A local search box on this page filters the already-loaded product list in-browser — it does not re-query the database.

### `orders.html` / `settings.html` (transactions tab)
Gated by `requireAuth()`. Shows the logged-in user's own orders (`.eq('buyer_id', currentUserId)`), joined with product info. Cancelling a pending order runs `UPDATE orders SET status = 'cancelled' WHERE id = ...`, only available for orders currently in `pending` status.

> **Known gap:** no page in the current build actually **creates** an order (there is no "Buy Now"/checkout button wired to an insert). The `orders` table, its RLS insert policy, and this history page all exist and work, but nothing currently populates the table during normal use — rows would need to be added directly in Supabase for this page to show data. If your report describes a purchase flow, flag this as a partially-implemented feature.

### `settings.html` — Profile Management
Gated by `requireAuth()`. Loads the current profile via the shared `getProfile()` helper. "Save Changes" validates that `full_name` isn't empty, then `UPDATE users SET full_name, username, phone WHERE id = currentUserId`. Email and role fields are shown but disabled — a user cannot change their own email or self-promote to admin/vendor from this screen. Dark mode toggle is purely a `localStorage` preference and never touches the database.

### `admin.html` — Admin Dashboard
The only page gated by `requireAdmin()`. On load, four count queries run in parallel to populate the stat cards: total users, total vendors (`role = 'vendor'`), total active products, total upcoming/available events. Below that:
- **Pending vendor verifications:** rows from `users` where `role = 'vendor' AND verified = false`.
- **Approve:** `UPDATE users SET verified = true WHERE id = ...`.
- **Reject:** confirms, then `UPDATE users SET role = 'student', verified = false WHERE id = ...` (demotes the applicant back to student).
- **Recent activity feed:** tries to show recent `orders`; if there are none yet (see the orders gap above), it falls back to showing recent `announcements` instead.
- **Broadcast/Announcement creation:** validates title and body are filled, then `INSERT INTO announcements (title, body, tag, author_id)`.

### `events.html` — Flea Market Events (public)
No login required. Loads all rows from `events`, sorted by date. Calendar-day clicks and category-style filtering happen entirely client-side against the already-fetched list — no extra queries fire. "Add to Calendar"/"View Details" buttons are currently decorative (no handler wired).

### `news.html` — Announcements (public)
No login required. Loads `announcements` (joined with the author's name), paginated, with an optional tag filter (`policy`/`event`/`alert`/`tips`/`success`) applied as a `.eq('tag', ...)` filter re-query.

### `home-student.html`
An alternate student-facing landing view. Loads featured products, announcements, and events similarly to `index.html`, and additionally fetches the logged-in user's first name (if a session exists) to personalize the greeting — but it has **no auth guard**, so it's reachable and fully functional for anonymous visitors too.

---

## 6. Error Handling Patterns

Every data-loading function follows the same three-state pattern:
1. **Loading:** a spinner + "Loading…" message is shown while the query is in flight.
2. **Empty:** if the query succeeds but returns zero rows, a friendly message is shown ("No products found.", "No upcoming events.", etc.) instead of a blank page.
3. **Error:** if the query itself fails (network issue, RLS rejection, etc.), a red alert box shows a friendly message rather than a raw stack trace or console error.

Form submissions (login, register, add/edit product, broadcast, cancel order, profile update) all disable their submit button and show inline alert text on failure, so the user is never left wondering whether their click registered.

---

## 7. Known Limitations (read before your viva)

These are gaps between what the schema/UI *suggests* and what is *fully wired up*. Worth knowing so your report and live demo stay consistent, or so you can quickly patch them before presenting:

1. **No image upload.** The `products.image_url` column exists but no page has a file input or calls Supabase Storage. Product cards display a category emoji instead of a photo.
2. **No checkout/"Buy" flow.** `orders.html` and the admin activity feed both read from `orders`, but no button anywhere inserts a row into it. The "add to cart" 🛒 icons on product cards only show a toast — they don't add to a real cart or create an order.
3. **Role gating is client-side only** for admin-only writes (events/announcements) and vendor-only writes (products) — the database's RLS policies are more permissive than the UI implies (see §4). This is fine for a student project but worth a one-line caveat in your report ("access control is enforced at the application layer for these actions") rather than claiming full database-level role separation everywhere.
4. **Vendor verification is cosmetic for listing purposes** — an unverified/student account can still list a product via `my-shop.html`; `verified` currently only gates the "Verified" badge shown to buyers, not the ability to sell.
5. **`verify-otp.html` doesn't surface upsert errors** — if the post-verification profile write silently fails, the user still sees "Email verified!" and is redirected to login. Low risk in practice (the DB trigger already guarantees a baseline `id`+`email` row), but worth knowing.
6. **The admin-role login hint box is intentionally a placeholder, not a real credential.** `login.html`'s dropdown reveals `demo-admin@example.com` / `DemoPass123` when "Admin / Support" is selected — this is a fake account that doesn't exist in the database, shown only so an examiner can see where admin login would be demonstrated. It is **not** wired to bypass authentication and there is no matching row in `auth.users`. Do not replace these with your real seeded admin's actual credentials — displaying genuine admin credentials in plaintext to any anonymous site visitor is a hardcoded-credential vulnerability (CWE-798). If your examiner needs to log in as admin, hand them the real credentials separately (verbally, or in a private note), not through the UI.
7. **Navbar redesign scope:** the new top navbar (logo top-left, links top-right, hamburger→drawer on mobile) was applied to the public/auth pages that previously used the mobile-style header + bottom tab bar: `index.html`, `events.html`, `news.html`, `login.html`, `register.html`, and the new `verify-otp.html`. The logged-in dashboard pages (`marketplace.html`, `my-shop.html`, `admin.html`, `orders.html`, `settings.html`) intentionally kept their existing left-sidebar + topbar layout — that's already a standard desktop pattern (not the "mobile app" look being fixed) and rewiring it risked breaking `populateSidebar()`/`requireAuth()` bindings across five pages for no visual gain. `home-student.html` was also left untouched — it's a deliberately mobile-only view (see its own file-structure entry above) that isn't linked from anywhere else in the site.

None of these block the core end-to-end demo described in your rubric (register → verify email → login → add product → browse/search/filter → view details → announcements → events → admin approve/broadcast → logout) — that full path is implemented and functional. They matter mainly for making sure your written report doesn't claim more than the app currently does (e.g., don't describe a "shopping cart and checkout system" unless you add one).
