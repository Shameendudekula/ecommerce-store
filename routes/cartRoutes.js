const express = require('express');
const ctrl = require('../controllers/cartController');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// The server-side cart belongs to a logged-in user. Guests keep their cart in localStorage.
router.use(requireAuth);

router.route('/').get(ctrl.getCart).delete(ctrl.clearCart);
router.post('/items', ctrl.addItem);
router.route('/items/:productId').patch(ctrl.updateItem).delete(ctrl.removeItem);
router.post('/merge', ctrl.mergeCart);

module.exports = router;
