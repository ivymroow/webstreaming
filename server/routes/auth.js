const express = require('express');
const supabase = require('../supabase');
const sessions = require('../sessions');
const { requireUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');
const { requireBody } = require('../middleware/validation');

const router = express.Router();

router.post('/signup', requireBody('username'), requireBody('password'), asyncHandler(async (req, res) => {
  const result = await supabase.signUp(req.body.username, req.body.password, req.body.email);
  if (!result.needsConfirmation) sessions.create(res, result.user);
  res.json({ ok: true, user: result.user, needsConfirmation: result.needsConfirmation });
}));

router.post('/signin', requireBody('username'), requireBody('password'), asyncHandler(async (req, res) => {
  const result = await supabase.signIn(req.body.username, req.body.password, req.body.token);
  if (result.needs2fa) {
    return res.json({ ok: true, needs2fa: true, method: result.method });
  }
  sessions.create(res, result.user);
  res.json({ ok: true, user: result.user });
}));

router.post('/2fa/setup', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const result = await supabase.setup2fa(user.id);
  res.json(result);
}));

router.post('/2fa/verify', requireBody('token'), asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.verify2faSetup(user.id, req.body.token);
  res.json({ ok: true });
}));

router.post('/2fa/disable', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.disable2fa(user.id, req.body?.token);
  res.json({ ok: true });
}));

router.post('/2fa/email/setup', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.setup2faEmail(user.id);
  res.json({ ok: true });
}));

router.post('/2fa/email/disable', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.disable2faEmail(user.id, req.body?.code);
  res.json({ ok: true });
}));

router.post('/2fa/email/send', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.sendEmailOTP(user.id);
  res.json({ ok: true });
}));

router.post('/session', requireBody('accessToken'), requireBody('refreshToken'), asyncHandler(async (req, res) => {
  const result = await supabase.setSession(req.body.accessToken, req.body.refreshToken);
  sessions.create(res, result.user);
  res.json({ ok: true, user: result.user });
}));

router.get('/user', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(user);
}));

router.get('/account', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(await supabase.getAccount(user.id));
}));

router.post('/account/email', requireBody('email'), asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const account = await supabase.updateEmail(user.id, req.body.email);
  sessions.create(res, account);
  res.json({ ok: true, user: account });
}));

router.post('/password-reset', asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  await supabase.sendPasswordReset(user.id);
  res.json({ ok: true });
}));

router.post('/password-reset-email', requireBody('email'), asyncHandler(async (req, res) => {
  await supabase.sendPasswordResetToEmail(req.body.email);
  res.json({ ok: true });
}));

router.post('/password/update', requireBody('password'), asyncHandler(async (req, res) => {
  const result = await supabase.updatePasswordFromReset(req.body);
  sessions.create(res, result.user);
  res.json({ ok: true, user: result.user });
}));

router.post('/account/delete', requireBody('confirmation'), asyncHandler(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.body.confirmation !== 'DELETE MY ACCOUNT') {
    res.status(400).json({ error: 'Type DELETE MY ACCOUNT to confirm' });
    return;
  }
  await supabase.deleteAccount(user.id);
  sessions.clear(res);
  res.json({ ok: true });
}));

router.post('/signout', (req, res) => {
  sessions.clear(res);
  res.json({ ok: true });
});

module.exports = router;
