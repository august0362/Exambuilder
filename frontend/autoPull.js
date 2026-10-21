// Khoi dong, tro lai tab va co mang co the den cung luc: chi Pull mot lan.
export function createAutoPull({ loadSettings, pull, isEnabled, isOnline, isBusy = () => false, now = Date.now, cooldownMs = 60000 }) {
  let running = false;
  let lastGistId = null;
  let lastAttempt = null;
  return async function requestAutoPull({ force = false } = {}) {
    if (running || !isEnabled() || !isOnline() || isBusy()) return false;
    running = true;
    try {
      const settings = await loadSettings();
      if (!settings?.gist_id || !isEnabled() || !isOnline() || isBusy()) return false;
      const time = now();
      const elapsed = time - lastAttempt;
      if (!force && lastAttempt !== null && settings.gist_id === lastGistId && elapsed >= 0 && elapsed < cooldownMs) return false;
      lastAttempt = time;
      lastGistId = settings.gist_id;
      return await pull();
    } finally {
      running = false;
    }
  };
}
