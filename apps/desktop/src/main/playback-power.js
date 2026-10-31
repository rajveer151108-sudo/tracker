function createPlaybackPowerGuard(powerSaveBlocker) {
  let blockerId = null;

  function isActive() {
    return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
  }

  function setActive(active) {
    const started = isActive();
    if (active && !started) {
      blockerId = powerSaveBlocker.start("prevent-display-sleep");
    } else if (!active && started) {
      powerSaveBlocker.stop(blockerId);
      blockerId = null;
    } else if (!active) {
      blockerId = null;
    }
    return isActive();
  }

  return { setActive, isActive, dispose: () => setActive(false) };
}

module.exports = { createPlaybackPowerGuard };
