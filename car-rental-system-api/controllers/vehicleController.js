const { supabaseAdmin } = require('../config/supabase');

const CATEGORIES = ['Sedan', 'SUV', 'Luxury', 'Hatchback', 'Electric'];
const STATUSES = ['available', 'rented', 'maintenance'];

/**
 * GET /api/vehicles — public. Supports ?category= and ?status= filters.
 */
async function listVehicles(req, res) {
  try {
    const { category, status } = req.query;

    let query = supabaseAdmin.from('vehicles').select('*').order('id', { ascending: true });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/vehicles/:id — public. Includes past rental records for that vehicle.
 */
async function getVehicle(req, res) {
  try {
    const { id } = req.params;

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const { data: rentals, error: rentalsError } = await supabaseAdmin
      .from('rentals')
      .select('id, customer_name, start_date, end_date, status, total_cost')
      .eq('vehicle_id', id)
      .order('start_date', { ascending: false });

    if (rentalsError) {
      return res.status(500).json({ success: false, message: rentalsError.message });
    }

    return res.status(200).json({ success: true, data: { ...vehicle, rentalHistory: rentals } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/vehicles — authenticated. Add a new vehicle to the fleet.
 */
async function createVehicle(req, res) {
  try {
    const { brand, model, year, category, daily_rate, fuel_type, seating_capacity } = req.body;

    if (!brand || !model || !year || !category || daily_rate === undefined || !fuel_type) {
      return res.status(400).json({
        success: false,
        message: 'brand, model, year, category, daily_rate and fuel_type are required'
      });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (typeof daily_rate !== 'number' || daily_rate <= 0) {
      return res.status(400).json({ success: false, message: 'daily_rate must be a number greater than 0' });
    }

    const { data, error } = await supabaseAdmin
      .from('vehicles')
      .insert([
        {
          brand,
          model,
          year,
          category,
          daily_rate,
          fuel_type,
          seating_capacity: seating_capacity ?? 5,
          status: 'available'
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    return res.status(201).json({ success: true, message: 'Vehicle added to fleet', data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PUT /api/vehicles/:id — authenticated. Update rate/status/other fields.
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;
    const { brand, model, year, category, daily_rate, fuel_type, seating_capacity, status } = req.body;

    if (category !== undefined && !CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${STATUSES.join(', ')}` });
    }
    if (daily_rate !== undefined && (typeof daily_rate !== 'number' || daily_rate <= 0)) {
      return res.status(400).json({ success: false, message: 'daily_rate must be a number greater than 0' });
    }

    const updates = {};
    if (brand !== undefined) updates.brand = brand;
    if (model !== undefined) updates.model = model;
    if (year !== undefined) updates.year = year;
    if (category !== undefined) updates.category = category;
    if (daily_rate !== undefined) updates.daily_rate = daily_rate;
    if (fuel_type !== undefined) updates.fuel_type = fuel_type;
    if (seating_capacity !== undefined) updates.seating_capacity = seating_capacity;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabaseAdmin
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    return res.status(200).json({ success: true, message: 'Vehicle updated', data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/vehicles/:id — authenticated. Blocked if the vehicle has
 * any active (booked/active) bookings.
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;

    const { data: activeBookings, error: checkError } = await supabaseAdmin
      .from('rentals')
      .select('id')
      .eq('vehicle_id', id)
      .in('status', ['booked', 'active']);

    if (checkError) {
      return res.status(500).json({ success: false, message: checkError.message });
    }
    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete vehicle: it has active or upcoming bookings'
      });
    }

    const { data, error } = await supabaseAdmin.from('vehicles').delete().eq('id', id).select().single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    return res.status(200).json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { listVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle };
