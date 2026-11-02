import { Universe } from './universe.js';
import { defaultConfigForLocale, clearLegacyConfig, localizeDefaultSlogan } from './config.js';
import { today, dateToDay, DAY_MS, loadAccounts, validAccount, mergeAccounts, STORAGE_KEY, accountBrightness, starProfile, nextCatalogNumber, catalogDesignation, CLAUDE_EPOCH, MIN_DAY } from './model.js';
import { ParticleCounter } from './particle-counter.js';
import { getSharedStarsConfig, latestCivilDate, SharedStarsClient } from './shared-stars.js';
import {applyDocumentLocale,normalizeLocale,persistLocale,resolveLocale,safeStorage,translate} from './i18n.js';
import { createCardsPageShare, shareCountText } from './share.js';
import { cardConnector, connectorPathData, shareConnector } from './connector.js';
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
const browserStorage=safeStorage(()=>localStorage);
const CARD_SWITCH_FADE_MS = 180;
clearLegacyConfig(browserStorage);
let locale=resolveLocale({search:location.search,storage:browserStorage,languages:navigator.languages});
applyDocumentLocale(locale);
let config=defaultConfigForLocale(locale);
const PUBLIC_SITE_URL = 'https://claudestarry.pages.dev/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL
  || (LOCAL_HOSTS.has(location.hostname) ? PUBLIC_SITE_URL : location.origin + location.pathname);
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
      if(landedIndex>=0)showCard(landedIndex);
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
  const shareButton=$('#share-page');
  if(shareButton)shareButton.disabled=!ready||!universe||!entryControlsReady;
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

  const d = connectorPathData(cardConnector(placement));
  const path = $('#card-connector-path');
  if(path){
    path.setAttribute('d', d);
    path.dataset.layout = placement.mobile ? 'mobile' : 'desktop';
  }
  $('#card-connector-reveal')?.setAttribute('d', d);
}

