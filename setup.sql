-- ════════════════════════════════════════════════════
-- STRATHMORE MARKETPLACE — Supabase Database Setup
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ════════════════════════════════════════════════════

-- 1. Users (extends Supabase auth.users)
create table if not exists public.users (
  id          uuid references auth.users on delete cascade primary key,
  email       text unique not null,
  full_name   text,
  username    text unique,
  phone       text,
  role        text not null default 'student', -- 'student' | 'vendor' | 'admin'
  verified    boolean not null default false,
  student_id  text,
  shop_name   text,
  created_at  timestamptz not null default now()
);

-- 2. Products
create table if not exists public.products (
  id            uuid default gen_random_uuid() primary key,
  seller_id     uuid references public.users(id) on delete cascade not null,
  title         text not null,
  description   text,
  category      text,   -- textbooks | electronics | furniture | accessories | clothing | lab-gear
  price         numeric(12,2) not null,
  status        text not null default 'active', -- active | sold | pending | inactive
  is_negotiable boolean not null default false,
  image_url     text,
  created_at    timestamptz not null default now()
);

-- 3. Events
create table if not exists public.events (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  location    text,
  event_date  date,
  start_time  text,
  end_time    text,
  description text,
  status      text not null default 'upcoming', -- upcoming | available | coming-soon | ongoing
  is_featured boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 4. Announcements
create table if not exists public.announcements (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  body        text,
  tag         text not null default 'event', -- policy | event | alert | tips | success
  author_id   uuid references public.users(id),
  created_at  timestamptz not null default now()
);

-- 5. Orders
create table if not exists public.orders (
  id          uuid default gen_random_uuid() primary key,
  buyer_id    uuid references public.users(id),
  product_id  uuid references public.products(id) on delete set null,
  status      text not null default 'pending', -- pending | completed | cancelled
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════

alter table public.users         enable row level security;
alter table public.products      enable row level security;
alter table public.events        enable row level security;
alter table public.announcements enable row level security;
alter table public.orders        enable row level security;

-- Users: anyone can read; only own row writeable
create policy "Public can read users"        on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);

-- Products: anyone can read active; authenticated can insert; sellers can update/delete own
create policy "Public can read active products" on public.products for select using (status = 'active' or auth.uid() = seller_id);
create policy "Auth can insert products"        on public.products for insert with check (auth.uid() = seller_id);
create policy "Sellers can update own products" on public.products for update using (auth.uid() = seller_id);
create policy "Sellers can delete own products" on public.products for delete using (auth.uid() = seller_id);

-- Events: public read; admin write (set role check in app layer)
create policy "Public can read events"  on public.events for select using (true);
create policy "Auth can manage events"  on public.events for all using (auth.role() = 'authenticated');

-- Announcements: public read; admin write
create policy "Public can read announcements" on public.announcements for select using (true);
create policy "Auth can manage announcements" on public.announcements for all using (auth.role() = 'authenticated');

-- Orders: buyers and sellers can see their own
create policy "Users can see own orders" on public.orders for select
  using (auth.uid() = buyer_id or auth.uid() = (select seller_id from public.products where id = product_id));
create policy "Buyers can create orders" on public.orders for insert with check (auth.uid() = buyer_id);

-- ════════════════════════════════════════════════════
-- AUTO-CREATE USER PROFILE ON SIGN-UP
-- ════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ════════════════════════════════════════════════════
-- SAMPLE DATA (optional — delete if you want a clean start)
-- ════════════════════════════════════════════════════

insert into public.events (name, location, event_date, start_time, end_time, description, status, is_featured) values
  ('Mega Student Bazaar 2024',  'Main Auditorium Plaza',  '2024-11-10', '09:00', '17:00', 'Our biggest event of the semester featuring over 40 student vendors.', 'upcoming', true),
  ('Textbook Exchange Week',    'Library Commons',        '2024-11-04', '08:00', '18:00', 'Swap or sell your semester textbooks. All subjects welcome.', 'ongoing', false),
  ('Tech & Gadgets Pop-up',     'Innovation Centre Hub',  '2024-11-15', '10:00', '17:00', 'Electronics, gadgets, and accessories at student prices.', 'upcoming', false),
  ('Mid-Semester Harvest Market','Campus Main Plaza',     '2024-11-22', '09:00', '16:00', 'Handmade goods, food, and lifestyle products from student entrepreneurs.', 'upcoming', false);

insert into public.announcements (title, body, tag) values
  ('Vendor Verification Update',  'New vendors must verify their accounts with a valid SU ID to receive a Verified badge on their listings.',                                  'policy'),
  ('M-Pesa Payments Now Live',    'Integrated M-Pesa payments are now available for all in-app marketplace transactions. Enjoy seamless checkout.',                            'event'),
  ('Safety First',                'Always meet buyers and sellers at designated campus trade zones. Report suspicious listings to admin immediately.',                          'tips'),
  ('Holiday Bazaar Applications', 'Applications for the December Grand Gala Market are now open. Exclusive spots for Strathmore students only. Apply before November 15th.', 'event'),
  ('Record Sales in October',     'Last month saw the highest volume of transactions since the marketplace launched. Thank you to all student entrepreneurs!',                  'success');
