-- ════════════════════════════════════════════════════
-- STRATHMORE MARKETPLACE — Demo Data Seed Script
-- Run in: Supabase Dashboard → SQL Editor → Run
--
-- WHY THIS EXISTS: auth.users (email/password accounts) cannot be safely
-- created from plain SQL — Supabase's auth system (GoTrue) manages
-- password hashing and confirmation state internally, and its internal
-- table shape isn't guaranteed stable across Supabase versions. So the
-- accounts below must be created first through the Dashboard UI, THEN
-- this script fills in their marketplace profile + demo listings.
-- ════════════════════════════════════════════════════

-- ── STEP 1 (do this in the Dashboard, not here) ──────────────────────
-- Authentication → Users → "Add user" for EACH account below.
-- Tick "Auto Confirm User" every time — that skips the OTP email step
-- entirely, so these demo accounts work immediately without needing a
-- real inbox.
--
--   admin-flea@market.com      / DemoPass123   (promoted to admin below)
--   vendor1.demo@strathmore.edu/ DemoPass123   (Kevin's Tech Shop)
--   vendor2.demo@strathmore.edu/ DemoPass123   (Campus Books Corner)
--   student1.demo@strathmore.edu/ DemoPass123
--   student2.demo@strathmore.edu/ DemoPass123
--
-- Once all five exist and show "Confirmed" in the Users table, come
-- back here and run everything below in one go.

-- ── STEP 2: fill in profile details for each account ─────────────────
-- (the handle_new_user() trigger already created a bare id+email row
-- for each one the moment you added them in Step 1 — this just fills
-- in the rest.)

update public.users set
  full_name = 'System Administrator', username = 'admin', role = 'admin', verified = true
where email = 'admin-flea@market.com';

update public.users set
  full_name = 'Kevin Otieno', username = 'kevin.tech', phone = '+254 711 222 333',
  role = 'vendor', shop_name = 'Kevin''s Tech Shop', verified = true
where email = 'vendor1.demo@strathmore.edu';

update public.users set
  full_name = 'Amina Hassan', username = 'amina.books', phone = '+254 722 333 444',
  role = 'vendor', shop_name = 'Campus Books Corner', verified = true
where email = 'vendor2.demo@strathmore.edu';

update public.users set
  full_name = 'Brian Mwangi', username = 'brian.m', phone = '+254 733 444 555',
  role = 'student', student_id = 'SU-2024-0113'
where email = 'student1.demo@strathmore.edu';

update public.users set
  full_name = 'Grace Wanjiru', username = 'grace.w', phone = '+254 744 555 666',
  role = 'student', student_id = 'SU-2024-0287'
where email = 'student2.demo@strathmore.edu';

-- ── STEP 3: seed products for the two demo vendors ────────────────────
-- (run AFTER step 2 — these subqueries need the vendor rows to already
-- exist in public.users)

insert into public.products (seller_id, title, description, category, price, status, is_negotiable)
select id, 'Scientific Calculator (Casio FX-991)', 'Barely used, all functions working. Great for engineering/actuarial courses.', 'electronics', 1500, 'active', true
from public.users where email = 'vendor1.demo@strathmore.edu'
union all
select id, 'HP Laptop Charger (65W)', 'Original HP charger, compatible with most HP EliteBook/Pavilion models.', 'electronics', 1200, 'active', false
from public.users where email = 'vendor1.demo@strathmore.edu'
union all
select id, 'Bluetooth Headphones', 'Over-ear, noise isolating, 20hr battery. Used one semester.', 'electronics', 2500, 'sold', false
from public.users where email = 'vendor1.demo@strathmore.edu'
union all
select id, 'Desk Lamp with USB Port', 'Adjustable LED desk lamp, perfect for late-night study sessions.', 'furniture', 900, 'active', true
from public.users where email = 'vendor1.demo@strathmore.edu'

union all

select id, 'Principles of Economics (8th Ed)', 'Mankiw textbook, minimal highlighting, used for ECON 101/102.', 'textbooks', 1800, 'active', true
from public.users where email = 'vendor2.demo@strathmore.edu'
union all
select id, 'Introduction to Algorithms (CLRS)', 'Hardcover, great condition, a must-have CS reference.', 'textbooks', 3200, 'active', false
from public.users where email = 'vendor2.demo@strathmore.edu'
union all
select id, 'Financial Accounting Workbook', 'Comes with unused practice question booklet.', 'textbooks', 700, 'active', true
from public.users where email = 'vendor2.demo@strathmore.edu'
union all
select id, 'Strathmore Business School Hoodie', 'Size M, official campus store merchandise, worn twice.', 'clothing', 1300, 'sold', false
from public.users where email = 'vendor2.demo@strathmore.edu';

-- ── Verify ─────────────────────────────────────────────────────────────
select email, role, shop_name, verified from public.users
where email in (
  'admin-flea@market.com','vendor1.demo@strathmore.edu','vendor2.demo@strathmore.edu',
  'student1.demo@strathmore.edu','student2.demo@strathmore.edu'
);

select p.title, p.category, p.price, p.status, u.shop_name
from public.products p join public.users u on u.id = p.seller_id
order by u.shop_name, p.created_at;
