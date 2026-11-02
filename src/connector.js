// Geometry for the thread that joins a star to its card. Shared by the live
// star card, the share-flow mini cards and the canvas share image so all
// three draw the same curve.

// Radius (CSS px) of the ring drawn around a connected star. The thread
// starts on this ring instead of touching the particle itself. Keep in sync
// with the 20px #star-anchor ring in style.css.
export const CONNECTOR_RING_RADIUS = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function curve(start, c1, c2, end, radius) {
  const dx = c1.x - start.x, dy = c1.y - start.y;
  const length = Math.hypot(dx, dy);
  // A card sitting on top of its star has no room for a thread.
  if (!(length > 0) || Math.hypot(end.x - start.x, end.y - start.y) <= radius * 2) return null;
  // Leave along the curve's initial tangent so the thread meets the ring
  // head-on rather than at an angle.
  const from = { x: start.x + dx / length * radius, y: start.y + dy / length * radius };
  return { center: { ...start }, start: from, c1, c2, end, radius };
}

/** Star card: horizontal S-curve on desktop, vertical drop to a bottom sheet on mobile. */
export function cardConnector({ mobile, sx, sy, targetX, targetY }, radius = CONNECTOR_RING_RADIUS) {
  const start = { x: sx, y: sy }, end = { x: targetX, y: targetY };
  if (mobile) {
    const direction = targetY >= sy ? 1 : -1;
    const bend = clamp(Math.abs(targetY - sy) * 0.48, 28, 92);
    return curve(start, { x: sx, y: sy + bend * direction }, { x: targetX, y: targetY - bend * direction }, end, radius);
  }
  const direction = targetX >= sx ? 1 : -1;
  const gap = Math.abs(targetX - sx);
  const departure = clamp(gap * 0.32, 28, 118);
  const arrival = clamp(gap * 0.20, 32, 84);
  return curve(start, { x: sx + departure * direction, y: sy }, { x: targetX - arrival * direction, y: targetY }, end, radius);
}

/** Share mini card: from the star to the card's inner edge, at the star's height where possible. */
export function shareConnector({ star, side, x, y, w, h }, viewport = { width: Infinity, height: Infinity }, radius = CONNECTOR_RING_RADIUS) {
  if (!star?.visible) return null;
  const start = { x: clamp(star.x, 8, viewport.width - 8), y: clamp(star.y, 8, viewport.height - 8) };
  const end = { x: side === 'left' ? x + w : x, y: clamp(star.y, y + 24, y + h - 24) };
  const gap = Math.max(48, Math.abs(end.x - start.x) * 0.34);
  const bend = Math.min(92, Math.max(24, Math.abs(end.y - start.y) * 0.28 + gap * 0.14));
  const direction = end.x >= start.x ? 1 : -1;
  return curve(start, { x: start.x + gap * direction, y: start.y + bend }, { x: end.x - gap * direction, y: end.y - bend }, end, radius);
}

export function connectorPathData(connector) {
  if (!connector) return '';
  const { start, c1, c2, end } = connector;
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
