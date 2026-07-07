-- Strengthen ownership checks for child tables.
-- Run this after supabase/schema.sql has already been applied.

drop policy if exists "Users can read own chat messages" on public.chat_messages;
create policy "Users can read own chat messages"
on public.chat_messages for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own chat messages" on public.chat_messages;
create policy "Users can insert own chat messages"
on public.chat_messages for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own chat messages" on public.chat_messages;
create policy "Users can delete own chat messages"
on public.chat_messages for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_sessions
    where chat_sessions.id = chat_messages.session_id
      and chat_sessions.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own reports" on public.reports;
create policy "Users can insert own reports"
on public.reports for insert
with check (
  auth.uid() = user_id
  and (
    session_id is null
    or exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = reports.session_id
        and chat_sessions.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can read own file analyses" on public.file_analyses;
create policy "Users can read own file analyses"
on public.file_analyses for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_files
    where user_files.id = file_analyses.file_id
      and user_files.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own file analyses" on public.file_analyses;
create policy "Users can insert own file analyses"
on public.file_analyses for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_files
    where user_files.id = file_analyses.file_id
      and user_files.user_id = auth.uid()
  )
  and (
    session_id is null
    or exists (
      select 1
      from public.chat_sessions
      where chat_sessions.id = file_analyses.session_id
        and chat_sessions.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can delete own file analyses" on public.file_analyses;
create policy "Users can delete own file analyses"
on public.file_analyses for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.user_files
    where user_files.id = file_analyses.file_id
      and user_files.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own knowledge chunks" on public.knowledge_chunks;
create policy "Users can read own knowledge chunks"
on public.knowledge_chunks for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.knowledge_documents
    where knowledge_documents.id = knowledge_chunks.document_id
      and knowledge_documents.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own knowledge chunks" on public.knowledge_chunks;
create policy "Users can insert own knowledge chunks"
on public.knowledge_chunks for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.knowledge_documents
    where knowledge_documents.id = knowledge_chunks.document_id
      and knowledge_documents.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own knowledge chunks" on public.knowledge_chunks;
create policy "Users can delete own knowledge chunks"
on public.knowledge_chunks for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.knowledge_documents
    where knowledge_documents.id = knowledge_chunks.document_id
      and knowledge_documents.user_id = auth.uid()
  )
);
