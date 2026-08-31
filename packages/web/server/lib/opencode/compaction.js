import {
  getConfigForPath,
  isPlainObject,
  readConfigLayers,
  writeConfig,
} from './shared.js';

// OpenCode's `compaction` keys surfaced in Settings. Unknown keys in an
// existing block (reserved, tail_turns, ...) are preserved untouched.

function compactionSourceLayer(layers) {
  for (const layer of ['custom', 'project', 'user']) {
    if (isPlainObject(layers[`${layer}Config`]?.compaction)) {
      return layer;
    }
  }
  return null;
}

const isBoolean = (value) => value === true || value === false;

/**
 * Effective compaction state across the OpenCode config layers.
 * Defaults mirror OpenCode: auto-compact on, pruning off.
 */
function getCompactionConfig(workingDirectory) {
  const layers = readConfigLayers(workingDirectory);
  const merged = isPlainObject(layers.mergedConfig?.compaction)
    ? layers.mergedConfig.compaction
    : {};
  return {
    auto: merged.auto !== false,
    prune: merged.prune === true,
    layer: compactionSourceLayer(layers),
  };
}

/**
 * Persist auto/prune into the layer that already defines `compaction`
 * (custom > project > user), falling back to the user layer. Writing the
 * winning layer avoids shadowing an existing definition.
 */
function upsertCompactionConfig({ auto, prune }, workingDirectory) {
  if (!isBoolean(auto) || !isBoolean(prune)) {
    const error = new Error('auto and prune must be booleans');
    error.statusCode = 400;
    throw error;
  }

  const layers = readConfigLayers(workingDirectory);
  const layer = compactionSourceLayer(layers) ?? 'user';
  const targetPath = layer === 'custom'
    ? layers.paths.customPath
    : (layer === 'project' ? layers.paths.projectPath : layers.paths.userPath);

  if (!targetPath) {
    const error = layer === 'custom'
      ? new Error('Custom config path (OPENCODE_CONFIG) is not set')
      : new Error('Working directory is required for project scope');
    error.statusCode = 400;
    throw error;
  }

  const targetConfig = getConfigForPath(layers, targetPath);
  const existing = isPlainObject(targetConfig.compaction) ? targetConfig.compaction : {};
  targetConfig.compaction = { ...existing, auto, prune };
  writeConfig(targetConfig, targetPath);

  return { auto, prune, layer, path: targetPath };
}

export {
  getCompactionConfig,
  upsertCompactionConfig,
};
