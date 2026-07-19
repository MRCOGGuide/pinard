-- ============================================================
-- PINARD — Phase 2: private "sources" storage bucket
-- Paste into the Supabase SQL editor and Run (once).
--
-- If the policy statements fail with "must be owner of table
-- objects", create the same four policies through the dashboard
-- instead: Storage → Policies → sources bucket → New policy,
-- with the USING / WITH CHECK expression:
--   bucket_id = 'sources' and public.is_admin()
-- for SELECT, INSERT, UPDATE and DELETE (authenticated role).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

create policy "sources bucket: admin select"
  on storage.objects for select to authenticated
  using (bucket_id = 'sources' and public.is_admin());

create policy "sources bucket: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sources' and public.is_admin());

create policy "sources bucket: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'sources' and public.is_admin())
  with check (bucket_id = 'sources' and public.is_admin());

create policy "sources bucket: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sources' and public.is_admin());
