class AgentInspector {
  constructor() {
    this.drawer = document.getElementById('agent-inspector-drawer');
    document.getElementById('close-inspector-btn')?.addEventListener('click', () => this.close());
  }

  set(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  show(agent) {
    if (!agent || !this.drawer) return;
    this.set('inspector-agent-name', agent.name || 'Team member');
    this.set('inspector-agent-role', agent.role || 'Marketing specialist');
    this.set('inspector-agent-department', agent.departmentName || agent.department || 'Marketing');
    this.set('inspector-agent-status', this.readableStatus(agent.status));
    this.set('inspector-task-name', agent.currentTaskName || 'No active work');
    this.set('inspector-subtask', agent.currentSubtask || 'Ready for the next task.');

    const progress = Math.max(0, Math.min(100, Number(agent.progress) || 0));
    const bar = document.getElementById('inspector-progress-bar');
    if (bar) bar.style.width = `${progress}%`;
    this.set('inspector-progress-val', `${progress}% complete`);

    const history = document.getElementById('inspector-history-list');
    if (history) {
      history.replaceChildren();
      const entries = (agent.history || []).slice(0, 5);
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'muted-copy';
        empty.textContent = 'No updates yet.';
        history.appendChild(empty);
      }
      for (const entry of entries) {
        const item = document.createElement('div');
        item.className = 'history-entry';
        const time = document.createElement('time');
        time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const copy = document.createElement('p');
        copy.textContent = entry.action;
        item.append(time, copy);
        history.appendChild(item);
      }
    }
    this.drawer.classList.add('open');
  }

  readableStatus(status) {
    return ({ WORKING: 'Working', EXECUTING: 'Working', PLANNING: 'Planning', WAITING_FOR_HUMAN: 'Needs input', COMPLETED: 'Complete', IDLE: 'Ready' })[status] || 'Ready';
  }

  close() {
    this.drawer?.classList.remove('open');
  }
}

window.AgentInspector = AgentInspector;
