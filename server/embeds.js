async function getEmbeds(imdbId, tmdbId, season, episode, anilistId) {
  const embeds = [];
  const isEpisode = typeof season === 'number' && typeof episode === 'number';
  const isSpecial = isEpisode && season === 0;
  // VidSrc.to is known to redirect to the wrong show for these titles.
  const vidSrcBlocked = new Set(['tt37692332', '296756']);
  const vidSrcBad = vidSrcBlocked.has(imdbId) || vidSrcBlocked.has(tmdbId);

  if (isEpisode) {
    if (isSpecial && !tmdbId) return [];

    if (tmdbId) {
      if (!vidSrcBad) embeds.push({ name: 'VidSrc.to', url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` });
      embeds.push({ name: 'VidLink', url: `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` });
      embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}` });
      embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&s=${season}&e=${episode}` });
    }

    if (!isSpecial) {
      embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` });
      if (!tmdbId) {
        embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${imdbId}&s=${season}&e=${episode}` });
        embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${imdbId}&s=${season}&e=${episode}` });
      }
    }
  } else {
    if (tmdbId) {
      if (!vidSrcBad) embeds.push({ name: 'VidSrc.to', url: `https://vidsrc.to/embed/movie/${tmdbId}` });
      embeds.push({ name: 'VidLink', url: `https://vidlink.pro/movie/${tmdbId}` });
    }
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${imdbId}` });
    embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdbId||imdbId}&tmdb=1` });
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?${tmdbId?'tmdb='+tmdbId:'imdb='+imdbId}` });
  }

  return embeds.map((e, i) => ({
    provider: e.name,
    embedUrl: e.url,
    hash: ['embed', season ?? 'movie', episode ?? 'movie', i].join('-'),
    quality: 'HD',
    fileIndex: 0,
  }));
}
module.exports = { getEmbeds };
