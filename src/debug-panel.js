import './debug-panel.css';

const PANEL_ID = 'afterlight-debug-panel';
const TOGGLE_ID = 'afterlight-debug-toggle';
const INSTANCE_KEY = Symbol.for('afterlight.debug-panel.instance');

const FONT_OPTIONS = [
  ['"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif', '苹方 / 微软雅黑 · 现代黑体'],
  ['"Songti SC", "Source Han Serif SC", "STSong", "Noto Serif CJK SC", SimSun, serif', '宋体 / 思源宋体 · 文学明朝'],
  ['"Kaiti SC", "STKaiti", "KaiTi", "BiauKai", serif', '楷体 · 温润手迹'],
  ['"STFangsong", "FangSong", "Songti SC", serif', '仿宋 · 典籍古意'],
  ['"Xingkai SC", "STXingkai", "Kaiti SC", serif', '行楷 · 挥毫墨韵'],
  ['"Yuanti SC", "YouYuan", "PingFang SC", sans-serif', '圆体 · 柔和星光'],
  ['"Hiragino Sans GB", "PingFang SC", "Heiti SC", sans-serif', '冬青黑体 · 纤秀现代'],
  ['"STZhongsong", "Songti SC", "Source Han Serif SC", serif', '华文中宋 · 雅致书卷'],
  ['"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Monaco, monospace', '等宽终端 / 代码 · 开发者记忆'],
  ['Georgia, "Songti SC", "STSong", serif', 'Georgia / 宋体 · 雅致衬线混排'],
  ['Baskerville, "Songti SC", "STSong", serif', 'Baskerville · 古典西方衬线'],
  ['"Palatino Linotype", Palatino, "Songti SC", serif', 'Palatino · 人文诗意衬线'],
  ['system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', '系统原生 · 现代无衬线'],
  ['"Times New Roman", "Songti SC", "STSong", serif', 'Times New Roman · 经典罗马'],
  ['Futura, "Trebuchet MS", "PingFang SC", sans-serif', 'Futura / 苹方 · 几何现代'],
];

const EASING_OPTIONS = [
  ['linear', '匀速'],
  ['smoothstep', '平滑进出'],
  ['easeInQuad', '先慢后快 · 二次'],
  ['easeInCubic', '先慢后快 · 三次'],
  ['easeOutCubic', '先快后慢 · 三次'],
  ['easeInOutCubic', '慢—快—慢 · 三次'],
];

const ANIMATION_MODE_OPTIONS = [
  ['full', '完整流程 · 标语 → 变形 → 星云（默认）'],
  ['slogan-freeze', '常驻标语 · 停留在标语，专用于调试文字与排版'],
  ['slogan-loop', '循环标语 · 仅循环播放标语显现动画'],
  ['nebula-loop', '循环星云 · 仅循环播放星云展开动画'],
  ['nebula-freeze', '常驻星海 · 跳过前奏，直接进入完整星系'],
];

