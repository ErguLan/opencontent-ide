let corePromise = null;

async function loadRustCore() {
  if (!corePromise) {
    corePromise = import(/* @vite-ignore */ '/oc-core/oc_core.js')
      .then(async (module) => {
        if (typeof module.default === 'function') await module.default();
        return module;
      })
      .catch(() => null);
  }
  return corePromise;
}

export async function validateAiOperationsWithCore(operations) {
  const core = await loadRustCore();
  if (!core?.validate_ai_operations) return operations;
  const json = core.validate_ai_operations(JSON.stringify(operations));
  return JSON.parse(json);
}

export async function validateArtifactOperationsWithCore(operations) {
  const core = await loadRustCore();
  if (!core?.validate_operations) return operations;
  const json = core.validate_operations(JSON.stringify(operations));
  return JSON.parse(json);
}

export async function snapWithCore(value, grid = 10) {
  const core = await loadRustCore();
  return core?.snap ? core.snap(value, grid) : (grid > 0 ? Math.round(value / grid) * grid : value);
}

export async function isRustCoreAvailable() {
  return Boolean(await loadRustCore());
}
