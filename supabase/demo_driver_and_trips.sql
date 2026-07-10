-- =====================================================================
-- LUU TRAVELS & LOGISTICS - DEMO DRIVER + DEMO TRIPS
-- Run this AFTER creating the demo driver's login (see step 1 below)
-- =====================================================================

-- STEP 1 (do this in the Supabase Dashboard, not SQL):
-- Go to Authentication > Users > Add User
--   Email:    demodriver@luutravels.co.za
--   Password: Driver@2026
--   Toggle "Auto Confirm User"
-- These are the login details for the demo driver dashboard.

-- STEP 2: run the block below. It automatically finds the demo driver's
-- auth UUID by email, creates their profile + driver record (already
-- approved and active), and adds 4 demo trips so the booking page has
-- something to show immediately.

do $$
declare
    demo_uid uuid;
    demo_driver_id uuid;
begin
    select id into demo_uid from auth.users where email = 'demodriver@luutravels.co.za' limit 1;

    if demo_uid is null then
        raise notice 'No auth user found for demodriver@luutravels.co.za yet — create it in Authentication > Users first, then re-run this script.';
        return;
    end if;

    insert into public.users (id, email, full_name, phone, role)
    values (demo_uid, 'demodriver@luutravels.co.za', 'Demo Driver', '0821234567', 'driver')
    on conflict (id) do update set role = 'driver';

    insert into public.drivers (
        user_id, full_name, email, phone, license_number, prdp_number,
        vehicle_registration, vehicle_model, vehicle_color, vehicle_capacity,
        is_approved, is_active
    )
    values (
        demo_uid, 'Demo Driver', 'demodriver@luutravels.co.za', '0821234567',
        'DL1234567', 'PRDP998877', 'GP 123-456', 'Toyota Quantum', 'White',
        14, true, true
    )
    on conflict (email) do update set user_id = demo_uid, is_approved = true, is_active = true
    returning id into demo_driver_id;

    if demo_driver_id is null then
        select id into demo_driver_id from public.drivers where email = 'demodriver@luutravels.co.za' limit 1;
    end if;

    insert into public.trips (
        driver_id, route, pickup_location, dropoff_location,
        distance, price_per_km, total_price, departure_time,
        available_seats, status
    )
    values
        (demo_driver_id, 'Gauteng-Limpopo', 'Boksburg, Gauteng', 'Polokwane, Limpopo', 320, 2.50, 800.00, now() + interval '1 day 6 hours', 14, 'scheduled'),
        (demo_driver_id, 'Gauteng-Limpopo', 'Boksburg, Gauteng', 'Polokwane, Limpopo', 320, 2.50, 800.00, now() + interval '2 days 10 hours', 14, 'scheduled'),
        (demo_driver_id, 'Limpopo-Gauteng', 'Polokwane, Limpopo', 'Boksburg, Gauteng', 320, 2.50, 800.00, now() + interval '1 day 14 hours', 14, 'scheduled'),
        (demo_driver_id, 'Limpopo-Gauteng', 'Polokwane, Limpopo', 'Boksburg, Gauteng', 320, 2.50, 800.00, now() + interval '3 days 18 hours', 14, 'scheduled');

    raise notice 'Demo driver + 4 demo trips created successfully.';
end $$;
