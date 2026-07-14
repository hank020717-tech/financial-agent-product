-- Add first-version credit balance and AI usage ledger.
-- Run this in Supabase SQL Editor after the existing schema scripts.

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 100 check (balance >= 0),
  lifetime_granted integer not null default 100 check (lifetime_granted >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  credits_charged integer not null default 0 check (credits_charged >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0,
  status text not null default 'succeeded',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;
alter table public.ai_usage_logs enable row level security;

grant select, insert on public.user_credits to authenticated;
grant select on public.ai_usage_logs to authenticated;

drop policy if exists "Users can read own credits" on public.user_credits;
create policy "Users can read own credits"
on public.user_credits for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own credits" on public.user_credits;
create policy "Users can create own credits"
on public.user_credits for insert
with check (
  auth.uid() = user_id
  and balance = 100
  and lifetime_granted = 100
  and lifetime_spent = 0
);

drop policy if exists "Users can read own AI usage logs" on public.ai_usage_logs;
create policy "Users can read own AI usage logs"
on public.ai_usage_logs for select
using (auth.uid() = user_id);

create index if not exists ai_usage_logs_user_created_idx
on public.ai_usage_logs(user_id, created_at desc);

create index if not exists ai_usage_logs_user_feature_created_idx
on public.ai_usage_logs(user_id, feature, created_at desc);

create or replace function public.spend_user_credits(
  p_feature text,
  p_credits integer,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_total_tokens integer default 0,
  p_estimated_cost_usd numeric default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns table(balance integer, credits_charged integer, log_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_credits < 0 then
    raise exception 'INVALID_CREDITS';
  end if;

  insert into public.user_credits (
    user_id,
    balance,
    lifetime_granted,
    lifetime_spent
  )
  values (
    v_user_id,
    100,
    100,
    0
  )
  on conflict (user_id) do nothing;

  update public.user_credits
  set
    balance = user_credits.balance - p_credits,
    lifetime_spent = user_credits.lifetime_spent + p_credits,
    updated_at = now()
  where user_credits.user_id = v_user_id
    and user_credits.balance >= p_credits
  returning user_credits.balance into v_balance;

  if v_balance is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.ai_usage_logs (
    user_id,
    feature,
    credits_charged,
    input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost_usd,
    status,
    metadata
  )
  values (
    v_user_id,
    p_feature,
    p_credits,
    greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0),
    greatest(p_total_tokens, 0),
    greatest(p_estimated_cost_usd, 0),
    'succeeded',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  balance := v_balance;
  credits_charged := p_credits;
  log_id := v_log_id;
  return next;
end;
$$;

grant execute on function public.spend_user_credits(text, integer, integer, integer, integer, numeric, jsonb) to authenticated;
