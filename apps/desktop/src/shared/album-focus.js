(function exposeAlbumFocus(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AlbumFocus = api;
})(typeof globalThis === "object" ? globalThis : this, function albumFocusFactory() {
  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function pixel(data, width, x, y) {
    const offset = (y * width + x) * 4;
    return [data[offset] || 0, data[offset + 1] || 0, data[offset + 2] || 0];
  }

  function findFocusPoints(imageData, width, height, count = 4) {
    const data = imageData?.data || imageData;
    if (!data || width < 8 || height < 8) return [];
    const candidates = [];
    const positions = [0.16, 0.27, 0.39, 0.5, 0.61, 0.73, 0.84];
    const radius = Math.max(3, Math.round(Math.min(width, height) * 0.11));

    for (const ny of positions) {
      for (const nx of positions) {
        const cx = Math.round(nx * (width - 1));
        const cy = Math.round(ny * (height - 1));
        let samples = 0;
        let sumL = 0, sumL2 = 0, sumSat = 0, sumEdge = 0, sumColor = 0;
        let prev = null;
        for (let y = clamp(cy - radius, 1, height - 2); y <= clamp(cy + radius, 1, height - 2); y += 2) {
          for (let x = clamp(cx - radius, 1, width - 2); x <= clamp(cx + radius, 1, width - 2); x += 2) {
            const rgb = pixel(data, width, x, y);
            const max = Math.max(...rgb), min = Math.min(...rgb);
            const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            const sat = max ? (max - min) / max : 0;
            const right = pixel(data, width, x + 1, y);
            const down = pixel(data, width, x, y + 1);
            const edge = (Math.abs(rgb[0] - right[0]) + Math.abs(rgb[1] - right[1]) + Math.abs(rgb[2] - right[2])
              + Math.abs(rgb[0] - down[0]) + Math.abs(rgb[1] - down[1]) + Math.abs(rgb[2] - down[2])) / 6;
            const colorDelta = prev
              ? (Math.abs(rgb[0] - prev[0]) + Math.abs(rgb[1] - prev[1]) + Math.abs(rgb[2] - prev[2])) / 3
              : 0;
            prev = rgb;
            samples++;
            sumL += luma;
            sumL2 += luma * luma;
            sumSat += sat;
            sumEdge += edge;
            sumColor += colorDelta;
          }
        }
        const meanL = sumL / Math.max(1, samples);
        const contrast = Math.sqrt(Math.max(0, sumL2 / Math.max(1, samples) - meanL * meanL)) / 64;
        const edge = sumEdge / Math.max(1, samples) / 42;
        const color = sumColor / Math.max(1, samples) / 52;
        const saturation = sumSat / Math.max(1, samples);
        const centerPrior = 1 - Math.hypot(nx - 0.5, ny - 0.5) * 0.18;
        const score = Math.max(0, contrast * 0.42 + edge * 0.31 + color * 0.17 + saturation * 0.10) * centerPrior;
        candidates.push({ x: nx, y: ny, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const strongest = candidates[0]?.score || 0;
    if (strongest < 0.035) return [{ x: 0.5, y: 0.5, score: 0 }];
    const selected = [];
    for (const candidate of candidates) {
      if (candidate.score < strongest * 0.38) break;
      const separated = selected.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= 0.21);
      if (separated) selected.push(candidate);
      if (selected.length >= count) break;
    }
    return selected.length ? selected : [{ x: 0.5, y: 0.5, score: strongest }];
  }

  return { findFocusPoints };
});
