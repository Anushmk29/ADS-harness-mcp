class OverviewView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  money(value) {
    return Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString('en-IN')}` : '—';
  }

  render(data, agents = [], tasks = []) {
    if (!this.container) return;
    const business = data?.business || {};
    const performance = data?.performance || {};
    const active = agents.filter(agent => ['WORKING', 'EXECUTING', 'PLANNING'].includes(agent.status));
    const needsInput = agents.filter(agent => agent.status === 'WAITING_FOR_HUMAN');
    const recent = [...tasks].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4);
    const currentCac = performance.blendedCAC ?? business.current_cac;
    const targetCac = business.target_cac;
    const cacHealthy = currentCac != null && targetCac != null && Number(currentCac) <= Number(targetCac);
    const updated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const summary = needsInput.length
      ? `${needsInput.length} item${needsInput.length === 1 ? '' : 's'} need your input.`
      : active.length
        ? `${active.length} workstream${active.length === 1 ? '' : 's'} moving now.`
        : 'No work is blocked. The team is ready.';

    this.container.innerHTML = `
      <div class="dashboard-shell">
        <header class="dashboard-header">
          <div>
            <h1>Your marketing pulse</h1>
            <p>${this.esc(summary)} Last refreshed at ${updated}.</p>
          </div>
          <button class="secondary-button" onclick="window.HarnessApp.switchTab('3d')">View live floor</button>
        </header>

        <section class="metric-strip" aria-label="Key marketing results">
          ${this.metric('Customer acquisition cost', this.money(currentCac), currentCac == null ? 'No current measurement' : cacHealthy ? 'On or below target' : `Target ${this.money(targetCac)}`, cacHealthy ? 'good' : 'attention')}
          ${this.metric('Qualified leads', performance.totalQualifiedLeads ?? '—', performance.totalQualifiedLeads == null ? 'No current measurement' : 'Current reporting period')}
          ${this.metric('Return on ad spend', performance.blendedROAS == null ? '—' : `${performance.blendedROAS}×`, performance.blendedROAS == null ? 'Awaiting attributed revenue' : `Target ${business.target_roas ?? '—'}×`)}
          ${this.metric('Tracked spend', this.money(performance.totalSpendUSD), performance.totalSpendUSD == null ? 'No current measurement' : 'Current reporting period')}
        </section>

        <div class="insight-grid">
          <section class="client-panel">
            <div class="panel-title-row"><h2>What is happening now</h2><span>${active.length} active</span></div>
            ${active.length ? `<div class="work-list">${active.slice(0, 4).map(agent => this.workItem(agent)).join('')}</div>` : this.empty('No active work right now', 'The floor will update as soon as a workstream starts.')}
          </section>

          <section class="client-panel attention-panel">
            <div class="panel-title-row"><h2>Needs attention</h2><span>${needsInput.length}</span></div>
            ${needsInput.length ? `<div class="attention-list">${needsInput.slice(0, 3).map(agent => `<button onclick="window.HarnessApp.watchAgentIn3D('${this.esc(agent.agentId)}')"><strong>${this.esc(agent.currentTaskName || agent.name)}</strong><span>Open on the live floor</span></button>`).join('')}</div>` : this.empty('Nothing is waiting on you', 'Decisions and approvals will appear here.')}
          </section>

          <section class="client-panel full-width">
            <div class="panel-title-row"><h2>Recent outcomes</h2><span>${recent.length} updates</span></div>
            ${recent.length ? `<div class="outcome-list">${recent.map(task => `<article><span class="outcome-status ${this.esc(String(task.status || '').toLowerCase())}">${this.esc(this.readableStatus(task.status))}</span><div><strong>${this.esc(task.objective || task.capability || 'Marketing work')}</strong><p>${this.esc(this.outcomeCopy(task))}</p></div></article>`).join('')}</div>` : this.empty('No completed work yet', 'Recent client-facing outcomes will collect here.')}
          </section>
        </div>
      </div>`;
  }

  metric(label, value, note, tone = '') {
    return `<article class="metric ${tone}"><span>${this.esc(label)}</span><strong>${this.esc(value)}</strong><p>${this.esc(note)}</p></article>`;
  }

  workItem(agent) {
    const progress = Math.max(0, Math.min(100, Number(agent.progress) || 0));
    return `<button class="work-item" onclick="window.HarnessApp.watchAgentIn3D('${this.esc(agent.agentId)}')"><div><span>${this.esc(agent.departmentName || agent.department)}</span><strong>${this.esc(agent.currentTaskName || 'Marketing work in progress')}</strong><p>${this.esc(agent.currentSubtask || 'Work is underway.')}</p></div><em>${progress}%</em></button>`;
  }

  empty(title, copy) {
    return `<div class="empty-state"><strong>${title}</strong><p>${copy}</p></div>`;
  }

  readableStatus(status) {
    return ({ COMPLETED: 'Complete', FAILED: 'Needs review', PENDING: 'Waiting', RUNNING: 'In progress', DRY_RUN: 'Preview' })[status] || String(status || 'Update').replaceAll('_', ' ').toLowerCase();
  }

  outcomeCopy(task) {
    if (task.status === 'COMPLETED') return 'Finished and recorded.';
    if (task.status === 'FAILED') return task.error || 'The team is reviewing what happened.';
    if (task.status === 'PENDING') return 'A decision is required before this moves forward.';
    return 'Progress is being tracked.';
  }
}

window.OverviewView = OverviewView;
