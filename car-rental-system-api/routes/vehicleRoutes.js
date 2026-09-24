const express = require('express');
const router = express.Router();
const {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle
} = require('../controllers/vehicleController');
const authenticate = require('../middleware/auth');

// GET /api/vehicles?category=&status= — public
router.get('/', listVehicles);

// GET /api/vehicles/:id — public
router.get('/:id', getVehicle);

// POST /api/vehicles — authenticated
router.post('/', authenticate, createVehicle);

// PUT /api/vehicles/:id — authenticated
router.put('/:id', authenticate, updateVehicle);

// DELETE /api/vehicles/:id — authenticated
router.delete('/:id', authenticate, deleteVehicle);

module.exports = router;
