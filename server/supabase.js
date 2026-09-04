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

function userPayload(user, fallbackUsername) {
  return {
    id: user.id,
    username: user.user_metadata?.username || fallbackUsername || user.email,
    email: user.email,
  };
}

function passwordResetRedirectUrl() {
  try {
    const url = new URL(env.publicUrl);
    url.pathname = '/reset-password';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'http://localhost:8080/reset-password';
  }
}

async function signUp(username, password, email) {
  const safeUsername = cleanUsername(username);
  const usernameKey = safeUsername.toLowerCase();
  const safeEmail = cleanString(email, 320);
  const userEmail = safeEmail || `${usernameKey}@ws.local`;
  const { data, error } = await sb.auth.signUp({ email: userEmail, password, options: { data: { username: safeUsername } } });
  if (error) throw authError(error.message);
  if (env.supabaseServiceRoleKey && data?.user?.id) {
    await admin.from('ws_accounts').upsert({
      username_key: usernameKey,
      username: safeUsername,
      user_id: data.user.id,
      session_version: '',
      reset_pending: false,
    }, { onConflict: 'username_key' });
  }
  return {
    user: { id: data.user.id, username: safeUsername, email: data.user.email },
    needsConfirmation: !data.session,
  };
}

async function signIn(username, password, token) {
  const safeUsername = cleanUsername(username);
  const usernameKey = safeUsername.toLowerCase();
  const localEmail = `${usernameKey}@ws.local`;
  if (safeUsername.includes('@')) {
    const { data, error } = await sb.auth.signInWithPassword({ email: safeUsername, password });
    if (error) throw authError(error.message);
    return await finishSignIn(data.user, safeUsername, token);
  }

  let result = await sb.auth.signInWithPassword({ email: localEmail, password });
  if (result.error && env.supabaseServiceRoleKey) {
    const mappedEmail = await getEmailForUsername(safeUsername);
    if (mappedEmail && mappedEmail !== localEmail) {
      result = await sb.auth.signInWithPassword({ email: mappedEmail, password });
    }
  }
  if (result.error) throw authError(result.error.message);
  if (env.supabaseServiceRoleKey && result.data?.user?.id) {
    await admin.from('ws_accounts').upsert({
      username_key: usernameKey,
      username: safeUsername,
      user_id: result.data.user.id,
      session_version: '',
      reset_pending: false,
    }, { onConflict: 'username_key' });
  }
  return await finishSignIn(result.data.user, safeUsername, token);
}

async function finishSignIn(user, safeUsername, token) {
  const md = user.user_metadata || {};

  // TOTP 2FA
  if (md.totp_enabled === true) {
    if (!token) return { needs2fa: true, method: 'totp' };
    const speakeasy = require('speakeasy');
    const verified = speakeasy.totp.verify({ secret: md.totp_secret, encoding: 'base32', token, window: 2 });
    if (!verified) throw authError('Invalid 2FA code');
  }

  // Email 2FA
  if (md.email_2fa_enabled === true) {
    if (!token) {
      // Auto-send OTP and signal frontend to prompt for it
      await sendEmailOTP(user.id);
      return { needs2fa: true, method: 'email' };
    }
    await verifyEmailOTP(user.id, token);
  }

  return { user: userPayload(user, safeUsername) };
}

async function setSession(accessToken, refreshToken) {
  const { data, error } = await sb.auth.setSession({
    access_token: cleanString(accessToken, 4096),
    refresh_token: cleanString(refreshToken, 4096),
  });
  if (error) throw authError(error.message);
  return { user: userPayload(data.user) };
}

async function getEmailForUsername(username) {
  if (username.includes('@')) return username;
  const usernameKey = username.toLowerCase();
  const localEmail = `${usernameKey}@ws.local`;
  if (!env.supabaseServiceRoleKey) return null;

  const account = await admin
    .from('ws_accounts')
    .select('user_id')
    .eq('username_key', usernameKey)
    .maybeSingle();
  if (account.data?.user_id) {
    const { data } = await admin.auth.admin.getUserById(account.data.user_id);
    if (data?.user?.email) return data.user.email;
  }

  return null;
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
    totp_enabled: !!user.user_metadata?.totp_enabled,
    email_2fa_enabled: !!user.user_metadata?.email_2fa_enabled,
    user_metadata: user.user_metadata,
  };
}

