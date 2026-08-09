const store = new Map();
const TTL = { default: 5 * 60 * 1000, source: 5 * 60 * 1000, tmdb: 10 * 60 * 1000 };
function get(key) { const e = store.get(key); if (!e) return null; if (Date.now() > e.expires) { store.delete(key); return null; } return e.value; }
function set(key, value, ttl = 'default') { store.set(key, { value, expires: Date.now() + (TTL[ttl] || TTL.default) }); }
module.exports = { get, set };
