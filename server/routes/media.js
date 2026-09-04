const express = require('express');
const metadata = require('../services/metadata');
const embeds = require('../embeds');
const anilist = require('../anilist');
const { asyncHandler } = require('../middleware/errors');
const { requireQuery } = require('../middleware/validation');
const axios = require('axios');
const env = require('../config/env');

const router = express.Router();
const K = env.tmdbKey;
const VIDEO_URL_RE = /(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\.mp4|\.webm|\.mov|\.m4v)(?:[^\s"'<>\\]*)?|(?:\/|\.\/|\.\.\/)[^\s"'<>\\]+?(?:\.m3u8|\.mp4|\.webm|\.mov|\.m4v)(?:[^\s"'<>\\]*)?/gi;
const SCRIPT_URL_RE = /(?:src|href)=["']([^"']+)["']|["']((?:https?:)?\/\/[^"']+?\.js(?:[?#][^"']*)?|(?:\/|\.\/|\.\.\/)[^"']+?\.js(?:[?#][^"']*)?)["']/gi;

function safeRemoteUrl(raw) {
  const url = new URL(String(raw || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid media URL');
  return url.href;
}

function mediaKind(url, contentType = '') {
  if (/\.m3u8(?:$|[?#])/i.test(url) || /mpegurl/i.test(contentType)) return 'HLS';
  const match = url.match(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i);
  return match ? match[1].toUpperCase() : 'VIDEO';
}

function cleanFoundUrl(raw, base) {
  try {
    const cleaned = String(raw || '')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .replace(/[),.;]+$/g, '');
    return new URL(cleaned, base).href;
  } catch {
    return null;
  }
}

async function fetchText(url, referer) {
  const response = await axios.get(url, {
    timeout: 12000,
    maxContentLength: 3 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml,application/json,text/plain,*/*',
      Referer: referer || url,
    },
    validateStatus: status => status >= 200 && status < 400,
  });
  return {
    text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data || ''),
    contentType: response.headers['content-type'] || '',
  };
}

function collectMedia(text, base, referer, seen, items) {
  for (const match of text.matchAll(VIDEO_URL_RE)) {
    const url = cleanFoundUrl(match[0], base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({ url, type: mediaKind(url), source: 'embed', referer });
  }
}

router.get('/status', (req, res) => {
  res.json({
    mode: 'backend',
    services: {
      tmdb: Boolean(K),
      supabase: Boolean(env.supabaseAnonKey && env.supabaseUrl),
      supabaseAdmin: Boolean(env.supabaseServiceRoleKey),
    },
  });
});

router.get('/search', requireQuery('q'), asyncHandler(async (req, res) => {
  res.json(await metadata.search(req.query.q.trim()));
}));

router.get('/trending', asyncHandler(async (req, res) => {
  res.json(await metadata.trending());
}));

router.get('/popular', asyncHandler(async (req, res) => {
  const results = req.query.type === 'tv' ? await metadata.popularShows() : await metadata.popularMovies();
  res.json(results);
}));

router.get('/sniff-media', requireQuery('url'), asyncHandler(async (req, res) => {
  const target = safeRemoteUrl(req.query.url);
  const { text, contentType } = await fetchText(target, req.query.referer);
  if (/video|mpegurl/i.test(contentType) || /\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])/i.test(target)) {
    res.json([{ url: target, type: mediaKind(target, contentType), source: 'embed', referer: req.query.referer || target }]);
    return;
  }
  const seen = new Set();
  const items = [];
  const scripts = [];
  collectMedia(text, target, target, seen, items);
  for (const match of text.matchAll(SCRIPT_URL_RE)) {
    const url = cleanFoundUrl(match[1] || match[2], target);
    if (url && scripts.length < 12 && !scripts.includes(url)) scripts.push(url);
  }
  for (const scriptUrl of scripts) {
    try {
      const script = await fetchText(scriptUrl, target);
      collectMedia(script.text, scriptUrl, target, seen, items);
    } catch {}
  }
  res.json(items.slice(0, 50));
}));

router.get('/media-proxy', requireQuery('url'), asyncHandler(async (req, res) => {
  const target = safeRemoteUrl(req.query.url);
  const referer = req.query.referer ? safeRemoteUrl(req.query.referer) : target;
  const response = await axios.get(target, {
    timeout: 30000,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: '*/*',
      Referer: referer,
      ...(req.headers.range ? { Range: req.headers.range } : {}),
    },
    validateStatus: status => status >= 200 && status < 400,
  });
  const contentType = response.headers['content-type'];
  const contentLength = response.headers['content-length'];
  const contentRange = response.headers['content-range'];
  if (contentType) res.set('Content-Type', contentType);
  if (contentLength) res.set('Content-Length', contentLength);
  if (contentRange) res.set('Content-Range', contentRange);
  if (response.status === 206) res.status(206);
  response.data.pipe(res);
}));

router.get('/movie/:id', asyncHandler(async (req, res) => {
  let { id } = req.params;
  const { title, year, type } = req.query;
  if (id.startsWith('tmdb-')) {
    const tmdbId = id.replace('tmdb-', '');
    const isTv = type === 'tv';
    try {
      const ep = isTv ? 'tv' : 'movie';
      const { data: info } = await axios.get(`https://api.themoviedb.org/3/${ep}/${tmdbId}?api_key=${K}`, { timeout: 8000 });
      if (info) {
        let imdbId = info.imdb_id;
        if (!imdbId) {
          try { const ext = await axios.get(`https://api.themoviedb.org/3/${ep}/${tmdbId}/external_ids?api_key=${K}`, { timeout: 8000 }); imdbId = ext.data.imdb_id; } catch {}
        }
        const relDate = info.release_date || info.first_air_date || '';
        const isFuture = relDate ? new Date(relDate) > new Date() : false;
        res.json({
          id: imdbId || id, title: info.title || info.name || '', year: relDate.slice(0, 4),
          poster: info.poster_path ? 'https://image.tmdb.org/t/p/w500' + info.poster_path : '',
          overview: info.overview || '', rating: info.vote_average || null,
          type: isTv ? 'tv' : 'movie', _tmdbId: tmdbId,
          unreleased: isFuture,
          releaseDate: relDate,
        });
        return;
      }
    } catch {}
  }
  try { res.json(await metadata.details(id, title, year)); }
  catch { res.json({ id, title: title || id, year: year || null, poster: '', overview: '', genres: [], runtime: null, cast: [], rating: null, type: id.startsWith('tt') ? 'movie' : 'tv' }); }
}));

async function convertTmdb(tmdb, type) {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdb}/external_ids?api_key=${K}`, { timeout: 8000 });
    return data.imdb_id || null;
  } catch { return null; }
}

async function convertImdbToTmdb(imdb, type) {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/find/${imdb}?api_key=${K}&external_source=imdb_id`, { timeout: 8000 });
    const items = type === 'tv' ? (data.tv_results || []) : (data.movie_results || []);
    return items.length ? String(items[0].id) : null;
  } catch { return null; }
}


