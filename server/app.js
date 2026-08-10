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
  return {
    origin(origin, callback) {
      callback(null, true);
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
