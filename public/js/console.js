// Client console: Home, Approvals, Progress, Results, My Business. Plain language, session-cookie auth.
(() => {
  const $ = sel => document.querySelector(sel);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : Number(Number(n).toFixed(2)).toLocaleString();
  const when = ts => {
    const d = new Date(ts), today = new Date();
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
  const api = async (url, options = {}) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (res.status === 401) { showLogin(); throw new Error('Please sign in'); }
    const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  };
  const toast = message => {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.append(el);
    setTimeout(() => el.remove(), 3500);
  };
  const delta = (cur, prev, lowerIsBetter = false) => {
    if (!prev || cur === undefined) return '<div class="delta flat">no earlier data</div>';
    const pct = Math.round(((cur - prev) / prev) * 100);
    const good = lowerIsBetter ? pct <= 0 : pct >= 0;
    return `<div class="delta ${pct === 0 ? 'flat' : good ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct}% vs last week</div>`;
  };

  const state = { view: 'home', user: null, events: null };
  const main = () => $('#console-main');

  // ---------- auth ----------
  function showLogin(mustChange = false) {
    document.body.classList.add('console-mode'); document.body.classList.remove('inside-mode');
    $('#console').hidden = true; $('#login-screen').hidden = false;
    $('#login-form').hidden = mustChange; $('#password-form').hidden = !mustChange;
  }
  async function boot() {
    document.body.classList.add('console-mode');
    const session = await fetch('/api/core/auth/session', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { user: null }).catch(() => ({ user: null }));
    if (!session.user) return showLogin();
    state.user = session.user;
    if (session.mustChangePassword) return showLogin(true);
    $('#login-screen').hidden = true; $('#console').hidden = false;
    connectEvents();
    go(location.hash.slice(1) || 'home');
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('#login-error').textContent = '';
    try {
      await api('/api/core/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-user').value.trim(), password: $('#login-pass').value }) });
      $('#login-pass').value = '';
      boot();
    } catch (error) { $('#login-error').textContent = error.message; }
  });
  $('#password-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('#password-error').textContent = '';
    if ($('#new-pass').value !== $('#new-pass-2').value) { $('#password-error').textContent = 'The two new passwords do not match'; return; }
    try {
      await api('/api/core/auth/password', { method: 'POST', body: JSON.stringify({ current: $('#current-pass').value, next: $('#new-pass').value }) });
      toast('Password updated'); boot();
    } catch (error) { $('#password-error').textContent = error.message; }
  });
  $('#logout-btn').addEventListener('click', async () => { await fetch('/api/core/auth/logout', { method: 'POST', credentials: 'same-origin' }); state.events?.close(); showLogin(); });

  // ---------- navigation ----------
  document.querySelectorAll('.rail [data-view]').forEach(button => button.addEventListener('click', () => go(button.dataset.view)));
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== state.view) go(v); });
  function go(view) {
    if (view === 'inside') return enterInside();
    if (!VIEWS[view]) view = 'home';
    state.view = view;
    if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
    document.querySelectorAll('.rail [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    main().innerHTML = '<p class="empty">Loading…</p>';
    VIEWS[view]().catch(error => { main().innerHTML = `<p class="c-error">${esc(error.message)}</p>`; });
  }
  function enterInside() {
    document.body.classList.remove('console-mode'); document.body.classList.add('inside-mode');
    if (!window.HarnessApp) { window.HarnessApp = new MarketingHarnessApp(); window.HarnessApp.init(); }
    else window.HarnessApp.world3d?.onWindowResize();
  }
  $('#back-to-console').addEventListener('click', () => { document.body.classList.remove('inside-mode'); document.body.classList.add('console-mode'); go('home'); });

  function connectEvents() {
    state.events?.close();
    state.events = new EventSource('/api/events/stream');
    state.events.addEventListener('event', e => {
      const event = JSON.parse(e.data);
      if (['HITL_REQUIRED', 'HITL_RESOLVED', 'ADS_OPERATION_CHANGED'].includes(event.type)) {
        refreshBadge();
        if (['home', 'approvals'].includes(state.view)) go(state.view);
      }
    });
  }
  async function refreshBadge(count) {
    if (count === undefined) count = (await api('/api/console/approvals').catch(() => ({ items: [] }))).items.length;
    const badge = $('#approvals-badge'); badge.textContent = count; badge.hidden = !count;
  }

  // ---------- views ----------
  const VIEWS = {
    async home() {
      const d = await api('/api/console/home');
      refreshBadge(d.pending);
      const t = d.thisWeek, l = d.lastWeek;
      const cpl = t.spend && t.leads ? t.spend / t.leads : undefined, prevCpl = l.spend && l.leads ? l.spend / l.leads : undefined;
      const hour = new Date().getHours();
      main().innerHTML = `
        <h1 class="c-h1">Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${state.user ? `, ${esc(state.user.username)}` : ''}</h1>
        <p class="c-sub">Your week at a glance.</p>
        <div class="status-strip ${d.pending ? 'wait' : 'ok'}"><span class="dot"></span>${d.pending ? `${d.pending} ${d.pending === 1 ? 'thing needs' : 'things need'} your yes` : 'All good — nothing is waiting on you'}</div>
        <div class="c-grid">
          <div class="c-card c-kpi"><div class="label">Leads (last 7 days)</div><div class="value">${fmt(t.leads)}</div>${delta(t.leads, l.leads)}</div>
          <div class="c-card c-kpi"><div class="label">Ad spend</div><div class="value">${fmt(t.spend)}</div>${delta(t.spend, l.spend)}</div>
          <div class="c-card c-kpi"><div class="label">Cost per lead</div><div class="value">${fmt(cpl)}</div>${delta(cpl, prevCpl, true)}</div>
          <div class="c-card c-kpi"><div class="label">Website visits</div><div class="value">${fmt(t.sessions)}</div>${delta(t.sessions, l.sessions)}</div>
        </div>
        ${d.pending ? `<p style="margin-top:18px"><button class="c-btn primary" data-go="approvals">Review ${d.pending} ${d.pending === 1 ? 'thing that needs' : 'things that need'} you →</button></p>` : ''}
        <h2 class="c-h2">Next step</h2>
        <div class="c-card">${d.summary.nextMilestone ? `<strong>${esc(d.summary.nextMilestone.title)}</strong> <span class="pill">${d.summary.nextMilestone.owner === 'client' ? 'waiting on you' : 'we are on it'}</span>` : 'Every onboarding step is done.'}
          <div class="progress-bar"><div style="width:${d.summary.milestonePct}%"></div></div><span class="c-sub">${d.summary.milestonePct}% of the plan complete</span></div>
        <h2 class="c-h2">What we did while you were away</h2>
        <div class="c-card">${timeline(d.activity)}</div>`;
      main().querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    },

    async approvals() {
      const { items } = await api('/api/console/approvals');
      refreshBadge(items.length);
      main().innerHTML = `<h1 class="c-h1">Needs your yes</h1><p class="c-sub">Nothing is published or changed in your ad accounts until you say yes here.</p>
        ${items.length ? items.map(card).join('') : '<div class="c-card empty">Nothing is waiting on you. Nice.</div>'}`;
      main().querySelectorAll('[data-decide]').forEach(button => button.addEventListener('click', async () => {
        const wrap = button.closest('.approval');
        const feedback = wrap.querySelector('textarea')?.value.trim();
        wrap.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try {
          const r = await api(`/api/console/approvals/${wrap.dataset.kind}/${encodeURIComponent(wrap.dataset.id)}`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decide, feedback }) });
          toast(button.dataset.decide === 'yes' ? `Done (${String(r.status).toLowerCase().replace(/_/g, ' ')})` : 'Okay, not now');
          go('approvals');
        } catch (error) { toast(error.message); wrap.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
      }));
      function card(item) {
        const { imageBytes, ...details } = item.details?.change ?? {};
        const media = imageBytes ?? details.spec?.ad?.creative?.imageBytes;
        const image = media ? `<img alt="Image included in this creative approval" src="data:image/png;base64,${esc(media)}" style="max-width:100%;max-height:360px;object-fit:contain">` : '';
        const change = item.details?.change ? `${image}<div class="preview">${esc(JSON.stringify(details, (key, value) => key === 'imageBytes' ? '[image shown above]' : value, 2))}</div>` : '';
        return `<div class="c-card approval" data-kind="${esc(item.kind)}" data-id="${esc(item.id)}">
          <span class="pill wait">Ad change</span>
          <h3>${esc(item.title)}</h3><p>${esc(item.description)}</p>
          <div class="meta">Waiting since ${esc(when(item.createdAt))}</div>
          ${change}
          <textarea class="c-textarea" placeholder="Tell us why (optional) — we learn from this"></textarea>
          <div class="actions"><button class="c-btn primary" data-decide="yes">Yes, do it</button><button class="c-btn" data-decide="no">Not now</button></div>
        </div>`;
      }
    },

    async progress() {
      const { milestones, summary } = await api('/api/console/progress');
      main().innerHTML = `<h1 class="c-h1">Progress</h1><p class="c-sub">Where we are in getting your marketing running.</p>
        <div class="c-card"><strong>${summary.milestonePct}% complete</strong><div class="progress-bar"><div style="width:${summary.milestonePct}%"></div></div>
        ${milestones.map(m => `<div class="milestone ${m.status === 'done' ? 'done' : ''}"><span class="check">${m.status === 'done' ? '✓' : ''}</span>
          <div><div>${esc(m.title)}</div><div class="c-sub" style="margin:0;font-size:13px">${esc(m.phase)}${m.doneAt ? ` · done ${esc(when(m.doneAt))}` : m.due ? ` · due ${esc(m.due)}` : ''}</div></div>
          <span class="owner">${m.status === 'done' ? '' : m.owner === 'client' ? 'Waiting on you' : 'We are on it'}</span></div>`).join('')}</div>`;
    },

    async results() {
      const d = await api('/api/console/results');
      const weeks = new Map();
      for (const k of d.kpis) {
        if (k.channel !== 'all') continue;
        const date = new Date(k.date + 'T00:00:00'); date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        const key = date.toLocaleDateString('en-CA');
        const w = weeks.get(key) || { spend: 0, leads: 0 }; if (k.metric === 'spend' || k.metric === 'leads') w[k.metric] += k.value; weeks.set(key, w);
      }
      const series = [...weeks.entries()].sort();
      const channels = {};
      for (const k of d.kpis) {
        if (k.channel === 'all') continue;
        const c = channels[k.channel] || (channels[k.channel] = {}); c[k.metric] = (c[k.metric] || 0) + k.value;
      }
      main().innerHTML = `<h1 class="c-h1">Results</h1><p class="c-sub">Leads and spend over the last 12 weeks, as each platform reported them.</p>
        <div class="c-card">${series.length ? chart(series) : '<p class="empty">No numbers yet. The first daily snapshot appears the morning after your accounts are connected.</p>'}</div>
        <h2 class="c-h2">By channel (last 12 weeks)</h2>
        <div class="c-card table-wrap">${Object.keys(channels).length ? `<table class="c-table"><thead><tr><th>Channel</th><th>Spend</th><th>Leads / conversions</th><th>Cost per lead</th><th>Clicks</th><th>Visits</th></tr></thead><tbody>
          ${Object.entries(channels).map(([name, c]) => `<tr><td>${esc(name)}</td><td>${fmt(c.spend)}</td><td>${fmt(c.leads ?? c.conversions)}</td><td>${c.spend && c.leads ? fmt(c.spend / c.leads) : '—'}</td><td>${fmt(c.clicks)}</td><td>${fmt(c.sessions)}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">No channel data yet.</p>'}</div>
        <h2 class="c-h2">Reports</h2>
        <div class="c-card">${d.reports.length ? d.reports.map(r => `<div class="milestone"><div>${esc(r.kind === 'weekly' ? `Week of ${r.period}` : `Month ${r.period}`)}</div><span class="owner"><button class="c-btn ghost" data-report="${esc(r.id)}">Open / save as PDF</button></span></div>`).join('') : '<p class="empty">Your first weekly report arrives next Monday.</p>'}</div>`;
      main().querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => openReport(b.dataset.report)));
    },

    async business() {
      const { config } = await api('/api/business/config');
      const b = config.business || {}, brand = config.brand || {}, budget = config.marketing?.monthlyBudget || {};
      const lines = list => esc((list || []).join('\n'));
      main().innerHTML = `<h1 class="c-h1">My Business</h1><p class="c-sub">What we know about you. Changes apply to everything we write from now on.</p>
        <form id="biz-form" class="c-card">
          <div class="form-row"><label for="f-name">Business name</label><input class="c-input" id="f-name" value="${esc(b.name)}" required></div>
          <div class="form-row"><label for="f-website">Website</label><input class="c-input" id="f-website" value="${esc(b.website)}"></div>
          <div class="form-row"><label for="f-desc">What you do</label><textarea class="c-textarea" id="f-desc">${esc(b.description)}</textarea></div>
          <div class="form-row"><label for="f-voice">How we should sound</label><textarea class="c-textarea" id="f-voice">${esc(brand.voice)}</textarea></div>
          <div class="form-row"><label for="f-banned">Words and phrases we must never use</label><textarea class="c-textarea" id="f-banned">${lines(brand.bannedPhrases)}</textarea><div class="hint">One per line.</div></div>
          <div class="form-row"><label for="f-preferred">Phrases you like</label><textarea class="c-textarea" id="f-preferred">${lines(brand.preferredPhrases)}</textarea><div class="hint">One per line.</div></div>
          <div class="form-row"><label for="f-budget">Monthly marketing budget (${esc(budget.currency || '')})</label><input class="c-input" id="f-budget" type="number" min="0" step="1" value="${esc(budget.total ?? '')}"></div>
          <button class="c-btn primary" type="submit">Save changes</button> <span id="biz-msg" class="c-error"></span>
        </form>`;
      $('#biz-form').addEventListener('submit', async event => {
        event.preventDefault();
        const split = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
        const patch = {
          business: { name: $('#f-name').value.trim(), website: $('#f-website').value.trim(), description: $('#f-desc').value.trim() },
          brand: { voice: $('#f-voice').value.trim(), bannedPhrases: split('#f-banned'), preferredPhrases: split('#f-preferred') }
        };
        if ($('#f-budget').value !== '') patch.marketing = { monthlyBudget: { total: Number($('#f-budget').value) } };
        try { await api('/api/business/config', { method: 'PATCH', body: JSON.stringify(patch) }); toast('Saved'); $('#biz-msg').textContent = ''; }
        catch (error) { $('#biz-msg').textContent = error.message; }
      });
    },

    // Operator view: every MCP call (Claude, Codex, other clients) and scheduled harness job, with a verdict per output.
    async agent() {
      const f = state.agentFilter ||= { days: '7', client: '', tool: '', status: '', rated: '' };
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      const d = await api(`/api/console/agent?${qs}`);
      const s = d.stats, pct = (n, of) => of ? `${Math.round((n / of) * 100)}%` : '—';
      const opt = (key, values, label) => `<select data-filter="${key}" aria-label="${label}"><option value="">${label}: all</option>${values.map(v => `<option value="${esc(v)}" ${f[key] === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      main().innerHTML = `<h1 class="c-h1">Agent activity</h1>
        <p class="c-sub">What Claude, Codex and the harness's own scheduled jobs did through this system. Mark outputs useful or wrong; the weekly agent report lists what to fix.</p>
        <div class="filters">
          <select data-filter="days" aria-label="Period">${[1, 7, 30, 90].map(n => `<option value="${n}" ${f.days === String(n) ? 'selected' : ''}>Last ${n} day${n > 1 ? 's' : ''}</option>`).join('')}</select>
          ${opt('client', s.byClient.map(c => c.client), 'Source')}
          ${opt('tool', s.byTool.map(t => t.tool), 'Tool')}
          ${opt('status', ['ok', 'failed'], 'Status')}
          ${opt('rated', ['good', 'bad'], 'Rating')}
          <button class="c-btn ghost" id="agent-refresh">Refresh</button>
        </div>
        <div class="c-grid">
          <div class="c-card c-kpi"><div class="label">Calls</div><div class="value">${fmt(s.calls)}</div><div class="delta flat">${s.byClient.length} source(s)</div></div>
          <div class="c-card c-kpi"><div class="label">Failed</div><div class="value">${fmt(s.failed)}</div><div class="delta ${s.failed ? 'down' : 'flat'}">${pct(s.failed, s.calls)} of calls</div></div>
          <div class="c-card c-kpi"><div class="label">Rated useful</div><div class="value">${fmt(s.good)}</div><div class="delta flat">by you</div></div>
          <div class="c-card c-kpi"><div class="label">Rated wrong</div><div class="value">${fmt(s.bad)}</div><div class="delta ${s.bad ? 'down' : 'flat'}">to fix</div></div>
        </div>
        ${s.byDay.length ? `<h2 class="c-h2">Calls per day</h2><div class="c-card">${dayChart(s.byDay)}</div>` : ''}
        <h2 class="c-h2">By source</h2>
        <div class="c-card table-wrap">${s.byClient.length ? `<table class="c-table"><thead><tr><th>Source</th><th>Calls</th><th>Failed</th><th>Last seen</th></tr></thead><tbody>
          ${s.byClient.map(c => `<tr><td>${esc(c.client)}</td><td>${fmt(c.calls)}</td><td>${fmt(c.failed)}</td><td>${esc(when(c.lastTs))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No calls yet. Connect Claude Code or Codex to bin/mcp.js, or wait for the next scheduled job.</p>'}</div>
        <h2 class="c-h2">By tool</h2>
        <div class="c-card table-wrap">${s.byTool.length ? `<table class="c-table"><thead><tr><th>Tool</th><th>Calls</th><th>Failed</th><th>Avg time</th><th>Slowest</th><th>Useful</th><th>Wrong</th></tr></thead><tbody>
          ${s.byTool.map(t => `<tr><td class="mono">${esc(t.tool)}</td><td>${fmt(t.calls)}</td><td>${t.failed ? `<span class="pill bad">${fmt(t.failed)} (${pct(t.failed, t.calls)})</span>` : '0'}</td><td>${ms(t.avgMs)}</td><td>${ms(t.maxMs)}</td><td>${fmt(t.good)}</td><td>${fmt(t.bad)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nothing yet.</p>'}</div>
        ${s.topErrors.length ? `<h2 class="c-h2">Most common errors</h2><div class="c-card table-wrap"><table class="c-table"><thead><tr><th>Tool</th><th>Error</th><th>Times</th><th>Last</th></tr></thead><tbody>
          ${s.topErrors.map(e => `<tr><td class="mono">${esc(e.tool)}</td><td>${esc(e.error)}</td><td>${fmt(e.count)}</td><td>${esc(when(e.lastTs))}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <h2 class="c-h2">Calls <span class="c-sub" style="font-weight:400">newest first, up to 200; click one for the full input and output</span></h2>
        <div class="c-card table-wrap">${d.calls.length ? `<table class="c-table"><thead><tr><th>When</th><th>Source</th><th>Tool</th><th>Time</th><th>Result</th><th>Output</th></tr></thead><tbody>
          ${d.calls.map(c => `<tr class="call-row" data-call="${c.id}" tabindex="0"><td>${esc(when(c.ts))}</td><td>${esc(c.client)}</td><td class="mono">${esc(c.tool)}</td><td>${ms(c.durationMs)}</td>
            <td>${c.ok ? '<span class="pill ok">ok</span>' : '<span class="pill bad">failed</span>'}${c.rating === 1 ? ' 👍' : c.rating === -1 ? ' 👎' : ''}</td><td class="mono">${esc(c.ok ? c.output : c.error)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No calls match these filters.</p>'}</div>
        <h2 class="c-h2">Agent reports</h2>
        <div class="c-card"><p><button class="c-btn primary" id="agent-save">Save a report now</button> <span class="c-sub">One is also saved every Monday. It lists failures, outputs you marked wrong, and what to fix.</span></p>
          ${d.reports.length ? d.reports.map(r => `<div class="milestone"><div>Week ending ${esc(r.period)}</div><span class="owner"><button class="c-btn ghost" data-agent-report="${esc(r.id)}">Open</button></span></div>`).join('') : '<p class="empty">No saved reports yet.</p>'}
          <div id="agent-report-view"></div></div>`;
      main().querySelectorAll('[data-filter]').forEach(el => el.addEventListener('change', () => { f[el.dataset.filter] = el.value; go('agent'); }));
      $('#agent-refresh').addEventListener('click', () => go('agent'));
      $('#agent-save').addEventListener('click', async () => {
        const r = await api('/api/console/agent/report', { method: 'POST' });
        toast('Report saved'); await VIEWS.agent(); showAgentReport(r.report);
      });
      main().querySelectorAll('[data-agent-report]').forEach(b => b.addEventListener('click', async () => showAgentReport((await api(`/api/console/reports/${encodeURIComponent(b.dataset.agentReport)}`)).report)));
      main().querySelectorAll('.call-row').forEach(row => {
        row.addEventListener('click', () => toggleCall(row));
        row.addEventListener('keydown', e => { if (e.key === 'Enter') toggleCall(row); });
      });
    }
  };

  const ms = n => n === null || n === undefined ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
  const pretty = text => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text ?? ''; } };

  async function toggleCall(row) {
    const next = row.nextElementSibling;
    if (next?.classList.contains('call-detail')) { next.remove(); return; }
    const { call: c } = await api(`/api/console/agent/calls/${row.dataset.call}`);
    const tr = document.createElement('tr'); tr.className = 'call-detail';
    tr.innerHTML = `<td colspan="6"><strong>Input</strong><div class="preview">${esc(pretty(c.args))}</div>
      <strong style="display:block;margin-top:10px">${c.ok ? 'Output' : 'Error'}</strong><div class="preview">${esc(c.ok ? pretty(c.output) : c.error)}</div>
      <textarea class="c-textarea" aria-label="Note on this output" placeholder="What was wrong or right about this output? (optional)">${esc(c.note ?? '')}</textarea>
      <div class="actions"><button class="c-btn ${c.rating === 1 ? 'primary' : ''}" data-rate="1">👍 Useful</button> <button class="c-btn ${c.rating === -1 ? 'primary' : ''}" data-rate="-1">👎 Wrong</button> <button class="c-btn ghost" data-rate="null">Clear</button></div></td>`;
    row.after(tr);
    tr.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', async () => {
      await api(`/api/console/agent/calls/${c.id}/rating`, { method: 'POST', body: JSON.stringify({ rating: JSON.parse(b.dataset.rate), note: tr.querySelector('textarea').value.trim() }) });
      toast('Saved'); go('agent');
    }));
  }

  function showAgentReport(r) {
    const el = $('#agent-report-view'); if (!el || !r) return;
    el.innerHTML = `<h3 style="margin-top:16px">${esc(r.since)} to ${esc(r.until)}</h3><p>${esc(r.headline)}</p>
      <strong>What to fix</strong>${r.improvements.length ? `<ul class="improve">${r.improvements.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="empty">Nothing stands out.</p>'}
      ${r.flagged.length ? `<strong>Outputs you marked wrong</strong><ul class="improve">${r.flagged.map(x => `<li><span class="mono">${esc(x.tool)}</span> (${esc(x.client)}, ${esc(when(x.ts))}): ${esc(x.note || 'no note')}</li>`).join('')}</ul>` : ''}
      ${r.failures.length ? `<strong>Recent failures</strong><ul class="improve">${r.failures.map(x => `<li><span class="mono">${esc(x.tool)}</span> (${esc(x.client)}, ${esc(when(x.ts))}): ${esc(x.error)}</li>`).join('')}</ul>` : ''}`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function dayChart(days) {
    const W = 720, H = 180, P = 30, max = Math.max(1, ...days.map(d => d.calls)), step = (W - 2 * P) / days.length;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calls per day; the red part failed">${days.map((d, i) => {
      const x = P + i * step + step * 0.2, w = step * 0.6, h = (d.calls / max) * (H - 2 * P), fh = (d.failed / max) * (H - 2 * P);
      return `<rect x="${x}" y="${H - P - h}" width="${w}" height="${h}" fill="#a7f3d0" rx="3"><title>${esc(d.day)}: ${d.calls} calls</title></rect>${d.failed ? `<rect x="${x}" y="${H - P - fh}" width="${w}" height="${fh}" fill="#ef4444" rx="3"><title>${d.failed} failed</title></rect>` : ''}${i % Math.ceil(days.length / 8) === 0 ? `<text x="${x + w / 2}" y="${H - 10}" font-size="11" text-anchor="middle" fill="#64748b">${esc(d.day.slice(5))}</text>` : ''}`;
    }).join('')}</svg>`;
  }

  function timeline(items) {
    if (!items?.length) return '<p class="empty">Nothing yet. As soon as work starts it shows up here.</p>';
    return `<div class="timeline">${items.map(a => `<div class="timeline-item"><time>${esc(when(a.ts))}</time><div>${esc(a.summary)}<span class="who">${a.actor === 'client' ? 'you' : ''}</span></div></div>`).join('')}</div>`;
  }

  function chart(series) {
    const W = 720, H = 240, P = 36, maxSpend = Math.max(1, ...series.map(([, w]) => w.spend)), maxLeads = Math.max(1, ...series.map(([, w]) => w.leads));
    const step = (W - 2 * P) / series.length, x = i => P + i * step + step / 2;
    const bars = series.map(([, w], i) => { const h = (w.spend / maxSpend) * (H - 2 * P); return `<rect x="${x(i) - step * 0.3}" y="${H - P - h}" width="${step * 0.6}" height="${h}" fill="#e2e8f0" rx="4"><title>Spend ${fmt(w.spend)}</title></rect>`; }).join('');
    const pts = series.map(([, w], i) => `${x(i)},${H - P - (w.leads / maxLeads) * (H - 2 * P)}`).join(' ');
    const labels = series.map(([d], i) => i % Math.ceil(series.length / 6) === 0 ? `<text x="${x(i)}" y="${H - 10}" font-size="11" text-anchor="middle" fill="#64748b">${esc(d.slice(5))}</text>` : '').join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly leads (line) and spend (bars)">${bars}<polyline points="${pts}" fill="none" stroke="#10b981" stroke-width="3"/>${series.map(([, w], i) => `<circle cx="${x(i)}" cy="${H - P - (w.leads / maxLeads) * (H - 2 * P)}" r="4" fill="#10b981"><title>${fmt(w.leads)} leads</title></circle>`).join('')}${labels}
      <text x="${P}" y="16" font-size="12" fill="#10b981">● leads</text><text x="${P + 70}" y="16" font-size="12" fill="#94a3b8">■ spend</text></svg>`;
  }

  // The report is its own printable page (findings, next steps, campaigns); the session cookie authorises it.
  function openReport(id) { window.open(`/api/console/reports/${encodeURIComponent(id)}/html`, '_blank', 'noopener'); }

  window.addEventListener('DOMContentLoaded', boot);
})();
