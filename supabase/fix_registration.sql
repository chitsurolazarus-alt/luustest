-- =====================================================================
-- FIX: Auto-create profile row when a new auth user signs up
-- Run this in the Supabase SQL Editor
-- =====================================================================

-- 1. Function that copies the new auth user into public.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.users (id, email, full_name, phone, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
        coalesce(new.raw_user_meta_data->>'phone', ''),
        'customer'
    )
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. Trigger: fires every time a row is inserted into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3. Backfill: create profile rows for any existing auth users who are
--    missing one (e.g. accounts that hit the RLS error before this fix)
insert into public.users (id, email, full_name, phone, role)
select
    au.id,
    au.email,
    coalesce(au.raw_user_meta_data->>'full_name', 'New User'),
    coalesce(au.raw_user_meta_data->>'phone', ''),
    'customer'
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;
