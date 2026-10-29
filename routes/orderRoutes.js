const express = require('express');
const ctrl = require('../controllers/orderController');
const requireAuth = require('../middleware/auth');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

router.use(requireAuth);

router.route('/').get(ctrl.getMyOrders).post(ctrl.placeOrder);
router.get('/:id', validateObjectId, ctrl.getOrder);

module.exports = router;
