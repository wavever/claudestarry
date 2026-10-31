import './style.css';
import { Universe } from './universe.js';
import { DEFAULT_CONFIG, CONFIG_STORAGE_KEY, loadConfig, normalizeConfig, defaultConfigForLocale, localizeDefaultSlogan } from './config.js';
import { today, dateToDay, DAY_MS, loadAccounts, validAccount, mergeAccounts, STORAGE_KEY, accountBrightness, starProfile, nextCatalogNumber, catalogDesignation, CLAUDE_EPOCH, MIN_DAY } from './model.js';
import { ParticleCounter } from './particle-counter.js';
import { getSharedStarsConfig, latestCivilDate, SharedStarsClient } from './shared-stars.js';
import {applyDocumentLocale,normalizeLocale,persistLocale,resolveLocale,safeStorage,translate} from './i18n.js';

const $ = selector => document.querySelector(selector);
let accounts = [];
let universe;
let ready = false;
let entryControlsReady = false;
let counter = null;
let toastTimer;
let cardId = null;
let lastStarTipHit = null;
let currentFormError = null;
let sharedStars = null;
let submissionInFlight = false;
const meteorQueue=[];
const queuedMeteorIds=new Set();
const browserStorage=safeStorage(()=>localStorage);
let locale=resolveLocale({search:location.search,storage:browserStorage,languages:navigator.languages});
applyDocumentLocale(locale);
let config=defaultConfigForLocale(locale);
try{config=loadConfig(browserStorage,defaultConfigForLocale(locale));config.slogan=localizeDefaultSlogan(config.slogan,locale,import.meta.env.DEV);}catch{}
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || location.origin + location.pathname;
const sharedConfig=getSharedStarsConfig(import.meta.env);
const t=(key,values)=>translate(locale,key,values);
const formatNumber=value=>new Intl.NumberFormat(locale==='zh-CN'?'zh-CN':'en-US').format(value);
addEventListener('afterlight:localechange',event=>setLocale(event.detail?.locale));

const OWN_IDS_KEY = 'afterlight_own_ids_v1';
let ownAccountIds = new Set();
try {
  const stored = JSON.parse(browserStorage?.getItem(OWN_IDS_KEY) || '[]');
  if (Array.isArray(stored)) ownAccountIds = new Set(stored);
} catch {}

function recordOwnId(id) {
  if (!id) return;
  ownAccountIds.add(id);
  try {
    browserStorage?.setItem(OWN_IDS_KEY, JSON.stringify([...ownAccountIds]));
  } catch {}
}

function isOwnAccount(account) {
  if (!account) return false;
  if (ownAccountIds.has(account.id)) return true;
  if (sharedStars?.ownIds?.has(account.id)) return true;
  if (!sharedConfig && typeof account.id === 'string' && account.id.startsWith('MY-')) return true;
  return false;
}

function meteorBusy(){return Boolean(universe?.meteor)||meteorQueue.length>0||submissionInFlight;}
function updateAccountCount(){
  const count=accounts.filter(a=>!a.sample).length;
  counter?.setCount(count);
  const countKey=count===1?'One':'';
  $('#account-counter')?.setAttribute('aria-label',t(`counter.aria${countKey}`,{count:formatNumber(count)}));
  const suffix=$('#account-counter-suffix');
  if(suffix)suffix.textContent=t(`counter.suffix${countKey}`);
}
function setVisibleAccounts(next){
  accounts=next;
  universe?.setAccounts(accounts);
  updateAccountCount();
}
function applySharedRecords(records){
  // A shared record may use a legitimate civil date ahead of this visitor's.
  setVisibleAccounts(mergeAccounts([],records,dateToDay(latestCivilDate())));
}

