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
    username: user.user_metadata?.username || user.user_metadata?.display_name || fallbackUsername || user.email,
    email: user.email,
  };
}

function displayNameMetadata(username, metadata = {}) {
  return {
    ...metadata,
    username,
    display_name: username,
    name: username,
    full_name: username,
  };
}

async function updateDisplayName(userId, username, metadata = {}) {
  if (!env.supabaseServiceRoleKey || !userId || !username) return;
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: displayNameMetadata(username, metadata),
  });
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
  const metadata = displayNameMetadata(safeUsername);
  let data;
  let error;
  let needsConfirmation = false;
  if (safeEmail && env.supabaseServiceRoleKey && env.resendApiKey) {
    const generated = await admin.auth.admin.generateLink({
      type: 'signup',
      email: userEmail,
      password,
      options: { data: metadata, redirectTo: env.publicUrl },
    });
    data = generated.data;
    error = generated.error;
    if (!error) {
      try {
        await sendSignupConfirmation(userEmail, generated.data.properties.action_link);
      } catch (sendError) {
        if (generated.data?.user?.id) await admin.auth.admin.deleteUser(generated.data.user.id).catch(() => {});
        throw sendError;
      }
      needsConfirmation = true;
    }
  } else if (!safeEmail && env.supabaseServiceRoleKey) {
    const created = await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    data = created.data;
    error = created.error;
  } else {
    const signedUp = await sb.auth.signUp({ email: userEmail, password, options: { data: metadata } });
    data = signedUp.data;
    error = signedUp.error;
    needsConfirmation = !signedUp.data?.session;
  }
  if (error) throw authError(error.message);
  if (env.supabaseServiceRoleKey && data?.user?.id) {
    updateDisplayName(data.user.id, safeUsername, data.user.user_metadata).catch(() => {});
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
    needsConfirmation,
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
    updateDisplayName(result.data.user.id, safeUsername, result.data.user.user_metadata).catch(() => {});
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
    username: user.user_metadata?.username || user.user_metadata?.display_name || user.email,
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
  const username = user.user_metadata?.username || user.user_metadata?.display_name || user.email;
  await updateDisplayName(user.id, username, user.user_metadata);
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
  if (env.supabaseServiceRoleKey && env.resendApiKey) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: safeEmail,
      options: { redirectTo: passwordResetRedirectUrl() },
    });
    if (error) {
      if (/not found|does not exist/i.test(error.message || '')) return;
      throw authError(error.message);
    }
    await sendPasswordRecovery(safeEmail, data.properties.action_link);
    return;
  }
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

async function exportAccountData(userId) {
  const c = getClient();
  const progress = await c.from('watch_progress').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
  if (progress.error) throw new Error(progress.error.message);
  const watchlist = await c.from('watchlist').select('*').eq('user_id', userId).order('added_at', { ascending: false });
  if (watchlist.error) throw new Error(watchlist.error.message);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    watch_progress: (progress.data || []).map(({ user_id, id, ...item }) => item),
    watchlist: (watchlist.data || []).map(({ user_id, id, ...item }) => item),
  };
}

