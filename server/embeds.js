async function getEmbeds(imdbId, tmdbId, season, episode) {
  const embeds = [];
  const isRealImdb = imdbId && imdbId.startsWith('tt');

  if (season && episode) {
    if (isRealImdb) embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` });
    if (tmdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=tmdb-tv-${tmdbId}-${season}-${episode}` });
    if (isRealImdb) embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${imdbId}&s=${season}&e=${episode}` });
  } else {
    if (isRealImdb) embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${imdbId}` });
    if (tmdbId) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=tmdb-movie-${tmdbId}` });
    else if (isRealImdb) embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=imdb-movie-${imdbId}` });
    if (isRealImdb) embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${imdbId}` });
  }

  return embeds.map((e, i) => ({ provider: e.name, embedUrl: e.url, hash: 'embed-' + i, quality: 'HD', fileIndex: 0 }));
}

module.exports = { getEmbeds };
