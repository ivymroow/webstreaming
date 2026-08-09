async function getEmbeds(imdbId, tmdbId, season, episode) {
  const embeds = [];

  // 2Embed uses IMDb IDs directly
  if (season && episode) {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` });
  } else {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${imdbId}` });
  }

  // MultiEmbed uses tmdb-movie-{id} or imdb-movie-{id} format
  if (season && episode) {
    if (tmdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=tmdb-tv-${tmdbId}-${season}-${episode}` });
    if (imdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=imdb-tv-${imdbId}-${season}-${episode}` });
  } else {
    if (tmdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=tmdb-movie-${tmdbId}` });
    if (imdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=imdb-movie-${imdbId}` });
  }

  // Smashy uses IMDb IDs
  if (season && episode) {
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${imdbId}&s=${season}&e=${episode}` });
  } else {
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${imdbId}` });
  }

  return embeds.map((e, i) => ({ provider: e.name, embedUrl: e.url, hash: 'embed-' + i, quality: 'HD', fileIndex: 0 }));
}

module.exports = { getEmbeds };