async function importAccountData(userId, backup = {}) {
  const progress = Array.isArray(backup.watch_progress) ? backup.watch_progress.slice(0, 1000) : [];
  const watchlist = Array.isArray(backup.watchlist) ? backup.watchlist.slice(0, 1000) : [];
  let importedProgress = 0;
  let importedWatchlist = 0;

  for (const item of progress) {
    await saveProgress(userId, {
      id: item.item_id || item.id,
      title: item.title || '',
      poster: item.poster || '',
      type: item.type || 'movie',
      season: item.season || 0,
      episode: item.episode || 0,
      duration: item.duration || 0,
      watched: item.watched || 0,
      status: item.status || 'watching',
    });
    importedProgress += 1;
  }

  for (const item of watchlist) {
    await addToWatchlist(userId, {
      id: item.item_id || item.id,
      title: item.title || '',
      poster: item.poster || '',
      type: item.type || 'movie',
    });
    importedWatchlist += 1;
  }

  return { importedProgress, importedWatchlist };
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

async function sendTransactionalEmail(message) {
  if (!env.resendApiKey) throw authError('RESEND_API_KEY or SMTP_PASS is not configured');
  if (!env.smtpFrom) throw authError('SMTP_FROM is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw authError(result.message || `Email delivery failed (${response.status})`);
  return result;
}

function escapeEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailCard({ heading, body, code, actionLabel, actionUrl, footer }) {
  const action = actionUrl
    ? `<a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;background:#9747ff;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;margin-top:8px">${escapeEmailHtml(actionLabel)}</a>`
    : '';
  const codeBlock = code
    ? `<div style="font-size:38px;font-weight:800;letter-spacing:10px;color:#9747ff;padding:20px 0">${escapeEmailHtml(code)}</div>`
    : '';
  return `<div style="background:#f4f4f5;padding:24px 12px;font-family:Arial,sans-serif">
    <div style="max-width:500px;margin:0 auto;background:#08070c;color:#ffffff;border-radius:14px;padding:32px 26px;box-sizing:border-box">
      <div style="color:#9747ff;font-size:23px;font-weight:800;margin-bottom:24px">web-streaming</div>
      <h2 style="color:#ffffff;font-size:20px;line-height:1.35;margin:0 0 16px">${escapeEmailHtml(heading)}</h2>
      <div style="color:#f5f3f7;font-size:15px;line-height:1.65">${body}</div>
      ${codeBlock}${action}
      <p style="color:#c6b8d7;font-size:13px;line-height:1.6;margin:28px 0 0">${escapeEmailHtml(footer)}</p>
    </div>
  </div>`;
}

async function sendSignupConfirmation(email, actionUrl) {
  await sendTransactionalEmail({
    from: env.smtpFrom,
    to: [email],
    subject: 'confirm your web-streaming email',
    text: `Hey! Confirm your web-streaming email.\n\nPlease use this link to confirm your email address and finish signing up:\n${actionUrl}\n\nIf you did not create this account, you can ignore this email.`,
    html: emailCard({
      heading: 'hey! confirm your web-streaming email!',
      body: '<p style="margin:0 0 16px">please click below to confirm this email address and finish signing up!</p>',
      actionLabel: 'confirm email',
      actionUrl,
      footer: 'if you did not create this account, you can safely ignore this email.',
    }),
  });
}

async function sendPasswordRecovery(email, actionUrl) {
  await sendTransactionalEmail({
    from: env.smtpFrom,
    to: [email],
    subject: 'reset your web-streaming password',
    text: `Forget your password? Silly billy!\n\nweb-streaming received a request to reset your password. Use this link:\n${actionUrl}\n\nIf you did not request this, you can safely ignore this email or secure your account if you think it has been accessed.`,
    html: emailCard({
      heading: 'forget your password? silly billy!',
      body: '<p style="margin:0 0 16px">web-streaming received a request to reset your password.</p><p style="margin:0 0 16px">next time don\'t forget it!!!! (i forget my password all the time...god i suck)</p>',
      actionLabel: 'click to reset password :3',
      actionUrl,
      footer: 'if you did not request this, you can safely ignore this email or secure your account if you think it has been accessed.',
    }),
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
  await sendTransactionalEmail({
    from: env.smtpFrom || env.smtpUser,
    to: [account.email],
    subject: 'your web-streaming code',
    text: `Your web-streaming code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: emailCard({
      heading: 'your web-streaming code',
      body: '<p style="margin:0">code below. it expires in 10 minutes.</p>',
      code,
      footer: 'if you did not request this, you can safely ignore this email.',
    }),
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

module.exports = { signUp, signIn, setSession, getAccount, updateEmail, sendPasswordReset, sendPasswordResetToEmail, updatePasswordFromReset, deleteAccount, exportAccountData, importAccountData, setup2fa, verify2faSetup, disable2fa, setup2faEmail, disable2faEmail, sendEmailOTP, verifyEmailOTP, getClient, saveProgress, getProgress, listProgress, addToWatchlist, removeFromWatchlist, getWatchlist, isInWatchlist };
