const express = require('express');
const supabase = require('../supabase');
const sessions = require('../sessions');
const { requireUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { requireBody } = require('../middleware/validation');

const router = express.Router();

router.post('/signup', requireBody('username'), requireBody('password'), asyncHandler(async (req, res) => {
  const result = await supabase.signUp(req.body.username, req.body.password);
  sessions.create(res, result.user);
  res.json({ ok: true, user: result.user });
}));

router.post('/signin', requireBody('username'), requireBody('password'), asyncHandler(async (req, res) => {
  const result = await supabase.signIn(req.body.username, req.body.password);
  sessions.create(res, result.user);
  res.json({ ok: true, user: result.user });
}));

router.get('/user', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(user);
}));

router.post('/signout', (req, res) => {
  sessions.clear(res);
  res.json({ ok: true });
});

module.exports = router;
