create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新的对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  title text not null,
  report_type text not null,
  content text not null,
  source text not null default 'agent',
  created_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reports enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.chat_sessions to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update, delete on public.reports to authenticated;

drop policy if exists "Users can read own chat sessions" on public.chat_sessions;
create policy "Users can read own chat sessions"
on public.chat_sessions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat sessions" on public.chat_sessions;
create policy "Users can insert own chat sessions"
on public.chat_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat sessions" on public.chat_sessions;
create policy "Users can update own chat sessions"
on public.chat_sessions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own chat messages" on public.chat_messages;
create policy "Users can read own chat messages"
on public.chat_messages for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat messages" on public.chat_messages;
create policy "Users can insert own chat messages"
on public.chat_messages for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read own reports" on public.reports;
create policy "Users can read own reports"
on public.reports for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own reports" on public.reports;
create policy "Users can insert own reports"
on public.reports for insert
with check (auth.uid() = user_id);

create index if not exists chat_sessions_user_updated_idx
on public.chat_sessions(user_id, updated_at desc);

create index if not exists chat_messages_session_created_idx
on public.chat_messages(session_id, created_at);

create index if not exists reports_user_created_idx
on public.reports(user_id, created_at desc);
