const COMPONENT_NAMES = {
  bar: 'Progress / Bar',
  radial: 'Progress / Radial'
};

const TARGET_NAMES = {
  barMaster: 'Bar Master',
  barSocket: 'Bar Progress',
  barIndicator: 'Bar Progress Indicator',
  radial: 'Progress Value'
};

const PROPERTY_KEYS = {
  responsive: 'responsive-slider',
  value: 'value'
};

const PLUGIN_KEYS = {
  baseHeight: 'rspndr-base-height',
  baseStartAngle: 'rspndr-base-start-angle',
  baseInnerRadius: 'rspndr-base-inner-radius'
};

const trackedValues = new Map();
let listeningEnabled = true;
let isApplyingUpdate = false;
let scanScheduled = false;
let allPagesLoaded = false;

figma.showUI(__html__, {
  width: 360,
  height: 360,
  themeColors: true
});

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function postStatus(tracked, synced, message) {
  figma.ui.postMessage({ type: 'sync-status', tracked: tracked, synced: synced, message: message });
  figma.ui.postMessage({ type: 'listening-state', value: listeningEnabled });
}

function postFoundCharts(items) {
  figma.ui.postMessage({ type: 'found-charts', items: items });
}

function getComponentProperties(node) {
  if (!node || !node.componentProperties) {
    return null;
  }
  return node.componentProperties;
}

function getPropertyValue(node, key) {
  const properties = getComponentProperties(node);
  if (!properties) return null;
  const target = normalizeName(key);

  for (const name in properties) {
    const definition = properties[name];
    const cleanName = normalizeName(name.split('#')[0]);
    if (cleanName === target) {
      return definition && typeof definition.value !== 'undefined' ? definition.value : null;
    }
  }

  return null;
}

async function getMainComponentSafe(node) {
  if (!node) return null;
  if (node.type === 'COMPONENT') return node;
  if (node.type !== 'INSTANCE' || typeof node.getMainComponentAsync !== 'function') {
    return null;
  }

  try {
    return await node.getMainComponentAsync();
  } catch (error) {
    return null;
  }
}

async function getNodeNames(node) {
  var instanceName = node && node.name ? node.name : '';
  var mainComponent = await getMainComponentSafe(node);
  var mainName = mainComponent && mainComponent.name ? mainComponent.name : instanceName;
  var parentName = mainComponent && mainComponent.parent && mainComponent.parent.name
    ? mainComponent.parent.name
    : (node && node.parent && node.parent.name ? node.parent.name : '');

  return {
    instanceName: instanceName,
    mainName: mainName,
    parentName: parentName
  };
}

async function getProgressKind(node) {
  if (!node || (node.type !== 'INSTANCE' && node.type !== 'COMPONENT')) {
    return null;
  }

  var names = await getNodeNames(node);
  var instanceName = normalizeName(names.instanceName);
  var mainName = normalizeName(names.mainName);

  if (mainName === normalizeName(COMPONENT_NAMES.radial) || instanceName === normalizeName(COMPONENT_NAMES.radial)) {
    return 'radial';
  }

  if (mainName === normalizeName(COMPONENT_NAMES.bar) || instanceName === normalizeName(COMPONENT_NAMES.bar)) {
    return 'bar';
  }

  return null;
}

async function isResponsiveSlider(node, kind) {
  var resolvedKind = kind || await getProgressKind(node);
  if (resolvedKind === 'bar') {
    return true;
  }

  return normalizeName(getPropertyValue(node, PROPERTY_KEYS.responsive)) === 'true';
}

