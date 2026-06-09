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

function getNodeNames(node) {
  var instanceName = node && node.name ? node.name : '';
  var mainName = node && node.mainComponent && node.mainComponent.name
    ? node.mainComponent.name
    : instanceName;
  var parentName = node && node.mainComponent && node.mainComponent.parent && node.mainComponent.parent.name
    ? node.mainComponent.parent.name
    : (node && node.parent && node.parent.name ? node.parent.name : '');

  return {
    instanceName: instanceName,
    mainName: mainName,
    parentName: parentName
  };
}

function getProgressKind(node) {
  if (!node || (node.type !== 'INSTANCE' && node.type !== 'COMPONENT')) {
    return null;
  }

  var names = getNodeNames(node);
  var haystack = [names.instanceName, names.mainName, names.parentName].join(' | ').toLowerCase();

  if (haystack.indexOf('progress / radial') !== -1 || haystack.indexOf('radial') !== -1) {
    return 'radial';
  }

  if (haystack.indexOf('progress / bar') !== -1 || haystack.indexOf('bar') !== -1) {
    return 'bar';
  }

  return null;
}

function isResponsiveSlider(node) {
  if (getProgressKind(node) === 'bar') {
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

function describeTrackedInstances(instances) {
  var items = [];
  for (var i = 0; i < instances.length; i += 1) {
    var instance = instances[i];
    var kind = getProgressKind(instance);
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

function getTrackedInstances() {
  return figma.currentPage.findAll(function(node) {
    if (node.type !== 'INSTANCE' && node.type !== 'COMPONENT') return false;
    if (!getProgressKind(node)) return false;
    return isResponsiveSlider(node);
  });
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
  var barMaster = instance.findOne(function(node) {
    return node.name === TARGET_NAMES.barMaster;
  });
  if (!barMaster) return null;

  var barProgress = barMaster.findOne(function(node) {
    return node.name === TARGET_NAMES.barSocket;
  });
  if (!barProgress) return null;

  var barIndicator = barProgress.findOne(function(node) {
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

  return instance.findOne(function(node) {
    return node.name === TARGET_NAMES.radial;
  });
}

function applyValueToInstance(instance, value) {
  const kind = getProgressKind(instance);
  if (!kind) return false;

  const targetNode = findTargetNode(instance, kind);
  if (!targetNode) return false;

  if (kind === 'bar') {
    return updateBarProgress(targetNode.master, targetNode.target, value);
  }

  return updateRadialProgress(targetNode, value);
}

function syncAllResponsiveSliders() {
  const tracked = getTrackedInstances();
  let synced = 0;
  let applied = 0;

  for (let i = 0; i < tracked.length; i += 1) {
    const node = tracked[i];
    const value = readNumericValue(node);
    if (value === null) continue;

    const previousValue = trackedValues.get(node.id);
    if (previousValue === value) continue;

    let success = false;
    try {
      success = applyValueToInstance(node, value);
    } catch (error) {
      success = false;
    }

    trackedValues.set(node.id, value);
    synced += 1;
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

  postFoundCharts(describeTrackedInstances(tracked));
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
    syncAllResponsiveSliders();
  }, 60);
}

figma.on('currentpagechange', function() {
  trackedValues.clear();
  scheduleSync();
});

figma.on('documentchange', function() {
  scheduleSync();
});

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
    syncAllResponsiveSliders();
  }
};

startListening();
syncAllResponsiveSliders();
figma.notify('Rspndr is ready.');
