// Decode: scrape competitor ads (or read our own), watch every ad get sorted into a
// creative angle and plotted live. Items stream in over SSE ('decode' events) and are drained one at a time
// so a batch of ten lands as ten fly-ins, not one jump.
const TAGS = ['hook', 'setup', 'proof', 'payoff', 'offer', 'cta'];
const DOTS = ['#2f6fed', '#e2553f', '#1f9d6b', '#c58a00', '#8b5cf6', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#475569', '#9333ea', '#0d9488'];
const AXES = {
  ads: { x: 'days running', y: 'live variants' }
};
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

class DecodeView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.mode = 'ads';
    this.source = 'competitors';
    this.run = null;
    this.items = [];
    this.points = new Map();
    this.queue = [];
    this.pinned = null;
    this.selectedFormat = null;
    this.groupBy = 'format';
    this.shown = {};
    this.built = false;
  }

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  axes() {
    return this.run?.axes || AXES[this.run?.mode || this.mode];
  }

  fmt(n) {
    n = Number(n) || 0;
    return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n));
  }

  median(values) {
    const s = values.filter(Number.isFinite).sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  }

  $(id) { return this.container.querySelector(`[data-d="${id}"]`); }

  async show() {
    if (!this.built) this.build();
    await this.loadRuns();
  }

  build() {
    this.built = true;
    this.container.innerHTML = `
      <div class="decode">
        <div class="d-crumb">marketing operations · <span data-d="crumb">decode</span></div>
        <div class="d-head">
          <div>
            <h1 data-d="title">Decode competitor ads.</h1>
            <p data-d="lede">Scrape competitor ads or read your own, sort every one into a creative angle, and see which angles win, live.</p>
          </div>
          <form class="d-controls" data-d="form">
            <div class="d-seg" role="group" aria-label="Whose ads" data-d="source">
              <button type="button" data-source="competitors" class="on">Competitors</button>
              <button type="button" data-source="mine">My ads</button>
            </div>
            <input data-d="query" placeholder="brand, keyword or Ad Library URL" aria-label="What to decode" />
            <input data-d="limit" type="number" min="5" max="200" value="60" aria-label="How many items" title="How many items" />
            <select data-d="days" aria-label="Date range"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
            <label class="d-check"><input type="checkbox" data-d="transcribe" checked /> Transcribe videos</label>
            <button type="submit" class="d-go" data-d="go">Decode</button>
            <button type="button" class="d-stop" data-d="stop" hidden>❚❚ Stop</button>
            <select data-d="runs" aria-label="Previous runs"><option value="">Previous runs</option></select>
          </form>
        </div>
        <p class="d-error" data-d="error" hidden></p>

        <section class="d-kpis" aria-label="Run totals">
          <article class="dark"><span>items decoded</span><strong data-d="k-decoded">0</strong><em data-d="k-total"></em></article>
          <article><span data-d="k-who-label">creators</span><strong data-d="k-who">0</strong></article>
          <article><span>sorted into a format</span><strong data-d="k-sorted">0</strong><em data-d="k-formats"></em></article>
          <article><span data-d="k-median-label">median views</span><strong data-d="k-median">0</strong></article>
          <article class="lime"><span>ai cost · est</span><strong data-d="k-cost">$0.00</strong></article>
        </section>

        <div class="d-label">every item in the run, in one picture</div>
        <section class="d-band">
          <div class="d-top">
            <div class="d-mini"><span>top items</span><span data-d="top-by">by views</span></div>
            <div class="d-grid" data-d="grid"></div>
          </div>
          <div class="d-map">
            <div class="d-mini"><span>performance map</span><span data-d="status">idle</span></div>
            <div class="d-plot" data-d="plot">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line data-d="median-line" x1="0" x2="0" y1="0" y2="100" />
                <line data-d="trend" class="trend" x1="0" y1="100" x2="100" y2="0" />
              </svg>
              <span class="d-median-tag" data-d="median-tag"></span>
              <span class="d-axis x" data-d="axis-x">views →</span>
              <span class="d-axis y" data-d="axis-y">likes ↑</span>
              <div class="d-points" data-d="points"></div>
              <div class="d-empty" data-d="empty">Run a decode to fill the map.</div>
            </div>
            <div class="d-legend" data-d="legend"></div>
          </div>
          <aside class="d-inside" data-d="inside"><div class="d-mini"><span>inside the item</span></div><p class="d-muted">The newest decoded item shows here.</p></aside>
        </section>

        <section class="d-formats">
          <div class="d-formats-head">
            <div>
              <div class="d-label">follow the evidence</div>
              <h2 data-d="win-title">Which formats win?</h2>
              <div class="d-tabs" data-d="tabs">
                <button data-group="format" class="on">format</button><button data-group="handle">creator</button>
              </div>
            </div>
            <div class="d-side-stats">
              <div><span>matching items</span><strong data-d="match-count">—</strong></div>
              <div><span data-d="match-median-label">median views</span><strong data-d="match-median">—</strong></div>
            </div>
          </div>
          <ol class="d-rank" data-d="rank"></ol>
        </section>
      </div>`;

    this.container.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', () => { this.source = b.dataset.source; this.setMode(this.mode); }));
    this.$('form').addEventListener('submit', e => { e.preventDefault(); this.start(); });
    this.$('stop').addEventListener('click', () => this.run && fetch(`/api/decode/runs/${this.run.id}/stop`, { method: 'POST' }));
    this.$('runs').addEventListener('change', e => e.target.value && this.open(e.target.value));
    this.$('tabs').addEventListener('click', e => {
      if (!e.target.dataset.group) return;
      this.groupBy = e.target.dataset.group;
      this.selectedFormat = null;
      this.$('tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
      this.renderRank(); this.applyFilter();
    });
    this.$('points').addEventListener('click', e => {
      const id = e.target.closest('.dp')?.dataset.id;
      if (id) { this.pinned = id; this.spotlight(id); }
    });
    this.$('grid').addEventListener('click', e => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (id) { this.pinned = id; this.spotlight(id); }
    });
    this.$('rank').addEventListener('click', e => {
      const brief = e.target.closest('[data-brief]');
      if (brief) return this.brief(brief.dataset.brief, brief);
      const row = e.target.closest('[data-key]');
      if (!row) return;
      this.selectedFormat = this.selectedFormat === row.dataset.key ? null : row.dataset.key;
      this.renderRank(); this.applyFilter();
    });
    this.setMode('ads');
  }

  setMode(mode) {
    this.mode = mode;
    const mine = this.source === 'mine';
    this.container.querySelectorAll('[data-source]').forEach(b => b.classList.toggle('on', b.dataset.source === this.source));
    this.$('days').hidden = !mine;
    this.$('transcribe').parentElement.hidden = mine;
    this.$('query').placeholder = mine ? 'ad account id (blank = allowlisted)' : 'brand, keyword or Ad Library URL';
    this.$('crumb').textContent = `decode · ${mine ? 'my ads' : 'competitor ads'}`;
  }

  async loadRuns() {
    try {
      const { runs = [] } = await (await fetch('/api/decode/runs')).json();
      this.$('runs').innerHTML = '<option value="">Previous runs</option>' + runs.map(r =>
        `<option value="${this.esc(r.id)}">${this.esc(r.query)} · ${r.mode} · ${new Date(r.startedAt).toLocaleDateString()}</option>`).join('');
      const live = runs.find(r => ['scraping', 'decoding'].includes(r.status));
      if (!this.run && (live || runs[0])) await this.open((live || runs[0]).id);
    } catch (error) { this.error(`Could not load decode runs: ${error.message}`); }
  }

  async start() {
    this.error('');
    const mine = this.source === 'mine';
    const body = { mode: 'ads', query: this.$('query').value.trim(), limit: Number(this.$('limit').value) || 60, transcribe: this.$('transcribe').checked };
    if (mine) Object.assign(body, { platform: 'own_meta', days: Number(this.$('days').value) });
    else if (body.query.length < 2) return this.error('Enter a brand, keyword or Ad Library URL to decode.');
    const res = await fetch('/api/decode/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return this.error(data.error || `Decode failed (${res.status})`);
    this.reset(data.run);
    this.loadRuns();
  }

  async open(id) {
    const res = await fetch(`/api/decode/runs/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return this.error(data.error || 'Run not found');
    const { items = [], ...run } = data.run;
    this.reset(run);
    for (const item of items) this.add(item, { instant: true });
    this.afterAdd(items.length, run.costUsd, run.formats, true);
  }

  reset(run) {
    this.run = run; this.items = []; this.queue = []; this.pinned = null; this.selectedFormat = null;
    this.points.clear(); this.$('points').innerHTML = ''; this.$('grid').innerHTML = '';
    this.shown = {};
    this.source = run.platform === 'own_meta' ? 'mine' : 'competitors';
    this.setMode('ads');
    const axes = this.axes();
    const own = run.platform === 'own_meta';
    this.$('title').textContent = own ? 'Decode my ads.' : `Decode ${run.query}.`;
    this.$('lede').textContent = (own
      ? `Your Meta ads on ${run.query}, plotted by spend against ${axes.y}. Each ad is sorted into a creative angle; winners sit above the trend line.`
      : `Competitor ads from the Meta Ad Library. Each ad is sorted into a creative angle; days running is the proxy for "it works".`)
      + (run.transcriber ? ` Spoken words via ${run.transcriber}.` : '');
    this.$('axis-x').textContent = `${axes.x} →`;
    this.$('axis-y').textContent = `${axes.y} ↑`;
    this.$('k-who-label').textContent = own ? 'ads' : 'advertisers';
    this.$('k-median-label').textContent = this.$('match-median-label').textContent = `median ${axes.x}`;
    this.$('top-by').textContent = `by ${axes.x}`;
    this.$('win-title').textContent = 'Which angles win?';
    this.$('inside').innerHTML = '<div class="d-mini"><span>inside the item</span></div><p class="d-muted">The newest decoded item shows here.</p>';
    this.updateRun(run);
    this.renderRank();
  }

  onEvent(event) {
    if (!this.built || !this.run) return;
    if (event.type === 'run' && event.run.id === this.run.id) {
      this.updateRun(event.run);
      if (!['scraping', 'decoding'].includes(event.run.status)) this.loadRuns();
    }
    if (event.type === 'item' && event.runId === this.run.id) {
      this.queue.push(event);
      if (!this.draining) this.drain();
    }
  }

  drain() {
    const next = this.queue.shift();
    if (!next) { this.draining = false; return; }
    this.draining = true;
    this.run.formats = next.formats;
    this.run.transcribed = next.transcribed;
    this.add(next.item);
    this.afterAdd(next.decoded, next.costUsd, next.formats);
    setTimeout(() => this.drain(), this.queue.length > 20 ? 40 : 160);
  }

  statusText() {
    const run = this.run;
    const spoken = run.transcriber ? ` · ${run.transcribed || 0} transcribed` : '';
    return run.status === 'scraping' ? (run.platform === 'own_meta' ? 'reading ads…' : 'scraping…')
      : run.status === 'decoding' ? `decoding ${this.items.length} / ${run.total}${spoken}`
      : `${run.status} · ${this.items.length} items${spoken}`;
  }

  updateRun(run) {
    Object.assign(this.run, run);
    const live = ['scraping', 'decoding'].includes(run.status);
    this.$('go').hidden = live; this.$('stop').hidden = !live;
    this.$('k-total').textContent = run.total ? `/ ${run.total.toLocaleString()}` : '';
    this.$('status').textContent = this.statusText();
    this.$('status').classList.toggle('live', live);
    this.error(run.status === 'error' ? run.error : '');
  }

  add(item, { instant = false } = {}) {
    this.items.push(item);
    const el = document.createElement('button');
    el.className = 'dp';
    el.dataset.id = item.id;
    el.title = `${item.handle}: ${item.hook || item.text.slice(0, 80)}`;
    el.style.setProperty('--dot', this.dot(item.format));
    el.append(this.thumb(item));
    if (!instant) {
      // Fly in from the top-items grid on the left edge of the map.
      el.style.left = '-14%';
      el.style.top = `${20 + Math.random() * 50}%`;
      el.classList.add('incoming');
    }
    this.$('points').append(el);
    this.points.set(item.id, el);
    if (!instant) requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('incoming'); this.place(item); }));
  }

  afterAdd(decoded, costUsd, formats = [], instant = false) {
    const axes = this.axes();
    const items = this.items;
    this.count('k-decoded', decoded, v => Math.round(v).toLocaleString(), instant);
    this.count('k-who', new Set(items.map(i => i.handle)).size, v => Math.round(v), instant);
    this.count('k-sorted', items.filter(i => i.format).length, v => Math.round(v), instant);
    this.$('k-formats').textContent = `/ ${formats.length} format${formats.length === 1 ? '' : 's'}`;
    this.count('k-median', this.median(items.map(i => i.x)), v => this.fmt(v), instant);
    this.count('k-cost', costUsd, v => `$${v.toFixed(2)}`, instant);
    this.$('status').textContent = this.statusText();
    this.$('empty').hidden = items.length > 0;
    this.$('median-tag').textContent = `median ${axes.x} ${this.fmt(this.median(items.map(i => i.x)))}`;
    this.$('axis-x').textContent = `${axes.x} →`;
    this.$('axis-y').textContent = `${axes.y} ↑`;
    this.layout();
    this.renderGrid();
    this.renderLegend();
    this.renderRank();
    if (!this.pinned && items.length) this.spotlight(items[items.length - 1].id);
  }

  count(id, target, format, instant) {
    const el = this.$(id);
    const from = this.shown[id] ?? 0;
    this.shown[id] = target;
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = format(target); return; }
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / 450);
      el.textContent = format(from + (target - from) * (1 - (1 - p) ** 3));
      if (p < 1 && this.shown[id] === target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Log-log scale over the current data; rescaling moves every point (CSS transitions do the rest).
  scale() {
    // log(v + 1) keeps zero values and sub-1 metrics (ROAS, CTR %) on the chart.
    const lx = this.items.map(i => Math.log10(Math.max(0, i.x) + 1));
    const ly = this.items.map(i => Math.log10(Math.max(0, i.y) + 1));
    const pad = (lo, hi) => (hi - lo < 0.5 ? [lo - 0.25, hi + 0.25] : [lo - (hi - lo) * 0.06, hi + (hi - lo) * 0.06]);
    const [x0, x1] = pad(Math.min(...lx), Math.max(...lx));
    const [y0, y1] = pad(Math.min(...ly), Math.max(...ly));
    return {
      x: v => ((Math.log10(Math.max(0, v) + 1) - x0) / (x1 - x0)) * 100,
      y: v => 100 - ((Math.log10(Math.max(0, v) + 1) - y0) / (y1 - y0)) * 100,
      lx, ly, x0, x1, y0, y1
    };
  }

  layout() {
    if (!this.items.length) return;
    this.sc = this.scale();
    this.items.forEach(item => this.place(item));
    const order = this.items.length;
    this.items.forEach((item, i) => this.points.get(item.id)?.classList.toggle('old', order - i > 14));
    const m = this.sc.x(this.median(this.items.map(i => i.x)));
    const line = this.$('median-line');
    line.setAttribute('x1', m); line.setAttribute('x2', m);
    this.$('median-tag').style.left = `${m}%`;
    // Least-squares trend in log space.
    const { lx, ly } = this.sc;
    const n = lx.length, mx = lx.reduce((a, b) => a + b, 0) / n, my = ly.reduce((a, b) => a + b, 0) / n;
    const sxx = lx.reduce((a, v) => a + (v - mx) ** 2, 0);
    const slope = sxx ? lx.reduce((a, v, i) => a + (v - mx) * (ly[i] - my), 0) / sxx : 0;
    const yAt = lv => 100 - ((my + slope * (lv - mx) - this.sc.y0) / (this.sc.y1 - this.sc.y0)) * 100;
    const trend = this.$('trend');
    trend.setAttribute('x1', 0); trend.setAttribute('y1', yAt(this.sc.x0));
    trend.setAttribute('x2', 100); trend.setAttribute('y2', yAt(this.sc.x1));
    trend.style.display = n > 2 ? '' : 'none';
  }

  place(item) {
    const el = this.points.get(item.id);
    if (!el || !this.sc || el.classList.contains('incoming')) return;
    el.style.left = `${this.sc.x(item.x)}%`;
    el.style.top = `${this.sc.y(item.y)}%`;
  }

  thumb(item) {
    const fallback = () => Object.assign(document.createElement('span'), { className: 'd-noimg', textContent: (item.handle || '?')[0] });
    if (!item.thumb) return fallback();
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = item.thumb;
    img.onerror = () => img.replaceWith(fallback());
    return img;
  }

  dot(format) {
    const i = (this.run?.formats || []).findIndex(f => f.name === format);
    return i < 0 ? '#9a9a92' : DOTS[i % DOTS.length];
  }

  renderGrid() {
    const grid = this.$('grid');
    const top = [...this.items].sort((a, b) => b.x - a.x).slice(0, 24);
    if (grid.dataset.ids === top.map(i => i.id).join()) return;
    grid.dataset.ids = top.map(i => i.id).join();
    grid.replaceChildren(...top.map(item => {
      const cell = document.createElement('button');
      cell.dataset.id = item.id;
      cell.title = `${item.handle} · ${this.fmt(item.x)} ${this.axes().x}`;
      cell.append(this.thumb(item));
      return cell;
    }));
  }

  renderLegend() {
    const counts = this.groups('format');
    this.$('legend').innerHTML = counts.map(g =>
      `<span><i style="background:${this.dot(g.key)}"></i>${this.esc(g.key)} <b>${g.items.length}</b></span>`).join('');
  }

  groups(by) {
    const map = new Map();
    for (const item of this.items) {
      const key = by === 'format' ? item.format || 'no clear format' : `@${item.handle || 'unknown'}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items, median: this.median(items.map(i => i.x)) }))
      .sort((a, b) => b.median - a.median || b.items.length - a.items.length);
  }

  renderRank() {
    const groups = this.groups(this.groupBy);
    const overall = this.median(this.items.map(i => i.x)) || 1;
    const describe = name => this.run?.formats?.find(f => f.name === name)?.description || '';
    this.$('rank').innerHTML = groups.length ? groups.slice(0, 20).map(g => `
      <li data-key="${this.esc(g.key)}" class="${this.selectedFormat === g.key ? 'on' : ''}">
        <i style="background:${this.groupBy === 'format' ? this.dot(g.key) : '#1b1b18'}"></i>
        <div><strong>${this.esc(g.key)}</strong><p>${this.esc(this.groupBy === 'format' ? describe(g.key) : g.items[0]?.hook || '')}</p></div>
        <span class="d-mono">${g.items.length} · ${this.fmt(g.median)} · ${(g.median / overall).toFixed(1)}×</span>
        ${this.groupBy === 'format' && g.key !== 'no clear format' ? `<button class="d-brief" data-brief="${this.esc(g.key)}">Brief this →</button>` : ''}
      </li>`).join('') : '<li class="d-muted">Formats appear as items are decoded.</li>';
    const sel = groups.find(g => g.key === this.selectedFormat);
    this.$('match-count').textContent = sel ? sel.items.length : this.items.length || '—';
    this.$('match-median').textContent = this.items.length ? this.fmt(sel ? sel.median : overall) : '—';
  }

  applyFilter() {
    const key = this.selectedFormat;
    for (const item of this.items) {
      const k = this.groupBy === 'format' ? item.format || 'no clear format' : `@${item.handle || 'unknown'}`;
      this.points.get(item.id)?.classList.toggle('dim', !!key && k !== key);
    }
  }

  spotlight(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    this.points.forEach((el, key) => el.classList.toggle('spot', key === id));
    const overall = this.median(this.items.map(i => i.x)) || 1;
    const beats = item.beats || [];
    const total = beats.reduce((a, b) => a + b.text.length, 0) || 1;
    const own = item.platform === 'own_meta';
    const st = item.stats || {};
    const stats = own
      ? [['spend', this.fmt(st.spend)], ['ROAS', st.revenue ? `${st.roas}×` : '—'], ['leads', this.fmt(st.leads)], ['CTR', `${(st.ctr || 0).toFixed(2)}%`], ['impressions', this.fmt(st.impressions)], ['clicks', this.fmt(st.clicks)]]
      : [['days running', this.fmt(item.x)], ['live variants', this.fmt(item.y)]];
    const inside = this.$('inside');
    inside.innerHTML = `
      <div class="d-mini"><span>inside the ad</span><span>${this.items.indexOf(item) + 1} of ${this.items.length}</span></div>
      <div class="d-who">
        <div class="d-who-thumb"></div>
        <div><strong>${own ? '' : '@'}${this.esc(item.handle)}</strong>
          <span class="d-mono">${item.postedAt ? this.esc(item.postedAt.slice(0, 10)) : ''} · ${this.esc(item.platform.replace('_', ' '))}</span>
          ${item.format ? `<span class="d-fmt"><i style="background:${this.dot(item.format)}"></i>${this.esc(item.format)}</span>` : ''}
          <a href="${this.esc(item.url)}" target="_blank" rel="noopener noreferrer">${own ? 'open in Ads Manager' : 'original ad'} ↗</a></div>
      </div>
      <p class="d-hook">${this.esc(item.hook || item.text.slice(0, 140))}</p>
      <div class="d-stats">${stats.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
      <span class="d-pill">${(item.x / overall).toFixed(1)}× the median ${this.esc(this.axes().x)}</span>
      <div class="d-mini"><span>${item.transcript ? 'script' : 'ad copy'} anatomy</span>${item.transcript ? '<span>spoken + copy</span>' : ''}</div>
      <div class="d-anatomy">${beats.map(b => `<i class="t-${TAGS.includes(b.tag) ? b.tag : 'setup'}" style="flex:${b.text.length / total}"></i>`).join('')}</div>
      <ol class="d-beats">${beats.length ? beats.map(b => `<li><span class="d-mono t-${TAGS.includes(b.tag) ? b.tag : 'setup'}">${b.t != null ? `${clock(b.t)} · ` : ''}${this.esc(b.tag)}</span><p>${this.esc(b.text)}</p></li>`).join('') : `<li><p>${this.esc(item.text.slice(0, 400))}</p></li>`}</ol>`;
    inside.querySelector('.d-who-thumb').append(this.thumb(item));
  }

  async brief(format, button) {
    const examples = this.items.filter(i => i.format === format).sort((a, b) => b.x - a.x).slice(0, 5);
    const desc = this.run.formats.find(f => f.name === format)?.description || '';
    const text = [
        `Ad angle brief: ${format}`,
        `Decoded from ${this.run.platform === 'own_meta' ? `our Meta account ${this.run.query}` : `${this.run.query} (${this.run.platform.replace('_', ' ')})`}. ${desc}`,
        `Median ${this.axes().x}: ${this.fmt(this.median(examples.map(e => e.x)))} across ${this.items.filter(i => i.format === format).length} items.`,
        this.run.platform === 'own_meta' ? 'Our own best-performing ads in this angle:' : 'Reference hooks (other people\'s content: learn the structure, never copy):',
        ...examples.map(e => `- ${e.handle}: "${e.hook || e.text.slice(0, 120)}" (${e.url})`),
        'Write our own version for our audience and offer.'
      ].join('\n');
    try { await navigator.clipboard.writeText(text); button.textContent = 'Brief copied ✓'; }
    catch { button.textContent = 'Copy failed, retry'; }
  }

  error(message) {
    const el = this.$('error');
    el.hidden = !message;
    el.textContent = message || '';
  }
}

window.DecodeView = DecodeView;
