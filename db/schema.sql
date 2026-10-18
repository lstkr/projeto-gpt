-- Projeto GPT: per-user inventory state.
-- Run this in the Supabase SQL Editor before configuring the application.
create table if not exists public.inventory_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{"products":[],"movements":[],"documents":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.inventory_state enable row level security;

drop policy if exists "Users can read their own inventory" on public.inventory_state;
create policy "Users can read their own inventory"
  on public.inventory_state for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own inventory" on public.inventory_state;
create policy "Users can create their own inventory"
  on public.inventory_state for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own inventory" on public.inventory_state;
create policy "Users can update their own inventory"
  on public.inventory_state for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.inventory_state to authenticated;