function drainMeteorQueue(){
  if(!universe||universe.meteor||!meteorQueue.length)return;
  const item=meteorQueue.shift();
  const index=accounts.findIndex(account=>account.id===item.id);
  if(index<0){queuedMeteorIds.delete(item.id);drainMeteorQueue();return;}
  const launched=universe.ignite(index,()=>{
    queuedMeteorIds.delete(item.id);
    if(item.own){
      const landedIndex=accounts.findIndex(account=>account.id===item.id);
      if(landedIndex>=0)showCard(landedIndex);
    }
    updateViewControls();
    drainMeteorQueue();
  },{focus:false,interrupt:false});
  if(!launched){meteorQueue.unshift(item);return;}
  updateViewControls();
}
function enqueueMeteor(id,{own=false}={}){
  if(!id||queuedMeteorIds.has(id)||universe?.meteor?.id===id)return;
  queuedMeteorIds.add(id);meteorQueue.push({id,own});drainMeteorQueue();
}

function updateViewControls(){
  if(!ready || !universe)return;
  if(entryControlsReady){
    $('#create').disabled=meteorBusy();
    $('#restore').disabled=false;
  }
}

function computeCardPlacement(point, cardW, cardH) {
  const margin = innerWidth < 700 ? 14 : 32;
  const leadGap = 36; // horizontal leader entering card
  const centerX = universe ? universe.projectPoint(0, 0, 0).x : innerWidth * 0.5;

  // 1. Determine horizontal side: Blank area on either side of the nebula
  // The card MUST NOT be placed on the nebula; it only sits in the left/right blank flanks.
  // We choose the blank side that is closest to the star particle.
  const isRight = (universe?.cardSide || (point.x >= centerX ? 'right' : 'left')) === 'right';

  let cardX, targetEdgeX, elbowX;
  if (isRight) {
    // Placed in the RIGHT blank area outside the nebula
    cardX = Math.round(innerWidth - cardW - margin);
    targetEdgeX = cardX;
    elbowX = Math.round(targetEdgeX - leadGap);
  } else {
    // Placed in the LEFT blank area outside the nebula
    cardX = Math.round(margin);
    targetEdgeX = cardX + cardW;
    elbowX = Math.round(targetEdgeX + leadGap);
  }

  // 2. Vertical position: NOT horizontal! Must have significant vertical delta
  const topLimit = innerWidth < 700 ? 128 : 112;
  const bottomLimit = innerWidth < 700 ? 110 : 84;
  const isAbove = (point.y >= innerHeight * 0.45);

  let cardY, elbowY;
  if (isAbove) {
    // Place card above star
    const desiredY = point.y - cardH * 0.85;
    cardY = Math.round(Math.max(topLimit, Math.min(innerHeight - cardH - bottomLimit, desiredY)));
    elbowY = Math.round(cardY + Math.min(cardH - 24, Math.max(28, cardH * 0.72)));
    if (point.y - elbowY < 40) {
      if (cardY > topLimit + 40) {
        cardY -= 40;
        elbowY -= 40;
      }
    }
  } else {
    // Place card below star
    const desiredY = point.y + 40;
    cardY = Math.round(Math.max(topLimit, Math.min(innerHeight - cardH - bottomLimit, desiredY)));
    elbowY = Math.round(cardY + Math.min(cardH - 24, Math.max(28, cardH * 0.28)));
    if (elbowY - point.y < 40) {
      if (cardY + cardH < innerHeight - bottomLimit - 40) {
        cardY += 40;
        elbowY += 40;
      }
    }
  }

  return {
    cardX,
    cardY,
    targetEdgeX,
    elbowX,
    elbowY,
    sx: Math.round(point.x),
    sy: Math.round(point.y)
  };
}

