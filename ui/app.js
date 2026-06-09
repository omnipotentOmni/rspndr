const refs = {
  listenToggle: document.querySelector('#listen-toggle'),
  tracked: document.querySelector('#status-tracked'),
  synced: document.querySelector('#status-synced'),
  listening: document.querySelector('#status-listening'),
  message: document.querySelector('#status-message'),
  scanNow: document.querySelector('#scan-now'),
  foundCount: document.querySelector('#status-found-count'),
  foundLog: document.querySelector('#status-found-log'),
  manualTargetButton: document.querySelector('#manual-target-button'),
  manualTargetLabel: document.querySelector('#manual-target-label'),
  manualTargetMenu: document.querySelector('#manual-target-menu'),
  manualValue: document.querySelector('#manual-value'),
  manualApply: document.querySelector('#manual-apply')
};

const state = {
  listening: true,
  items: [],
  selectedTargetId: '',
  targetMenuOpen: false
};

function syncUI() {
  refs.listenToggle.setAttribute('aria-pressed', String(state.listening));
  refs.listening.textContent = state.listening ? 'Listening' : 'Paused';
  refs.manualApply.disabled = !state.selectedTargetId;
  refs.manualTargetButton.setAttribute('aria-expanded', String(state.targetMenuOpen));
  refs.manualTargetMenu.hidden = !state.targetMenuOpen;
}

function getSelectedItem() {
  for (let i = 0; i < state.items.length; i += 1) {
    if (state.items[i].id === state.selectedTargetId) {
      return state.items[i];
    }
  }
  return null;
}

function syncTargetLabel() {
  const selected = getSelectedItem();
  refs.manualTargetLabel.textContent = selected
    ? selected.name + ' · ' + selected.kind
    : 'No targets found';
}

function closeTargetMenu() {
  state.targetMenuOpen = false;
  syncUI();
}

function openTargetMenu() {
  if (!state.items.length) {
    return;
  }
  state.targetMenuOpen = true;
  syncUI();
}

function renderTargetMenu(items) {
  refs.manualTargetMenu.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'No targets found';
    refs.manualTargetMenu.appendChild(empty);
    return;
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-option';
    button.setAttribute('data-target-id', item.id);
    button.innerHTML = [
      '<span class="picker-option__name">' + item.name + '</span>',
      '<span class="picker-option__meta">' + item.kind + ' · value ' + item.value + '</span>'
    ].join('');

    if (item.id === state.selectedTargetId) {
      button.classList.add('is-active');
    }

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.selectedTargetId = item.id;
      syncTargetLabel();
      renderTargetMenu(state.items);
      closeTargetMenu();
      syncUI();
    });

    refs.manualTargetMenu.appendChild(button);
  }
}

function renderChartItem(item) {
  return [
    '<div class="chart-item">',
    '<div>',
    '<div class="chart-item__name">' + item.name + '</div>',
    '<div class="chart-item__meta">Value ' + item.value + '</div>',
    '</div>',
    '<span class="chart-kind">' + item.kind + '</span>',
    '</div>'
  ].join('');
}

function updateTargets(items) {
  const previous = state.selectedTargetId;
  state.items = items.slice();

  if (!items.length) {
    state.selectedTargetId = '';
    syncTargetLabel();
    renderTargetMenu([]);
    closeTargetMenu();
    syncUI();
    return;
  }

  state.selectedTargetId = items.some(function(item) { return item.id === previous; })
    ? previous
    : items[0].id;

  syncTargetLabel();
  renderTargetMenu(items);
  syncUI();
}

function updateFoundLog(items) {
  refs.foundCount.textContent = String(items.length);
  updateTargets(items);

  if (!items.length) {
    refs.foundLog.innerHTML = '<div class="chart-empty">No matching progress components on this page.</div>';
    return;
  }

  refs.foundLog.innerHTML = items.map(renderChartItem).join('');
}

function sendManualApply() {
  const rawValue = String(refs.manualValue.value || '').trim();
  if (!state.selectedTargetId || !rawValue) {
    return;
  }

  parent.postMessage({
    pluginMessage: {
      type: 'manual-apply',
      targetId: state.selectedTargetId,
      value: rawValue
    }
  }, '*');
}

refs.listenToggle.addEventListener('click', () => {
  state.listening = !state.listening;
  syncUI();
  parent.postMessage({ pluginMessage: { type: 'set-listening', value: state.listening } }, '*');
});

refs.manualTargetButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (state.targetMenuOpen) {
    closeTargetMenu();
  } else {
    openTargetMenu();
  }
});

refs.manualApply.addEventListener('click', () => {
  sendManualApply();
});

refs.manualValue.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    sendManualApply();
  }
});

refs.scanNow.addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'sync-now' } }, '*');
});

document.addEventListener('pointerdown', (event) => {
  if (!state.targetMenuOpen) return;
  const withinPicker = event.target.closest('.picker');
  if (!withinPicker) {
    closeTargetMenu();
  }
});

refs.manualTargetMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});

window.addEventListener('message', (event) => {
  const message = event.data && event.data.pluginMessage;
  if (!message) return;

  if (message.type === 'sync-status') {
    refs.tracked.textContent = String(message.tracked || 0);
    refs.synced.textContent = String(message.synced || 0);
    refs.message.textContent = message.message || 'Watching current page';
  }

  if (message.type === 'listening-state') {
    state.listening = !!message.value;
    syncUI();
  }

  if (message.type === 'found-charts') {
    updateFoundLog(message.items || []);
  }
});

syncTargetLabel();
syncUI();
updateFoundLog([]);
parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
