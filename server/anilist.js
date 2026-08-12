const axios = require('axios');
const fs = require('fs');
const path = require('path');

const MAPPINGS_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json';
const CACHE_FILE = path.join(__dirname, 'anime-list.json');

let mappings = null;

async function loadMappings() {
  if (mappings) return mappings;
  if (fs.existsSync(CACHE_FILE)) {
    try { mappings = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); return mappings; } catch {}
  }
  try {
    const { data } = await axios.get(MAPPINGS_URL, { timeout: 15000 });
    mappings = data;
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data)); } catch {}
    return mappings;
  } catch { return []; }
}

async function getAniListId(tmdbId) {
  const list = await loadMappings();
  const numId = Number(tmdbId);
  for (const item of list) {
    if (!item.anilist_id) continue;
    const t = item.themoviedb_id;
    if (!t) continue;
    if (typeof t === 'object') {
      if (t.tv === numId) return String(item.anilist_id);
      if (Array.isArray(t.movie) && t.movie.includes(numId)) return String(item.anilist_id);
    }
  }
  return null;
}

module.exports = { getAniListId };
