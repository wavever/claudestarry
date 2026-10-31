import {normalizeLocale,sloganForLocale,translate} from './i18n.js';

const WIDTH = 1080;
const HEIGHT = 1500;
const SNAPSHOT_HEIGHT = 626;
const INSET = 72;
const FONT_SANS = '"Microsoft YaHei", "PingFang SC", sans-serif';
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
 * Stable, display-safe coordinates shared by the star card and its image.
 * They describe this site's generated nebula, not a physical sky position.
 */
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

function dateLabel(value, empty = '') {
  const clean = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean.replaceAll('-', ' / ') : empty;
}

function safeDesignation(designation, account) {
  const supplied = text(designation);
  if (supplied) return supplied;
  const number = Number(account?.catalogNumber);
  return Number.isSafeInteger(number) && number > 0
    ? `AL ${String(number).padStart(6, '0')}`
    : 'AL 000000';
}

function safeFilename(designation, account) {
  const source = safeDesignation(designation, account).toUpperCase();
  const matched = source.match(/AL\s*[-_]?\s*(\d{1,12})/i);
  const number = matched ? matched[1].padStart(6, '0').slice(-12) : '000000';
  return `afterlight-AL-${number}.png`;
}

function seededRandom(seedText) {
  let seed = 2166136261;
  for (const character of String(seedText)) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
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

function drawBackground(context, seed) {
  const background = context.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, '#030303');
  background.addColorStop(0.43, '#0a0a09');
  background.addColorStop(1, '#050505');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(WIDTH * 0.5, SNAPSHOT_HEIGHT * 0.46, 0, WIDTH * 0.5, SNAPSHOT_HEIGHT * 0.46, 720);
  glow.addColorStop(0, 'rgba(180, 154, 105, 0.105)');
  glow.addColorStop(0.34, 'rgba(102, 93, 82, 0.042)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const random = seededRandom(seed);
  for (let index = 0; index < 205; index += 1) {
    const x = random() * WIDTH;
    const y = random() * HEIGHT;
    const alpha = 0.035 + random() * 0.19;
    const radius = random() < 0.9 ? 0.5 + random() * 1.1 : 1.8 + random() * 1.9;
    context.fillStyle = `rgba(231, 221, 199, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawSnapshotCover(context, image) {
  if (!image) return;
  const sourceWidth = Number(image.videoWidth || image.naturalWidth || image.width);
  const sourceHeight = Number(image.videoHeight || image.naturalHeight || image.height);
  if (!(sourceWidth > 0 && sourceHeight > 0)) return;

  const scale = Math.max(WIDTH / sourceWidth, SNAPSHOT_HEIGHT / sourceHeight);
  const cropWidth = WIDTH / scale;
  const cropHeight = SNAPSHOT_HEIGHT / scale;
  const sourceX = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sourceY = Math.max(0, (sourceHeight - cropHeight) / 2);
  context.save();
  context.beginPath();
  context.rect(0, 0, WIDTH, SNAPSHOT_HEIGHT);
  context.clip();
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, WIDTH, SNAPSHOT_HEIGHT);
  context.restore();

  const wash = context.createLinearGradient(0, 0, 0, SNAPSHOT_HEIGHT);
  wash.addColorStop(0, 'rgba(0, 0, 0, 0.30)');
  wash.addColorStop(0.49, 'rgba(0, 0, 0, 0.03)');
  wash.addColorStop(1, 'rgba(5, 5, 5, 0.94)');
  context.fillStyle = wash;
  context.fillRect(0, 0, WIDTH, SNAPSHOT_HEIGHT);
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
  if (!source) return [''];
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

  const paragraphs = source.split('\n');
  paragraphs.forEach(paragraph => {
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
  if (!output.length) return [''];
  if (lines.length > output.length) {
    output[output.length - 1] = ellipsize(context, output[output.length - 1], maxWidth, true);
  }
  // A lone punctuation mark is especially conspicuous on a social card. Fold
  // it back into the preceding line (and ellipsize if necessary) instead.
  if (output.length > 1 && /^[\s,.;:!?，。！？、；：]+$/u.test(output[output.length - 1])) {
    const punctuation = output.pop();
    output[output.length - 1] = ellipsize(context, output[output.length - 1] + punctuation, maxWidth);
  }
  return output;
}

function drawLines(context, lines, x, baseline, lineHeight) {
  lines.forEach((line, index) => context.fillText(line, x, baseline + index * lineHeight));
  return baseline + Math.max(0, lines.length - 1) * lineHeight;
}

function drawLabel(context, value, x, y) {
  context.fillStyle = '#958a79';
  context.font = `12px ${FONT_SANS}`;
  context.letterSpacing = '1.4px';
  context.fillText(value, x, y);
  context.letterSpacing = '0px';
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

/**
 * Render an export-ready social image.  The caller owns download/share UI;
 * this function only returns a deterministic PNG File.
 */
export async function createStarShare({ account = {}, designation, snapshot, siteUrl, slogan, locale = 'zh-CN' } = {}) {
  const resolvedLocale=normalizeLocale(locale)||'zh-CN';
  const t=(key,values)=>translate(resolvedLocale,key,values);
  if (typeof document === 'undefined') throw new Error(t('share.imageFailed'));
  const image = await resolveSnapshot(snapshot,t('share.imageFailed'));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('share.imageFailed'));

  const catalog = safeDesignation(designation, account);
  const alias = limitCharacters(text(account.alias, catalog) || catalog, 32);
  const message = limitCharacters(text(account.message, t('share.defaultMessage')) || t('share.defaultMessage'), 180);
  const url = limitCharacters(text(siteUrl), 112);
  const shareSlogan = String(slogan ?? sloganForLocale(resolvedLocale))
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim() || sloganForLocale(resolvedLocale);
  const seed = `${account.id || catalog}:${account.date || ''}`;

  drawBackground(context, seed);
  drawSnapshotCover(context, image);

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.58)';
  context.shadowBlur = 44;
  context.shadowOffsetY = 18;
  roundedRect(context, INSET, 564, WIDTH - INSET * 2, 866, 22);
  context.fillStyle = 'rgba(15, 14, 13, 0.94)';
  context.fill();
  context.restore();
  roundedRect(context, INSET, 564, WIDTH - INSET * 2, 866, 22);
  context.strokeStyle = 'rgba(218, 200, 167, 0.26)';
  context.lineWidth = 1;
  context.stroke();

  const left = INSET + 42;
  const right = WIDTH - INSET - 42;
  context.textAlign = 'left';
  context.fillStyle = '#b8a483';
  context.font = `12px ${FONT_MONO}`;
  context.letterSpacing = '2.5px';
  context.fillText(`${t('brand.title').toUpperCase()}  /  ${t('share.record')}`, left, 620);
  context.letterSpacing = '0px';

  context.fillStyle = '#eee6d9';
  context.font = `50px ${FONT_SANS}`;
  const aliasLines = wrappedLines(context, alias, right - left, 2);
  const aliasBottom = drawLines(context, aliasLines, left, 682, 64);

  context.fillStyle = '#c9ad7f';
  context.font = `18px ${FONT_MONO}`;
  context.letterSpacing = '1.8px';
  context.fillText(catalog, left, aliasBottom + 42);
  context.letterSpacing = '0px';

  const ruleY = aliasBottom + 72;
  context.strokeStyle = 'rgba(218, 200, 167, 0.20)';
  context.beginPath();
  context.moveTo(left, ruleY);
  context.lineTo(right, ruleY);
  context.stroke();

  const coordinateY = ruleY + 37;
  drawLabel(context, `${t('share.coordinates')}  ·  XYZ`, left, coordinateY);
  context.fillStyle = '#d8cbbc';
  context.font = `17px ${FONT_MONO}`;
  context.fillText(formatStarCoordinates(account.position) || t('share.coordinatesUnavailable'), left, coordinateY + 31);
  context.fillStyle = '#7f786e';
  context.font = `12px ${FONT_SANS}`;
  context.fillText(t('share.located'), left, coordinateY + 56);

  const dateX = left + 474;
  drawLabel(context, t('share.started'), dateX, coordinateY);
  context.fillStyle = '#d8cbbc';
  context.font = `16px ${FONT_MONO}`;
  context.fillText(dateLabel(account.started, t('share.unfilled')), dateX, coordinateY + 29);
  drawLabel(context, t('share.disabled'), dateX, coordinateY + 61);
  context.fillStyle = '#d8cbbc';
  context.font = `16px ${FONT_MONO}`;
  context.fillText(dateLabel(account.date, t('share.unrecorded')), dateX, coordinateY + 90);

  const messageRuleY = coordinateY + 120;
  context.strokeStyle = 'rgba(218, 200, 167, 0.15)';
  context.beginPath();
  context.moveTo(left, messageRuleY);
  context.lineTo(right, messageRuleY);
  context.stroke();
  drawLabel(context, t('share.message'), left, messageRuleY + 35);
  context.fillStyle = '#d9d1c6';
  context.font = `24px ${FONT_SANS}`;
  const messageLines = wrappedLines(context, message, right - left, 6);
  const messageBottom = drawLines(context, messageLines, left, messageRuleY + 76, 39);

  const sloganY = Math.max(messageBottom + 70, 1283);
  context.strokeStyle = 'rgba(218, 200, 167, 0.15)';
  context.beginPath();
  context.moveTo(left, sloganY - 29);
  context.lineTo(right, sloganY - 29);
  context.stroke();
  context.fillStyle = '#a79b8b';
  context.font = `19px ${FONT_SANS}`;
  const sloganLines = wrappedLines(context, shareSlogan, right - left, 2);
  drawLines(context, sloganLines, left, sloganY, 31);

  if (url) {
    context.fillStyle = '#a59985';
    context.font = `20px ${FONT_MONO}`;
    context.fillText(ellipsize(context, url, right - left - 220), left, 1401);
  }
  context.fillStyle = '#6f675c';
  context.font = `11px ${FONT_MONO}`;
  context.textAlign = 'right';
  context.fillText('CLAUDE STARRY', right, 1401);

  const blob = await canvasToBlob(canvas,t('share.imageFailed'));
  return new File([blob], safeFilename(catalog, account), { type: 'image/png' });
}
