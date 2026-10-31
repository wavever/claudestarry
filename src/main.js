import { Universe } from './universe.js';
import { defaultConfigForLocale, clearLegacyConfig, localizeDefaultSlogan } from './config.js';
import { today, dateToDay, DAY_MS, loadAccounts, validAccount, mergeAccounts, STORAGE_KEY, accountBrightness, starProfile, nextCatalogNumber, catalogDesignation, CLAUDE_EPOCH, MIN_DAY } from './model.js';
import { ParticleCounter } from './particle-counter.js';
import { getSharedStarsConfig, latestCivilDate, SharedStarsClient } from './shared-stars.js';
import {applyDocumentLocale,normalizeLocale,persistLocale,resolveLocale,safeStorage,translate} from './i18n.js';
import { createStarShare } from './share.js';
import { OWN_IDS_STORAGE_KEY, isOwnStar, loadOwnIds, nextOwnStarIndex, ownStarIndices, rememberOwnId } from './own-stars.js';
import { FallbackUniverse, supportsWebGL2 } from './fallback-universe.js';

const $ = selector => document.querySelector(selector);
let accounts = [];
let universe;
let ready = false;
let entryControlsReady = false;
let counter = null;
let toastTimer;
let cardId = null;
let cardTransition = null;
let lastStarTipHit = null;
let currentFormError = null;
let sharedStars = null;
let submissionInFlight = false;
const meteorQueue=[];
const queuedMeteorIds=new Set();
const shareImageJobs=new Map();
const browserStorage=safeStorage(()=>localStorage);
const CARD_SWITCH_FADE_MS = 180;
clearLegacyConfig(browserStorage);
let locale=resolveLocale({search:location.search,storage:browserStorage,languages:navigator.languages});
applyDocumentLocale(locale);
let config=defaultConfigForLocale(locale);
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || location.origin + location.pathname;
const sharedConfig=getSharedStarsConfig(import.meta.env);
const t=(key,values)=>translate(locale,key,values);
const formatNumber=value=>new Intl.NumberFormat(locale==='zh-CN'?'zh-CN':'en-US').format(value);
addEventListener('afterlight:localechange',event=>setLocale(event.detail?.locale));

const OWN_IDS_KEY = OWN_IDS_STORAGE_KEY;
let ownAccountIds = loadOwnIds(browserStorage);

function recordOwnId(id) {
  rememberOwnId(ownAccountIds, id, browserStorage, OWN_IDS_KEY);
}

function ownStarOptions() {
  return {
    ownIds: ownAccountIds,
    sessionOwnIds: sharedStars?.ownIds,
    // Before shared storage is configured, this browser's local star store is
    // private to the visitor. Keep older local records usable even if they
    // predate the own-ID ledger.
    includeLocalMyStars: !sharedConfig,
  };
}

function currentOwnStarIndices() {
  return ownStarIndices(accounts, ownStarOptions());
}

function isOwnAccount(account) {
  return isOwnStar(account, ownStarOptions());
}

function meteorBusy(){return Boolean(universe?.meteor)||meteorQueue.length>0||submissionInFlight;}
function updateAccountCount(){
  const count=accounts.filter(a=>!a.sample).length;
  counter?.setCount(count);
  $('#counter-value').textContent=formatNumber(count);
  const countKey=count===1?'One':'';
  $('#account-counter')?.setAttribute('aria-label',t(`counter.aria${countKey}`,{count:formatNumber(count)}));
  const suffix=$('#account-counter-suffix');
  if(suffix)suffix.textContent=t(`counter.suffix${countKey}`);
}
function setVisibleAccounts(next){
  // Remote reconciliation may arrive while the card is fading between two
  // records. Invalidate that handoff before replacing the record array so a
  // delayed callback can never resurrect stale card content.
  cancelCardTransition();
  accounts=Array.isArray(next)?next:[];
  universe?.setAccounts(accounts);
  updateAccountCount();
  // Shared reconciliation and another local tab can rebuild the visible list
  // while a visitor is reading a card. Preserve that view by stable ID; only
  // close it if its record genuinely no longer exists.
  if(cardId){
    const activeIndex=accounts.findIndex(account=>account.id===cardId);
    if(activeIndex<0)closeCard();
    else {renderCard(accounts[activeIndex]);updateCardPosition();}
  }
  updateViewControls();
}
function applySharedRecords(records){
  // A shared record may use a legitimate civil date ahead of this visitor's.
  setVisibleAccounts(mergeAccounts([],records,dateToDay(latestCivilDate()),null));
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
      if(landedIndex>=0)showCard(landedIndex,{arrival:true});
    }
    updateViewControls();
    drainMeteorQueue();
  },{focus:item.own,interrupt:item.own});
  if(!launched){meteorQueue.unshift(item);return;}
  updateViewControls();
}
function enqueueMeteor(id,{own=false}={}){
  if(!id||queuedMeteorIds.has(id)||universe?.meteor?.id===id)return;
  queuedMeteorIds.add(id);meteorQueue.push({id,own});drainMeteorQueue();
}

