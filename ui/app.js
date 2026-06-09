const refs = {
  listenToggle: document.querySelector('#listen-toggle'),
  tracked: document.querySelector('#status-tracked'),
  synced: document.querySelector('#status-synced'),
  listening: document.querySelector('#status-listening'),
  message: document.querySelector('#status-message'),
  scanNow: document.querySelector('#scan-now'),
  foundCount: document.querySelector('#status-found-count'),
  foundLog: document.querySelector('#status-found-log')
};

const state = {
  listening: true
};

function syncUI() {
  refs.listenToggle.setAttribute('aria-pressed', String(state.listening));
  refs.listening.textContent = state.listening ? 'Listening' : 'Paused';
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

function updateFoundLog(items) {
  refs.foundCount.textContent = String(items.length);

  if (!items.length) {
    refs.foundLog.innerHTML = '<div class="chart-empty">No matching progress components on this page.</div>';
    return;
  }

  refs.foundLog.innerHTML = items.map(renderChartItem).join('');
}

refs.listenToggle.addEventListener('click', () => {
  state.listening = !state.listening;
  syncUI();
  parent.postMessage({ pluginMessage: { type: 'set-listening', value: state.listening } }, '*');
});

refs.scanNow.addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'sync-now' } }, '*');
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

syncUI();
updateFoundLog([]);
parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
