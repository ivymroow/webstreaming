const sessions = require('../sessions');
const supabase = require('../supabase');

// In-memory dedup for concurrent refresh calls on the same refresh token
const refreshInFlight = new Map();

function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json.exp ? json.exp * 1000 : 0;
  } catch { return 0; }
}

async function requireUser(req, res) {
  const session = sessions.get(req);
  if (!session) { res.status(401).json({ error: 'Not signed in' }); return null; }

  // Access token is still valid — use it directly, no refresh needed.
  const exp = tokenExpiry(session.token);
  if (exp > Date.now() + 60 * 1000) {
    req._supabaseToken = session.token;
    return session.user;
  }

  // Token expired (or nearly) — refresh, deduping concurrent calls.
  try {
    if (!refreshInFlight.has(session.refresh)) {
      refreshInFlight.set(session.refresh, supabase.refreshSession(session.refresh).finally(() => refreshInFlight.delete(session.refresh)));
    }
    const { token, refresh } = await refreshInFlight.get(session.refresh);
    session.token = token; session.refresh = refresh;
    sessions.create(res, session.user, token, refresh);
    req._supabaseToken = token;
    return session.user;
  } catch (e) {
    try {
      const user = await supabase.getUserFromToken(session.token);
      if (user) { req._supabaseToken = session.token; return session.user; }
    } catch (e2) {}
    sessions.clear(res);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return null;
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
