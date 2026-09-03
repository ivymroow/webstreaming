const sessions = require('../sessions');

async function requireUser(req, res) {
  const session = sessions.get(req);
  if (!session || !session.id) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  return { id: session.id, username: session.username || 'user', email: session.email || '' };
}

async function requireUserMiddleware(req, res, next) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    req.user = user;
    next();
  } catch (e) { next(e); }
}

module.exports = { requireUser, requireUserMiddleware };
