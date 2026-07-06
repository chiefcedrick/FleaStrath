# FleaStrath — Panel/Viva Preparation Guide

Likely questions a panelist could ask, grouped by course unit, with one-line answers in plain language. Read these as talking points, not a script — panelists probe follow-ups, so understand the *why*, not just the words.

---

## SOFTWARE ENGINEERING

**Q: What SDLC (Software Development Life Cycle) model did you follow?**
An iterative/incremental model — a written proposal + design mockups defined requirements up front, then pages were built and refined in cycles (e.g. auth was reworked from plain login to OTP verification after the first version).

**Q: Where did your requirements come from?**
Requirements elicitation via a written project proposal and 10 UI design mockups, which were translated directly into the page structure and design system (colors, fonts, layout).

**Q: What are your functional requirements?**
User registration/login, product listing (CRUD), browsing/search/filter, admin approval of vendors, announcements, and events.

**Q: What are your non-functional requirements?**
Security (RLS, hashed passwords), usability (responsive layout, friendly error states), performance (paginated queries, debounced search), maintainability (shared helper functions instead of duplicated code).

**Q: Who are your system's actors / user roles?**
Three: Student (buyer — browse/search only), Vendor (seller — manages own products only), Admin (manages users, events, announcements, and reports).

**Q: How did you ensure separation of concerns / modularity?**
`js/supabase.js` holds data-access + shared UI-render logic, `js/main.js` holds generic UI behavior (toggles, toasts), and each page's own inline script holds only that page's logic — no single file does everything.

**Q: How did you test the system?**
Manual end-to-end flow testing per role (register→verify→login→list→browse→admin-approve→logout) plus automated headless-browser checks (Playwright) for the navbar and login-page behavior, watching for console errors.

**Q: Why use version control (Git/GitHub)?**
To track every change with a message explaining *why*, roll back safely if something breaks, and keep a full history for the report/demo — this project's entire build history is visible in `git log`.

**Q: What is technical debt, and do you have any?**
Yes, and it's named on purpose: no checkout/cart flow, no image upload, and role restrictions enforced only in the frontend rather than the database — all documented in `IMPLEMENTATION.md` §7 rather than hidden, because a report should match what's actually built.

**Q: What design pattern did you use for the CRUD screens (my-shop.html)?**
A single reusable modal + form serves both "Add" and "Edit" — the same fields, switching only whether the submit calls `insert()` or `update()` — avoiding duplicate code for two near-identical screens.

**Q: What is a client-server architecture, and does your project use it?**
Yes — the browser (client) never talks to the database directly; it sends requests to Supabase's hosted API (server), which enforces rules before touching data.

---

## INTERNET APPLICATION PROGRAMMING

**Q: What is a REST API, and where is yours?**
A REST API exposes data as URLs manipulated with standard HTTP verbs; ours isn't hand-written — Supabase's **PostgREST** auto-generates one straight from the Postgres schema (e.g. `GET /rest/v1/products`).

**Q: What HTTP methods does your app use, and for what?**
GET (fetch listings/profile), POST (create account/product/announcement), PATCH (edit product, update profile, mark sold), DELETE (remove a listing).

**Q: What is JSON, and why does it matter here?**
JavaScript Object Notation — the format every Supabase response comes back as, which maps directly onto JS objects/arrays with no manual parsing needed.

**Q: How does your page load data without a full page refresh?**
`async`/`await` with the Supabase JS client, which itself wraps the browser's `fetch()` API — the request goes out in the background and the DOM is updated once the response arrives (classic AJAX pattern, just via a modern SDK instead of raw `XMLHttpRequest`).

**Q: Is this a Single Page Application (SPA)?**
No — it's a traditional **multi-page application** (separate `.html` files, real navigation between them), but each page independently uses AJAX-style calls for its own data, so it's a hybrid, not a React/Vue-style SPA with client-side routing.

**Q: How does login work without the browser storing a server session?**
Supabase issues a **JWT (JSON Web Token)** on login, stored client-side, sent as an `Authorization: Bearer <token>` header on every request — stateless auth, no server-side session table to manage.

**Q: What's the difference between a cookie/session and a token?**
A session relies on the server remembering you (a session store); a JWT is self-contained proof of identity the client holds and presents each time — Supabase uses the latter.

**Q: What is CORS, and does it apply here?**
Cross-Origin Resource Sharing — the browser page (e.g. `localhost` or your deployed domain) calls a *different* origin (`*.supabase.co`), so Supabase's API must explicitly allow that origin, which it does by default for its own client.

**Q: Why is the site responsive, and how?**
CSS Flexbox/Grid with `@media` breakpoints reflow the layout for phones/tablets/desktops from one shared stylesheet — e.g. the navbar collapses into a hamburger drawer under 768px width instead of needing a separate mobile site.

**Q: Why use HTTPS?**
Everything sent to Supabase — including the password on login — is encrypted in transit; without HTTPS, credentials would be readable by anyone intercepting the network traffic.

