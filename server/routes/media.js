const express = require('express');
const metadata = require('../services/metadata');
const embeds = require('../embeds');
const { asyncHandler } = require('../middleware/errors');
const { requireQuery } = require('../middleware/validation');
const axios = require('axios');

const router = express.Router();
const TMDB_KEY = process.env.TMDB_KEY || '64caa5119a1abe79e6a57a9069c03df5';

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
  const { title, year } = req.query;
  if (id.startsWith('tmdb-')) {
    const tmdbId = id.replace('tmdb-', '');
    try {
      const { data: movie } = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`, { timeout: 8000 });
      if (movie) {
        const imdbId = movie.imdb_id || '';
        const { data: tv } = !imdbId ? await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`, { timeout: 8000 }).catch(() => ({})) : {};
        id = imdbId || (tv ? tv.imdb_id || id : id);
        res.json({
          id, title: movie.title || tv?.name || '', year: (movie.release_date || tv?.first_air_date || '').slice(0, 4),
          poster: movie.poster_path ? 'https://image.tmdb.org/t/p/w500' + movie.poster_path : '',
          overview: movie.overview || tv?.overview || '', rating: movie.vote_average || null,
          type: tv?.name ? 'tv' : 'movie', _tmdbId: tmdbId,
        });
        return;
      }
    } catch {}
  }
  try { res.json(await metadata.details(id, title, year)); }
  catch { res.json({ id, title: title || id, year: year || null, poster: '', overview: '', genres: [], runtime: null, cast: [], rating: null, type: id.startsWith('tt') ? 'movie' : 'tv' }); }
}));

router.get('/movie/:id/sources', asyncHandler(async (req, res) => {
  let id = req.params.id;
  if (id.startsWith('tmdb-')) {
    const tmdbId = id.replace('tmdb-', '');
    const imdb = await new Promise(resolve => {
      axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, { params: { api_key: TMDB_KEY }, timeout: 8000 })
        .then(r => resolve(r.data.imdb_id)).catch(() => resolve(null));
    });
    if (!imdb) {
      const tvImdb = await new Promise(resolve => {
        axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, { params: { api_key: TMDB_KEY }, timeout: 8000 })
          .then(r => resolve(r.data.imdb_id)).catch(() => resolve(null));
      });
      id = tvImdb || id;
    } else { id = imdb; }
  }
  res.json(await embeds.getEmbeds(id, id.replace('tmdb-', '')));
}));

router.get('/show/:id/episodes', asyncHandler(async (req, res) => {
  res.json(await metadata.getAllEpisodes(req.params.id, req.query.title));
}));

router.get('/show/:id/sources', asyncHandler(async (req, res) => {
  let id = req.params.id;
  const { season, episode } = req.query;
  if (!season || !episode) return res.json([]);
  if (id.startsWith('tmdb-')) {
    const tmdbId = id.replace('tmdb-', '');
    const imdb = await new Promise(resolve => {
      axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, { params: { api_key: TMDB_KEY }, timeout: 8000 })
        .then(r => resolve(r.data.imdb_id)).catch(() => resolve(null));
    });
    id = imdb || id;
  }
  res.json(await embeds.getEmbeds(id, null, Number(season), Number(episode)));
}));

module.exports = router;
