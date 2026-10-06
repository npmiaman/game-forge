interface Meta { title: string; tagline?: string; controls?: string; color?: string; engine?: string; featured?: boolean }

const metas = import.meta.glob<Meta>('/games/*/game.json', { eager: true, import: 'default' });
const games = Object.entries(metas)
  .map(([path, meta]) => ({ slug: path.split('/')[2], ...meta }))
  .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.title.localeCompare(b.title));

const grid = document.getElementById('grid')!;
const esc = (s = '') => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
grid.innerHTML = games.length
  ? games.map((g) => `
    <a class="card" href="games/${g.slug}/" style="--c:${esc(g.color ?? '#33f0ff')}">
      <div class="badges">${g.featured ? '<span class="badge featured">featured</span>' : ''}<span class="badge">${esc(g.engine ?? 'web')}</span></div>
      <h2>${esc(g.title)}</h2>
      <p>${esc(g.tagline)}</p>
      <p class="controls">${esc(g.controls)}</p>
    </a>`).join('')
  : '<p class="empty">No games yet — run <code>npm run new -- my-game</code></p>';
