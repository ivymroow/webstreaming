const axios = require('axios');

const TMDB_KEY = process.env.TMDB_KEY || '64caa5119a1abe79e6a57a9069c03df5';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const http = axios.create({ timeout: 20000, headers: { 'User-Agent': 'web-streaming/1.0' } });

// Titles whose embed providers are known to redirect to the wrong show.
// Keys may be IMDb IDs (tt...) or TMDb IDs. Values are the user-facing reason.
const BLOCKED_EMBEDS = {
  'tt37692332': 'President Curtis is currently unavailable. Embed providers are temporarily redirecting to an incorrect show ("Our Cartoon President") due to indexing conflicts.',
  '296756': 'President Curtis is currently unavailable. Embed providers are temporarily redirecting to an incorrect show ("Our Cartoon President") due to indexing conflicts.',
};

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try { return await http.get(url); } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function posterUrl(path) {
  if (!path) return '';
  if (Array.isArray(path)) path = path[0] || '';
  if (typeof path === 'object') path = path.imageUrl || path.url || '';
  if (typeof path !== 'string') return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return TMDB_IMG + path;
  return path;
}

function isShow(qid) { return qid === 'tvSeries' || qid === 'tvMiniSeries' || qid === 'tvMovie'; }
function isMovie(qid) { return qid === 'movie' || qid === 'feature' || qid === 'tvMovie'; }

function cleanup(items) {
  const seen = new Set();
  return items.filter(i => { if (!i.id || seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 30);
}

async function search(query) {
  const q = encodeURIComponent(query.trim().replace(/\s+/g, ' '));
  const { data } = await fetchWithRetry(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json`);
  return (data.d || []).filter(i => i.id && i.l && i.id.startsWith('tt')).map(i => ({
    id: i.id, title: i.l, year: i.y || null,
    stars: i.s || '', poster: posterUrl(i.i),
    type: isShow(i.qid) ? 'tv' : 'movie',
  }));
}

async function details(id, titleHint, yearHint) {
  const result = { id, title: titleHint || '', year: yearHint || null, poster: '', overview: '', genres: [], runtime: null, cast: [], rating: null, type: 'movie' };
  try {
    const { data } = await http.get(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(titleHint || id)}.json`);
    const item = data?.d?.find(i => i.id === id) || data?.d?.[0];
    if (item && item.id !== id) {
      result.title = titleHint || result.title;
      result.poster = '';
      result.type = result.id.startsWith('tt') ? 'movie' : 'tv';
    } else if (item) {
      result.title = item.l || result.title;
      result.year = item.y || result.year;
      result.poster = posterUrl(item.i) || result.poster;
      result.cast = item.s ? item.s.split(', ').filter(Boolean).slice(0, 10) : [];
      result.type = isShow(item.qid) ? 'tv' : 'movie';
    }
  } catch {}
  if (result.title) {
    try {
      const wikiQ = `${result.title}${result.year ? ' ' + result.year : ''} film`;
      const { data: sr } = await http.get('https://en.wikipedia.org/w/api.php', {
        params: { action: 'query', list: 'search', srsearch: wikiQ, format: 'json', srlimit: 1 }, timeout: 5000,
      });
      const page = sr?.query?.search?.[0]?.title;
      if (page) {
        const { data: sm } = await http.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`, { timeout: 5000 });
        if (sm.extract) result.overview = sm.extract;
        if (!result.poster && sm.thumbnail?.source) result.poster = sm.thumbnail.source;
      }
    } catch {}
    try {
      const { data: found } = await http.get(`https://api.themoviedb.org/3/find/${id}`, {
        params: { api_key: TMDB_KEY, external_source: 'imdb_id' }, timeout: 8000,
      });
      const items = result.type === 'tv' ? (found.tv_results || []) : (found.movie_results || []);
      if (items.length) {
        const tmdbId = items[0].id;
        if (!result.poster && items[0].poster_path) result.poster = TMDB_IMG + items[0].poster_path;
        result._tmdbId = tmdbId;
        const relDate = items[0].release_date || items[0].first_air_date || '';
        if (relDate) {
          result.releaseDate = relDate;
          result.unreleased = new Date(relDate) > new Date();
        }
        const { data: credits } = await http.get(`https://api.themoviedb.org/3/${result.type === 'tv' ? 'tv' : 'movie'}/${tmdbId}/credits`, {
          params: { api_key: TMDB_KEY }, timeout: 8000,
        });
        const tmdbCast = (credits.cast || []).slice(0, 15).map(c => c.name);
        if (tmdbCast.length > result.cast.length) result.cast = tmdbCast;
      }
    } catch {}
  }
  const blockReason = BLOCKED_EMBEDS[result.id] || BLOCKED_EMBEDS[String(result._tmdbId)];
  if (blockReason) {
    result.unavailable = true;
    result.unavailableReason = blockReason;
  }
  return result;
}

function tmdbToItem(item, mediaType) {
  return {
    id: '',
    title: item.title || item.name || '',
    year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
    poster: posterUrl(item.poster_path),
    overview: item.overview || '',
    rating: item.vote_average || null,
    type: mediaType === 'tv' ? 'tv' : 'movie',
    _tmdbId: item.id,
  };
}

async function trending() {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}`, { timeout: 10000 });
    const items = (data.results || []).map(i => tmdbToItem(i, i.media_type));
    items.forEach(i => { i.id = 'tmdb-' + i._tmdbId; });
    return items.filter(i => i.poster && i.title).slice(0, 40);
  } catch (e) { console.error('trending failed:', e.message); return []; }
}

async function popularMovies() {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}`, { timeout: 10000 });
    const items = (data.results || []).map(i => tmdbToItem(i, 'movie'));
    items.forEach(i => { i.id = 'tmdb-' + i._tmdbId; });
    return items.filter(i => i.poster && i.title).slice(0, 30);
  } catch { return []; }
}

async function popularShows() {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}`, { timeout: 10000 });
    const items = (data.results || []).map(i => tmdbToItem(i, 'tv'));
    items.forEach(i => { i.id = 'tmdb-' + i._tmdbId; });
    return items.filter(i => i.poster && i.title).slice(0, 30);
  } catch { return []; }
}

module.exports = { search, details, trending, popularMovies, popularShows, TMDB_IMG, BLOCKED_EMBEDS };
