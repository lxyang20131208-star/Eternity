-- Create storage bucket for photo memories

-- Create bucket
insert into storage.buckets (id, name, public)
values ('photo-memories', 'photo-memories', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Users can upload their own photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'photo-memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can view their own photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'photo-memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'photo-memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'photo-memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access for photos
create policy "Public can view photos"
on storage.objects for select
to public
using (bucket_id = 'photo-memories');
