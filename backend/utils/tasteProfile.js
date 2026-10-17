// Taste model behind getForYou: turns a user's library into weighted signals,
// per-feature weights and a one-line "why" per recommended movie. Pure, tested in services/chat/chat.test.js.

// Ratings are stored 1-10; the UI's 4-5 stars send 8/10 and 1-2 stars send 2/4.
const RATING_LIKE = 8;
const RATING_DISLIKE = 4;
const WEIGHT = { favorite: 2, watchlist: 0.3, dislike: -1 };
const RECENT_EXCLUDED = 10; // most recent views are not recommended again
const MAX_ACTORS = 5;
const DAY = 24 * 60 * 60 * 1000;
const REASON_PREFIX = { favorite: 'Vì bạn thích', rating: 'Vì bạn thích', history: 'Vì bạn đã xem' };

const slugOf = (x) => (x && typeof x === 'object' ? x.slug : x);
const slugsOf = (list) => [].concat(list ?? []).map(slugOf).filter(Boolean);
const peopleOf = (m) => [...(m.director || []), ...(m.actor || []).slice(0, MAX_ACTORS)].filter(Boolean);

/**
 * Rows are lean docs with movieId populated (disliked: populated movies).
 * @returns {{ signals: {movie, weight, kind}[], excludeIds: ObjectId[] }}
 */
function buildTasteSignals({ history = [], favorites = [], ratings = [], watchlist = [], disliked = [] }, now = Date.now()) {
  const signals = [];
  const excludeIds = [];
  const add = (movie, weight, kind) => movie && signals.push({ movie, weight, kind });
  const exclude = (movie) => movie && excludeIds.push(movie._id);

  history.forEach((h) => {
    // Recent, mostly finished views count more: e^(-days/30) x progress.
    const days = (now - new Date(h.lastWatchedAt).getTime()) / DAY;
    add(h.movieId, Math.exp(-days / 30) * Math.max(0.1, (h.progress || 0) / 100), 'history');
  });
  history.filter((h) => h.movieId).slice(0, RECENT_EXCLUDED).forEach((h) => exclude(h.movieId));
  favorites.forEach((f) => {
    add(f.movieId, WEIGHT.favorite, 'favorite');
    exclude(f.movieId);
  });
  watchlist.forEach((w) => add(w.movieId, WEIGHT.watchlist, 'watchlist'));
  ratings.forEach((r) => {
    if (r.rating >= RATING_LIKE) add(r.movieId, (r.rating - 6) / 2, 'rating'); // 8 -> 1, 10 -> 2
    else if (r.rating <= RATING_DISLIKE) add(r.movieId, WEIGHT.dislike, 'dislike');
    exclude(r.movieId); // rated = already seen
  });
  disliked.forEach((m) => {
    add(m, WEIGHT.dislike, 'dislike');
    exclude(m);
  });
  return { signals, excludeIds };
}

/** Summed weight per genre/director/actor/country; disliked movies pull theirs down. */
function tasteWeights(signals) {
  const taste = { genres: new Map(), directors: new Map(), actors: new Map(), countries: new Map(), genreNames: new Map() };
  const bump = (map, key, weight) => key && map.set(key, (map.get(key) || 0) + weight);
  signals.forEach(({ movie, weight }) => {
    [].concat(movie.categories ?? []).forEach((c) => {
      bump(taste.genres, slugOf(c), weight);
      if (c?.name) taste.genreNames.set(c.slug, c.name);
    });
    (movie.director || []).forEach((d) => bump(taste.directors, d, weight));
    (movie.actor || []).slice(0, MAX_ACTORS).forEach((a) => bump(taste.actors, a, weight));
    slugsOf(movie.country).forEach((c) => bump(taste.countries, c, weight));
  });
  // Titles a reason can cite, strongest first.
  taste.sources = signals.filter((s) => REASON_PREFIX[s.kind] && s.weight > 0).sort((a, b) => b.weight - a.weight);
  return taste;
}

/** Positive-weight keys, best first. */
const topKeys = (map, n) =>
  [...map].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key);

/**
 * "Vì bạn thích X" when a liked/watched title shares cast, crew or 2+ genres,
 * else the user's strongest genre among the movie's genres.
 */
function tasteReason(movie, taste) {
  const genres = slugsOf(movie.categories);
  const people = new Set(peopleOf(movie));
  const source = taste.sources.find(
    ({ movie: m }) =>
      String(m._id) !== String(movie._id) &&
      (peopleOf(m).some((p) => people.has(p)) || slugsOf(m.categories).filter((g) => genres.includes(g)).length >= 2),
  );
  if (source?.movie.name) return `${REASON_PREFIX[source.kind]} ${source.movie.name}`;
  const genre = topKeys(new Map(genres.map((g) => [g, taste.genres.get(g) || 0])), 1)[0];
  return genre ? `Cùng thể loại ${taste.genreNames.get(genre) || genre} bạn hay xem` : undefined;
}

module.exports = { buildTasteSignals, tasteWeights, topKeys, tasteReason };
