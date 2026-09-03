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

router.get('/status', (req, res) => { res.json({ mode: 'backend' }); });

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