function updateCardPosition(){
  if(!cardId || $('#star-card').hidden)return;
  const index=accounts.findIndex(a=>a.id===cardId);
  if(index<0)return;
  const point=universe.project(index);
  const card=$('#star-card');
  const anchor=$('#star-anchor');
  const svg=$('#card-connector-svg');

  if(!point.visible){
    card.style.visibility='hidden';
    anchor.hidden=true;
    if(svg)svg.style.display='none';
    return;
  }
  card.style.visibility='visible';
  anchor.hidden=false;
  anchor.style.transform=`translate3d(${point.x-12}px,${point.y-12}px,0)`;
  if(svg)svg.style.display='block';

  const cardW=card.offsetWidth||280;
  const cardH=card.offsetHeight||250;

  const placement = computeCardPlacement(point, cardW, cardH);
  card.style.transform = `translate3d(${placement.cardX}px,${placement.cardY}px,0)`;

  // Update SVG connector path with obtuse angle bend
  const path = $('#card-connector-path');
  if(path){
    const d = `M ${placement.sx} ${placement.sy} L ${placement.elbowX} ${placement.elbowY} L ${placement.targetEdgeX} ${placement.elbowY}`;
    path.setAttribute('d', d);
  }
  const dotStar = $('#card-connector-dot-star');
  if(dotStar){
    dotStar.setAttribute('cx', placement.sx);
    dotStar.setAttribute('cy', placement.sy);
  }
  const dotElbow = $('#card-connector-dot-elbow');
  if(dotElbow){
    dotElbow.setAttribute('cx', placement.elbowX);
    dotElbow.setAttribute('cy', placement.elbowY);
  }
  const dotCard = $('#card-connector-dot-card');
  if(dotCard){
    dotCard.setAttribute('cx', placement.targetEdgeX);
    dotCard.setAttribute('cy', placement.elbowY);
  }
}
function closeCard(){
  $('#star-anchor').hidden=true;
  $('#star-card').hidden=true;
  const svg=$('#card-connector-svg');
  if(svg)svg.style.display='none';
  if(universe)universe.setCardView(false);
  cardId=null;
}
function renderCard(account){
  if(!account)return;
  $('#card-name').textContent=account.alias;
  $('#card-catalog').textContent=catalogDesignation(account);

  const datesRow = $('#card-dates-group');
  if(account.started || account.date){
    datesRow.hidden = false;
    $('#card-dates-label').textContent = account.started ? t('card.onlinePeriod') : t('card.disabledDate');
    $('#card-dates').textContent = account.started
      ? `${account.started.replaceAll('-', ' / ')} — ${account.date.replaceAll('-', ' / ')}`
      : account.date.replaceAll('-', ' / ');
  } else {
    datesRow.hidden = true;
  }

  // Story: 没有的就直接不展示
  const cardMsg = $('#card-message');
  if(account.message && account.message.trim()){
    cardMsg.hidden = false;
    cardMsg.textContent = account.message.trim();
  } else {
    cardMsg.hidden = true;
  }
}
function showCard(index){
  const account=accounts[index];if(!account)return;
  hideStarTip();cardId=account.id;
  renderCard(account);

  const point = universe ? universe.project(index) : { x: innerWidth * 0.5 };
  const centerX = universe ? universe.projectPoint(0, 0, 0).x : innerWidth * 0.5;
  const isRight = point.x >= centerX;
  if(universe) universe.setCardView(true, isRight ? 'right' : 'left');

  $('#star-card').hidden=false;
  updateCardPosition();
}
if(!sharedConfig){
  try {
    accounts = loadAccounts(browserStorage);
  } catch {
    // A broken local record should not prevent the historical sky from opening.
  }
}

const counterCanvas = $('#counter-canvas');
if (counterCanvas) {
  counter = new ParticleCounter(counterCanvas);
  updateAccountCount();
}

window.addEventListener('storage', e => {
  if (!sharedConfig && e.key === STORAGE_KEY) {
    try {
      setVisibleAccounts(loadAccounts(browserStorage));
    } catch {}
  }
});

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function clearFormError(){
  currentFormError=null;
  $('#form-error').textContent='';
}
function setFormError(key,values){
  currentFormError={key,values};
  $('#form-error').textContent=t(key,values);
}
function setFormErrorMessage(message){
  currentFormError=null;
  $('#form-error').textContent=message;
}

function lifespanDays(account) {
  if (!account.started) return null;
  return Math.max(1, dateToDay(account.date) - dateToDay(account.started) + 1);
}

function lifeLabel(account) {
  const days = lifespanDays(account);
  return days === null ? t('life.missingStarted') : t('life.onlineDays',{days:formatNumber(days)});
}

function currentLight(account) {
  return accountBrightness(account, Date.now() / DAY_MS);
}

function hideStarTip() {
  lastStarTipHit = null;
  $('#star-tip').hidden = true;
}

