const createApp = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

process.on('uncaughtException', err => {
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE') || err.message?.includes('write after end') || err.message?.includes('destroy')) return;
  logger.error('Uncaught exception', { error: err.message });
  process.exitCode = 1;
});

process.on('unhandledRejection', err => {
  if (err?.code === 'EPIPE' || err?.message?.includes('EPIPE') || err?.message?.includes('write after end')) return;
  logger.error('Unhandled rejection', { error: err?.message || String(err) });
});

const app = createApp();
const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info(`WebStreaming listening on ${env.port}`, { env: env.nodeEnv });
  if (env.isProduction) {
    const http = require('http');
    setInterval(() => {
      http.get(`http://localhost:${env.port}/health`, res => {
        logger.debug(`keepalive ping: ${res.statusCode}`);
        res.resume();
      }).on('error', err => logger.debug(`keepalive ping failed: ${err.message}`));
    }, 5 * 60 * 1000).unref();
  }
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
