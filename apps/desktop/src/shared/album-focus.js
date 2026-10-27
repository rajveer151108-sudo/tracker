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

  function findFocusPoints(imageData, width, height, count = 3) {
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
        let sumL = 0, sumL2 = 0, sumSat = 0, sumEdge = 0, sumColor = 0, sumGX = 0, sumGY = 0;
        let prev = null;
        for (let y = clamp(cy - radius, 1, height - 2); y <= clamp(cy + radius, 1, height - 2); y += 2) {
          for (let x = clamp(cx - radius, 1, width - 2); x <= clamp(cx + radius, 1, width - 2); x += 2) {
            const rgb = pixel(data, width, x, y);
            const max = Math.max(...rgb), min = Math.min(...rgb);
            const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            const sat = max ? (max - min) / max : 0;
            const right = pixel(data, width, x + 1, y);
            const down = pixel(data, width, x, y + 1);
            const gx = (Math.abs(rgb[0] - right[0]) + Math.abs(rgb[1] - right[1]) + Math.abs(rgb[2] - right[2])) / 3;
            const gy = (Math.abs(rgb[0] - down[0]) + Math.abs(rgb[1] - down[1]) + Math.abs(rgb[2] - down[2])) / 3;
            const edge = (gx + gy) / 2;
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
            sumGX += gx;
            sumGY += gy;
          }
        }
        const meanL = sumL / Math.max(1, samples);
        const contrast = Math.sqrt(Math.max(0, sumL2 / Math.max(1, samples) - meanL * meanL)) / 64;
        const edge = sumEdge / Math.max(1, samples) / 42;
        const color = sumColor / Math.max(1, samples) / 52;
        const saturation = sumSat / Math.max(1, samples);
        const distance = Math.hypot(nx - 0.5, ny - 0.47);
        const centerPrior = 0.52 + 0.48 * Math.exp(-(distance * distance) / 0.12);
        const edgePrior = Math.min(1, Math.min(nx, 1 - nx, ny, 1 - ny) / 0.25);
        const lowerLabelPenalty = ny >= 0.72 ? 0.22 : ny > 0.64 ? 1 - (ny - 0.64) * 3.5 : 1;
        const orientation = Math.abs(sumGX - sumGY) / Math.max(1, sumGX + sumGY);
        const repetitivePenalty = 1 - Math.max(0, orientation - 0.34) * Math.min(0.72, edge * 0.55);
        const visualScore = contrast * 0.46 + edge * 0.20 + color * 0.18 + saturation * 0.16;
        const score = Math.max(0, visualScore) * centerPrior * (0.62 + edgePrior * 0.38)
          * lowerLabelPenalty * repetitivePenalty;
        candidates.push({ x: nx, y: ny, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const strongest = candidates[0]?.score || 0;
    if (strongest < 0.035) return [{ x: 0.5, y: 0.5, score: 0 }];
    const selected = [];
    for (const candidate of candidates) {
      if (candidate.score < strongest * 0.58) break;
      const separated = selected.every((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) >= 0.21);
      if (separated) selected.push(candidate);
      if (selected.length >= count) break;
    }
    return selected.length ? selected : [{ x: 0.5, y: 0.5, score: strongest }];
  }

  return { findFocusPoints };
});
