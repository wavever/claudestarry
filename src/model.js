import { claudePosition } from './claude-field.js';
export const DAY_MS = 86400000;
export const HALF_LIFE = 120;
export const MIN_LIGHT = 0.03;
export const STORAGE_KEY = 'afterlight-3d-accounts-v1';
export function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function dateToDay(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const ms = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return NaN;
  return ms / DAY_MS;
}
export function dayToDate(day) { return new Date(Math.floor(day) * DAY_MS).toISOString().slice(0, 10); }
export function brightness(ageDays) {
  if (ageDays < 0) return 0;
  return MIN_LIGHT + (1 - MIN_LIGHT) * Math.pow(2, -ageDays / HALF_LIFE);
}
export function seededRandom(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function galaxyPosition(seed) {
  return claudePosition(seed);
}

export function nextCatalogNumber(accounts) {
  return accounts.reduce((max,a)=>Math.max(max,Number.isSafeInteger(a.catalogNumber)?a.catalogNumber:0),0)+1;
}
export function catalogDesignation(account) {
  return 'AL '+String(account.catalogNumber).padStart(6,'0');
}

export const CLAUDE_EPOCH = '2021-01-26';
export const MIN_DAY = dateToDay(CLAUDE_EPOCH);

function textLength(value) { return Array.from(value).length; }

export function validAccount(a, maxDay = dateToDay(today()), minDay = MIN_DAY) {
  if (!a || typeof a !== 'object') return false;
  if (typeof a.id !== 'string' || textLength(a.id) === 0 || textLength(a.id) > 80) return false;
  if (typeof a.alias !== 'string' || a.alias.trim().length === 0 || textLength(a.alias.trim()) > 32) return false;
  if (typeof a.message !== 'string' || textLength(a.message) > 180) return false;
  const dateDay = dateToDay(a.date);
  if (!Number.isFinite(dateDay) || (minDay !== null && minDay !== undefined && dateDay < minDay) || dateDay > maxDay) return false;
  if (a.started) {
    const startedDay = dateToDay(a.started);
    if (!Number.isFinite(startedDay) || (minDay !== null && minDay !== undefined && startedDay < minDay) || startedDay > dateDay) return false;
  }
  return true;
}
export function loadAccounts(storage, maxDay) {
  const raw = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(raw)) throw new Error('Invalid stored star collection');
  return mergeAccounts([],raw,maxDay);
}
// One stable record ID -> one independent star. Replayed API events must
// update the existing star, never create a second visual representation.
export function mergeAccounts(existing, incoming, maxDay = dateToDay(today())) {
  const unique = new Map();
  const reserved=new Map();
  let next=nextCatalogNumber([...existing,...incoming]);
  for (const a of [...existing, ...incoming]) {
    if (!validAccount(a,maxDay)) continue;
    let catalogNumber=unique.get(a.id)?.catalogNumber??a.catalogNumber;
    if(!Number.isSafeInteger(catalogNumber)||catalogNumber<1||(reserved.has(catalogNumber)&&reserved.get(catalogNumber)!==a.id))catalogNumber=next++;
    reserved.set(catalogNumber,a.id);
    unique.set(a.id, {catalogNumber,id:a.id, alias:a.alias.trim(), date:a.date, started:a.started || null, message:a.message.trim(), sample:false, position:galaxyPosition(hashId(a.id))});
  }
  return [...unique.values()];
}

// Lifetime changes both the initial light and its subsequent half-life.
// Legacy records with no registration date retain the original decay curve.
export function starProfile(a){
  if(!a.started)return {peak:1,halfLife:HALF_LIFE};
  const life=Math.max(1,dateToDay(a.date)-dateToDay(a.started)+1);
  return {peak:.45+.55*Math.min(1,Math.log1p(life)/Math.log1p(365)),halfLife:Math.min(730,30+Math.sqrt(life)*10)};
}
export function accountBrightness(a,day){const age=day-dateToDay(a.date);if(age<0)return 0;const p=starProfile(a);return MIN_LIGHT+(p.peak-MIN_LIGHT)*Math.pow(2,-age/p.halfLife);}
