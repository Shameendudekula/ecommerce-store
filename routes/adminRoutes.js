const express = require('express');
const ctrl = require('../controllers/adminController');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

// Every route in this file: must be logged in (401 otherwise) AND be an admin (403 otherwise)
router.use(requireAuth, requireRole('admin'));

router.get('/stats', ctrl.getStats);
router.get('/orders', ctrl.getOrders);
router.patch('/orders/:id/status', validateObjectId, ctrl.updateOrderStatus);

module.exports = router;
