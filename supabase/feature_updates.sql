-- =====================================================================
-- LUU TRAVELS & LOGISTICS - FEATURE UPGRADE MIGRATION
-- Run this in the Supabase SQL Editor AFTER schema.sql and fix_registration.sql
-- =====================================================================

-- =====================================================================
-- 1. Make the new-user trigger role-aware (customer vs driver)
--    Drivers self-register through driver-register.html with role='driver'
--    in their signup metadata. Admins are never created this way.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
    requested_role text;
begin
    requested_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
    if requested_role not in ('customer', 'driver') then
        requested_role := 'customer';
    end if;

    insert into public.users (id, email, full_name, phone, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
        coalesce(new.raw_user_meta_data->>'phone', ''),
        requested_role
    )
    on conflict (id) do nothing;
    return new;
end;
$$ language plpgsql security definer set search_path = public;

-- =====================================================================
-- 2. Let drivers register + manage their own driver profile
-- =====================================================================
drop policy if exists "Drivers can insert own record" on drivers;
create policy "Drivers can insert own record" on drivers
    for insert with check (auth.uid() = user_id);

drop policy if exists "Drivers can view own driver record" on drivers;
create policy "Drivers can view own driver record" on drivers
    for select using (auth.uid() = user_id);

drop policy if exists "Drivers can update own record" on drivers;
create policy "Drivers can update own record" on drivers
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Note: this lets a driver update their own vehicle details/location. It does
-- not stop a driver from flipping is_approved themselves at the DB level;
-- the UI never exposes that control to drivers, only to admins.

-- =====================================================================
-- 3. Let drivers see and manage trips assigned to them
-- =====================================================================
drop policy if exists "Drivers can update own trips" on trips;
create policy "Drivers can update own trips" on trips
    for update using (
        exists (select 1 from drivers d where d.id = trips.driver_id and d.user_id = auth.uid())
    ) with check (
        exists (select 1 from drivers d where d.id = trips.driver_id and d.user_id = auth.uid())
    );

-- =====================================================================
-- 4. Let drivers see + update bookings/passengers for their own trips
--    (needed so a driver can see who they're picking up, how many
--    passengers, and mark cash payments as collected)
-- =====================================================================
drop policy if exists "Drivers can view bookings for own trips" on bookings;
create policy "Drivers can view bookings for own trips" on bookings
    for select using (
        exists (
            select 1 from trips t
            join drivers d on d.id = t.driver_id
            where t.id = bookings.trip_id and d.user_id = auth.uid()
        )
    );

drop policy if exists "Drivers can update bookings for own trips" on bookings;
create policy "Drivers can update bookings for own trips" on bookings
    for update using (
        exists (
            select 1 from trips t
            join drivers d on d.id = t.driver_id
            where t.id = bookings.trip_id and d.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 5. Let drivers see the contact details of passengers on their own trips
-- =====================================================================
drop policy if exists "Drivers can view customers on own trips" on users;
create policy "Drivers can view customers on own trips" on users
    for select using (
        exists (
            select 1 from bookings b
            join trips t on t.id = b.trip_id
            join drivers d on d.id = t.driver_id
            where b.user_id = users.id and d.user_id = auth.uid()
        )
    );

-- =====================================================================
-- 6. REVIEWS
-- =====================================================================
create table if not exists reviews (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references users(id) on delete cascade,
    booking_id uuid references bookings(id) on delete set null,
    driver_id uuid references drivers(id) on delete set null,
    rating integer not null check (rating between 1 and 5),
    comment text,
    is_approved boolean default false,
    created_at timestamp with time zone default now()
);

alter table reviews enable row level security;

drop policy if exists "Anyone can view approved reviews" on reviews;
create policy "Anyone can view approved reviews" on reviews
    for select using (is_approved = true or auth.uid() = user_id or is_admin());

drop policy if exists "Users can insert own review" on reviews;
create policy "Users can insert own review" on reviews
    for insert with check (auth.uid() = user_id);

drop policy if exists "Admins update reviews" on reviews;
create policy "Admins update reviews" on reviews
    for update using (is_admin());

drop policy if exists "Admins delete reviews" on reviews;
create policy "Admins delete reviews" on reviews
    for delete using (is_admin());

drop policy if exists "Users delete own pending review" on reviews;
create policy "Users delete own pending review" on reviews
    for delete using (auth.uid() = user_id and is_approved = false);

create index if not exists idx_reviews_approved on reviews(is_approved);

-- =====================================================================
-- 7. STORAGE BUCKET for ad images (lets admin upload pictures for ads)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('ads-images', 'ads-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read ad images" on storage.objects;
create policy "Public read ad images" on storage.objects
    for select using (bucket_id = 'ads-images');

drop policy if exists "Admins upload ad images" on storage.objects;
create policy "Admins upload ad images" on storage.objects
    for insert with check (bucket_id = 'ads-images' and is_admin());

drop policy if exists "Admins update ad images" on storage.objects;
create policy "Admins update ad images" on storage.objects
    for update using (bucket_id = 'ads-images' and is_admin());

drop policy if exists "Admins delete ad images" on storage.objects;
create policy "Admins delete ad images" on storage.objects
    for delete using (bucket_id = 'ads-images' and is_admin());

-- =====================================================================
-- 8. Trips: allow admins to update trip status too (already covered by
--    the existing "Admins update trips" policy in schema.sql - no change
--    needed, listed here for reference only).
-- =====================================================================