const FIELDS = [
  {
    title: '播放与调试模式',
    description: '独立循环或常驻特定动画阶段。选择“常驻标语”可一直停留在标语界面调试文字与排版。',
    open: true,
    fields: [
      { key: 'animationMode', label: '播放阶段', type: 'select', options: ANIMATION_MODE_OPTIONS, defaultValue: 'full' },
    ],
  },
  {
    title: '文字与排版',
    description: '修改开场文字、字体与粒子密度。超出画面宽高时，字号会自动缩小以完整显示。',
    open: true,
    fields: [
      { key: 'slogan', label: '标语文案', type: 'textarea', maxLength: 200, defaultValue: '' },
      { key: 'fontFamily', label: '字体', type: 'select', options: FONT_OPTIONS, defaultValue: FONT_OPTIONS[0][0] },
      { key: 'fontSize', label: '桌面字号', type: 'number', min: 16, max: 96, step: 1, unit: 'CSS px', defaultValue: 54 },
      { key: 'mobileFontSize', label: '手机字号', type: 'number', min: 14, max: 64, step: 1, unit: 'CSS px', defaultValue: 34 },
      { key: 'fontWeight', label: '字重', type: 'select', numeric: true, options: [[300, '300'], [400, '400'], [500, '500'], [600, '600'], [700, '700']], defaultValue: 500 },
      { key: 'textParticleSize', label: '文字粒子尺寸', type: 'number', min: 0.6, max: 4, step: 0.1, unit: 'CSS px', defaultValue: 1.3 },
      { key: 'textSampleStep', label: '文字采样间距', type: 'number', min: 1, max: 4, step: 0.1, unit: 'CSS px', defaultValue: 3.0 },
      { key: 'lineHeight', label: '桌面行高', type: 'number', min: 30, max: 140, step: 1, unit: 'CSS px', defaultValue: 80 },
      { key: 'mobileLineHeight', label: '手机行高', type: 'number', min: 24, max: 100, step: 1, unit: 'CSS px', defaultValue: 52 },
    ],
  },
  {
    title: '开场节奏',
    description: '所有时间均为秒；“应用并重播”后从开场重新观看。',
    fields: [
      { key: 'lightDuration', label: '初光显现', type: 'number', min: 0.1, max: 10, step: 0.1, unit: '秒', defaultValue: 2 },
      { key: 'lightEase', label: '点亮插值器', type: 'select', options: EASING_OPTIONS, defaultValue: 'linear' },
      { key: 'textHold', label: '标语停留', type: 'number', min: 0, max: 10, step: 0.1, unit: '秒', defaultValue: 1 },
      { key: 'textMorphDuration', label: '文字变形', type: 'number', min: 0.2, max: 8, step: 0.1, unit: '秒', defaultValue: 1.7 },
      { key: 'textEase', label: '文字插值器', type: 'select', options: EASING_OPTIONS, defaultValue: 'easeInCubic' },
      { key: 'logoHold', label: '标志停留', type: 'number', min: 0, max: 10, step: 0.1, unit: '秒', defaultValue: 0.6 },
    ],
  },
  {
    title: '星云与流星',
    description: '控制星云铺开、流星划过与星点余辉。',
    fields: [
      { key: 'nebulaDuration', label: '星云展开', type: 'number', min: 0.2, max: 20, step: 0.1, unit: '秒', defaultValue: 6 },
      { key: 'nebulaEase', label: '星云插值器', type: 'select', options: EASING_OPTIONS, defaultValue: 'smoothstep' },
      { key: 'meteorDuration', label: '流星时长', type: 'number', min: 0.2, max: 8, step: 0.01, unit: '秒', defaultValue: 1.85 },
      { key: 'meteorEase', label: '流星插值器', type: 'select', options: EASING_OPTIONS, defaultValue: 'linear' },
      { key: 'meteorTail', label: '流星尾迹比例', type: 'number', min: 0.03, max: 0.35, step: 0.01, unit: '比例', defaultValue: 0.17 },
      { key: 'twinkleDecay', label: '闪烁衰减', type: 'number', min: 1, max: 60, step: 1, unit: '秒', defaultValue: 8 },
    ],
  },
  {
    title: '镜头与收尾',
    description: '调节镜头聚焦的速度、延迟与默认观看距离。',
    fields: [
      { key: 'focusDuration', label: '镜头聚焦', type: 'number', min: 0.2, max: 8, step: 0.1, unit: '秒', defaultValue: 1.5 },
      { key: 'focusDelay', label: '镜头延迟', type: 'number', min: 0, max: 2, step: 0.01, unit: '秒', defaultValue: 0.08 },
      { key: 'focusEase', label: '镜头插值器', type: 'select', options: EASING_OPTIONS, defaultValue: 'smoothstep' },
      { key: 'homeDistance', label: '桌面默认距离', type: 'number', min: 25, max: 100, step: 1, unit: '场景单位', defaultValue: 44 },
      { key: 'mobileHomeDistance', label: '手机默认距离', type: 'number', min: 40, max: 160, step: 1, unit: '场景单位', defaultValue: 74 },
    ],
  },
];

const FIELD_BY_KEY = new Map(FIELDS.flatMap(group => group.fields).map(field => [field.key, field]));

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function valueFor(field, value, fallback = field.defaultValue) {
  if (field.type === 'textarea') return String(value ?? fallback ?? '').slice(0, field.maxLength ?? 200);
  if (field.type === 'number') {
    const number = Number(value);
    const valid = Number.isFinite(number) ? number : Number(fallback);
    return Math.min(field.max, Math.max(field.min, valid));
  }
  const matched = field.options?.find(([optionValue]) => String(optionValue) === String(value));
  const safeValue = matched ? matched[0] : fallback;
  return field.numeric ? Number(safeValue) : safeValue;
}

function makeDraft(initial, defaults) {
  const draft = { ...(defaults && typeof defaults === 'object' ? defaults : {}), ...(initial && typeof initial === 'object' ? initial : {}) };
  for (const field of FIELD_BY_KEY.values()) draft[field.key] = valueFor(field, draft[field.key], defaults?.[field.key]);
  return draft;
}