async function updateEmail(userId, email) {
  if (!env.supabaseServiceRoleKey) throw authError('Email changes require SUPABASE_SERVICE_ROLE_KEY');
  const safeEmail = cleanString(email, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) throw authError('Enter a valid email');
  const { data, error } = await admin.auth.admin.updateUserById(userId, { email: safeEmail });
  if (error) throw authError(error.message);
  const user = data.user;
  const username = user.user_metadata?.username || user.email;
  if (username) {
    await admin.from('ws_accounts').upsert({
      username_key: username.toLowerCase(),
      username,
      user_id: user.id,
      session_version: '',
      reset_pending: false,
    }, { onConflict: 'username_key' });
  }
  return {
    id: user.id,
    username,
    email: user.email || safeEmail,
    needsEmail: false,
  };
}

async function sendPasswordReset(userId) {
  const account = await getAccount(userId);
  if (!account.email || account.needsEmail) throw authError('Set a real email before requesting a password reset');
  await sendPasswordResetToEmail(account.email);
}

async function sendPasswordResetToEmail(email) {
  const safeEmail = cleanString(email, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) throw authError('Enter a valid email');
  const { error } = await sb.auth.resetPasswordForEmail(safeEmail, {
    redirectTo: passwordResetRedirectUrl(),
  });
  if (error) throw authError(error.message);
}

async function deleteAccount(userId) {
  if (!env.supabaseServiceRoleKey) throw authError('Account deletion requires SUPABASE_SERVICE_ROLE_KEY');
  await admin.from('watch_progress').delete().eq('user_id', userId);
  await admin.from('watchlist').delete().eq('user_id', userId);
  await admin.from('ws_accounts').delete().eq('user_id', userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw authError(error.message);
}

async function updatePasswordFromReset({ accessToken, refreshToken, code, password }) {
  const safePassword = cleanString(password, 256);
  if (safePassword.length < 6) throw authError('Password must be at least 6 characters');

  const recoveryClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  let sessionUser = null;
  if (code) {
    const { data, error } = await recoveryClient.auth.exchangeCodeForSession(cleanString(code, 2048));
    if (error) throw authError(error.message);
    sessionUser = data?.user || null;
  } else if (accessToken && refreshToken) {
    const { data, error } = await recoveryClient.auth.setSession({
      access_token: cleanString(accessToken, 4096),
      refresh_token: cleanString(refreshToken, 4096),
    });
    if (error) throw authError(error.message);
    sessionUser = data?.user || null;
  } else {
    throw authError('Password reset link is missing recovery tokens');
  }

  const { data, error } = await recoveryClient.auth.updateUser({ password: safePassword });
  if (error) throw authError(error.message);
  const user = data?.user || sessionUser;
  if (!user) throw authError('Password reset session could not be loaded');
  return { user: userPayload(user) };
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

async function setup2fa(userId) {
  const account = await getAccount(userId);
  let secret = account.user_metadata?.totp_secret;
  const speakeasy = require('speakeasy');
  const qrcode = require('qrcode');
  if (!secret) {
    const s = speakeasy.generateSecret({ name: 'WebStreaming (' + account.username + ')' });
    secret = s.base32;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...(account.user_metadata || {}), totp_secret: secret, totp_enabled: false },
    });
    if (error) throw authError(error.message);
  }
  const otpauthUrl = speakeasy.otpauthURL({ secret, label: 'WebStreaming (' + account.username + ')', encoding: 'base32' });
  const dataUrl = await qrcode.toDataURL(otpauthUrl);
  return { qrcode: dataUrl };
}

