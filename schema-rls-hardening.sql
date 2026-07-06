-- ════════════════════════════════════════════════════
-- STRATHMORE MARKETPLACE — RLS Hardening Migration
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run: every statement drops-then-recreates its policy.
--
-- WHY THIS EXISTS: the original setup.sql granted "any authenticated user"
-- write access to events/announcements (admin-only in the UI, but not in
-- the database), and let any authenticated user insert a product for
-- themselves regardless of role — so a student account could technically
-- create a listing via the REST API even though my-shop.html is now
-- vendor-gated in the UI. This migration makes the ROLE checks real at the
-- database layer, so requireRole()/requireVendor() in the frontend are
-- backed by the database, not just trusted client-side.
-- ════════════════════════════════════════════════════

-- Events: only admins may insert/update/delete; everyone can still read
-- (the existing "Public can read events" select policy is untouched).
drop policy if exists "Auth can manage events" on public.events;
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events" on public.events for all
  using       (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check  (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Announcements: only admins may insert/update/delete; everyone can still read.
drop policy if exists "Auth can manage announcements" on public.announcements;
drop policy if exists "Admins can manage announcements" on public.announcements;
create policy "Admins can manage announcements" on public.announcements for all
  using       (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check  (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Products: only vendors/admins may create a listing for themselves
-- (students can still browse/read via the existing select policy).
drop policy if exists "Auth can insert products" on public.products;
drop policy if exists "Vendors and admins can insert products" on public.products;
create policy "Vendors and admins can insert products" on public.products for insert
  with check (
    auth.uid() = seller_id
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('vendor','admin'))
  );

-- Products: admins may delete/force-delist ANY listing (moderation), on top
-- of the existing "Sellers can delete own products" policy — RLS OR's every
-- permissive policy together, so sellers keep deleting their own listings
-- and admins additionally gain override power over anyone's.
drop policy if exists "Admins can delete any product" on public.products;
create policy "Admins can delete any product" on public.products for delete
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
