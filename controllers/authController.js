const User = require('../models/User');
const { signToken } = require('../utils/token');

const str = (v) => (typeof v === 'string' ? v : '');

// POST /api/auth/register  { name, email, password }
exports.register = async (req, res) => {
  const { name, email, password } = req.body || {};
  // "role" is deliberately not read from the body: everyone who signs up is a customer
  const user = await User.create({ name, email, password });
  res.status(201).json({ message: 'Account created', token: signToken(user._id), user });
};

// POST /api/auth/login  { email, password }
exports.login = async (req, res) => {
  const email = str(req.body?.email).trim().toLowerCase();
  const password = str(req.body?.password);
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // The password hash is excluded by default (select: false), so ask for it explicitly
  const user = await User.findOne({ email }).select('+password');

  // Same message whether the email or the password is wrong, so attackers can't find out
  // which emails have accounts
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  res.json({ message: 'Logged in', token: signToken(user._id), user });
};

// GET /api/auth/me – the logged-in user (set by the auth middleware)
exports.me = (req, res) => {
  res.json({ user: req.user });
};

// PATCH /api/auth/me  { name } – update profile
exports.updateMe = async (req, res) => {
  if (req.body?.name !== undefined) req.user.name = req.body.name;
  await req.user.save();
  res.json({ message: 'Profile saved', user: req.user });
};
