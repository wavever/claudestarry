import qrcode from 'qrcode-generator';
import {normalizeLocale,sloganForLocale,translate} from './i18n.js';

const FONT_SERIF = '"Songti SC", "PingFang SC", "Noto Serif SC", Georgia, serif';
const FONT_MONO = '"SFMono-Regular", Consolas, monospace';

function positionValues(position) {
  const source = Array.isArray(position) || ArrayBuffer.isView(position) ? position : null;
  if (!source || source.length < 3) return null;
  const values = [Number(source[0]), Number(source[1]), Number(source[2])];
  return values.every(Number.isFinite) ? values : null;
}

function signedFixed(value) {
  const negative = value < 0 || Object.is(value, -0);
  return `${negative ? '-' : '+'}${Math.abs(value).toFixed(2)}`;
}

/**
 * Header caption for the share image. `ownCount` is how many of the visible
 * accounts belong to this visitor; the rest of `totalCount` are companions,
 * so the two numbers in the caption always add up to the total.
 */
export function shareCountText({ ownCount = 0, totalCount = 0, locale = 'zh-CN', format = String } = {}) {
  const t = (key, values) => translate(locale, key, values);
  const total = Math.max(0, Math.floor(Number(totalCount) || 0));
  const own = Math.min(total, Math.max(0, Math.floor(Number(ownCount) || 0)));
  const others = total - own;
  const word = (key, count) => t(`share.${key}${count === 1 ? 'One' : ''}`);
  if (!own) return t('share.screenshotTotal', { total: format(total), accounts: word('accounts', total) });
  const values = { own: format(own), others: format(others), accounts: word('accounts', own), companions: word('companions', others) };
  return t('share.screenshotJoined', values);
}

export function formatStarCoordinates(position) {
  const values = positionValues(position);
  return values ? `(${signedFixed(values[0])}, ${signedFixed(values[1])}, ${signedFixed(values[2])})` : '';
}

