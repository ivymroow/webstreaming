const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

function parseList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireEnv(name) {
  return process.env[name] || '';
}

function optionalEnv(name) {
  return process.env[name] || '';
}

const supabaseKey = optionalEnv('SUPABASE_SERVICE_ROLE_KEY') || optionalEnv('SUPABASE_KEY');
const corsOrigins = parseList(process.env.CORS_ORIGINS);

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
  supabaseKey: supabaseKey || 'development-placeholder',
};

module.exports = env;
