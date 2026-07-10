# Luu Travels & Logistics — Shuttle Booking Website

A complete shuttle booking website for **Luu Travels & Logistics (Pty) Ltd**, connecting Gauteng and Limpopo. Built with plain HTML/CSS/JS, Supabase (auth + database), and Leaflet.js for maps.

## 1. Set up Supabase

1. Go to your Supabase project's **SQL Editor**: https://supabase.com/dashboard/project/gwzpzvwermsfnputttdo/sql
2. Paste the entire contents of `supabase/schema.sql` and run it. This creates all tables, triggers, Row Level Security policies, and seeds default time slots.

## 2. Create the admin account

Supabase requires auth users to be created through the Auth system (not by inserting directly into a table):

1. In the Supabase dashboard, go to **Authentication → Users → Add user**.
2. Create a user with:
   - Email: `princemahapa20@gmail.com`
   - Password: `Prince@2001`
   - Confirm the email automatically (toggle "Auto Confirm User").
3. Copy the new user's **UUID** from the Auth dashboard.
4. Back in the SQL Editor, run:
   ```sql
   insert into users (id, email, full_name, phone, role)
   values ('<PASTE-UUID-HERE>', 'princemahapa20@gmail.com', 'Prince Mahapa', '0000000000', 'admin')
   on conflict (id) do update set role = 'admin';
   ```
5. Log in at `pages/admin-login.html` with that email/password.

## 3. Run the feature-upgrade migrations

Two more SQL files add drivers, reviews, and ad image uploads. Run them **in this order** in the SQL Editor:

1. `supabase/fix_registration.sql` — if you haven't already run this, run it now (it makes customer registration reliable).
2. `supabase/feature_updates.sql` — adds the reviews table, driver self-registration permissions, driver trip/passenger visibility, and a storage bucket for ad images.
3. `supabase/demo_driver_and_trips.sql` — see the "Demo driver login" section below; this creates a ready-to-use demo driver and 4 sample trips.

## 3b. Demo driver login

To give you something to test with immediately:

1. In **Authentication → Users → Add user**, create:
   - Email: `demodriver@luutravels.co.za`
   - Password: `Driver@2026`
   - Toggle **Auto Confirm User**
2. Run `supabase/demo_driver_and_trips.sql` in the SQL Editor. This automatically:
   - Sets that user's role to `driver` and creates an **approved, active** driver profile (Toyota Quantum, 14 seats)
   - Adds 4 demo trips (2 each direction) so the booking page has real trips to show right away

Log in at `pages/login.html` with those credentials to see the **driver dashboard**.

Any other drivers should self-register at `pages/driver-register.html` — their account starts **pending approval**, and you approve them from **Admin → Drivers**.

## 4. Replace placeholder images

Two placeholder images were generated so the site works out of the box:
- `assets/logo.png` — replace with the real Luu Travels logo (used as the favicon and in the navbar/footer).
- `assets/hero-bg.jpg` — replace with a real hero photo (shuttle, road, or team photo).

Keep the same filenames so no code changes are needed.

## 5. Configuration

`js/config.js` already contains the Supabase URL, anon key, and pricing (R2.50/km, 14 seats max). The anon key is safe to expose in client-side code — it only allows what the Row Level Security policies permit.

## 6. Deploy

Upload the whole `luu-travels-booking/` folder to any static web host (Netlify, Vercel, GitHub Pages, cPanel, etc.) — no build step is required. Open `index.html` as the entry point.

## 7. Test checklist

- [ ] Register a new customer account (check inbox for confirmation email, since Supabase requires email confirmation by default — you can disable this in **Authentication → Providers → Email** if you want instant access).
- [ ] Log in as that customer, go to **Book a Trip**.
- [ ] As admin, add a driver (**Admin → Drivers → Add Driver**), then a trip (**Admin → Trips → Add Trip**) assigning that driver.
- [ ] As the customer, book the trip, then view it on **My Dashboard**.
- [ ] As admin, change the booking status to "Confirmed" — the customer's dashboard will then show a **Track Driver** button.
- [ ] To simulate live tracking, either have the demo driver click **Go Live** on their dashboard (uses the browser's real GPS), or update it manually:
  ```sql
  update drivers set current_location = '{"lat": -25.75, "lng": 28.19}' where id = '<driver-id>';
  ```
  The customer's tracking map refreshes every 10 seconds.
- [ ] As the customer, once a booking's trip is marked "completed" (by the driver or admin), a **Leave a Review** button appears on that booking.
- [ ] As admin, go to **Reviews** and approve a review — it will then appear as a testimonial on the public homepage.
- [ ] As admin, add an ad with an uploaded image (**Admin → Ads → Add Ad → Upload Image**) — it appears in the ads banner near the top of the homepage.
- [ ] Try the address search boxes on the booking page (type an address and click **Find**) instead of clicking the map directly.

## File structure

```
luu-travels-booking/
├── index.html
├── assets/            (logo.png, hero-bg.jpg)
├── css/               (style.css, booking.css, admin.css, dashboard.css, driver.css)
├── js/                (config.js, auth.js, main.js, booking.js, admin.js, dashboard.js, driver.js, map.js)
├── pages/             (login, register, driver-register, dashboard, driver-dashboard, booking,
│                       admin-login, admin-dashboard, forgot/reset password)
└── supabase/          (schema.sql, fix_registration.sql, feature_updates.sql, demo_driver_and_trips.sql)
```

## Notes

- Card payments are wired up as a disabled option in the booking UI — enable it once a payment gateway (e.g. PayFast, Yoco, or Stripe) is integrated. Search `Card payments are coming soon` in `js/booking.js` for the placeholder.
- Booking reference numbers follow the format `LUU-YYMMDD-XXXX`, generated automatically by a database trigger.
- Row Level Security is enabled on every table — customers only see their own bookings/profile, drivers only see their own assigned trips/passengers, and admins (role = 'admin' in the `users` table) can see and manage everything.
- **Customers never see the R2.50/km rate** — the booking page only ever shows a calculated distance and total price, never the underlying rate. Admins still enter distance when creating a trip and the price auto-calculates for their reference.
- **Drivers** register themselves at `pages/driver-register.html` (pending admin approval), or use the demo account described above. Once approved and assigned to a trip, they can see passenger names, phone numbers, seat counts, and payment method/status on `pages/driver-dashboard.html`, mark cash payments as collected, update trip status (Start Trip / Mark Completed), and share their live GPS location with one tap ("Go Live") so customers can track them — no manual database updates needed.
- **Reviews**: customers can rate/comment on any completed trip from their dashboard. Reviews start unpublished; admins approve them under **Admin → Reviews**, after which they appear as testimonials on the homepage.
- **Ad images**: admins can either upload an image file directly (stored in the `ads-images` Supabase Storage bucket) or paste an external image URL.
