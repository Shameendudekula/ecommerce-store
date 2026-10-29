// Role-based access control. Use AFTER requireAuth, which sets req.user:
//   router.post('/', requireAuth, requireRole('admin'), createProduct)
//
// 401 = "we don't know who you are" (no or invalid token, handled by requireAuth)
// 403 = "we know who you are, but you're not allowed to do this"
module.exports = function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to do this' });
    }
    next();
  };
};