async function verify2faSetup(userId, token) {
  const account = await getAccount(userId);
  const secret = account.user_metadata?.totp_secret;
  if (!secret) throw authError('2FA not initialized');
  const speakeasy = require('speakeasy');
  const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token: cleanString(token, 20), window: 2 });
  if (!verified) throw authError('Invalid code');
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...(account.user_metadata || {}), totp_enabled: true, email_2fa_enabled: false },
  });
  if (error) throw authError(error.message);
  return true;
}

async function disable2fa(userId, token) {
  const account = await getAccount(userId);
  if (token) {
    const secret = account.user_metadata?.totp_secret;
    if (secret) {
      const speakeasy = require('speakeasy');
      const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token: cleanString(token, 20), window: 2 });
      if (!verified) throw authError('Invalid code');
    }
  }
  const md = {
    ...(account.user_metadata || {}),
    totp_secret: null,
    totp_enabled: false,
    email_2fa_enabled: false,
    email_otp_code: null,
    email_otp_expires: null,
  };
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: md });
  if (error) throw authError(error.message);
  return true;
}

function createMailer() {
  const nodemailer = require('nodemailer');
  if (!env.smtpHost || !env.smtpUser) throw authError('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment variables.');
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
}

async function setup2faEmail(userId) {
  if (!env.supabaseServiceRoleKey) throw authError('Email 2FA requires SUPABASE_SERVICE_ROLE_KEY');
  const account = await getAccount(userId);
  if (account.needsEmail) throw authError('Add a real email address to your account before enabling email 2FA');
  const md = {
    ...(account.user_metadata || {}),
    email_2fa_enabled: true,
    totp_enabled: false,
    totp_secret: null,
  };
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: md });
  if (error) throw authError(error.message);
  return true;
}

async function disable2faEmail(userId, code) {
  const account = await getAccount(userId);
  if (code) {
    const storedCode = account.user_metadata?.email_otp_code;
    const expires = account.user_metadata?.email_otp_expires;
    if (storedCode && expires && Date.now() <= expires) {
      if (cleanString(code, 10) !== String(storedCode)) throw authError('Invalid code');
    }
  }
  const md = {
    ...(account.user_metadata || {}),
    email_2fa_enabled: false,
    email_otp_code: null,
    email_otp_expires: null,
    totp_secret: null,
    totp_enabled: false,
  };
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: md });
  if (error) throw authError(error.message);
  return true;
}

async function sendEmailOTP(userId) {
  const account = await getAccount(userId);
  if (!account.email || account.needsEmail) throw authError('No valid email on account');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...account.user_metadata, email_otp_code: code, email_otp_expires: expires },
  });
  const mailer = createMailer();
  await mailer.sendMail({
    from: env.smtpFrom || env.smtpUser,
    to: account.email,
    subject: 'Your WebStreaming 2FA code',
    text: `Your sign-in code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;background:#09070d;color:#f8f3ff;border-radius:12px">
      <h2 style="color:#a568ff;margin-top:0">WebStreaming</h2>
      <p>Your sign-in verification code is:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#a568ff;padding:16px 0">${code}</div>
      <p style="color:#a99db5;font-size:13px">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`,
  });
}

async function verifyEmailOTP(userId, code) {
  const account = await getAccount(userId);
  const storedCode = account.user_metadata?.email_otp_code;
  const expires = account.user_metadata?.email_otp_expires;
  if (!storedCode || !expires || Date.now() > expires) throw authError('Code expired — request a new one');
  if (cleanString(code, 10) !== String(storedCode)) throw authError('Invalid code');
  // Clear used code
  const md = { ...account.user_metadata };
  delete md.email_otp_code;
  delete md.email_otp_expires;
  await admin.auth.admin.updateUserById(userId, { user_metadata: md });
  return true;
}

module.exports = { signUp, signIn, setSession, getAccount, updateEmail, sendPasswordReset, sendPasswordResetToEmail, updatePasswordFromReset, deleteAccount, setup2fa, verify2faSetup, disable2fa, setup2faEmail, disable2faEmail, sendEmailOTP, verifyEmailOTP, getClient, saveProgress, getProgress, listProgress, addToWatchlist, removeFromWatchlist, getWatchlist, isInWatchlist };
