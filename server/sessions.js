const crypto = require('crypto');
const env = require('./config/env');

const COOKIE_NAME = 'ws_sid';
const SESSION_TTL = 10 * 365 * 24 * 60 * 60; // 10 years, in seconds

function secret() {
  return env.sessionSecret;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function create(res, user) {
  const payload = { id: user.id, username: user.username, email: user.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  res.cookie(COOKIE_NAME, sign(payload), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL * 1000 });
}

function get(req) {
  const val = req.cookies?.[COOKIE_NAME];
  if (!val) return null;
  return verify(val);
}

function clear(res) {
  res.cookie(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

module.exports = { COOKIE_NAME, create, get, clear };