function showStarTip(hit) {
  if (!hit || $('#create-dialog').open) {
    hideStarTip();
    return;
  }
  const account = accounts[hit.index];
  if (!account) {
    hideStarTip();
    return;
  }
  if (cardId === account.id) {
    hideStarTip();
    return;
  }

  $('#star-tip-name').textContent = account.alias;
  $('#star-tip-catalog').textContent = catalogDesignation(account);

  const tipDates = $('#star-tip-dates');
  if (account.started || account.date) {
    tipDates.hidden = false;
    tipDates.textContent = account.started
      ? `${account.started.replaceAll('-', ' / ')} — ${account.date.replaceAll('-', ' / ')}`
      : t('card.disabledOn',{date:account.date.replaceAll('-', ' / ')});
  } else {
    tipDates.hidden = true;
  }

  // Story: 没有的就直接不展示
  const tipMsg = $('#star-tip-message');
  if (account.message && account.message.trim()) {
    tipMsg.hidden = false;
    tipMsg.textContent = account.message.trim();
  } else {
    tipMsg.hidden = true;
  }

  const tip = $('#star-tip');
  lastStarTipHit = {...hit};
  tip.hidden = false;
  const tipW = tip.offsetWidth || 220;
  const tipH = tip.offsetHeight || 80;
  const x = Math.max(14, Math.min(innerWidth - tipW - 14, hit.x + 14));
  const y = Math.max(14, Math.min(innerHeight - tipH - 14, hit.y - tipH - 10 > 10 ? hit.y - tipH - 10 : hit.y + 14));
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

function select(index) {
  if (index === null || index === undefined) {
    hideStarTip();
    closeCard();
    return;
  }
  const account = accounts[index];
  if (!account) return;
  if (isOwnAccount(account)) {
    // 只有自己添加的点击粒子后才是这个名片效果
    hideStarTip();
    showCard(index);
  } else {
    // 其他的都是鼠标悬浮或点击后展示当前这种小气泡效果，然后里面的信息也是这些内容
    closeCard();
    const point = universe.project(index);
    showStarTip({ index, x: point.x, y: point.y });
  }
}

function updateLifePreview() {
  const preview = $('#life-preview');
  if (!preview) return;
  const started = $('#star-form input[name=started]').value;
  const ended = $('#star-form input[name=date]').value;
  if (!started) {
    preview.textContent = '';
    preview.classList.remove('ready');
    return;
  }
  if (!ended || dateToDay(started) > dateToDay(ended)) {
    preview.textContent = t('life.invalidRange');
    preview.classList.remove('ready');
    return;
  }
  const account = { started, date: ended };
  const days = lifespanDays(account);
  const profile = starProfile(account);
  preview.textContent = t('life.preview',{days:formatNumber(days),peak:Math.round(profile.peak*100),halfLife:formatNumber(Math.round(profile.halfLife))});
  preview.classList.add('ready');
}

function syncDateBounds() {
  const started = $('#star-form input[name=started]');
  const ended = $('#star-form input[name=date]');
  started.min = CLAUDE_EPOCH;
  started.max = ended.value || today();
  ended.min = started.value || CLAUDE_EPOCH;
  ended.max = today();
  updateLifePreview();
}

function fatal() {
  window.__afterlightEntryBoot?.finish();
  $('#webgl-error').hidden = false;
  $('#create').disabled = true;
}

const entryBoot=window.__afterlightEntryBoot;
if(entryBoot)await entryBoot.ready;

try {
  universe = new Universe($('#scene'), accounts, {
    config,
    ariaLabel:t('scene.aria'),
    onHover: showStarTip,
    onSelect: select,
    onFrame: () => { universe?.setDay(Date.now() / DAY_MS); if(universe){updateCardPosition();updateViewControls();} },
    onNebulaReady: () => {
      document.body.classList.add('nebula-ready');
      entryControlsReady = true;
      $('#restore').disabled = false;
      $('#create').disabled = meteorBusy();
    },
    onReady: () => {
      ready = true;
      document.body.classList.add('loaded');
      entryBoot?.finish();
    },
    onError: fatal,
  });
  if(import.meta.env.DEV)window.__universe = universe;
  if(entryBoot){
    if(config.animationMode==='slogan-freeze'){
      universe.entryClock.elapsed=config.lightDuration+0.5;
      universe.uniforms.uTextReveal.value=1;
      universe.uniforms.uTextMorph.value=0;
      universe.uniforms.uFormation.value=0;
    }else if(config.animationMode==='nebula-freeze'){
      universe.entryClock.elapsed=100;
      universe.uniforms.uTextReveal.value=1;
      universe.uniforms.uTextMorph.value=1;
      universe.uniforms.uFormation.value=1;
    }else{
      universe.entryClock.elapsed=config.lightDuration+config.textHold;
      universe.uniforms.uTextReveal.value=1;
    }
  }
} catch (error) {
  console.error(error);
  fatal();
}

if(sharedConfig&&universe){
  const formNote=$('.form-note');
  if(formNote)formNote.textContent=t('form.sharedNote');
  sharedStars=new SharedStarsClient(sharedConfig,{
    onRecords:records=>applySharedRecords(records),
    onRemoteStar:record=>enqueueMeteor(record.id),
    onError:error=>toast(error.message),
    message:key=>t(`errors.${key}`),
  });
  void sharedStars.start();
  addEventListener('pagehide',()=>sharedStars?.stop());
  addEventListener('pageshow',event=>{
    if(event.persisted)void sharedStars?.start();
  });
}

$('#create').addEventListener('click', () => {
  if (!ready || !entryControlsReady || meteorBusy()) return;
  hideStarTip();
  clearFormError();
  const designation=catalogDesignation({catalogNumber:nextCatalogNumber(accounts)});
  if ($('#catalog-preview')) $('#catalog-preview').textContent=sharedStars?t('form.catalogOnSave'):designation;
  $('#star-form input[name=alias]').placeholder=t('dialog.aliasPlaceholder');
  const ended = $('#star-form input[name=date]');
  if (!ended.value) ended.value = today();
  syncDateBounds();
  closeCard();
  $('#create-dialog').showModal();
});

document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      dialog.close();
    }
  });
});

