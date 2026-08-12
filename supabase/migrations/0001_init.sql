-- Initial schema: shared quote cache + per-user watchlists.
--
-- This project was created with "automatically expose new tables" OFF, so
-- every table needs an explicit GRANT in addition to its RLS policy.
-- Privileges and policies are two independent gates: a policy alone yields
-- "permission denied for table", a grant alone yields zero rows.

-- ---------------------------------------------------------------------------
-- quote_series: shared cache of daily closes, one row per ticker.
--
-- Replaces the module-level Map in lib/quotes.ts, which doesn't survive
-- serverless instance recycling and so burns the Twelve Data free-tier
-- budget (800/day, 8/min) on cold starts.
-- ---------------------------------------------------------------------------
create table if not exists public.quote_series (
  ticker      text primary key,
  name        text not null,
  exchange    text not null default '',
  currency    text not null default 'USD',
  points      jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.quote_series enable row level security;

-- Readable by anyone; writes are service-role only.
-- Deliberately no insert/update grant to anon: a browser must never be able
-- to poison the price cache.
grant select on public.quote_series to anon, authenticated;

-- service_role bypasses RLS but NOT table privileges, and gets no default
-- grant while "automatically expose new tables" is off. Without this, cache
-- writes fail with 42501 "permission denied for table".
grant select, insert, update, delete on public.quote_series to service_role;

drop policy if exists "quote_series readable by all" on public.quote_series;
create policy "quote_series readable by all"
  on public.quote_series for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- watchlist: per-user, replacing the localStorage list in lib/watchlist.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id   uuid not null references auth.users on delete cascade,
  ticker    text not null,
  added_at  timestamptz not null default now(),
  primary key (user_id, ticker)
);

alter table public.watchlist enable row level security;

-- Nothing granted to anon: signed-out users stay on localStorage.
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, update, delete on public.watchlist to service_role;

drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist"
  on public.watchlist for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