function makeControl(field, value) {
  const controlId = `${PANEL_ID}-${field.key}`;
  const row = element('label', 'afterlight-debug-panel__field');
  row.htmlFor = controlId;

  const label = element('span', 'afterlight-debug-panel__field-label', field.label);
  row.append(label);

  const controlShell = element('span', 'afterlight-debug-panel__control-shell');
  let control;
  if (field.type === 'textarea') {
    control = element('textarea', 'afterlight-debug-panel__control');
    control.rows = 3;
    control.maxLength = field.maxLength;
    control.spellcheck = false;
  } else if (field.type === 'select') {
    control = element('select', 'afterlight-debug-panel__control');
    for (const [optionValue, optionLabel] of field.options) {
      const option = element('option', '', optionLabel);
      option.value = String(optionValue);
      control.append(option);
    }
    if (value !== undefined && !field.options.some(([ov]) => String(ov) === String(value))) {
      const customOption = element('option', '', `自定义 (${value})`);
      customOption.value = String(value);
      control.append(customOption);
    }
  } else {
    control = element('input', 'afterlight-debug-panel__control');
    control.type = 'number';
    control.min = String(field.min);
    control.max = String(field.max);
    control.step = String(field.step);
    control.inputMode = field.step < 1 ? 'decimal' : 'numeric';
  }

  control.id = controlId;
  control.name = field.key;
  control.dataset.debugField = field.key;
  control.value = String(value);
  control.setAttribute('aria-label', field.label);
  controlShell.append(control);

  if (field.unit) controlShell.append(element('span', 'afterlight-debug-panel__unit', field.unit));
  row.append(controlShell);
  return row;
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const fallback = document.createElement('textarea');
  fallback.value = text;
  fallback.setAttribute('readonly', '');
  fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand?.('copy');
  fallback.remove();
  if (!copied) return Promise.reject(new Error('Clipboard is unavailable'));
  return Promise.resolve();
}

/**
 * Adds the local animation tuning panel. Field edits only change its draft;
 * the supplied callbacks decide when the running scene is updated or persisted.
 */
