create extension if not exists vector with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'user-files',
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique(bucket_id, storage_path)
);

create table if not exists public.file_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.user_files(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  mode text not null,
  title text not null,
  note text,
  analysis text not null,
  extracted_characters integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_files enable row level security;
alter table public.file_analyses enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_files to authenticated;
grant select, insert, update, delete on public.file_analyses to authenticated;
grant select, insert, update, delete on public.knowledge_documents to authenticated;
grant select, insert, update, delete on public.knowledge_chunks to authenticated;

drop policy if exists "Users can upload own storage files" on storage.objects;
create policy "Users can upload own storage files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own storage files" on storage.objects;
create policy "Users can read own storage files"
on storage.objects for select to authenticated
using (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own storage files" on storage.objects;
create policy "Users can delete own storage files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own files" on public.user_files;
create policy "Users can read own files"
on public.user_files for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own files" on public.user_files;
create policy "Users can insert own files"
on public.user_files for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own files" on public.user_files;
create policy "Users can delete own files"
on public.user_files for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own file analyses" on public.file_analyses;
create policy "Users can read own file analyses"
on public.file_analyses for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own file analyses" on public.file_analyses;
create policy "Users can insert own file analyses"
on public.file_analyses for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own file analyses" on public.file_analyses;
create policy "Users can delete own file analyses"
on public.file_analyses for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own knowledge documents" on public.knowledge_documents;
create policy "Users can read own knowledge documents"
on public.knowledge_documents for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own knowledge documents" on public.knowledge_documents;
create policy "Users can insert own knowledge documents"
on public.knowledge_documents for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own knowledge documents" on public.knowledge_documents;
create policy "Users can delete own knowledge documents"
on public.knowledge_documents for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own knowledge chunks" on public.knowledge_chunks;
create policy "Users can read own knowledge chunks"
on public.knowledge_chunks for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own knowledge chunks" on public.knowledge_chunks;
create policy "Users can insert own knowledge chunks"
on public.knowledge_chunks for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own knowledge chunks" on public.knowledge_chunks;
create policy "Users can delete own knowledge chunks"
on public.knowledge_chunks for delete
using (auth.uid() = user_id);

create index if not exists user_files_user_created_idx
on public.user_files(user_id, created_at desc);

create index if not exists file_analyses_user_created_idx
on public.file_analyses(user_id, created_at desc);

create index if not exists knowledge_documents_user_created_idx
on public.knowledge_documents(user_id, created_at desc);

create index if not exists knowledge_chunks_document_idx
on public.knowledge_chunks(document_id, chunk_index);
