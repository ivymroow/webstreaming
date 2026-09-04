const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const env = require('./config/env');
const rateLimit = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errors');

const mediaRoutes = require('./routes/media');
const authRoutes = require('./routes/auth');
const progressRoutes = require('./routes/progress');
const watchlistRoutes = require('./routes/watchlist');

function createCorsOptions() {
  const devOrigins = ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080'];
  const allowedOrigins = new Set(env.isProduction ? env.corsOrigins : [...env.corsOrigins, ...devOrigins]);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
  };
}

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors(createCorsOptions()));
  app.use(cookieParser());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit);
  app.use(express.static(env.publicDir, { maxAge: env.isProduction ? '1h' : 0 }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: process.env.npm_package_version || 'dev' });
  });

  app.get('/privacy', (req, res) => {
    res.sendFile(path.join(env.publicDir, 'privacy.html'));
  });

  app.use('/api', mediaRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/watchlist', watchlistRoutes);

  app.get('*', (req, res) => {
    res.sendFile(path.join(env.publicDir, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
