const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

function parseList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function originFrom(value) {
  if (!value) return '';
  const raw = value.startsWith('http') ? value : `https://${value}`;
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireEnv(name) {
  const value = process.env[name] || '';
  if (!value && isProduction) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name) {
  return process.env[name] || '';
}

const corsOrigins = [
  ...parseList(process.env.CORS_ORIGINS).map(originFrom),
  originFrom(process.env.PUBLIC_URL),
  originFrom(process.env.RAILWAY_PUBLIC_DOMAIN),
  originFrom(process.env.RAILWAY_STATIC_URL),
  'https://web-streaming.site',
  'https://www.web-streaming.site',
  'https://webtesting.up.railway.app',
].filter(Boolean);
const supabaseAnonKey = optionalEnv('SUPABASE_ANON_KEY') || optionalEnv('SUPABASE_KEY');
const supabaseServiceRoleKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: numberFromEnv('PORT', 8080),
  publicDir: path.join(__dirname, '..', '..', 'public'),
  corsOrigins,
  rateLimitWindowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: numberFromEnv('RATE_LIMIT_MAX', 180),
  streamIdleMs: numberFromEnv('STREAM_IDLE_MS', 10 * 60_000),
  streamCleanupIntervalMs: numberFromEnv('STREAM_CLEANUP_INTERVAL_MS', 60_000),
  maxActiveStreams: numberFromEnv('MAX_ACTIVE_STREAMS', 8),
  downloadTimeoutMs: numberFromEnv('DOWNLOAD_TIMEOUT_MS', 8 * 60_000),
  downloadRetentionMs: numberFromEnv('DOWNLOAD_RETENTION_MS', 15 * 60_000),
  ffmpegTimeoutMs: numberFromEnv('FFMPEG_TIMEOUT_MS', 30_000),
  supabaseUrl: requireEnv('SUPABASE_URL') || 'http://localhost',
  supabaseAnonKey: supabaseAnonKey || 'development-placeholder',
  supabaseServiceRoleKey,
  supabaseKey: supabaseServiceRoleKey || supabaseAnonKey || 'development-placeholder',
  tmdbKey: requireEnv('TMDB_KEY') || '',
  sessionSecret: requireEnv('SESSION_SECRET') || 'ws-local-dev-secret',
};

module.exports = env;