**Q: What's asynchronous programming, and where do you rely on it?**
Code that doesn't block the page while waiting on a network response — every single database call (`await sb.from(...)`) is asynchronous, so the UI shows a loading spinner rather than freezing while data is fetched.

**Q: How is client-side form validation different from server-side, and do you have both?**
Client-side (`required`, `minlength`, matching-password checks) gives instant feedback but can be bypassed; server-side (Postgres `not null`/`unique` constraints, RLS) is the real enforcement — we have both, deliberately.

---

## ADVANCED DATABASE

**Q: Is your database normalized? To what level?**
1NF and 2NF fully (atomic columns, single-column surrogate keys). 3NF mostly — one deliberate exception: the `users` table combines student/vendor/admin fields into one table (see next question).

**Q: What is 3NF, and where does your schema bend the rule?**
3NF means non-key columns shouldn't depend on other non-key columns. `users.shop_name` only makes sense when `role = 'vendor'` — technically a mild 3NF compromise, chosen deliberately (**single-table inheritance**) over the textbook-correct alternative (separate `vendors`/`students` subtype tables) to avoid extra joins for a small app.

**Q: What is a primary key vs a foreign key?**
Primary key uniquely identifies a row in its own table (`products.id`); a foreign key (`products.seller_id`) points to a primary key in another table, linking the two.

**Q: Why UUIDs instead of auto-incrementing integers for primary keys?**
UUIDs can be generated independently by any client without coordinating with the database first, and they don't leak information like "how many rows exist" or let someone guess the next id.

**Q: What is referential integrity, and how did you enforce it?**
Foreign keys with explicit delete behavior — `products.seller_id` is `on delete cascade` (delete a user, their listings go too), `orders.product_id` is `on delete set null` (delete a product, past order history survives with the link cleared) — so the database itself never ends up with a dangling reference.

**Q: What are the ACID properties?**
Atomicity, Consistency, Isolation, Durability — Postgres guarantees each insert/update either fully happens or doesn't happen at all, even if two users act at the same time or a request fails mid-way.

**Q: What is Row Level Security (RLS), and how is it different from normal table permissions?**
Normal `GRANT`/`REVOKE` controls access to a whole table; RLS adds a *per-row* rule evaluated on every query (e.g. "you may only update a product where `seller_id = your id`") — it's how one shared `products` table safely serves every vendor without them seeing each other's write access.

**Q: What is a JOIN, and where do you use one?**
Combining rows from two related tables via a foreign key — e.g. fetching a product *with* its seller's name (`select('*, users(full_name)')`) instead of storing the seller's name redundantly on every product row.

**Q: What is a database trigger, and do you have one?**
A function that runs automatically when an event happens on a table — `handle_new_user()` fires the instant a new row appears in Supabase's internal `auth.users`, auto-creating a matching `public.users` profile row before the app even asks for one.

**Q: How do you prevent SQL injection?**
Never build SQL by concatenating strings — every query goes through the Supabase query builder, which sends user input as a parameter, not as part of the SQL text, so injected SQL syntax is treated as inert data.

**Q: Do you have any indexes beyond primary keys?**
Only the automatic ones Postgres creates for primary keys and `unique` columns (`email`, `username`); there's no custom index (e.g. a trigram/GIN index) speeding up the `ILIKE` product-title search — fine at small scale, a known limitation at larger scale.

**Q: What is database denormalization, and did you avoid or use it?**
Deliberately storing redundant data to save a join (e.g. copying a seller's name onto every product row). We avoided it — products only store `seller_id` and always join for the name — except for the `users` single-table-inheritance trade-off already named above.

**Q: Who manages backup/recovery for your database?**
Supabase, as the managed hosting provider — automated backups are handled at the platform level, not something this codebase implements itself.

---

## Rapid-fire glossary (for anything asked standalone)

- **CRUD** — Create, Read, Update, Delete: the four basic data operations every page performs.
- **API** — a defined way for one program to ask another for data or actions, without needing to know its internals.
- **PostgREST** — the tool that auto-generates our REST API directly from the Postgres schema.
- **GoTrue** — Supabase's authentication microservice; handles signup, login, OTP, password reset.
- **JWT** — a signed token proving who you are, without the server needing to store a session.
- **RLS** — Row Level Security; per-row database access rules.
- **ORM** — Object-Relational Mapping (translates code objects to SQL automatically); **we don't use one** — we call Supabase's REST API directly instead of a library like Sequelize/Prisma.
- **Normalization** — organizing tables to minimize redundancy and avoid update anomalies.
- **Foreign key** — a column that references another table's primary key.
- **Trigger** — a stored function that fires automatically on a database event.
- **Migration** — a versioned script that changes the database schema over time (`setup.sql`/`seed-demo-data.sql` serve this role here, run manually rather than through a migration tool).
- **Idempotent** — an operation that gives the same end result no matter how many times it runs (e.g. `upsert`).
