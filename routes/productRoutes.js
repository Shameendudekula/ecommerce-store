const express = require('express');
const ctrl = require('../controllers/productController');
const requireAuth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];

// Anyone can browse; only admins can change the catalogue
router.route('/').get(ctrl.getProducts).post(...adminOnly, ctrl.createProduct);

router
  .route('/:id')
  .all(validateObjectId)
  .get(ctrl.getProduct)
  .put(...adminOnly, ctrl.updateProduct)
  .delete(...adminOnly, ctrl.deleteProduct);

module.exports = router;
