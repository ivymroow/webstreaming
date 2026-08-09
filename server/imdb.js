const axios = require('axios');

const TMDB_KEY = process.env.TMDB_KEY || '64caa5119a1abe79e6a57a9069c03df5';
const http = axios.create({ timeout: 20000, headers: { 'User-Agent': 'web-streaming/1.0' } });

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try { return await http.get(url); } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function posterUrl(i) {
  if (!i) return '';
  if (Array.isArray(i)) return i[0] || '';
  if (typeof i === 'object') return i.imageUrl || i.url || '';
  return '';
}

function isShow(qid) {
  return qid === 'tvSeries' || qid === 'tvMiniSeries' || qid === 'tvMovie';
}

function isMovie(qid) {
  return qid === 'movie' || qid === 'feature' || qid === 'tvMovie';
}

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
    if (item) {
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
        params: { action: 'query', list: 'search', srsearch: wikiQ, format: 'json', srlimit: 1 },
        timeout: 5000,
      });
      const page = sr?.query?.search?.[0]?.title;
      if (page) {
        const { data: sm } = await http.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`, { timeout: 5000 });
        if (sm.extract) result.overview = sm.extract;
        if (!result.poster && sm.thumbnail?.source) result.poster = sm.thumbnail.source;
      }
    } catch {}

    // Fetch full cast from TMDB
    try {
      const { data: found } = await http.get(`https://api.themoviedb.org/3/find/${id}`, {
        params: { api_key: TMDB_KEY, external_source: 'imdb_id' },
        timeout: 8000,
      });
      const items = result.type === 'tv' ? (found.tv_results || []) : (found.movie_results || []);
      if (items.length) {
        const tmdbId = items[0].id;
        const { data: credits } = await http.get(`https://api.themoviedb.org/3/${result.type === 'tv' ? 'tv' : 'movie'}/${tmdbId}/credits`, {
          params: { api_key: TMDB_KEY },
          timeout: 8000,
        });
        const tmdbCast = (credits.cast || []).slice(0, 15).map(c => c.name);
        if (tmdbCast.length > result.cast.length) result.cast = tmdbCast;
      }
    } catch {}
  }

  return result;
}

async function popularMovies() {
  const queries = ['2024+film', '2023+film', '2025+film', '2022+film'];
  const results = [];
  for (const q of queries) {
    try {
      const { data } = await fetchWithRetry(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json`);
      if (data?.d) for (const i of data.d) {
        if (i.id?.startsWith('tt') && i.l && posterUrl(i.i) && isMovie(i.qid)) {
          results.push({ id: i.id, title: i.l, year: i.y || null, stars: i.s || '', poster: posterUrl(i.i), type: 'movie' });
        }
      }
    } catch {}
  }
  return cleanup(results);
}

async function popularShows() {
  const queries = ['tv+series+2025', 'tv+series+2024', 'tv+series+2023', 'tv+drama', 'tv+comedy', 'tv+action'];
  const results = [];
  for (const q of queries) {
    try {
      const { data } = await http.get(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json`);
      if (data?.d) for (const i of data.d) {
        if (i.id?.startsWith('tt') && i.l && posterUrl(i.i) && isShow(i.qid)) {
          results.push({ id: i.id, title: i.l, year: i.y || null, stars: i.s || '', poster: posterUrl(i.i), type: 'tv' });
        }
      }
    } catch {}
  }
  return cleanup(results);
}

async function trending() {
  const queries = ['action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi', 'romance', 'animation', 'adventure', 'crime', 'mystery', 'fantasy', 'documentary', 'new+movie', 'popular', 'tv+series', 'netflix', 'marvel', 'war', 'western', 'musical', 'biography', 'family'];
  const picked = [...queries].sort(() => Math.random() - 0.5).slice(0, 4);
  const results = [];
  for (const q of picked) {
    try {
      const { data } = await fetchWithRetry(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`);
      if (data?.d) for (const i of data.d) {
        if (i.id?.startsWith('tt') && i.l && posterUrl(i.i) && i.y) {
          results.push({ id: i.id, title: i.l, year: i.y || null, stars: i.s || '', poster: posterUrl(i.i), type: isShow(i.qid) ? 'tv' : 'movie' });
        }
      }
    } catch {}
  }
  return cleanup(results).sort(() => Math.random() - 0.5);
}

module.exports = { search, details, trending, popularMovies, popularShows };
