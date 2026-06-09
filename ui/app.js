const refs = {
  listenToggle: document.querySelector('#listen-toggle'),
  tracked: document.querySelector('#status-tracked'),
  synced: document.querySelector('#status-synced'),
  listening: document.querySelector('#status-listening'),
  message: document.querySelector('#status-message'),
  scanNow: document.querySelector('#scan-now')
};

const state = {
  listening: true
};

function ensureLogArea() {
  let logCard = document.querySelector('#log-card');
  if (logCard) return logCard;

  const section = document.createElement('section');
  section.className = 'section status-card';
  section.id = 'log-card';
  section.innerHTML = `
    <div class="status-row">
      <span>Found charts</span>
      <strong id="status-found-count">0</strong>
    </div>
    <div id="status-found-log" class="log-list">Waiting for scan…</div>
  `;
  refs.scanNow.parentElement.insertAdjacentElement('beforebegin', section);
  return section;
}

function syncUI() {
  refs.listenToggle.setAttribute('aria-pressed', String(state.listening));
  refs.listening.textContent = state.listening ? 'On' : 'Off';
}

function updateFoundLog(items) {
  const section = ensureLogArea();
  const count = section.querySelector('#status-found-count');
  const log = section.querySelector('#status-found-log');
  count.textContent = String(items.length);

  if (!items.length) {
    log.textContent = 'No matching charts found on current page.';
    return;
  }

  log.innerHTML = items
    .map(function(item) {
      return '<div class="log-item"><strong>' + item.name + '</strong><span>' + item.kind + ' · value ' + item.value + '</span><span>' + item.mainName + ' / ' + item.parentName + '</span><span>' + item.id + '</span></div>';
    })
    .join('');
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
ensureLogArea();
parent.postMessage({ pluginMessage: { type: 'ui-ready' } }, '*');