function readNumericValue(node) {
  const raw = getPropertyValue(node, PROPERTY_KEYS.value);
  if (raw === null || typeof raw === 'undefined') return null;

  var normalized = String(raw).trim().replace(/%/g, '');
  const value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function parseInputValue(raw) {
  var normalized = String(raw || '').trim().replace(/%/g, '');
  var value = Number(normalized);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function getPropertyKey(node, key) {
  var properties = getComponentProperties(node);
  if (!properties) return null;
  var target = normalizeName(key);

  for (var name in properties) {
    var cleanName = normalizeName(name.split('#')[0]);
    if (cleanName === target) {
      return name;
    }
  }

  return null;
}

function setManualValueOnNode(node, value) {
  if (!node || typeof node.setProperties !== 'function') {
    return false;
  }

  var propertyKey = getPropertyKey(node, PROPERTY_KEYS.value);
  if (!propertyKey) {
    return false;
  }

  try {
    var payload = {};
    payload[propertyKey] = String(value) + '%';
    node.setProperties(payload);
    return true;
  } catch (error) {
    return false;
  }
}

async function describeTrackedInstances(instances) {
  var items = [];
  for (var i = 0; i < instances.length; i += 1) {
    var instance = instances[i];
    var kind = await getProgressKind(instance);
    var value = readNumericValue(instance);
    items.push({
      id: instance.id,
      name: instance.name,
      kind: kind || 'unknown',
      value: value === null ? 'n/a' : value
    });
  }
  return items;
}

async function getTrackedInstances() {
  var candidates = figma.currentPage.findAll(function(node) {
    return node.type === 'INSTANCE' || node.type === 'COMPONENT';
  });

  var tracked = [];
  for (var i = 0; i < candidates.length; i += 1) {
    var node = candidates[i];
    var kind = await getProgressKind(node);
    if (!kind) continue;
    if (!await isResponsiveSlider(node, kind)) continue;
    tracked.push(node);
  }

  return tracked;
}

function safeFindOne(node, predicate) {
  if (!node || typeof node.findOne !== 'function') {
    return null;
  }

  try {
    return node.findOne(predicate);
  } catch (error) {
    return null;
  }
}

function ensureStoredNumber(node, key, fallbackValue) {
  const raw = node.getPluginData(key);
  const existing = Number(raw);
  if (raw !== '' && !Number.isNaN(existing)) {
    return existing;
  }
  node.setPluginData(key, String(fallbackValue));
  return fallbackValue;
}

function updateBarProgress(barMasterNode, targetNode, value) {
  if (!barMasterNode || !targetNode) {
    return false;
  }

  var canResize = typeof targetNode.resize === 'function' || typeof targetNode.resizeWithoutConstraints === 'function';
  if (!canResize) {
    return false;
  }

  const masterWidth = barMasterNode.width;
  const progressHeight = ensureStoredNumber(targetNode, PLUGIN_KEYS.baseHeight, targetNode.height);
  const nextWidth = Math.max(1, (masterWidth * value) / 100);

  if ('layoutSizingHorizontal' in targetNode) {
    try {
      targetNode.layoutSizingHorizontal = 'FIXED';
    } catch (error) {}
  }

  try {
    if ('layoutPositioning' in targetNode) {
      targetNode.layoutPositioning = 'ABSOLUTE';
    }
  } catch (error) {}

  isApplyingUpdate = true;
  try {
    if (typeof targetNode.resizeWithoutConstraints === 'function') {
      targetNode.resizeWithoutConstraints(nextWidth, progressHeight);
    } else {
      targetNode.resize(nextWidth, progressHeight);
    }
  } finally {
    isApplyingUpdate = false;
  }

  return true;
}

function findFirstEditableRadialNode(node) {
  if (!node) return null;

  if (node.type === 'ELLIPSE') {
    return node;
  }

  if ('children' in node && node.children && node.children.length) {
    for (var i = 0; i < node.children.length; i += 1) {
      var nested = findFirstEditableRadialNode(node.children[i]);
      if (nested) return nested;
    }
  }

  return null;
}

function updateRadialProgress(targetNode, value) {
  if (!targetNode) return false;

  var editableNode = findFirstEditableRadialNode(targetNode) || targetNode;
  if (editableNode.type !== 'ELLIPSE') {
    return false;
  }

  const arcData = editableNode.arcData || { startingAngle: 0, endingAngle: 0, innerRadius: 0.72 };
  const baseStartAngle = ensureStoredNumber(
    editableNode,
    PLUGIN_KEYS.baseStartAngle,
    typeof arcData.startingAngle === 'number' ? arcData.startingAngle : 0
  );
  const baseInnerRadius = ensureStoredNumber(
    editableNode,
    PLUGIN_KEYS.baseInnerRadius,
    typeof arcData.innerRadius === 'number' ? arcData.innerRadius : 0.72
  );

  isApplyingUpdate = true;
  try {
    editableNode.arcData = {
      startingAngle: baseStartAngle,
      endingAngle: baseStartAngle + Math.PI * 2 * (value / 100),
      innerRadius: baseInnerRadius
    };
  } finally {
    isApplyingUpdate = false;
  }

  return true;
}

function findBarTargetNode(instance) {
  var barMaster = safeFindOne(instance, function(node) {
    return node.name === TARGET_NAMES.barMaster;
  });
  if (!barMaster) return null;

  var barProgress = safeFindOne(barMaster, function(node) {
    return node.name === TARGET_NAMES.barSocket;
  });
  if (!barProgress) return null;

  var barIndicator = safeFindOne(barProgress, function(node) {
    return node.name === TARGET_NAMES.barIndicator;
  });
  if (!barIndicator) return null;

  return {
    master: barMaster,
    target: barIndicator
  };
}

function findTargetNode(instance, kind) {
  if (kind === 'bar') {
    return findBarTargetNode(instance);
  }

  return safeFindOne(instance, function(node) {
    return node.name === TARGET_NAMES.radial;
  });
}

function applyValueToInstance(instance, kind, value) {
  if (!kind) return false;

  const targetNode = findTargetNode(instance, kind);
  if (!targetNode) return false;

  if (kind === 'bar') {
    return updateBarProgress(targetNode.master, targetNode.target, value);
  }

  return updateRadialProgress(targetNode, value);
}

async function syncAllResponsiveSliders() {
  const tracked = await getTrackedInstances();
  let applied = 0;

  for (let i = 0; i < tracked.length; i += 1) {
    const node = tracked[i];
    const kind = await getProgressKind(node);
    const value = readNumericValue(node);
    if (!kind || value === null) continue;

    const previousValue = trackedValues.get(node.id);
    if (previousValue === value) continue;

    let success = false;
    try {
      success = applyValueToInstance(node, kind, value);
    } catch (error) {
      success = false;
    }

    trackedValues.set(node.id, value);
    if (success) {
      applied += 1;
    }
  }

  const liveIds = new Set(tracked.map(function(node) { return node.id; }));
  trackedValues.forEach(function(_, id) {
    if (!liveIds.has(id)) {
      trackedValues.delete(id);
    }
  });

  postFoundCharts(await describeTrackedInstances(tracked));
  postStatus(
    tracked.length,
    applied,
    tracked.length === 0 ? 'No matching progress components on current page' : applied + ' of ' + tracked.length + ' updated'
  );
}

function startListening() {
  scanScheduled = false;
}

function stopListening() {
  scanScheduled = false;
}

function scheduleSync() {
  if (!listeningEnabled || isApplyingUpdate || scanScheduled) return;
  scanScheduled = true;
  setTimeout(function() {
    scanScheduled = false;
    if (!listeningEnabled || isApplyingUpdate) return;
    syncAllResponsiveSliders().catch(function() {
      postStatus(0, 0, 'Sync failed');
    });
  }, 60);
}


async function handleManualApply(message) {
  var targetId = message && message.targetId ? message.targetId : '';
  var parsedValue = parseInputValue(message && message.value);

  if (!targetId || parsedValue === null) {
    postStatus(0, 0, 'Enter a valid manual value');
    return;
  }

  var tracked = await getTrackedInstances();
  var targetNode = null;
  for (var i = 0; i < tracked.length; i += 1) {
    if (tracked[i].id === targetId) {
      targetNode = tracked[i];
      break;
    }
  }

  if (!targetNode) {
    postStatus(0, 0, 'Selected target is no longer available');
    return;
  }

  var kind = await getProgressKind(targetNode);
  if (!kind) {
    postStatus(0, 0, 'Target is no longer supported');
    return;
  }

  setManualValueOnNode(targetNode, parsedValue);
  applyValueToInstance(targetNode, kind, parsedValue);
  trackedValues.set(targetNode.id, parsedValue);

  postStatus(tracked.length, 1, 'Manual value applied');
  postFoundCharts(await describeTrackedInstances(tracked));
}

function registerEventHandlers() {
  figma.on('currentpagechange', function() {
    trackedValues.clear();
    scheduleSync();
  });

  if (allPagesLoaded) {
    figma.on('documentchange', function() {
      scheduleSync();
    });
  }
}

figma.ui.onmessage = function(message) {
  if (!message) return;

  if (message.type === 'ui-ready') {
    postStatus(0, 0, 'Waiting for scan…');
    scheduleSync();
    return;
  }

  if (message.type === 'set-listening') {
    listeningEnabled = !!message.value;
    if (listeningEnabled) {
      startListening();
      trackedValues.clear();
      scheduleSync();
    } else {
      stopListening();
      postStatus(0, 0, 'Listening paused');
    }
    return;
  }

  if (message.type === 'sync-now') {
    trackedValues.clear();
    syncAllResponsiveSliders().catch(function() {
      postStatus(0, 0, 'Sync failed');
    });
    return;
  }

  if (message.type === 'manual-apply') {
    handleManualApply(message).catch(function() {
      postStatus(0, 0, 'Manual update failed');
    });
  }
};

async function initializePlugin() {
  if (typeof figma.loadAllPagesAsync === 'function') {
    try {
      await figma.loadAllPagesAsync();
      allPagesLoaded = true;
    } catch (error) {
      allPagesLoaded = false;
    }
  }

  registerEventHandlers();
  startListening();
  await syncAllResponsiveSliders();
  figma.notify('Rspndr is ready.');
}

initializePlugin().catch(function() {
  postStatus(0, 0, 'Startup failed');
});