export function mountDebugPanel({ initial = {}, defaults = {}, onChange, onReplay, onSave, onReset } = {}) {
  const prior = document.body?.[INSTANCE_KEY];
  if (prior?.destroy) prior.destroy();

  let draft = makeDraft(initial, defaults);
  const callbacks = {
    onChange: typeof onChange === 'function' ? onChange : () => {},
    onReplay: typeof onReplay === 'function' ? onReplay : () => {},
    onSave: typeof onSave === 'function' ? onSave : () => {},
    onReset: typeof onReset === 'function' ? onReset : () => {},
  };

  const panel = element('aside', 'afterlight-debug-panel');
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-labelledby', `${PANEL_ID}-title`);

  const toggle = element('button', 'afterlight-debug-toggle', '调试');
  toggle.id = TOGGLE_ID;
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', PANEL_ID);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', '展开调试面板');

  const header = element('header', 'afterlight-debug-panel__header');
  const headingGroup = element('div', 'afterlight-debug-panel__heading');
  headingGroup.append(element('p', 'afterlight-debug-panel__eyebrow', 'ANIMATION TUNING'));
  const title = element('h2', 'afterlight-debug-panel__title', '调试面板');
  title.id = `${PANEL_ID}-title`;
  headingGroup.append(title);
  header.append(headingGroup);
  const close = element('button', 'afterlight-debug-panel__close', '收起');
  close.type = 'button';
  close.setAttribute('aria-label', '收起调试面板');
  header.append(close);
  panel.append(header);

  panel.append(element('p', 'afterlight-debug-panel__intro', '选择“常驻标语”可一直停留在标语界面调试；常驻或循环模式下点击“应用方案”面板保持展开，方便持续调优。'));
  const form = element('form', 'afterlight-debug-panel__form');
  form.noValidate = true;
  for (const group of FIELDS) {
    const details = element('details', 'afterlight-debug-panel__group');
    details.open = Boolean(group.open);
    const summary = element('summary', 'afterlight-debug-panel__summary');
    summary.append(element('span', '', group.title));
    summary.append(element('span', 'afterlight-debug-panel__summary-mark', '⌄'));
    details.append(summary, element('p', 'afterlight-debug-panel__group-description', group.description));
    const fields = element('div', 'afterlight-debug-panel__fields');
    for (const field of group.fields) fields.append(makeControl(field, draft[field.key]));
    details.append(fields);
    form.append(details);
  }
  panel.append(form);

  const persistNote = element('p', 'afterlight-debug-panel__persist-note', '保存后告诉我，我会读取方案并写入默认配置；也可复制参数。');
  panel.append(persistNote);
  const status = element('p', 'afterlight-debug-panel__status', '草稿尚未应用。');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  panel.append(status);

  const actions = element('div', 'afterlight-debug-panel__actions');
  const apply = element('button', 'afterlight-debug-panel__action afterlight-debug-panel__action--primary', '应用方案');
  const replay = element('button', 'afterlight-debug-panel__action', '重播');
  const save = element('button', 'afterlight-debug-panel__action', '保存方案');
  const reset = element('button', 'afterlight-debug-panel__action afterlight-debug-panel__action--quiet', '恢复默认');
  const copy = element('button', 'afterlight-debug-panel__action afterlight-debug-panel__action--quiet afterlight-debug-panel__copy', '复制参数');
  for (const button of [apply, replay, save, reset, copy]) button.type = 'button';
  actions.append(apply, replay, save, reset, copy);
  panel.append(actions);

  document.body.append(panel, toggle);

  const setStatus = message => {
    status.textContent = String(message ?? '');
  };
  const snapshot = () => ({ ...draft });
  const syncControls = () => {
    form.querySelectorAll('[data-debug-field]').forEach(control => {
      const field = FIELD_BY_KEY.get(control.dataset.debugField);
      if (field) {
        if (field.type === 'select' && !Array.from(control.options).some(o => o.value === String(draft[field.key]))) {
          const customOption = element('option', '', `自定义 (${draft[field.key]})`);
          customOption.value = String(draft[field.key]);
          control.append(customOption);
        }
        control.value = String(draft[field.key]);
      }
    });
  };
  const setOpen = open => {
    panel.hidden = !open;
    panel.setAttribute('aria-hidden', String(!open));
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起调试面板' : '展开调试面板');
    toggle.textContent = open ? '收起调试' : '调试';
  };
  const run = async (button, pending, done, task) => {
    if (button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = pending;
    setStatus(pending);
    try {
      await task();
      setStatus(done);
    } catch (error) {
      console.error(error);
      setStatus(`操作未完成：${error?.message || '请重试。'}`);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };

  const updateDraft = event => {
    const control = event.target.closest?.('[data-debug-field]');
    if (!control) return;
    const field = FIELD_BY_KEY.get(control.dataset.debugField);
    if (!field) return;
    draft[field.key] = valueFor(field, control.value, draft[field.key]);
    if (event.type === 'change') control.value = String(draft[field.key]);
    if (field.key === 'animationMode') {
      callbacks.onChange(snapshot(), { replay: true });
      const opt = field.options?.find(o => o[0] === draft[field.key]);
      setStatus(`已切换阶段：${opt ? opt[1].split(' · ')[0] : draft[field.key]}`);
      return;
    }
    setStatus('已修改草稿；选择“应用”查看效果。');
  };
  const onEscape = event => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  };

  form.addEventListener('input', updateDraft);
  form.addEventListener('change', updateDraft);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', onEscape);

  apply.addEventListener('click', () => run(apply, '正在应用…', '已应用当前方案。', async () => {
    await callbacks.onChange(snapshot(), { replay: true });
    if (draft.animationMode === 'full') setOpen(false);
  }));
  replay.addEventListener('click', () => run(replay, '正在重播…', '正在按当前已应用的方案重播。', async () => {
    await callbacks.onReplay();
    if (draft.animationMode === 'full') setOpen(false);
  }));
  save.addEventListener('click', () => run(save, '正在保存…', '方案已保存。', async () => {
    await callbacks.onSave(snapshot());
    persistNote.textContent = '保存后告诉我，我会读取方案并写入默认配置；也可复制参数。';
  }));
  reset.addEventListener('click', () => run(reset, '正在恢复…', '已恢复默认参数。', async () => {
    await callbacks.onReset();
    draft = makeDraft(defaults, defaults);
    syncControls();
    persistNote.textContent = '已恢复默认草稿；若需要保留，请重新保存方案。';
  }));
  copy.addEventListener('click', () => run(copy, '正在复制…', '已复制当前草稿参数。', () => copyText(JSON.stringify(snapshot(), null, 2))));

  const api = { setStatus };
  const destroy = () => {
    document.removeEventListener('keydown', onEscape);
    panel.remove();
    toggle.remove();
    if (document.body?.[INSTANCE_KEY] === api) delete document.body[INSTANCE_KEY];
  };
  Object.defineProperty(api, 'destroy', { value: destroy });
  document.body[INSTANCE_KEY] = api;
  return api;
}
