-- ════════════════════════════════════════════════════
-- STRATHMORE MARKETPLACE — Storage (Product Images) Migration
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run: bucket insert uses "on conflict do nothing", policies
-- are dropped before being recreated.
--
-- WHY THIS EXISTS: the demo flow requires uploading a real product image.
-- Supabase Storage buckets and their access policies are plain Postgres
-- rows (storage.buckets / storage.objects), so they can be created here
-- via SQL exactly like any other table — no separate dashboard click needed.
--
-- IMPORTANT: the upload path convention used by my-shop.html MUST be
-- "product-images/<the vendor's auth uid>/<filename>" — the insert/update/
-- delete policies below check that the first folder segment of the
-- uploaded path matches auth.uid(). A mismatch here is the single most
-- common Storage bug (silent 403 on upload).
-- ════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images" on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Vendors can upload to own folder" on storage.objects;
create policy "Vendors can upload to own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Vendors can update own files" on storage.objects;
create policy "Vendors can update own files" on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Vendors can delete own files" on storage.objects;
create policy "Vendors can delete own files" on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
