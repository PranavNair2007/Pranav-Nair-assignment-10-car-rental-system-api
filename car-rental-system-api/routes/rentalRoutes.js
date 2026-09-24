const express = require('express');
const router = express.Router();
const { createRental, myBookings, cancelRental, completeRental } = require('../controllers/rentalController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

// POST /api/rentals
router.post('/', createRental);

// GET /api/rentals/my-bookings
router.get('/my-bookings', myBookings);

// PATCH /api/rentals/:id/cancel
router.patch('/:id/cancel', cancelRental);

// PATCH /api/rentals/:id/complete
router.patch('/:id/complete', completeRental);

module.exports = router;
