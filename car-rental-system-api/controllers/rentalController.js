const { supabaseAdmin } = require('../config/supabase');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(str) {
  const d = new Date(`${str}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Number of billed days between two YYYY-MM-DD dates, inclusive of both ends
 * (a same-day rental still bills for 1 day; a 1-day-later end_date bills 2).
 * Adjust here if your business rule differs (e.g. exclusive end date).
 */
function calculateDays(startDate, endDate) {
  const diff = (endDate.getTime() - startDate.getTime()) / MS_PER_DAY;
  return diff + 1;
}

/**
 * POST /api/rentals — authenticated
 * Books a vehicle for a date range. Checks the vehicle exists and is not
 * under maintenance, checks for overlapping bookings against existing
 * booked/active rentals for that vehicle, computes the total cost as
 * (days * daily_rate), and inserts the rental.
 */
async function createRental(req, res) {
  try {
    const { vehicle_id, start_date, end_date, customer_name, customer_email } = req.body;

    if (!vehicle_id || !start_date || !end_date || !customer_name || !customer_email) {
      return res.status(400).json({
        success: false,
        message: 'vehicle_id, start_date, end_date, customer_name and customer_email are required'
      });
    }

    const startDate = parseDateOnly(start_date);
    const endDate = parseDateOnly(end_date);
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'start_date and end_date must be valid dates (YYYY-MM-DD)' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'end_date cannot be before start_date' });
    }

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    if (vehicle.status === 'maintenance') {
      return res.status(400).json({ success: false, message: 'This vehicle is currently under maintenance and cannot be booked' });
    }

    // Overlap check: two date ranges [a_start, a_end] and [b_start, b_end]
    // overlap iff a_start <= b_end AND a_end >= b_start. We only care about
    // rentals that are still "booked" or "active" (not cancelled/completed).
    const { data: collisions, error: collisionError } = await supabaseAdmin
      .from('rentals')
      .select('id, start_date, end_date')
      .eq('vehicle_id', vehicle_id)
      .in('status', ['booked', 'active'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (collisionError) {
      return res.status(500).json({ success: false, message: collisionError.message });
    }
    if (collisions && collisions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle already reserved during this timeframe'
      });
    }

    const days = calculateDays(startDate, endDate);
    const totalCost = Number((days * Number(vehicle.daily_rate)).toFixed(2));

    const { data: rental, error: insertError } = await supabaseAdmin
      .from('rentals')
      .insert([
        {
          user_id: req.user.id,
          vehicle_id,
          customer_name,
          customer_email,
          start_date,
          end_date,
          total_cost: totalCost,
          status: 'booked'
        }
      ])
      .select()
      .single();

    if (insertError) {
      // Covers the rare race where two requests slip past the check above
      // at the same instant — surfaces as a clean 400 rather than a 500.
      return res.status(400).json({ success: false, message: insertError.message });
    }

    // Reflect the booking on the vehicle's current status
    await supabaseAdmin.from('vehicles').update({ status: 'rented' }).eq('id', vehicle_id);

    return res.status(201).json({ success: true, message: 'Vehicle booked successfully', data: rental });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/rentals/my-bookings — authenticated
 */
async function myBookings(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rentals')
      .select('*, vehicles(brand, model, category, daily_rate)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /api/rentals/:id/cancel — authenticated
 * Cancels an upcoming rental owned by the caller. Cannot cancel a rental
 * that's already completed or cancelled.
 */
async function cancelRental(req, res) {
  try {
    const { id } = req.params;

    const { data: rental, error: fetchError } = await supabaseAdmin
      .from('rentals')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    if (['completed', 'cancelled'].includes(rental.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a rental that is already ${rental.status}` });
    }

    const { data, error } = await supabaseAdmin
      .from('rentals')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    // Free up the vehicle if it has no other active/booked rentals right now
    const { data: stillActive } = await supabaseAdmin
      .from('rentals')
      .select('id')
      .eq('vehicle_id', rental.vehicle_id)
      .in('status', ['booked', 'active']);

    if (!stillActive || stillActive.length === 0) {
      await supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);
    }

    return res.status(200).json({ success: true, message: 'Rental cancelled', data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /api/rentals/:id/complete — authenticated
 * Marks the car as returned: rental -> "completed", vehicle -> "available".
 */
async function completeRental(req, res) {
  try {
    const { id } = req.params;

    const { data: rental, error: fetchError } = await supabaseAdmin
      .from('rentals')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !rental) {
      return res.status(404).json({ success: false, message: 'Rental not found' });
    }
    if (['completed', 'cancelled'].includes(rental.status)) {
      return res.status(400).json({ success: false, message: `Rental is already ${rental.status}` });
    }

    const { data, error } = await supabaseAdmin
      .from('rentals')
      .update({ status: 'completed' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    await supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);

    return res.status(200).json({ success: true, message: 'Vehicle marked as returned', data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { createRental, myBookings, cancelRental, completeRental };
