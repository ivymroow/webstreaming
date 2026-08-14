const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fjsqdiungqarlrnusddr.supabase.co';
const ANON_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqc3FkaXVuZ3FhcmxybnVzZGRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTQ5MjAsImV4cCI6MjA5ODA3MDkyMH0.QIWrPp8KflyvFHUjeWVbO0dxKxns2-WfOeH6UQeqe84';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Anon client is only for public auth (signUp/signIn).
const sb = createClient(SUPABASE_URL, ANON_KEY);

// Service-role client bypasses RLS and never needs a user token. Falls back to anon.
const admin = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : sb;

function getClient() {
  return admin;
}

async function signUp(username, password, email) {
  const userEmail = email || `${username}@ws.local`;
  const { data, error } = await sb.auth.signUp({ email: userEmail, password, options: { data: { username } } });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Check Supabase dashboard: disable email confirmation');
  return { user: { id: data.user.id, username } };
}

async function signIn(username, password) {
  const userEmail = `${username}@ws.local`;
  const { data, error } = await sb.auth.signInWithPassword({ email: userEmail, password });
  if (error) throw new Error(error.message);
  return { user: { id: data.user.id, username: data.user.user_metadata?.username || username } };
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

module.exports = { signUp, signIn, getClient, saveProgress, getProgress, listProgress, addToWatchlist, removeFromWatchlist, getWatchlist, isInWatchlist };
