const { createClient } = require('@supabase/supabase-js');
const env = require('./config/env');
const { cleanString, cleanUsername } = require('./utils/sanitize');

// Anon client is only for public auth (signUp/signIn).
const sb = createClient(env.supabaseUrl, env.supabaseAnonKey);

// Service-role client bypasses RLS and never needs a user token. Falls back to anon.
const admin = env.supabaseServiceRoleKey ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey) : sb;

function getClient() {
  return admin;
}

function authError(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}

async function signUp(username, password, email) {
  const safeUsername = cleanUsername(username);
  const safeEmail = cleanString(email, 320);
  const userEmail = safeEmail || `${safeUsername}@ws.local`;
  const { data, error } = await sb.auth.signUp({ email: userEmail, password, options: { data: { username: safeUsername } } });
  if (error) throw authError(error.message);
  return {
    user: { id: data.user.id, username: safeUsername, email: data.user.email },
    needsConfirmation: !data.session,
  };
}

async function signIn(username, password) {
  const safeUsername = cleanUsername(username);
  const userEmail = await getEmailForUsername(safeUsername);
  const { data, error } = await sb.auth.signInWithPassword({ email: userEmail, password });
  if (error) throw authError(error.message);
  return { user: { id: data.user.id, username: data.user.user_metadata?.username || safeUsername, email: data.user.email } };
}

async function getEmailForUsername(username) {
  if (username.includes('@')) return username;
  const localEmail = `${username}@ws.local`;
  if (!env.supabaseServiceRoleKey) return localEmail;

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return localEmail;
  const user = data?.users?.find(item => item.user_metadata?.username === username);
  return user?.email || localEmail;
}

async function getAccount(userId) {
  if (!env.supabaseServiceRoleKey) throw authError('Account settings require SUPABASE_SERVICE_ROLE_KEY');
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw authError(error?.message || 'User not found');
  const user = data.user;
  return {
    id: user.id,
    username: user.user_metadata?.username || user.email,
    email: user.email || '',
    needsEmail: (user.email || '').endsWith('@ws.local'),
  };
}

async function updateEmail(userId, email) {
  if (!env.supabaseServiceRoleKey) throw authError('Email changes require SUPABASE_SERVICE_ROLE_KEY');
  const safeEmail = cleanString(email, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) throw authError('Enter a valid email');
  const { data, error } = await admin.auth.admin.updateUserById(userId, { email: safeEmail });
  if (error) throw authError(error.message);
  const user = data.user;
  return {
    id: user.id,
    username: user.user_metadata?.username || user.email,
    email: user.email || safeEmail,
    needsEmail: false,
  };
}

async function sendPasswordReset(userId) {
  const account = await getAccount(userId);
  if (!account.email || account.needsEmail) throw authError('Set a real email before requesting a password reset');
  const { error } = await sb.auth.resetPasswordForEmail(account.email, {
    redirectTo: env.publicUrl,
  });
  if (error) throw authError(error.message);
}

async function saveProgress(userId, item) {
  const c = getClient();
  const { id, title, poster, type, season, episode, duration, watched, status } = item;
  const se = season || 0, ep = episode || 0;
  // Preserve existing poster/title if new ones are empty
  const old = await c.from('watch_progress').select('poster,title').eq('user_id', userId).eq('item_id', id).eq('season', se).eq('episode', ep).maybeSingle();
  const p = poster || (old?.data?.poster) || '';
  const t = title || (old?.data?.title) || '';
  // Delete existing first to avoid duplicate constraint issues
  await c.from('watch_progress').delete().eq('user_id', userId).eq('item_id', id).eq('season', se).eq('episode', ep);
  const { error } = await c.from('watch_progress').insert({
    user_id: userId, item_id: id, title: t, poster: p, type,
    season: se, episode: ep,
    duration: duration || 0, watched: watched || 0,
    status: status || 'watching',
  });
  if (error) throw new Error(error.message);
}

async function getProgress(userId, itemId, season, episode) {
  const c = getClient();
  let q = c.from('watch_progress').select('*').eq('user_id', userId).eq('item_id', itemId);
  if (season) q = q.eq('season', season);
  if (episode) q = q.eq('episode', episode);
  const { data } = await q.maybeSingle();
  return data;
}

async function listProgress(userId, status, limit = 30) {
  const c = getClient();
  let q = c.from('watch_progress').select('*').eq('user_id', userId);
  if (status) q = q.eq('status', status);
  const { data } = await q.order('updated_at', { ascending: false });
  // Deduplicate by item_id - only show latest entry per show
  const seen = new Set();
  const deduped = [];
  for (const item of (data || [])) {
    if (seen.has(item.item_id)) continue;
    seen.add(item.item_id);
    deduped.push(item);
  }
  return deduped.slice(0, limit);
}

async function addToWatchlist(userId, item) {
  const c = getClient();
  const { id, title, poster, type } = item;
  const { error } = await c.from('watchlist').upsert({ user_id: userId, item_id: id, title, poster, type }, { onConflict: 'user_id,item_id' });
  if (error) throw new Error(error.message);
}

async function removeFromWatchlist(userId, itemId) {
  const c = getClient();
  const { error } = await c.from('watchlist').delete().eq('user_id', userId).eq('item_id', itemId);
  if (error) throw new Error(error.message);
}

async function getWatchlist(userId, limit = 30) {
  const c = getClient();
  const { data } = await c.from('watchlist').select('*').eq('user_id', userId).order('added_at', { ascending: false }).limit(limit);
  return data || [];
}

async function isInWatchlist(userId, itemId) {
  const c = getClient();
  const { data } = await c.from('watchlist').select('id').eq('user_id', userId).eq('item_id', itemId).maybeSingle();
  return !!data;
}

module.exports = { signUp, signIn, getAccount, updateEmail, sendPasswordReset, getClient, saveProgress, getProgress, listProgress, addToWatchlist, removeFromWatchlist, getWatchlist, isInWatchlist };