// Ring, thread and card enter as one sequence: the ring closes around the
// star, the thread draws out to the card, the card surfaces, and the thread's
// landing point lights up. Restarting the class replays it for every card.
function playCardEntrance(){
  const nodes=[$('#star-card'),$('#star-anchor'),$('#card-connector-svg')].filter(Boolean);
  for(const node of nodes)node.classList.remove('is-entering');
  if(motionReduced())return;
  void nodes[0]?.offsetWidth;
  for(const node of nodes)node.classList.add('is-entering');
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
  card.classList.remove('is-entering');
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
function presentCard(index,{preserveCardView=false,fadeIn=false}={}){
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
  playCardEntrance();
  // While cycling, make sure the new content has been laid out while still
  // transparent before beginning its fade-in.
  if(fadeIn)void card.offsetWidth;
  setCardTransitionVisualState(false);
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

let shareFlow=null;
let shareFlowToken=0;
let shareRevealTimer=null;
let shareFlashTimer=null;
const SHARE_REVEAL_MS=1300;

function currentShareEntries(){
  const own=currentOwnStarIndices()
    .map(index=>({index,account:accounts[index]}))
    .filter(item=>item.account);
  // Newly added stars get the next catalog number, so newest-first keeps the
  // share cards in sync with what the visitor just added (up to three).
  own.sort((a,b)=>(Number(b.account.catalogNumber)||0)-(Number(a.account.catalogNumber)||0));
  // Prefer stars that are actually on screen so every visible card can carry
  // its connector; fill the remaining slots with the newest off-screen ones.
  // Keep newest-first order even when a star is off-screen: a just-added
  // record must not be pushed behind older visible stars.
  return own;
}

function shareCardBounds(){
  const mobile=innerWidth<700;
  const max=Math.min(
    Math.round(Math.min(mobile?190:300,Math.max(mobile?160:200,innerWidth*0.22))),
    Math.floor((innerWidth-48)/2),
  );
  return {min:Math.min(max,mobile?128:150),max};
}

function createShareMiniCard(account,{min,max}){
  const catalog=catalogDesignation(account);
  const node=document.createElement('article');
  node.className='share-mini-card';
  node.style.minWidth=`${min}px`;
  node.style.maxWidth=`${max}px`;
  node.style.width='max-content';
  const catalogNode=document.createElement('p');
  catalogNode.className='share-mini-card__catalog';
  catalogNode.textContent=catalog;
  const name=document.createElement('h3');
  name.textContent=account.alias||catalog;
  node.append(catalogNode,name);

  const started=account.started?account.started.replaceAll('-','/'):'';
  const disabled=account.date?account.date.replaceAll('-','/'):'';
  if(started||disabled){
    const row=document.createElement('div');
    row.className='share-mini-card__dates';
    const label=document.createElement('span');
    label.textContent=started?t('card.onlinePeriod'):t('card.disabledDate');
    const value=document.createElement('strong');
    value.textContent=started&&disabled?`${started}\n— ${disabled}`:started||disabled;
    row.append(label,value);
    node.append(row);
  }

  if(account.message?.trim()){
    const story=document.createElement('p');
    story.className='share-mini-card__story';
    story.textContent=account.message.trim();
    node.append(story);
  }
  return node;
}

let shareLineId=0;
function addShareLine(item,svg,delay){
  const connector=shareConnector({star:item.point,side:item.side,x:item.x,y:item.y,w:item.w,h:item.h},{width:innerWidth,height:innerHeight});
  if(!connector)return;
  const ns='http://www.w3.org/2000/svg';
  const el=(name,attrs)=>{
    const node=document.createElementNS(ns,name);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    return node;
  };
  const d=connectorPathData(connector);
  const maskId=`share-line-mask-${++shareLineId}`;
  // Same sequence as the star card: ring closes in, then the dashed thread
  // draws out to the card through its mask.
  const group=el('g',{class:'share-thread'});
  group.style.setProperty('--line-delay',`${delay}ms`);
  const mask=el('mask',{id:maskId,maskUnits:'userSpaceOnUse',x:0,y:0,width:'100%',height:'100%'});
  mask.append(el('path',{class:'connector-reveal',pathLength:1,d}));
  group.append(
    mask,
    el('path',{class:'share-line connector-thread',mask:`url(#${maskId})`,d}),
    el('circle',{class:'share-ring',cx:connector.center.x,cy:connector.center.y,r:connector.radius}),
  );
  svg.append(group);
}

function buildShareLayout(entries){
  const layer=$('#share-cards-layer');
  const svg=$('#share-cards-lines');
  if(!layer||!svg)return [];
  layer.hidden=false;
  layer.classList.remove('is-revealed');
  svg.replaceChildren();
  layer.querySelectorAll('.share-mini-card').forEach(node=>node.remove());
  if(!entries.length)return [];

  const bounds=shareCardBounds();
  const center=universe?.projectPoint(0,0,0).x??innerWidth/2;
  const points=entries.map((item,index)=>({
    ...item,
    point:universe?.project(item.index)??{x:0,y:0,visible:false},
  }));

  const nodes=points.map(item=>{
    const node=createShareMiniCard(item.account,bounds);
    layer.append(node);
    return node;
  });
  const widths=nodes.map(node=>{
    const width=Math.max(bounds.min,Math.min(bounds.max,Math.round(node.getBoundingClientRect().width)));
    node.style.width=`${width}px`;
    return width;
  });
  const heights=nodes.map(node=>node.offsetHeight||160);

  const top=Math.max(100,Math.round(innerHeight*0.14));
  const leftBottom=innerHeight-Math.max(24,Math.round(innerHeight*0.04));
  const rightBottom=innerHeight-Math.max(180,Math.round(innerHeight*0.24));
  const gap=12;

  // Group each card by the side its star actually sits on, then place each
  // group top-to-bottom in star-Y order. A card is never moved to the opposite
  // side just to fill space; that was what made the connectors cross.
  const groups={left:[],right:[]};
  points.forEach((item,index)=>{
    const side=Number.isFinite(item.point.x)
      ? item.point.x>=center?'right':'left'
      : index%2?'right':'left';
    groups[side].push({item,index});
  });

  const layout=[];
  for(const side of ['left','right']){
    const bottom=side==='left'?leftBottom:rightBottom;
    let cursor=top;
    const group=groups[side].sort((a,b)=>(a.item.point.y||0)-(b.item.point.y||0));
    for(const entry of group){
      const {item,index}=entry;
      if(cursor+heights[index]>bottom)continue;
      const width=widths[index];
      const placed={
        ...item,
        node:nodes[index],
        side,
        w:width,
        h:heights[index],
        height:heights[index],
        x:side==='left'?16:innerWidth-16-width,
        y:cursor,
        delay:Math.round(Math.random()*120),
      };
      cursor+=heights[index]+gap;
      placed.node.style.left=`${placed.x}px`;
      placed.node.style.top=`${placed.y}px`;
      placed.node.style.setProperty('--card-delay',`${placed.delay}ms`);
      addShareLine(placed,svg,placed.delay);
      layout.push(placed);
    }
  }

  points.forEach((item,index)=>{
    if(!layout.some(placed=>placed.node===nodes[index]))nodes[index].remove();
  });

  layer.classList.add('is-revealed');
  return layout;
}
function resetShareFlow(){
  shareFlowToken++;
  clearTimeout(shareRevealTimer);
  clearTimeout(shareFlashTimer);
  shareRevealTimer=null;
  shareFlashTimer=null;
  if(shareFlow?.previewUrl)URL.revokeObjectURL(shareFlow.previewUrl);
  shareFlow=null;
  const layer=$('#share-cards-layer');
  if(layer){
    layer.hidden=true;
    layer.classList.remove('is-revealed');
    layer.querySelectorAll('.share-mini-card').forEach(node=>node.remove());
  }
  const svg=$('#share-cards-lines');
  if(svg)svg.replaceChildren();
  const flash=$('#capture-flash');
  if(flash){flash.hidden=true;flash.classList.remove('is-active');}
  const image=$('#share-preview-img');
  if(image){image.hidden=true;image.removeAttribute('src');}
  const actions=$('#share-actions');
  if(actions)actions.hidden=true;
  const note=$('.share-note');
  if(note)note.textContent=t('share.xHint');
  setShareFeedback('');
  setShareButtonsEnabled(false);
}

function setShareButtonsEnabled(enabled){
  for(const id of ['#share-copy','#share-download','#share-x']){
    const button=$(id);
    if(button)button.disabled=!enabled;
  }
}

function setShareFeedback(message,{error=false}={}){
  const node=$('#share-feedback');
  if(!node)return;
  node.hidden=!message;
  node.textContent=message||'';
  node.classList.toggle('is-error',Boolean(error));
}

async function captureShareScreenshot(token){
  if(!shareFlow||shareFlow.token!==token)return;
  let snapshot=null;
  try{snapshot=universe?.captureFrame({preserveView:true})||null;}catch{}
  try{
    const file=await createCardsPageShare({
      snapshot,
      cards:shareFlow.layout.map(item=>({
        account:item.account,
        designation:catalogDesignation(item.account),
        x:item.x,
        y:item.y,
        w:item.w,
        h:item.height,
        side:item.side,
        // Re-project at capture time: closing the on-page card may still be
        // easing the camera back, and the screenshot is taken from the live view.
        star:universe?.project(item.index)??item.point,
      })),
      viewport:{width:innerWidth,height:innerHeight},
      // Count every star this visitor owns (the image only draws up to three
      // cards), against the same total the on-screen counter shows.
      countText:shareCountText({
        ownCount:currentOwnStarIndices().filter(index=>!accounts[index]?.sample).length,
        totalCount:accounts.filter(a=>!a.sample).length,
        locale,
        format:formatNumber,
      }),
      siteUrl:SITE_URL,
      slogan:config.slogan,
      locale,
    });
    if(!shareFlow||shareFlow.token!==token)return;
    shareFlow.file=file;
    shareFlow.autoCopied=false;
    shareFlow.autoCopy=copyShareFile(file).then(()=>{
      if(shareFlow?.file===file)shareFlow.autoCopied=true;
    }).catch(()=>{
      if(shareFlow?.file===file)shareFlow.autoCopied=false;
    });
    flashCapture(token);
  }catch(error){
    console.error(error);
    resetShareFlow();
    toast(t('share.imageFailed'));
  }
}

function flashCapture(token){
  const flash=$('#capture-flash');
  if(!flash)return;
  flash.hidden=false;
  flash.classList.remove('is-active');
  void flash.offsetWidth;
  flash.classList.add('is-active');
  clearTimeout(shareFlashTimer);
  shareFlashTimer=setTimeout(()=>{
    flash.classList.remove('is-active');
    flash.hidden=true;
    if(!shareFlow||shareFlow.token!==token)return;
    showShareShot(token);
  },620);
}

async function showShareShot(token){
  if(!shareFlow?.file)return;
  const image=$('#share-preview-img');
  const previewUrl=URL.createObjectURL(shareFlow.file);
  shareFlow.previewUrl=previewUrl;
  image.hidden=false;
  image.src=previewUrl;
  try{await image.decode?.();}catch{}
  if(!shareFlow||shareFlow.token!==token)return;
  const layer=$('#share-cards-layer');
  if(layer){layer.hidden=true;layer.classList.remove('is-revealed');}
  if(shareFlow.autoCopy){
    await Promise.race([
      shareFlow.autoCopy,
      new Promise(resolve=>setTimeout(resolve,700)),
    ]).catch(()=>{});
  }
  const note=$('.share-note');
  if(note)note.textContent=t(shareFlow.autoCopied?'share.copiedForX':'share.copyOnX');
  $('#share-actions').hidden=false;
  setShareButtonsEnabled(true);
  $('#share-dialog').showModal();
}

function startShareReveal(){
  if(!ready||!entryControlsReady||!universe||shareFlow)return;
  const wasCardOpen=Boolean(cardId)||Boolean(universe.cardView);
  closeCard();
  hideStarTip();
  const token=++shareFlowToken;
  shareFlow={token,layout:[],file:null,previewUrl:null};
  clearTimeout(shareRevealTimer);
  const needsGlobal=wasCardOpen||!(universe.isHomeView?.()??true);
  if(needsGlobal&&typeof universe.reset==='function')universe.reset();
  const started=performance.now();
  const begin=()=>{
    if(!shareFlow||shareFlow.token!==token)return;
    const home=universe.isHomeView?universe.isHomeView():true;
    const settled=home&&!universe.focusTween&&!universe.viewOffsetTween;
    if(!settled&&performance.now()-started<3200){
      requestAnimationFrame(begin);
      return;
    }
    const layout=buildShareLayout(currentShareEntries());
    if(!shareFlow||shareFlow.token!==token)return;
    shareFlow.layout=layout;
    shareRevealTimer=setTimeout(()=>captureShareScreenshot(token),layout.length?SHARE_REVEAL_MS:350);
  };
  requestAnimationFrame(begin);
}

function sharePostText(){
  const entries=shareFlow?.layout||[];
  const account=entries.length===1?entries[0].account:null;
  return account
    ?t('share.postText',{alias:account.alias||catalogDesignation(account),url:SITE_URL})
    :t('share.tweet',{url:SITE_URL});
}

function downloadShareFile(file){
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');
  link.href=url;
  link.download=file.name||'claude-starry-share.png';
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),15000);
}

