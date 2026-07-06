-- ════════════════════════════════════════════════════
-- STRATHMORE MARKETPLACE — Categories Migration
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run: table uses "if not exists", policies are dropped first,
-- seed rows use "on conflict (slug) do nothing".
--
-- WHY THIS EXISTS: category names were previously hardcoded as literal
-- strings/dropdown options in marketplace.html, my-shop.html, and
-- js/supabase.js (catEmoji()) — 8+ places duplicating the same 6 values.
-- This table becomes the single source of truth; every page now queries it
-- instead. products.category stays plain TEXT (no foreign key) on purpose:
-- deleting a category here can NEVER orphan or corrupt an existing product
-- row, it only removes that name from future add/edit dropdowns.
-- ════════════════════════════════════════════════════

create table if not exists public.categories (
  id          uuid default gen_random_uuid() primary key,
  name        text unique not null,
  slug        text unique not null,
  icon        text not null default '🏷️',
  created_at  timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories" on public.categories for select using (true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories" on public.categories for all
  using       (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check  (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Seed: the 6 slugs already referenced by existing/seeded products, plus the
-- 3 named in the project's own requirements doc that weren't covered yet.
insert into public.categories (name, slug, icon) values
  ('Textbooks',   'textbooks',   '📚'),
  ('Electronics', 'electronics', '💻'),
  ('Furniture',   'furniture',   '🪑'),
  ('Accessories', 'accessories', '💼'),
  ('Clothing',    'clothing',    '👕'),
  ('Lab Gear',    'lab-gear',    '🔬'),
  ('Books',       'books',       '📖'),
  ('Shoes',       'shoes',       '👟'),
  ('Food',        'food',        '🍎')
on conflict (slug) do nothing;