$('#star-form input[name=started]').addEventListener('input', syncDateBounds);
$('#star-form input[name=date]').addEventListener('input', syncDateBounds);

$('#star-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || meteorBusy()) return;
  const data = new FormData(event.target);
  const catalogNumber = nextCatalogNumber(accounts);
  const rawAlias = data.get('alias')?.toString().trim();
  if (!rawAlias) {
    setFormError('form.requiredAlias');
    return;
  }
  if (Array.from(rawAlias).length > 32) {
    setFormError('form.aliasTooLong');
    return;
  }

  const rawDate = data.get('date')?.toString().trim();
  if (!rawDate) {
    setFormError('form.requiredDate');
    return;
  }
  const maxDay = dateToDay(today());
  const dateDay = dateToDay(rawDate);
  if (!Number.isFinite(dateDay)) {
    setFormError('form.invalidDate');
    return;
  }
  if (dateDay < MIN_DAY) {
    setFormError('form.dateTooEarly');
    return;
  }
  if (dateDay > maxDay) {
    setFormError('form.dateTooLate');
    return;
  }

  const rawStarted = data.get('started')?.toString().trim() || null;
  if (rawStarted) {
    const startedDay = dateToDay(rawStarted);
    if (!Number.isFinite(startedDay)) {
      setFormError('form.invalidStarted');
      return;
    }
    if (startedDay < MIN_DAY) {
      setFormError('form.startedTooEarly');
      return;
    }
    if (startedDay > dateDay) {
      setFormError('form.startedAfterDate');
      return;
    }
  }

  const rawMessage = data.get('message')?.toString().trim() || '';
  if (Array.from(rawMessage).length > 180) {
    setFormError('form.storyTooLong');
    return;
  }

  const account = {
    catalogNumber,
    id: 'MY-' + crypto.randomUUID(),
    alias: rawAlias,
    started: rawStarted,
    date: rawDate,
    message: rawMessage,
  };
  if (!validAccount(account, maxDay, MIN_DAY)) {
    setFormError('form.invalid');
    return;
  }
  clearFormError();
  recordOwnId(account.id);
  if(sharedStars){
    submissionInFlight=true;
    $('#create').disabled=true;
    try{
      const saved=await sharedStars.submit({...account,alias:rawAlias});
      recordOwnId(saved.id);
      applySharedRecords(sharedStars.listRecords());
      $('#create-dialog').close();
      event.target.reset();
      enqueueMeteor(saved.id,{own:true});
    }catch(error){
      if(error?.message)setFormErrorMessage(error.message);else setFormError('errors.saveFallback');
    }finally{
      submissionInFlight=false;
      updateViewControls();
    }
    return;
  }
  const next = mergeAccounts(accounts, [account]);
  try {
    if(!browserStorage)throw new Error('storage unavailable');
    browserStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    setFormError('form.saveFailed');
    return;
  }
  setVisibleAccounts(next);
  $('#create-dialog').close();
  event.target.reset();
  enqueueMeteor(account.id,{own:true});
});