async function copyShareFile(file){
  if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error(t('share.imageCopyFailed'));
  await navigator.clipboard.write([new ClipboardItem({'image/png':file})]);
}

$('#share-dialog').addEventListener('close',()=>{resetShareFlow();});

$('#share-preview-img').addEventListener('click',()=>{
  if(shareFlow?.previewUrl)window.open(shareFlow.previewUrl,'_blank','noopener');
});

$('#card-close').addEventListener('click', closeCard);

$('#share-page').addEventListener('click',startShareReveal);

$('#share-copy').addEventListener('click',async()=>{
  if(!shareFlow?.file)return;
  try{
    await copyShareFile(shareFlow.file);
    setShareFeedback(t('share.imageCopied'));
  }catch{
    setShareFeedback(t('share.imageCopyFailed'),{error:true});
  }
});

$('#share-download').addEventListener('click',()=>{
  if(!shareFlow?.file)return;
  downloadShareFile(shareFlow.file);
  setShareFeedback(t('share.imageDownloaded'));
});

$('#share-x').addEventListener('click',()=>{
  if(!shareFlow?.file)return;
  const copyPromise=copyShareFile(shareFlow.file);
  const twitterUrl=`https://x.com/intent/post?text=${encodeURIComponent(sharePostText())}`;
  window.open(twitterUrl,'_blank','noopener,noreferrer,width=580,height=480');
  copyPromise
    .then(()=>setShareFeedback(t('share.xImageCopied')))
    .catch(()=>setShareFeedback(t('share.xImageCopyFailed'),{error:true}));
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
