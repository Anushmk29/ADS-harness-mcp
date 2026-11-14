class MarketingHarnessApp {
  constructor() {
    this.currentTab = '3d';
    this.world3d = null;
    this.inspector = null;
    this.overviewView = null;
    this.eventSource = null;
    this.statusData = null;
    this.agentsData = [];
    this.tasksData = [];
  }

  async init() {
    this.inspector = new AgentInspector();
    this.overviewView = new OverviewView('view-overview');
    this.decodeView = new DecodeView('view-decode');
    try {
      this.world3d = new Office3DWorld('threejs-canvas-container', {
        onAgentClick: agentId => this.onAgentSelected(agentId)
      });
    } catch (error) {
      console.error('[Dashboard] 3D floor could not start:', error);
    }

    this.setupNavigation();
    this.setupCameraButtons();
    await this.refreshAll();
    this.connectEventStream();
    window.setInterval(() => this.refreshAll(), 30000);
  }

  setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => tab.addEventListener('click', () => this.switchTab(tab.dataset.tab)));
  }

  switchTab(tab) {
    if (!['3d', 'overview', 'decode'].includes(tab)) return;
    this.currentTab = tab;
    document.querySelectorAll('.nav-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.toggle('active', panel.id === `view-${tab}`));
    if (tab === 'overview') this.renderDashboard();
    if (tab === 'decode') this.decodeView.show();
    if (tab === '3d') window.setTimeout(() => this.world3d?.onWindowResize(), 0);
  }

  setupCameraButtons() {
    const buttons = document.querySelectorAll('.camera-btn');
    buttons.forEach(button => button.addEventListener('click', () => {
      buttons.forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      button.dataset.preset === 'active' ? this.world3d?.focusActiveAgent() : this.world3d?.focusCamera(button.dataset.preset);
    }));
  }

  async refreshAll() {
    try {
      const [officesResponse, agentsResponse, statusResponse, tasksResponse] = await Promise.all([
        ...['/api/offices', '/api/agents', '/api/status', '/api/tasks'].map(url => fetch(url))
      ]);
      const [offices, agents, status, tasks] = await Promise.all([
        officesResponse.json(), agentsResponse.json(), statusResponse.json(), tasksResponse.json()
      ]);
      if (!officesResponse.ok || !agentsResponse.ok || !statusResponse.ok || !tasksResponse.ok) throw new Error('Dashboard data request failed');

      if (this.world3d && !this.world3d.officesData?.length) this.world3d.loadOffices(offices.offices || []);
      this.agentsData = agents.agents || [];
      this.statusData = status;
      this.tasksData = tasks.tasks || [];
      for (const agent of this.agentsData) this.world3d?.updateAgentState(agent.agentId, agent);
      this.updateFloorSummary();
      this.renderDashboard();
    } catch (error) {
      console.warn('[Dashboard] Could not refresh:', error);
      this.setFloorCopy('Live data is reconnecting.');
    }
  }

  connectEventStream() {
    this.eventSource?.close();
    this.eventSource = new EventSource('/api/events/stream'); // session cookie authenticates
    this.eventSource.addEventListener('init', event => {
      const data = JSON.parse(event.data);
      if (data.agents) {
        this.agentsData = data.agents;
        for (const agent of this.agentsData) this.world3d?.updateAgentState(agent.agentId, agent);
        this.updateFloorSummary();
        this.renderDashboard();
      }
    });
    this.eventSource.addEventListener('event', event => this.handleEvent(JSON.parse(event.data)));
    this.eventSource.addEventListener('decode', event => this.decodeView?.onEvent(JSON.parse(event.data)));
  }

  handleEvent(event) {
    this.addActivity(event);
    if (event.type === 'AGENT_STATE_CHANGED') {
      const agent = this.agentsData.find(item => item.agentId === event.agentId);
      if (agent) Object.assign(agent, {
        status: event.status ?? agent.status,
        currentTaskName: event.taskName ?? agent.currentTaskName,
        currentSubtask: event.subtask ?? agent.currentSubtask,
        progress: event.progress ?? agent.progress
      });
      this.world3d?.updateAgentState(event.agentId, event);
      this.updateFloorSummary();
      this.renderDashboard();
    } else if (['HITL_REQUIRED', 'HITL_RESOLVED'].includes(event.type)) {
      this.refreshAll();
    }
  }

  updateFloorSummary() {
    const working = this.agentsData.filter(agent => ['WORKING', 'EXECUTING', 'PLANNING'].includes(agent.status)).length;
    const waiting = this.agentsData.filter(agent => agent.status === 'WAITING_FOR_HUMAN').length;
    const ready = this.agentsData.filter(agent => agent.status === 'IDLE').length;
    this.setText('stat-working-agents', working);
    this.setText('stat-hitl-agents', waiting);
    this.setText('stat-idle-agents', ready);
    this.setFloorCopy(waiting ? `${waiting} item${waiting === 1 ? '' : 's'} need your input.` : working ? `${working} workstream${working === 1 ? '' : 's'} moving now.` : 'No work is blocked. The team is ready.');
  }

  setFloorCopy(copy) {
    this.setText('floor-summary-copy', copy);
  }

  setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  renderDashboard() {
    this.overviewView?.render(this.statusData, this.agentsData, this.tasksData);
  }

  addActivity(event) {
    const feed = document.getElementById('activity-feed-list');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const time = document.createElement('time');
    time.textContent = new Date(event.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const copy = document.createElement('p');
    copy.textContent = this.activityCopy(event);
    item.append(time, copy);
    feed.prepend(item);
    while (feed.children.length > 8) feed.lastElementChild.remove();
  }

  activityCopy(event) {
    if (event.type === 'AGENT_STATE_CHANGED') return event.subtask || event.taskName || 'A workstream changed status.';
    if (event.type === 'HITL_REQUIRED') return `${event.title || 'A decision'} needs your input.`;
    return 'The live floor received an update.';
  }

  onAgentSelected(agentId) {
    this.inspector?.show(this.agentsData.find(agent => agent.agentId === agentId));
  }

  watchAgentIn3D(agentId) {
    this.switchTab('3d');
    this.world3d?.selectAgent(agentId);
  }
}

// Started on demand by console.js ("See inside the system") so clients never pay for the 3D floor.