addEventListener('resize', hideStarTip);

async function captureGalaxyCardBlob(account) {
  if (!universe || !account) return null;
  const index = accounts.findIndex(a => a.id === account.id);
  const point = index >= 0 ? universe.project(index) : null;
  const card = $('#star-card');
  const cardW = card.offsetWidth || 280;
  const cardH = card.offsetHeight || 250;

  const dataUrl = universe.captureFrame({ preserveView: true });
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const width = img.width;
  const height = img.height;
  const scale = width / Math.max(1, window.innerWidth);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. WebGL galaxy background
  ctx.drawImage(img, 0, 0);

  // 2. Connecting line with obtuse bend
  const pt = (point && Number.isFinite(point.x) && Number.isFinite(point.y))
    ? {
        x: Math.max(20, Math.min(innerWidth - 20, point.x)),
        y: Math.max(20, Math.min(innerHeight - 20, point.y))
      }
    : { x: Math.round(innerWidth * 0.5), y: Math.round(innerHeight * 0.5) };

  const placement = computeCardPlacement(pt, cardW, cardH);
  const sx = placement.sx * scale;
  const sy = placement.sy * scale;
  const ex = placement.elbowX * scale;
  const ey = placement.elbowY * scale;
  const tx = placement.targetEdgeX * scale;

  ctx.save();
  ctx.strokeStyle = 'rgba(225, 205, 175, 0.42)';
  ctx.lineWidth = 1 * scale;
  ctx.setLineDash([4 * scale, 4 * scale]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(tx, ey);
  ctx.stroke();

  ctx.setLineDash([]);
  // Elbow and card junction dots
  ctx.fillStyle = 'rgba(235, 220, 195, 0.75)';
  ctx.beginPath(); ctx.arc(ex, ey, 2 * scale, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx, ey, 2 * scale, 0, Math.PI * 2); ctx.fill();

  // 指引圆环 (Indicator Ring)
  ctx.strokeStyle = 'rgba(225, 205, 175, 0.55)';
  ctx.lineWidth = 1 * scale;
  ctx.shadowColor = 'rgba(206, 109, 77, 0.4)';
  ctx.shadowBlur = 8 * scale;
  ctx.beginPath();
  ctx.arc(sx, sy, 12 * scale, 0, Math.PI * 2);
  ctx.stroke();

  // 粒子的发光效果 (Glowing Particle Halo)
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16 * scale);
  glow.addColorStop(0, 'rgba(255, 248, 238, 0.95)');
  glow.addColorStop(0.25, 'rgba(238, 172, 144, 0.65)');
  glow.addColorStop(0.55, 'rgba(206, 109, 77, 0.3)');
  glow.addColorStop(1, 'rgba(206, 109, 77, 0)');
  ctx.fillStyle = glow;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(sx, sy, 16 * scale, 0, Math.PI * 2);
  ctx.fill();

  // 粒子高亮晶莹核心 (Bright Core)
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 240, 220, 0.95)';
  ctx.shadowBlur = 6 * scale;
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Card
  const cx = placement.cardX * scale;
  const cy = placement.cardY * scale;
  const cw = cardW * scale;
  const ch = cardH * scale;
  const r = 10 * scale;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 28 * scale;
    ctx.shadowOffsetY = 10 * scale;

    ctx.fillStyle = 'rgba(14, 13, 11, 0.93)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx, cy, cw, ch, r);
    else ctx.rect(cx, cy, cw, ch);
    ctx.fill();

    ctx.strokeStyle = 'rgba(218, 200, 167, 0.35)';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    ctx.restore();

    const padX = 20 * scale;
    const startX = cx + padX;
    const maxTextW = cw - padX * 2;
    let curY = cy + 28 * scale;

    ctx.fillStyle = '#99866d';
    ctx.font = `600 ${8.5 * scale}px "SFMono-Regular", Consolas, monospace`;
    ctx.fillText(t('share.record'), startX, curY);
    curY += 24 * scale;

    // Name
    ctx.fillStyle = '#eee5d8';
    ctx.font = `500 ${18 * scale}px "Songti SC", Georgia, serif`;
    ctx.fillText(account.alias || '', startX, curY);
    curY += 18 * scale;

    // Catalog
    ctx.fillStyle = '#a89882';
    ctx.font = `${10 * scale}px "SFMono-Regular", Consolas, monospace`;
    ctx.fillText(catalogDesignation(account), startX, curY);
    curY += 20 * scale;

    if (account.started || account.date) {
      ctx.fillStyle = '#7a756d';
      ctx.font = `${9.5 * scale}px -apple-system, sans-serif`;
      const dateText = account.started
        ? `${t('card.onlinePeriod')}: ${account.started.replaceAll('-', ' / ')} — ${account.date.replaceAll('-', ' / ')}`
        : t('card.disabledOn',{date:account.date.replaceAll('-', ' / ')});
      ctx.fillText(dateText, startX, curY);
      curY += 20 * scale;
    }

    // Story
    if (account.message && account.message.trim()) {
      ctx.fillStyle = '#ccc4b8';
      ctx.font = `${11.5 * scale}px "Songti SC", Georgia, serif`;
      const chars = Array.from(account.message.trim());
      let line = '';
      for (let n = 0; n < chars.length; n++) {
        const testLine = line + chars[n];
        if (ctx.measureText(testLine).width > maxTextW && n > 0) {
          ctx.fillText(line, startX, curY);
          line = chars[n];
          curY += 18 * scale;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, startX, curY);
    }

  ctx.save();
  ctx.fillStyle = 'rgba(235, 225, 210, 0.7)';
  ctx.font = `500 ${12 * scale}px -apple-system, sans-serif`;
  ctx.fillText(t('brand.title'), 24 * scale, 36 * scale);
  ctx.fillStyle = '#ce6d4d';
  ctx.font = `${9 * scale}px -apple-system, sans-serif`;
  ctx.fillText(SITE_URL, 24 * scale, 50 * scale);
  ctx.restore();

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
if(import.meta.env.DEV)window.__captureGalaxyCardBlob = captureGalaxyCardBlob;

$('#card-close').addEventListener('click', closeCard);

$('#card-twitter').addEventListener('click', async () => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  toast(t('share.xPreparing'));
  const tweetText = t('share.tweet',{url:SITE_URL});
  const twitterUrl = `https://x.com/intent/post?text=${encodeURIComponent(tweetText)}`;

  try {
    const blob = await captureGalaxyCardBlob(account);
    const fileName = `claude-starry-${account.alias || catalogDesignation(account)}.png`;
    const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

    // 1. 如果浏览器支持 Web Share API 原生传文件（如移动端系统分享、Safari/Chrome 原生 Share）
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: t('brand.title'),
          text: tweetText,
          files: [file]
        });
        toast(t('share.xReady'));
        return;
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
      }
    }

    // 2. 网页端分享：写入剪贴板 + 自动下载图片附件
    if (blob) {
      if (navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch (clipErr) {
          console.warn('Clipboard write failed:', clipErr);
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }

    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=580,height=480');
    toast(t('share.xOpened'));
  } catch (err) {
    console.error('Twitter share preparation error:', err);
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=580,height=480');
    toast(t('share.xOpenedFallback'));
  }
});

