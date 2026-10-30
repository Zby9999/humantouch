/** An image placeholder, `width` by `height`, its hue set by `seed`: an SVG, so the page loads nothing. */
export function picture(seed: number, width: number, height: number) {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="hsl(${hue} 70% 88%)"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 5}" fill="hsl(${hue} 60% 70%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function avatar(seed: number) {
  return picture(seed + 11, 32, 32);
}
