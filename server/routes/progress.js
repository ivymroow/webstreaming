const express = require('express');
const supabase = require('../database/supabase');
const { requireUserMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.use(requireUserMiddleware);

router.post('/save', asyncHandler(async (req, res) => {
  await supabase.saveProgress(req.user.id, req.body, req._supabaseToken);
  res.json({ ok: true });
}));

router.get('/list', asyncHandler(async (req, res) => {
  res.json(await supabase.listProgress(req.user.id, req.query.status, req._supabaseToken));
}));

router.get('/get', asyncHandler(async (req, res) => {
  const item = await supabase.getProgress(req.user.id, req.query.id, Number(req.query.season), Number(req.query.episode), req._supabaseToken);
  res.json(item || {});
}));

router.post('/update', asyncHandler(async (req, res) => {
  const { id, status } = req.body;
  const c = await supabase.getClient(req._supabaseToken);
  await c.from('watch_progress').update({ status }).eq('user_id', req.user.id).eq('item_id', id);
  res.json({ ok: true });
}));

router.post('/delete', asyncHandler(async (req, res) => {
  const c = await supabase.getClient(req._supabaseToken);
  await c.from('watch_progress').delete().eq('user_id', req.user.id).eq('item_id', req.body.id);
  res.json({ ok: true });
}));

module.exports = router;
