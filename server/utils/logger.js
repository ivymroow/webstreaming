const env = require('../config/env');

function write(level, message, meta) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  };

  if (env.isProduction) {
    console.log(JSON.stringify(payload));
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${payload.time}] ${level.toUpperCase()} ${message}${suffix}`);
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
