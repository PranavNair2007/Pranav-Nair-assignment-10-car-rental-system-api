# 🚗 Car Rental & Fleet Booking System API

A production-ready REST API for a car rental fleet — vehicle inventory, date-range booking with collision prevention, and automatic cost calculation — built with **Node.js, Express, and Supabase (PostgreSQL + Auth)**.

## Tech Stack

- Node.js + Express.js
- Supabase (hosted PostgreSQL) for data, Supabase Auth for user accounts/tokens
- `@supabase/supabase-js` client SDK

## Setup

1. **Create a Supabase project**
   - Go to [supabase.com](https://supabase.com), create a free project.
   - In **Project Settings → API**, copy your Project URL, `anon` public key, and `service_role` key.

2. **Run the database migration**
   - Open your project's **SQL Editor** in the Supabase dashboard.
   - Paste and run the contents of [`supabase/schema.sql`](./supabase/schema.sql) — this creates the `vehicles` and `rentals` tables with their constraints.

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Environment variables**
   ```bash
   cp .env.example .env
   ```
   Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

5. **Run**
   ```bash
   npm run dev     # nodemon
   # or
   npm start
   ```

## How Auth Works Here

Registration and login go through **Supabase Auth** (`supabase.auth.signUp` / `signInWithPassword`), not custom JWT signing — Supabase issues and verifies the tokens for you. `POST /api/auth/login` returns an `accessToken`; send it as `Authorization: Bearer <accessToken>` on protected routes. The `authenticate` middleware calls `supabase.auth.getUser(token)` to verify it and attaches the resulting user to `req.user`.

> Note: depending on your Supabase project's Auth settings, new sign-ups may require email confirmation before they can log in. If `register` returns `session: null`, check your project's **Authentication → Providers → Email** settings, or disable "Confirm email" for local testing.

## Two Supabase Clients

- `supabase` (anon key) — used for auth calls, so Supabase's own auth flow handles tokens correctly.
- `supabaseAdmin` (service role key) — used for all vehicle/rental database reads & writes server-side. This bypasses Row Level Security, which is appropriate here since the API itself enforces authorization (the `authenticate` middleware) before these calls are made. **Never expose the service role key to a frontend/browser.**

## Endpoints

**Auth**
- `POST /api/auth/register` — `{ email, password, name }`
- `POST /api/auth/login` — `{ email, password }`, returns `accessToken`

**Vehicles**
- `GET /api/vehicles?category=&status=` — public
- `GET /api/vehicles/:id` — public, includes `rentalHistory`
- `POST /api/vehicles` — authenticated, add a vehicle to the fleet
- `PUT /api/vehicles/:id` — authenticated, update rate/status/other fields
- `DELETE /api/vehicles/:id` — authenticated, blocked with `400` if the vehicle has any `booked`/`active` rentals

**Rentals**
- `POST /api/rentals` — authenticated. `{ vehicle_id, start_date, end_date, customer_name, customer_email }`. Rejects with `400` on date collisions or if the vehicle is under maintenance; computes `total_cost = days * daily_rate` and sets the vehicle to `rented`.
- `GET /api/rentals/my-bookings` — authenticated, joins vehicle details
- `PATCH /api/rentals/:id/cancel` — authenticated, frees the vehicle back to `available` if no other active rentals remain
- `PATCH /api/rentals/:id/complete` — authenticated, marks the rental `completed` and vehicle `available`

## Key Design Notes

- **Date-range overlap check**: two ranges `[existingStart, existingEnd]` and `[newStart, newEnd]` collide iff `existingStart <= newEnd AND existingEnd >= newStart`. This is queried directly in Supabase (`lte`/`gte` filters) against only `booked`/`active` rentals — cancelled or completed rentals never block new bookings.
- **Billing**: days are calculated inclusive of both start and end dates (a `2026-05-01` to `2026-05-05` booking bills 5 days), then multiplied by the vehicle's `daily_rate`.
- **Vehicle status lifecycle**: `available → rented` (on booking) → `available` again (on cancel, if no other active rentals remain, or on complete).
- A DB-level `CHECK (end_date >= start_date)` constraint and `CHECK` constraints on `category`/`status`/`daily_rate` back up the application-level validation.

## Testing Checklist (from the assignment spec)

1. Configure `.env` with valid Supabase credentials and run `supabase/schema.sql`.
2. Insert 3 vehicles via `POST /api/vehicles` (or directly in the Supabase table editor).
3. Book Vehicle #1 for `2026-05-01` → `2026-05-05`.
4. Try booking Vehicle #1 again for `2026-05-03` → `2026-05-07` → expect `400 Bad Request: Vehicle already reserved during this timeframe`.

## Project Structure

```
car-rental-system-api/
├── config/
│   └── supabase.js
├── controllers/
│   ├── authController.js
│   ├── rentalController.js
│   └── vehicleController.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── authRoutes.js
│   ├── rentalRoutes.js
│   └── vehicleRoutes.js
├── supabase/
│   └── schema.sql
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```
