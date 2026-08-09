const axios = require('axios');

const http = axios.create({ timeout: 20000, headers: { 'User-Agent': 'web-streaming/1.0' } });

// Retry wrapper
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
        // Fetch full cast from Wikipedia
        const wikiCast = await getWikipediaCast(page);
        if (wikiCast.length > result.cast.length) result.cast = wikiCast;
      }
    } catch {}
  }

  return result;
}

async function getWikipediaCast(title) {
  try {
    const { data } = await http.get('https://en.wikipedia.org/w/api.php', {
      params: { action: 'parse', page: title, prop: 'text', section: 'Cast', format: 'json' },
      timeout: 8000,
    });
    const html = data?.parse?.text?.['*'] || '';
    if (!html) return [];
    // Extract actor names from cast list items
    const names = [];
    const liRegex = /<li>(.*?)<\/li>/g;
    let match;
    while ((match = liRegex.exec(html)) !== null) {
      let text = match[1].replace(/<[^>]+>/g, '').replace(/\s*as\s.*$/i, '').replace(/\[.*?\]/g, '').trim();
      if (text && text.length < 50 && !text.match(/^(Cast|and |also |with |featuring|guest|co-|starring)/i)) {
        names.push(text);
      }
    }
    return names.slice(0, 15);
  } catch { return []; }
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
  const queries = [
    'action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi', 'romance', 'animation',
    'adventure', 'crime', 'mystery', 'fantasy', 'documentary', 'new+movie', 'popular',
    'tv+series', 'netflix', 'marvel', 'war', 'western', 'musical', 'biography', 'family',
  ];
  // Pick 4 random queries each time for variety
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
