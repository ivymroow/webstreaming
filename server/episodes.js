const axios = require('axios');
const cache = require('./cache');

const api = axios.create({ timeout: 10000 });
const TMDB_KEY = process.env.TMDB_KEY || '64caa5119a1abe79e6a57a9069c03df5';

async function lookupByIMDB(imdbId, titleHint) {
  const key = `tvmaze:lookup:${imdbId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`);
    cache.set(key, data, 'tmdb');
    return data;
  } catch {}

  // Fallback: search by title
  if (titleHint) {
    try {
      const { data: results } = await api.get(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(titleHint)}`);
      const match = results?.find(r => r.show?.externals?.imdb === imdbId) || results?.[0];
      if (match?.show) {
        cache.set(key, match.show, 'tmdb');
        return match.show;
      }
    } catch {}
  }

  return null;
}

async function getSeasons(imdbId, titleHint) {
  const show = await lookupByIMDB(imdbId, titleHint);
  if (!show) return [];

  const key = `tvmaze:seasons:${show.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/seasons`);
    const seasons = data.map(s => ({
      id: s.id, number: s.number, episodeCount: s.episodeOrder || 0,
      premiereDate: s.premiereDate || '', endDate: s.endDate || '',
    }));
    cache.set(key, seasons, 'tmdb');
    return seasons;
  } catch { return []; }
}

async function getEpisodes(imdbId, seasonNumber, titleHint) {
  const show = await lookupByIMDB(imdbId, titleHint);
  if (!show) return [];

  const key = `tvmaze:episodes:${show.id}:${seasonNumber}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/episodes`);
    const now = new Date();
    const episodes = data
      .filter(e => e.season === seasonNumber && (!e.airdate || new Date(e.airdate) <= now))
      .sort((a, b) => a.number - b.number)
      .map(e => ({
        id: e.id, number: e.number, name: e.name || `Episode ${e.number}`,
        summary: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
        airdate: e.airdate || '',
        runtime: e.runtime || null,
        image: e.image?.medium || '',
      }));
    cache.set(key, episodes, 'tmdb');
    return episodes;
  } catch { return []; }
}

async function getTmdbId(id) {
  if (!id) return null;
  if (String(id).startsWith('tmdb-')) return String(id).replace('tmdb-', '');
  if (!String(id).startsWith('tt')) return null;
  const imdbId = id;
  const key = `tmdb:find:${imdbId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const { data } = await api.get(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const items = data.tv_results || [];
    const id = items.length ? String(items[0].id) : null;
    if (id) cache.set(key, id, 'tmdb');
    return id;
  } catch { return null; }
}

async function getSpecials(imdbId) {
  const tmdbId = await getTmdbId(imdbId);
  if (!tmdbId) return [];
  const key = `tmdb:specials:${tmdbId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const { data } = await api.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/0?api_key=${TMDB_KEY}`);
    const now = new Date();
    const specials = (data.episodes || [])
      .filter(e => !e.air_date || new Date(e.air_date) <= now)
      .sort((a, b) => a.episode_number - b.episode_number)
      .map(e => ({
        id: 'tmdb-' + e.id, number: e.episode_number, name: e.name || `Special ${e.episode_number}`,
        summary: (e.overview || '').trim(),
        airdate: e.air_date || '',
        runtime: e.runtime || null,
        image: e.still_path ? 'https://image.tmdb.org/t/p/w300' + e.still_path : '',
      }));
    cache.set(key, specials, 'tmdb');
    return specials;
  } catch { return []; }
}

function isPlayableSpecial(item) {
  const name = normalizeEpisode(item);
  const summary = (item.summary || '').toLowerCase();
  const text = `${name} ${summary}`;
  const blocked = [
    'behind the scenes',
    'making of',
    'music video',
    'trailer',
    'teaser',
    'promo',
    'preview',
    'recap',
    'sneak peek',
    'featurette',
    'interview',
    'deleted scene',
    'blooper',
    'gag reel',
  ];
  return !blocked.some(term => text.includes(term));
}

function normalizeEpisode(item) {
  return (item.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mergeSpecials(primary, fallback) {
  const seen = new Set();
  const merged = [];

  for (const item of [...primary, ...fallback]) {
    if (!isPlayableSpecial(item)) continue;
    const key = `${normalizeEpisode(item)}:${item.airdate || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.sort((a, b) => {
    const dateA = a.airdate ? new Date(a.airdate).getTime() : 0;
    const dateB = b.airdate ? new Date(b.airdate).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;
    return (a.number || 0) - (b.number || 0);
  });
}

async function getAllEpisodes(imdbId, titleHint) {
  const tmdbSpecials = await getSpecials(imdbId);
  const show = await lookupByIMDB(imdbId, titleHint);

  let groups = [];
  let tvmazeSpecials = [];
  if (show) {
    const key = `tvmaze:episodes:all:v2:${show.id}`;
    const cached = cache.get(key);
    if (cached) {
      groups = cached;
    } else {
      try {
        const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/episodes`);
        const now = new Date();
        const grouped = {};
        for (const e of data) {
          const s = e.season == null ? 1 : e.season;
          if (s === 0) {
            tvmazeSpecials.push({
              id: e.id, number: e.number, name: e.name || `Special ${e.number}`,
              summary: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
              airdate: e.airdate || '', runtime: e.runtime || null,
              image: e.image?.medium || '',
            });
            continue;
          }
          if (!grouped[s]) grouped[s] = [];
          grouped[s].push({
            id: e.id, number: e.number, name: e.name || `Episode ${e.number}`,
            summary: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
            airdate: e.airdate || '', runtime: e.runtime || null,
            image: e.image?.medium || '',
          });
        }

        groups = Object.entries(grouped)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .filter(([_, eps]) => eps.length > 0)
          .map(([season, eps]) => ({
            season: parseInt(season),
            episodes: eps.sort((a, b) => a.number - b.number),
          }))
          .filter(s => s.episodes.some(e => !e.airdate || new Date(e.airdate) <= now));

        cache.set(key, groups, 'tmdb');
      } catch { groups = []; }
    }
  }

  const specials = mergeSpecials(tmdbSpecials, tvmazeSpecials);
  if (specials.length) groups.push({ season: 0, episodes: specials });
  return groups;
}

module.exports = { lookupByIMDB, getSeasons, getEpisodes, getAllEpisodes };
