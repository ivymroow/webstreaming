async function getEmbeds(imdbId, tmdbId, season, episode) {
  const id = imdbId;
  const embeds = [];

  if (season && episode) {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}` });
    embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${id}&s=${season}&e=${episode}` });
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${id}&s=${season}&e=${episode}` });
  } else {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${id}` });
    embeds.push({ name: 'MultiEmbed', url: `https://multiembed.mov/?video_id=${id}` });
    embeds.push({ name: 'Smashy', url: `https://embed.smashystream.com/playere.php?imdb=${id}` });
  }

  return embeds.map((e, i) => ({ provider: e.name, embedUrl: e.url, hash: 'embed-' + i, quality: 'HD', fileIndex: 0 }));
}
module.exports = { getEmbeds };