function text(value, fallback = '') {
  return String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function limitCharacters(value, maximum) {
  return Array.from(value).slice(0, maximum).join('');
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (const character of String(seedText)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(context, x, y, width, height, radius) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function drawBaseBackground(context, width, height, seed) {
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#030303');
  background.addColorStop(0.44, '#0a0a09');
  background.addColorStop(1, '#040404');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.55);
  glow.addColorStop(0, 'rgba(180, 154, 105, 0.1)');
  glow.addColorStop(0.4, 'rgba(102, 93, 82, 0.04)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  const random = seededRandom(seed);
  for (let index = 0; index < 220; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const alpha = 0.03 + random() * 0.16;
    const radius = random() < 0.9 ? 0.5 + random() * 1.1 : 1.4 + random() * 1.8;
    context.fillStyle = `rgba(231, 221, 199, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawSnapshot(context, image, width, height) {
  if (!image) return;
  const sourceWidth = Number(image.videoWidth || image.naturalWidth || image.width);
  const sourceHeight = Number(image.videoHeight || image.naturalHeight || image.height);
  if (!(sourceWidth > 0 && sourceHeight > 0)) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sourceY = Math.max(0, (sourceHeight - cropHeight) / 2);
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
  const wash = context.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, 'rgba(2, 2, 2, 0.24)');
  wash.addColorStop(0.5, 'rgba(2, 2, 2, 0)');
  wash.addColorStop(1, 'rgba(2, 2, 2, 0.3)');
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);
}

function ellipsize(context, value, maxWidth, force = false) {
  if (!force && context.measureText(value).width <= maxWidth) return value;
  const ellipsis = '…';
  let result = '';
  for (const character of Array.from(value)) {
    if (context.measureText(result + character + ellipsis).width > maxWidth) break;
    result += character;
  }
  return result ? result + ellipsis : ellipsis;
}

function wrappedLines(context, value, maxWidth, maxLines = Infinity) {
  const source = String(value || '');
  if (!source) return [];
  const lines = [];
  let line = '';
  let pendingSpace = false;
  const flush = () => {
    if (!line) return;
    lines.push(line);
    line = '';
    pendingSpace = false;
  };
  const appendLongToken = token => {
    for (const character of Array.from(token)) {
      if (line && context.measureText(line + character).width > maxWidth) flush();
      line += character;
    }
  };
  source.split('\n').forEach(paragraph => {
    const tokens = paragraph.split(/(\s+)/u).filter(Boolean);
    if (!tokens.length) {
      lines.push(' ');
      return;
    }
    for (const token of tokens) {
      if (/^\s+$/u.test(token)) {
        if (line) pendingSpace = true;
        continue;
      }
      const separator = line && pendingSpace ? ' ' : '';
      const candidate = line + separator + token;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        pendingSpace = false;
        continue;
      }
      flush();
      if (context.measureText(token).width <= maxWidth) line = token;
      else appendLongToken(token);
    }
    flush();
  });
  const output = lines.slice(0, maxLines);
  if (!output.length) return [];
  if (lines.length > output.length) output[output.length - 1] = ellipsize(context, output[output.length - 1], maxWidth, true);
  if (output.length > 1 && /^[\s,.;:!?，。！？、；：]+$/u.test(output[output.length - 1])) {
    const punctuation = output.pop();
    output[output.length - 1] = ellipsize(context, output[output.length - 1] + punctuation, maxWidth);
  }
  return output;
}

function drawLine(context, card, scale) {
  if (!card.star?.visible) return;
  const startX = card.star.x * scale;
  const startY = card.star.y * scale;
  const endX = (card.side === 'left' ? card.x + card.w : card.x) * scale;
  const endY = Math.max(card.y + 24, Math.min(card.y + card.h - 24, card.star.y)) * scale;
  const gap = Math.max(48, Math.abs(endX - startX) * 0.34);
  const bend = Math.min(92, Math.max(24, Math.abs(endY - startY) * 0.28 + gap * 0.14));
  const direction = endX >= startX ? 1 : -1;
  context.save();
  context.strokeStyle = 'rgba(236, 218, 190, 0.78)';
  context.lineWidth = 1.25 * scale;
  context.lineCap = 'round';
  context.shadowColor = 'rgba(220, 195, 155, 0.36)';
  context.shadowBlur = 5 * scale;
  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(
    startX + gap * direction,
    startY + bend * scale,
    endX - gap * direction,
    endY - bend * scale,
    endX,
    endY,
  );
  context.stroke();
  context.restore();

  const halo = context.createRadialGradient(startX, startY, 0, startX, startY, 7 * scale);
  halo.addColorStop(0, 'rgba(255, 246, 230, 0.95)');
  halo.addColorStop(0.35, 'rgba(238, 200, 160, 0.45)');
  halo.addColorStop(1, 'rgba(238, 200, 160, 0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(startX, startY, 7 * scale, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255, 250, 242, 0.95)';
  context.beginPath();
  context.arc(startX, startY, 2 * scale, 0, Math.PI * 2);
  context.fill();
}

function drawCard(context, card, scale, t) {
  const x = card.x * scale;
  const y = card.y * scale;
  const width = card.w * scale;
  const height = card.h * scale;
  const padding = 14 * scale;
  const contentWidth = width - padding * 2;
  const account = card.account;
  const catalog = text(card.designation) || `AL ${String(account.catalogNumber || 0).padStart(6, '0')}`;
  const alias = limitCharacters(text(account.alias, catalog) || catalog, 32);
  const message = limitCharacters(text(account.message), 180);
  const started = text(account.started);
  const disabled = text(account.date);

  context.save();
  roundedRect(context, x, y, width, height, 10 * scale);
  context.clip();
  context.fillStyle = 'rgba(13, 12, 11, 0.93)';
  context.fillRect(x, y, width, height);

  let cursor = y + padding + 9 * scale;
  context.textAlign = 'left';
  context.fillStyle = '#a48d6d';
  context.font = `600 ${9 * scale}px ${FONT_MONO}`;
  context.letterSpacing = `${1.4 * scale}px`;
  context.fillText(catalog, x + padding, cursor);
  context.letterSpacing = '0px';
  cursor += 22 * scale;

  context.fillStyle = '#eee5d8';
  context.font = `400 ${22 * scale}px ${FONT_SERIF}`;
  const nameLines = wrappedLines(context, alias, contentWidth, 2);
  nameLines.forEach((line, index) => context.fillText(line, x + padding, cursor + index * 28 * scale));
  cursor += (nameLines.length - 1) * 28 * scale + 13 * scale;

  if (started || disabled) {
    const label = started ? t('card.onlinePeriod') : t('card.disabledDate');
    const value = started && disabled
      ? `${started.replaceAll('-', '/')}\n— ${disabled.replaceAll('-', '/')}`
      : (started || disabled).replaceAll('-', '/');
    cursor += 10 * scale;
    context.strokeStyle = 'rgba(213, 197, 172, 0.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + padding, cursor);
    context.lineTo(x + width - padding, cursor);
    context.stroke();
    cursor += 10 * scale;
    context.fillStyle = '#8a8174';
    context.font = `${10 * scale}px ${FONT_MONO}`;
    context.fillText(label, x + padding, cursor);
    cursor += 13 * scale;
    context.fillStyle = '#d0c0a9';
    context.font = `${13 * scale}px ${FONT_MONO}`;
    const dateLines = wrappedLines(context, value, contentWidth, 2);
    dateLines.forEach((line, index) => context.fillText(line, x + padding, cursor + index * 16 * scale));
    cursor += Math.max(0, dateLines.length - 1) * 16 * scale + 14 * scale;
  }

  if (message) {
    context.fillStyle = '#d0c6b7';
    context.font = `${13 * scale}px ${FONT_SERIF}`;
    const storyLines = wrappedLines(context, message, contentWidth, 4);
    storyLines.forEach((line, index) => context.fillText(line, x + padding, cursor + index * 19 * scale));
  }
  context.restore();

  roundedRect(context, x, y, width, height, 10 * scale);
  context.strokeStyle = 'rgba(218, 200, 167, 0.28)';
  context.lineWidth = 1;
  context.stroke();
}

function drawHeader(context, { title, countText, scale, width }) {
  context.textAlign = 'left';
  context.fillStyle = '#ce6d4d';
  context.font = `500 ${21 * scale}px ${FONT_SERIF}`;
  context.letterSpacing = `${1.5 * scale}px`;
  context.fillText(title, 18 * scale, 36 * scale);
  context.letterSpacing = '0px';
  if (!countText) return;
  context.fillStyle = 'rgba(226, 219, 207, 0.82)';
  context.font = `400 ${15 * scale}px ${FONT_SERIF}`;
  // Narrow (mobile) images cannot fit the full sentence on one line; wrap it
  // rather than cutting off the numbers, and only ellipsize beyond two lines.
  const maxWidth = Math.min(width - 36 * scale, 620 * scale);
  const lines = wrappedLines(context, countText, maxWidth);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = ellipsize(context, lines[1], maxWidth, true);
  }
  lines.forEach((line, index) => context.fillText(line, 18 * scale, (65 + index * 22) * scale));
}

function drawSlogan(context, slogan, { scale, width, height }) {
  context.textAlign = 'left';
  context.fillStyle = 'rgba(225, 216, 201, 0.9)';
  context.font = `400 ${23 * scale}px ${FONT_SERIF}`;
  const lines = wrappedLines(context, slogan, Math.min(width * 0.68, 760 * scale), 3);
  const lineHeight = 34 * scale;
  const first = height - 56 * scale - (lines.length - 1) * lineHeight;
  lines.forEach((line, index) => context.fillText(line, 18 * scale, first + index * lineHeight));
}

async function resolveSnapshot(snapshot, errorMessage) {
  if (typeof HTMLCanvasElement !== 'undefined' && snapshot instanceof HTMLCanvasElement) return snapshot;
  if (typeof snapshot !== 'string' || !snapshot.startsWith('data:image/')) return null;
  const image = new Image();
  image.decoding = 'async';
  const ready = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
  });
  image.src = snapshot;
  return ready;
}

function canvasToBlob(canvas, errorMessage) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error(errorMessage));
    }, 'image/png');
  });
}

function drawQrTile(context, value, x, y, size) {
  const qr=qrcode(0,'M');
  qr.addData(value);
  qr.make();
  const count=qr.getModuleCount();
  const quiet=4;
  const total=count+quiet*2;
  const cell=size/total;
  // Draw the modules directly in the warm theme colour; the dark panel behind
  // supplies contrast, so there is no white tile / background square.
  context.fillStyle='#d9c8ae';
  for(let row=0;row<count;row++){
    for(let column=0;column<count;column++){
      if(!qr.isDark(row,column))continue;
      context.fillRect(x+(column+quiet)*cell,y+(row+quiet)*cell,cell+0.35,cell+0.35);
    }
  }
}

/**
 * Compose a screenshot-like page image with up to three user cards (and their
 * connector lines) placed exactly where the temporary DOM cards were shown.
 */
export async function createCardsPageShare({
  snapshot,
  cards = [],
  viewport = { width: 1200, height: 800 },
  countText = '',
  siteUrl = '',
  slogan,
  locale = 'zh-CN',
} = {}) {
  const resolvedLocale = normalizeLocale(locale) || 'zh-CN';
  const t = (key, values) => translate(resolvedLocale, key, values);
  if (typeof document === 'undefined') throw new Error(t('share.imageFailed'));

  const image = await resolveSnapshot(snapshot, t('share.imageFailed'));
  const viewWidth = Math.max(1, Number(viewport.width) || 1200);
  const viewHeight = Math.max(1, Number(viewport.height) || 800);
  const scale = Math.max(1, Math.min(2, 1600 / viewWidth));
  const width = Math.round(viewWidth * scale);
  const height = Math.round(viewHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('share.imageFailed'));

  context.textBaseline = 'alphabetic';
  drawBaseBackground(context, width, height, 'page-cards');
  drawSnapshot(context, image, width, height);
  drawHeader(context, { title: t('brand.title'), countText, scale, width });

  for (const card of cards) drawLine(context, card, scale);
  for (const card of cards) drawCard(context, card, scale, t);

  if (!cards.length) {
    drawSlogan(context, String(slogan ?? sloganForLocale(resolvedLocale)), { scale, width, height });
  }

  // QR + URL directly on the image, bottom-right, in theme colours. A dark
  // glass panel supplies contrast without introducing a white background.
  const url = limitCharacters(text(siteUrl), 110);
  if (url) {
    const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const pad = Math.round(11 * scale);
    const qrSize = Math.max(90, Math.min(160, Math.round(width * 0.1)));
    const maxPanel = Math.round(width * 0.28);
    let urlFont = Math.max(10, 12 * scale);
    context.font = `${urlFont}px ${FONT_MONO}`;
    let measured = context.measureText(displayUrl).width;
    if (measured + pad * 2 > maxPanel) {
      urlFont = Math.max(8, Math.floor(urlFont * (maxPanel - pad * 2) / measured));
      context.font = `${urlFont}px ${FONT_MONO}`;
      measured = context.measureText(displayUrl).width;
    }
    const panelW = Math.min(maxPanel, Math.max(qrSize + pad * 2, Math.ceil(measured + pad * 2)));
    const panelH = pad + qrSize + Math.round(6 * scale) + urlFont * 1.35 + pad;
    const panelX = width - panelW - Math.round(18 * scale);
    const panelY = height - panelH - Math.round(18 * scale);
    context.save();
    context.fillStyle = 'rgba(8, 8, 7, 0.8)';
    context.fillRect(panelX, panelY, panelW, panelH);
    context.strokeStyle = 'rgba(213, 197, 172, 0.52)';
    context.lineWidth = Math.max(1, scale * 0.9);
    context.strokeRect(panelX, panelY, panelW, panelH);
    context.textAlign = 'center';
    const qrX = panelX + (panelW - qrSize) / 2;
    const qrY = panelY + pad;
    try {
      drawQrTile(context, url, qrX, qrY, qrSize);
    } catch (error) {
      console.warn('QR code unavailable', error);
    }
    context.fillStyle = 'rgba(217, 200, 174, 0.82)';
    context.font = `${urlFont}px ${FONT_MONO}`;
    context.fillText(
      ellipsize(context, displayUrl, panelW - pad * 2),
      panelX + panelW / 2,
      panelY + panelH - pad,
    );
    context.restore();
  }

  // Thin theme-coloured frame baked into the image; no matte or footer.
  const border = Math.max(1, Math.round(scale * 1.2));
  context.strokeStyle = 'rgba(213, 197, 172, 0.55)';
  context.lineWidth = border;
  context.strokeRect(border / 2, border / 2, width - border, height - border);

  const blob = await canvasToBlob(canvas, t('share.imageFailed'));
  return new File([blob], 'claude-starry-share.png', { type: 'image/png' });
}