router.get('/movie/:id/sources', asyncHandler(async (req, res) => {
  let id = req.params.id, tmdb = null;
  if (id.startsWith('tmdb-')) {
    tmdb = id.replace('tmdb-', '');
    id = await convertTmdb(tmdb, 'movie') || await convertTmdb(tmdb, 'tv') || id;
  } else if (id.startsWith('tt')) {
    tmdb = await convertImdbToTmdb(id, 'movie') || await convertImdbToTmdb(id, 'tv');
  }
  res.json(await embeds.getEmbeds(id, tmdb));
}));

router.get('/show/:id/episodes', asyncHandler(async (req, res) => {
  res.json(await metadata.getAllEpisodes(req.params.id, req.query.title));
}));

router.get('/show/:id/sources', asyncHandler(async (req, res) => {
  let id = req.params.id, tmdb = null, aniId = null;
  const { season, episode } = req.query;
  if (!season || !episode) return res.json([]);
  if (id.startsWith('tmdb-')) {
    tmdb = id.replace('tmdb-', '');
    aniId = await anilist.getAniListId(tmdb);
    id = await convertTmdb(tmdb, 'tv') || id;
  } else if (id.startsWith('tt')) {
    tmdb = await convertImdbToTmdb(id, 'tv');
    if (tmdb) aniId = await anilist.getAniListId(tmdb);
  }
  res.json(await embeds.getEmbeds(id, tmdb, Number(season), Number(episode), aniId));
}));

module.exports = router;