$('#card-copy-img').addEventListener('click', async () => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  try {
    toast(t('share.imagePreparing'));
    const blob = await captureGalaxyCardBlob(account);
    if (!blob) throw new Error(t('share.imageFailed'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast(t('share.imageCopied'));
  } catch (err) {
    toast(t('share.imageCopyFailed'));
  }
});

$('#card-download-img').addEventListener('click', async () => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  try {
    toast(t('share.imagePreparing'));
    const blob = await captureGalaxyCardBlob(account);
    if (!blob) throw new Error(t('share.imageFailed'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `claude-starry-${account.alias || catalogDesignation(account)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    toast(t('share.imageDownloaded'));
  } catch (err) {
    toast(t('share.imageDownloadFailed'));
  }
});
addEventListener('resize',()=>{
  if(!cardId)return;
  updateCardPosition();
});

$('#restore').addEventListener('click',()=>{
  closeCard();hideStarTip();universe.reset();
});

function syncLocaleControls(){
  document.querySelectorAll('[data-locale]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.locale===locale));
  });
}
function setLocale(nextLocale){
  const normalized=normalizeLocale(nextLocale);
  if(!normalized||normalized===locale)return;
  locale=normalized;
  persistLocale(browserStorage,locale);
  config.slogan=localizeDefaultSlogan(config.slogan,locale,import.meta.env.DEV);
  applyDocumentLocale(locale);
  window.__afterlightEntryBoot?.setLocale(locale);
  syncLocaleControls();
  universe?.setAriaLabel(t('scene.aria'));
  updateAccountCount();
  const activeCard=accounts.find(account=>account.id===cardId);
  if(activeCard){renderCard(activeCard);updateCardPosition();}
  if(lastStarTipHit)showStarTip(lastStarTipHit);
  updateLifePreview();
  if(currentFormError)$('#form-error').textContent=t(currentFormError.key,currentFormError.values);
  const formNote=$('.form-note');
  if(formNote&&sharedStars)formNote.textContent=t('form.sharedNote');
  if(sharedStars&&$('#catalog-preview'))$('#catalog-preview').textContent=t('form.catalogOnSave');
}
syncLocaleControls();

if(import.meta.env.DEV&&universe){
  void import('./debug-panel.js').then(({mountDebugPanel})=>{
    function resetEntryControls(){
      entryControlsReady=false;
      document.body.classList.remove('stars-ready');
      $('#create').hidden=true;$('#create').disabled=true;
      $('#restore').hidden=true;$('#restore').disabled=true;
    }
    function applyAnimationPreset(next,{replay=true}={}){
      config=normalizeConfig(next);
      $('#universe').setAttribute('aria-label',config.slogan);
      const cardSlogan=$('.card-slogan');
      if(cardSlogan)cardSlogan.textContent=config.slogan;
      closeCard();hideStarTip();
      universe.applyConfig(config,{replay});
      if(replay)resetEntryControls();
    }
    mountDebugPanel({
      initial:config,defaults:DEFAULT_CONFIG,
      onChange:applyAnimationPreset,
      onReplay:()=>{closeCard();hideStarTip();universe.replayEntry();resetEntryControls();},
      onSave:async next=>{
        const clean=normalizeConfig(next);
        const response=await fetch('/__afterlight/preset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)});
        if(!response.ok)throw new Error('本地方案未写入，请重试或复制参数。');
        if(!browserStorage)throw new Error('Local storage is unavailable.');
        browserStorage.setItem(CONFIG_STORAGE_KEY,JSON.stringify(clean));
        if(JSON.stringify(clean)!==JSON.stringify(config))applyAnimationPreset(clean);
      },
      onReset:async()=>{
        const response=await fetch('/__afterlight/preset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(DEFAULT_CONFIG)});
        if(!response.ok)throw new Error('恢复默认失败，请重试。');
        if(!browserStorage)throw new Error('Local storage is unavailable.');
        browserStorage.removeItem(CONFIG_STORAGE_KEY);
        applyAnimationPreset(DEFAULT_CONFIG);
      },
    });
  }).catch(error=>console.error(error));
}
