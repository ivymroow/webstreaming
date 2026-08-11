async function getEmbeds(imdbId, tmdbId, season, episode) {
  const embeds = [];

  if (season && episode) {
    if (tmdbId) {
      embeds.push({ name: 'VidSrc.to', url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` });
      if (anilistId) embeds.push({ name: 'VidPlus (Anime)', url: `https://player.vidplus.to/embed/anime/${anilistId}/${episode}` });
      embeds.push({ name: 'VidSrc.me', url: `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` });
      embeds.push({ name: 'VidLink', url: `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` });
    }
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` });
    embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdbId||imdbId}&tmdb=1&s=${season}&e=${episode}` });
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?${tmdbId?'tmdb='+tmdbId:'imdb='+imdbId}&s=${season}&e=${episode}` });
  } else {
    if (tmdbId) {
      embeds.push({ name: 'VidSrc.to', url: `https://vidsrc.to/embed/movie/${tmdbId}` });
      embeds.push({ name: 'VidSrc.me', url: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}` });
      embeds.push({ name: 'VidLink', url: `https://vidlink.pro/movie/${tmdbId}` });
    }
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${imdbId}` });
    embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${tmdbId||imdbId}&tmdb=1` });
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?${tmdbId?'tmdb='+tmdbId:'imdb='+imdbId}` });
  }

  return embeds.map((e, i) => ({ provider: e.name, embedUrl: e.url, hash: 'embed-' + i, quality: 'HD', fileIndex: 0 }));
}
module.exports = { getEmbeds };
