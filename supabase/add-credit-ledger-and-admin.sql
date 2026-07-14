-- Add the user-facing credit ledger and secure manual recharge flow.
-- Run this after supabase/add-credits-and-usage.sql.

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('grant', 'spend', 'refund', 'adjustment')),
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  feature text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;
alter table public.admin_users enable row level security;

grant select on public.credit_transactions to authenticated;

drop policy if exists "Users can create own credits" on public.user_credits;
create policy "Users can create own credits"
on public.user_credits for insert
with check (
  auth.uid() = user_id
  and balance = 100
  and lifetime_granted = 100
  and lifetime_spent = 0
);

drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
create policy "Users can read own credit transactions"
on public.credit_transactions for select
using (auth.uid() = user_id);

create index if not exists credit_transactions_user_created_idx
on public.credit_transactions(user_id, created_at desc);

create or replace function public.record_initial_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_transactions (
    user_id,
    kind,
    delta,
    balance_after,
    note,
    metadata
  )
  values (
    new.user_id,
    'grant',
    new.lifetime_granted,
    new.balance,
    '新用户赠送点数',
    jsonb_build_object('source', 'initial-credit-account')
  );

  return new;
end;
$$;

drop trigger if exists user_credits_initial_transaction on public.user_credits;
create trigger user_credits_initial_transaction
after insert on public.user_credits
for each row execute function public.record_initial_credit_transaction();

insert into public.credit_transactions (
  user_id,
  kind,
  delta,
  balance_after,
  note,
  metadata
)
select
  credits.user_id,
  'grant',
  greatest(credits.lifetime_granted, 1),
  credits.balance,
  '历史账户初始点数',
  jsonb_build_object('source', 'credit-ledger-migration')
from public.user_credits as credits
where not exists (
  select 1
  from public.credit_transactions as transactions
  where transactions.user_id = credits.user_id
);

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

  if p_credits > 0 then
    insert into public.credit_transactions (
      user_id,
      kind,
      delta,
      balance_after,
      feature,
      note,
      metadata
    )
    values (
      v_user_id,
      'spend',
      -p_credits,
      v_balance,
      p_feature,
      '功能使用',
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  balance := v_balance;
  credits_charged := p_credits;
  log_id := v_log_id;
  return next;
end;
$$;

create or replace function public.admin_grant_user_credits(
  p_user_id uuid,
  p_credits integer,
  p_note text default '管理员充值'
)
returns table(balance integer, credits_granted integer, transaction_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_balance integer;
  v_transaction_id uuid;
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1 from public.admin_users where user_id = v_admin_id
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_user_id is null or p_credits <= 0 or p_credits > 1000000 then
    raise exception 'INVALID_GRANT';
  end if;

  insert into public.user_credits (
    user_id,
    balance,
    lifetime_granted,
    lifetime_spent
  )
  values (
    p_user_id,
    100,
    100,
    0
  )
  on conflict (user_id) do nothing;

  update public.user_credits
  set
    balance = user_credits.balance + p_credits,
    lifetime_granted = user_credits.lifetime_granted + p_credits,
    updated_at = now()
  where user_credits.user_id = p_user_id
  returning user_credits.balance into v_balance;

  if v_balance is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.credit_transactions (
    user_id,
    kind,
    delta,
    balance_after,
    note,
    metadata
  )
  values (
    p_user_id,
    'grant',
    p_credits,
    v_balance,
    nullif(trim(p_note), ''),
    jsonb_build_object('admin_user_id', v_admin_id)
  )
  returning id into v_transaction_id;

  balance := v_balance;
  credits_granted := p_credits;
  transaction_id := v_transaction_id;
  return next;
end;
$$;

grant execute on function public.spend_user_credits(text, integer, integer, integer, integer, numeric, jsonb) to authenticated;
grant execute on function public.admin_grant_user_credits(uuid, integer, text) to authenticated;
