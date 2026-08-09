const sessions = require('../sessions');
const supabase = require('../supabase');

async function requireUser(req, res) {
  const session = sessions.get(req);
  if (!session) { res.status(401).json({ error: 'Not signed in' }); return null; }
  try {
    const user = await supabase.getUserFromToken(session.token);
    if (!user) throw new Error('expired');
    req._supabaseToken = session.token;
    return session.user;
  } catch (e) {
    try {
      const { token, refresh } = await supabase.refreshSession(session.refresh);
      session.token = token; session.refresh = refresh;
      sessions.create(res, session.user, token, refresh);
      req._supabaseToken = token;
      return session.user;
    } catch (e2) { res.status(401).json({ error: 'Session expired' }); return null; }
  }
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