function updateViewControls(){
  const ownButton=$('#own-stars');
  const ownIndices=currentOwnStarIndices();
  const ownCount=ownIndices.length;
  // The dock can arrive with the nebula, before historical account stars have
  // faded in. Keep the ownership affordance visible but inert until there is a
  // star to focus, rather than opening a card for an invisible point.
  const ownStarVisible=ownIndices.some(index=>universe?.isAccountStarVisible(index));
  if(ownButton){
    ownButton.hidden=!entryControlsReady||ownCount===0;
    ownButton.disabled=!ready||!universe||!entryControlsReady||ownCount===0||!ownStarVisible||meteorBusy();
  }
  if(!ready || !universe || !entryControlsReady)return;
  if(entryControlsReady){
    $('#create').disabled=meteorBusy();
    $('#restore').disabled=false;
  }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function computeCardPlacement(point, cardW, cardH) {
  const width = innerWidth;
  const height = innerHeight;
  const sx = Math.round(clamp(point.x, 18, width - 18));
  const sy = Math.round(clamp(point.y, 18, height - 18));
  const mobile = width < 700;

  // On phones the card becomes a calm bottom sheet. The selected star remains
  // above it (Universe.setCardView reserves that visual lane), so its thread
  // reads naturally instead of crossing a narrow card from the side.
  if (mobile) {
    const margin = 14;
    const cardX = Math.round(clamp((width - cardW) / 2, margin, width - cardW - margin));
    const topLimit = 108;
    const bottomLimit = Math.max(88, Math.round(height * 0.11));
    const cardY = Math.round(Math.max(topLimit, height - cardH - bottomLimit));
    return {
      mobile,
      cardX,
      cardY,
      targetX: Math.round(clamp(sx, cardX + 34, cardX + cardW - 34)),
      targetY: cardY,
      connector: 'top',
      sx,
      sy,
    };
  }

  const margin = 32;
  const centerX = universe ? universe.projectPoint(0, 0, 0).x : width * 0.5;
  const right = (universe?.cardSide || (sx >= centerX ? 'right' : 'left')) === 'right';
  const cardX = Math.round(right ? width - cardW - margin : margin);
  const targetX = right ? cardX : cardX + cardW;
  const topLimit = 112;
  const bottomLimit = 84;
  const maxY = Math.max(topLimit, height - cardH - bottomLimit);
  const starBelowCard = sy >= height * 0.45;
  const desiredY = starBelowCard ? sy - cardH * 0.84 : sy + 46;
  const cardY = Math.round(clamp(desiredY, topLimit, maxY));
  const targetY = Math.round(cardY + cardH * (starBelowCard ? 0.72 : 0.28));

  return { mobile, cardX, cardY, targetX, targetY, connector: right ? 'left' : 'right', sx, sy };
}

function connectorPath({ mobile, sx, sy, targetX, targetY }) {
  if (mobile) {
    const direction = targetY >= sy ? 1 : -1;
    const bend = clamp(Math.abs(targetY - sy) * 0.48, 28, 92);
    return `M ${sx} ${sy} C ${sx} ${sy + bend * direction}, ${targetX} ${targetY - bend * direction}, ${targetX} ${targetY}`;
  }
  const direction = targetX >= sx ? 1 : -1;
  const gap = Math.abs(targetX - sx);
  const departure = clamp(gap * 0.32, 28, 118);
  const arrival = clamp(gap * 0.20, 32, 84);
  return `M ${sx} ${sy} C ${sx + departure * direction} ${sy}, ${targetX - arrival * direction} ${targetY}, ${targetX} ${targetY}`;
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
  anchor.style.transform=`translate3d(${point.x-10}px,${point.y-10}px,0)`;
  if(svg)svg.style.display='block';

  const cardW=card.offsetWidth||280;
  const cardH=card.offsetHeight||250;

  const placement = computeCardPlacement(point, cardW, cardH);
  card.style.transform = `translate3d(${placement.cardX}px,${placement.cardY}px,0)`;
  card.dataset.layout = placement.mobile ? 'mobile' : 'desktop';
  card.dataset.connector = placement.connector;
  card.style.setProperty('--card-thread-x', `${placement.targetX - placement.cardX}px`);
  card.style.setProperty('--card-thread-y', `${placement.targetY - placement.cardY}px`);

  const path = $('#card-connector-path');
  if(path){
    path.setAttribute('d', connectorPath(placement));
    path.dataset.layout = placement.mobile ? 'mobile' : 'desktop';
  }
}

function motionReduced(){
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setCardTransitionVisualState(active){
  const className='is-cycle-transitioning';
  $('#star-card').classList.toggle(className,active);
  $('#star-anchor').classList.toggle(className,active);
  $('#card-connector-svg')?.classList.toggle(className,active);
}

function cancelCardTransition(){
  if(cardTransition?.timer)clearTimeout(cardTransition.timer);
  cardTransition=null;
  setCardTransitionVisualState(false);
}

function closeCard(){
  cancelCardTransition();
  $('#star-anchor').hidden=true;
  const card=$('#star-card');
  card.hidden=true;
  card.classList.remove('is-arrival');
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
function presentCard(index,{arrival=false,preserveCardView=false,fadeIn=false}={}){
  const account=accounts[index];if(!account)return;
  hideStarTip();cardId=account.id;
  renderCard(account);

  const keepCardView=preserveCardView&&universe?.cardView;
  if(universe&&!keepCardView){
    const point=universe.project(index);
    const centerX=universe.projectPoint(0,0,0).x;
    universe.setCardView(true,point.x>=centerX?'right':'left');
  }

  const card=$('#star-card');
  card.hidden=false;
  updateCardPosition();
  card.classList.remove('is-arrival');
  if(arrival&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    void card.offsetWidth;
    card.classList.add('is-arrival');
  }
  // While cycling, make sure the new content has been laid out while still
  // transparent before beginning its fade-in.
  if(fadeIn)void card.offsetWidth;
  setCardTransitionVisualState(false);
  warmStarShare(account);
}

function showCard(index,options={}){
  cancelCardTransition();
  presentCard(index,options);
}

function nextVisibleOwnStarIndex(currentId){
  let index=nextOwnStarIndex(accounts,currentId,ownStarOptions());
  const ownCount=currentOwnStarIndices().length;
  for(let attempts=0;index>=0&&attempts<ownCount;attempts++){
    if(universe?.isAccountStarVisible(index))return index;
    index=nextOwnStarIndex(accounts,accounts[index]?.id,ownStarOptions());
  }
  return -1;
}

function finishCardTransition(transition){
  if(cardTransition!==transition)return;
  transition.timer=null;
  transition.exitComplete=true;
  settleCardTransition();
}

function settleCardTransition(){
  const transition=cardTransition;
  if(!transition?.exitComplete)return;
  // Let the camera finish its uninterrupted pan before the new detail panel
  // enters. A far-away target is therefore never swapped into an off-screen
  // card halfway through the move.
  if(transition.focusTween&&universe?.focusTween===transition.focusTween)return;
  cardTransition=null;
  const index=accounts.findIndex(account=>account.id===transition.targetId);
  if(index<0){
    // The target was removed or replaced while its card was hidden. Restore
    // the still-valid card instead of showing a stale detail panel.
    setCardTransitionVisualState(false);
    return;
  }
  // The old card remains fully transparent while the new record and its
  // connector are positioned. Removing the state then fades them in without
  // ever exposing an intermediate layout jump.
  presentCard(index,{preserveCardView:true,fadeIn:true});
}

function beginCardTransition(index,focusTween){
  const account=accounts[index];
  if(!account)return;
  cancelCardTransition();
  if(motionReduced()){
    presentCard(index,{preserveCardView:true});
    return;
  }
  const card=$('#star-card');
  // Rapid clicks replace the target while retaining the current card as the
  // outgoing surface. Force the cleared state through layout first so the
  // next fade always begins from the card's actual opacity.
  void card.offsetWidth;
  setCardTransitionVisualState(true);
  const transition={targetId:account.id,focusTween,timer:null,exitComplete:false};
  cardTransition=transition;
  transition.timer=setTimeout(()=>finishCardTransition(transition),CARD_SWITCH_FADE_MS);
}

function cycleOwnStar(){
  if(!ready||!entryControlsReady||meteorBusy()||!universe)return;
  // During a fade, advance from the requested target rather than the still
  // visible outgoing card. Repeated presses therefore keep cycling instead
  // of repeatedly asking for the same second star.
  const fromId=cardTransition?.targetId??cardId;
  const index=nextVisibleOwnStarIndex(fromId);
  if(index<0){updateViewControls();return;}
  const card=$('#star-card');
  const preserveCardView=Boolean(cardId&&!card.hidden&&universe.cardView);
  // Keep the user's current zoom and the existing card-safe frustum. This
  // makes each selection a true pan, including when a previous pan is still
  // in flight, instead of snapping through the default focus distance.
  const focusTween=universe.focus(index,{preserveDistance:preserveCardView,preserveViewOffset:preserveCardView,delay:0});
  if(!preserveCardView||motionReduced()){
    cancelCardTransition();
    presentCard(index,{preserveCardView});
    return;
  }
  beginCardTransition(index,focusTween);
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
  if (!sharedConfig && (e.key === STORAGE_KEY || e.key === null)) {
    try {
      setVisibleAccounts(loadAccounts(browserStorage));
    } catch {}
  }
  if (e.key === OWN_IDS_KEY || e.key === null) {
    ownAccountIds=loadOwnIds(browserStorage,OWN_IDS_KEY);
    updateViewControls();
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
  const ownButton=$('#own-stars');
  if(ownButton){ownButton.hidden=true;ownButton.disabled=true;}
}

const entryBoot=window.__afterlightEntryBoot;
if(entryBoot)await entryBoot.ready;

try {
  const UniverseRenderer = supportsWebGL2() ? Universe : FallbackUniverse;
  universe = new UniverseRenderer($('#scene'), accounts, {
    config,
    ariaLabel:t('scene.aria'),
    onHover: showStarTip,
    onSelect: select,
    onFrame: () => {
      universe?.setDay(Date.now() / DAY_MS);
      if(universe){
        updateCardPosition();
        settleCardTransition();
        updateViewControls();
      }
    },
    onNebulaReady: () => {
      document.body.classList.add('nebula-ready');
      entryControlsReady = true;
      updateViewControls();
    },
    onReady: () => {
      ready = true;
      document.body.classList.add('loaded');
      updateViewControls();
      entryBoot?.finish();
    },
    onError: fatal,
  });
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
  if (universe instanceof FallbackUniverse) fatal();
  else {
    // A context can disappear between the capability probe and renderer
    // creation. Give the visitor the same graceful 2D fallback in that case.
    try {
      $('#scene').querySelector('canvas')?.remove();
      universe = new FallbackUniverse($('#scene'), accounts, {
        config, ariaLabel: t('scene.aria'), onSelect: select,
        onFrame: () => { updateCardPosition(); updateViewControls(); },
        onNebulaReady: () => { document.body.classList.add('nebula-ready'); entryControlsReady = true; updateViewControls(); },
        onReady: () => { ready = true; document.body.classList.add('loaded'); updateViewControls(); },
      });
    } catch (fallbackError) {
      console.error(fallbackError);
      fatal();
    }
  }
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
  const next = mergeAccounts(accounts, [account], maxDay, null);
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
function shareImageKey(account) {
  return [locale, account.id, account.alias, account.started, account.date, account.message, ...(account.position || [])].join('\u0001');
}

function shareText(account) {
  return t('share.postText', { alias: account.alias || catalogDesignation(account), url: SITE_URL });
}

function getStarShareFile(account) {
  const key = shareImageKey(account);
  const existing = shareImageJobs.get(key);
  if (existing) return existing;
  let snapshot = null;
  try {
    // Export the unobstructed galaxy, not the responsive card overlay. The
    // fixed portrait compositor below owns all text and framing.
    snapshot = universe?.captureFrame() || null;
  } catch {}
  const task = createStarShare({
    account,
    designation: catalogDesignation(account),
    snapshot,
    siteUrl: SITE_URL,
    slogan: config.slogan,
    locale,
  });
  shareImageJobs.set(key, task);
  task.catch(() => shareImageJobs.delete(key));
  return task;
}

let shareWarmTimer=null;
function warmStarShare(account) {
  // Rendering the share image is a synchronous frame capture. Starting it while
  // the camera is still easing into the card view stalls the transition, so the
  // prefetch waits until the camera and the frustum offset have both settled.
  clearTimeout(shareWarmTimer);
  const waitForSettle = () => {
    if (cardId !== account.id || !universe) return;
    if (universe.focusTween || universe.viewOffsetTween) {
      shareWarmTimer = setTimeout(waitForSettle, 140);
      return;
    }
    const warm = () => {
      if (cardId === account.id) void getStarShareFile(account).catch(() => {});
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 1200 });
    else shareWarmTimer = setTimeout(warm, 180);
  };
  shareWarmTimer = setTimeout(waitForSettle, 140);
}

function downloadStarShare(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || `afterlight-${catalogDesignation({ catalogNumber: 0 })}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function supportsFileShare(file) {
  try {
    return Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

async function runShareAction(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await action();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

$('#card-close').addEventListener('click', closeCard);

$('#card-share').addEventListener('click', async event => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  await runShareAction(event.currentTarget, async () => {
    try {
      toast(t('share.sharePreparing'));
      const file = await getStarShareFile(account);
      if (supportsFileShare(file)) {
        try {
          await navigator.share({
            title: t('share.nativeTitle', { alias: account.alias || catalogDesignation(account) }),
            text: shareText(account),
            files: [file],
          });
          toast(t('share.shareOpened'));
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      downloadStarShare(file);
      toast(t('share.shareDownloaded'));
    } catch {
      toast(t('share.imageFailed'));
    }
  });
});

$('#card-twitter').addEventListener('click', () => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  // X web intents can prefill text but cannot attach a local File. Keep this
  // synchronous so browser popup protection cannot swallow the user action.
  const twitterUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText(account))}`;
  window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=580,height=480');
  toast(t('share.xOpened'));
});

$('#card-copy-img').addEventListener('click', async () => {
  const account = accounts.find(a => a.id === cardId);
  if (!account) return;
  try {
    toast(t('share.imagePreparing'));
    const file = await getStarShareFile(account);
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error(t('share.imageCopyFailed'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
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
    const file = await getStarShareFile(account);
    downloadStarShare(file);
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

$('#own-stars').addEventListener('click',cycleOwnStar);

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
  shareImageJobs.clear();
  config.slogan=localizeDefaultSlogan(config.slogan,locale,import.meta.env.DEV);
  applyDocumentLocale(locale);
  window.__afterlightEntryBoot?.setLocale(locale);
  universe?.setSlogan?.(config.slogan);
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
