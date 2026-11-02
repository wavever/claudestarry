export const LOCALE_STORAGE_KEY = 'afterlight_locale_v1';
export const DEFAULT_LOCALE = 'zh-CN';
export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);

export const SLOGANS = Object.freeze({
  'zh-CN': '被停用的 Claude 账号没有消失，\n只是从此不再回应，但仍留有余光',
  en: 'Disabled Claude accounts have not disappeared.\nThey no longer respond, but they still leave an afterlight.',
});

export const TRANSLATIONS = Object.freeze({
  'zh-CN': {
    meta: {
      title: 'Claude 余光 · Claude Starry',
      description: '每一个被停用的 Claude 账号，都在星河里留下一点余光。',
      socialDescription: '被停用的 Claude 账号没有消失，只是从此不再回应，但仍留有余光。',
    },
    brand: {
      title: 'Claude 余光',
      aria: 'Claude 余光',
    },
    scene: {
      aria: '历史聚合星海。可拖动旋转、滚轮或双指缩放；新增独立星可点击阅读记录，历史光点是官方汇总数据的聚合展示。',
    },
    utility: {
      language: '选择语言',
      github: '在 GitHub 查看 Claude Starry',
      x: '在 X 关注 @HtWavever',
    },
    counter: {
      prefix: '已有',
      suffix: '个停用的 claude 账号留下余光',
      suffixOne: '个停用的 claude 账号留下余光',
      aria: '已有 {count} 个停用的 claude 账号留下余光',
      ariaOne: '已有 {count} 个停用的 claude 账号留下余光',
    },
    controls: {
      toolbar: '星河控制',
      restore: '恢复视角',
      ownStars: '切换我添加的星星',
      create: '添加星星',
    },
    card: {
      aria: '星星名片',
      close: '收起名片',
      onlinePeriod: '在线区间',
      disabledDate: '停用日期',
      disabledOn: '停用于 {date}',
    },
    dialog: {
      close: '关闭',
      title: '留下你被停用账号的余光',
      alias: '账号名称',
      aliasPlaceholder: '为它起一个独一无二的名称吧',
      started: '注册日期',
      disabled: '停用日期',
      story: '你和它的故事',
      storyPlaceholder: '还有一个故事，留在这里。',
      optional: '可选',
      noticeBefore: '记录会公开展示，请使用昵称，勿填写密码等敏感信息。需要删除时，可在 ',
      noticeAfter: ' 申请删除，提供星表编号即可。',
      submit: '留下余光',
    },
    memory: {
      record: '账户 / 余光',
      life: '在线时间',
      light: '当前余光',
      viewCard: '查看星星名片',
    },
    life: {
      missingStarted: '未填写注册日期',
      onlineDays: '曾在线 {days} 天',
      invalidRange: '请选择有效的停用日期，注册日期不能晚于停用日期。',
      preview: '存活 {days} 天 · 初光 {peak}% · 约 {halfLife} 天后余温减半',
    },
    webgl: {
      error: '当前浏览器无法运行星河。请开启硬件加速，或换用最新版 Chrome、Edge、Safari / Firefox。',
    },
    form: {
      requiredAlias: '请输入账号名称。',
      aliasTooLong: '账号名称不能超过 32 个字符。',
      requiredDate: '请选择停用日期。',
      invalidDate: '停用日期格式无效。',
      dateTooEarly: '停用日期不能早于 Claude 成立日期（2021-01-26）。',
      dateTooLate: '停用日期不能晚于今天。',
      invalidStarted: '注册日期格式无效。',
      startedTooEarly: '注册日期不能早于 Claude 成立日期（2021-01-26）。',
      startedAfterDate: '注册日期不能晚于停用日期。',
      storyTooLong: '你和它的故事不能超过 180 个字符。',
      invalid: '请检查输入信息。',
      saveFailed: '暂时无法保存，请检查浏览器存储权限。',
      sharedNote: '记录会写入共享星河；编号由星表在保存时分配。每颗星最终都会保留一点微光。',
      catalogOnSave: '保存时分配',
    },
    errors: {
      sharedSync: '共享星河暂时无法同步。',
      invalidSubmission: '请检查日期和填写内容。',
      connection: '无法连接共享星河。',
      wait: '请稍候再送入另一颗星。',
      sharedSave: '暂时无法保存，请检查填写内容后重试。',
      sharedUnavailable: '共享星河暂时无法保存。',
      invalidRecord: '共享星河返回了无效记录。',
      saveFallback: '暂时无法保存，请稍后重试。',
    },
    share: {
      pageButton: '分享',
      pageKicker: 'SHARE',
      pageTitle: '分享你的余光',
      previewAlt: '分享图片预览',
      viewFull: '点击查看原图',
      screenshotJoined: '您的 {own} 个 claude 停用{accounts}将和其他 {others} 个{companions}一起，点亮这片星云',
      screenshotTotal: '当前已有 {total} 个 claude 停用{accounts}在星云中',
      accounts: '账号',
      accountsOne: '账号',
      companions: '伙伴',
      companionsOne: '伙伴',
      copy: '复制',
      download: '下载',
      shareToX: '分享到 X',
      xHint: '分享图会自动复制到剪贴板，打开 X 后直接粘贴即可。',
      copiedForX: '分享图已复制到剪贴板，可直接在 X 上粘贴。',
      copyOnX: '分享图已生成，点击「分享到 X」时会复制到剪贴板。',
      xImageCopied: '已打开 X，图片已复制到剪贴板，直接粘贴即可',
      xImageCopyFailed: '已打开 X，但图片复制失败，请下载后手动添加',
      imagePreparing: '正在绘制分享图…',
      imageCopied: '分享图片已复制到剪贴板',
      imageCopyFailed: '复制失败，请尝试下载图片',
      imageDownloaded: '分享图片已下载',
      imageDownloadFailed: '下载失败，请稍后重试',
      imageFailed: '生成分享图失败',
      postText: '我把「{alias}」留在了 Claude 余光的星河里。每一个被停用的 Claude 账号，都留有一点余光。{url}',
      tweet: '被停用的 Claude 账号没有消失，只是从此不再回应，但仍留有余光：{url}',
    },
  },
  en: {
    meta: {
      title: 'Claude Starry',
      description: 'Every disabled Claude account leaves a little afterlight in this galaxy.',
      socialDescription: 'Disabled Claude accounts have not disappeared. They no longer respond, but they still leave an afterlight.',
    },
    brand: {
      title: 'Claude Starry',
      aria: 'Claude Starry',
    },
    scene: {
      aria: 'A historical aggregate galaxy. Drag to orbit; use the wheel or pinch to zoom. New individual stars can be selected to read their records; historical lights are an aggregate of public totals.',
    },
    utility: {
      language: 'Choose language',
      github: 'View Claude Starry on GitHub',
      x: 'Follow @HtWavever on X',
    },
    counter: {
      prefix: '',
      suffix: 'disabled Claude accounts have left an afterlight',
      suffixOne: 'disabled Claude account has left an afterlight',
      aria: '{count} disabled Claude accounts have left an afterlight',
      ariaOne: '{count} disabled Claude account has left an afterlight',
    },
    controls: {
      toolbar: 'Galaxy controls',
      restore: 'Restore view',
      ownStars: 'Cycle through my stars',
      create: 'Add a star',
    },
    card: {
      aria: 'Star record',
      close: 'Close star record',
      onlinePeriod: 'Online period',
      disabledDate: 'Disabled on',
      disabledOn: 'Disabled on {date}',
    },
    dialog: {
      close: 'Close',
      title: 'Leave an afterlight for your disabled account',
      alias: 'Account alias',
      aliasPlaceholder: 'Give it a name only you will recognize',
      started: 'Registration date',
      disabled: 'Disabled date',
      story: 'Your story with it',
      storyPlaceholder: 'Leave another story here.',
      optional: 'Optional',
      noticeBefore: 'Records are public. Use an alias and never enter passwords or other sensitive information. To request removal, open an issue on ',
      noticeAfter: ' and include the catalog number.',
      submit: 'Leave afterlight',
    },
    memory: {
      record: 'ACCOUNT / AFTERLIGHT',
      life: 'TIME ONLINE',
      light: 'CURRENT LIGHT',
      viewCard: 'View star record',
    },
    life: {
      missingStarted: 'Registration date not provided',
      onlineDays: 'Online for {days} days',
      invalidRange: 'Choose a valid disabled date; the registration date cannot be later.',
      preview: 'Online {days} days · initial light {peak}% · warmth halves in about {halfLife} days',
    },
    webgl: {
      error: 'This browser cannot render the galaxy. Enable hardware acceleration or try the latest Chrome, Edge, Safari, or Firefox.',
    },
    form: {
      requiredAlias: 'Enter an account alias.',
      aliasTooLong: 'An account alias can be at most 32 characters.',
      requiredDate: 'Choose a disabled date.',
      invalidDate: 'The disabled date is invalid.',
      dateTooEarly: 'The disabled date cannot be before Claude launched (2021-01-26).',
      dateTooLate: 'The disabled date cannot be later than today.',
      invalidStarted: 'The registration date is invalid.',
      startedTooEarly: 'The registration date cannot be before Claude launched (2021-01-26).',
      startedAfterDate: 'The registration date cannot be later than the disabled date.',
      storyTooLong: 'Your story can be at most 180 characters.',
      invalid: 'Check the information and try again.',
      saveFailed: 'Unable to save. Check your browser storage permission.',
      sharedNote: 'This record will join the shared galaxy; the catalog assigns its number when it is saved. Every star keeps a little light.',
      catalogOnSave: 'Assigned on save',
    },
    errors: {
      sharedSync: 'The shared galaxy is temporarily unavailable.',
      invalidSubmission: 'Check the dates and entered information.',
      connection: 'Unable to reach the shared galaxy.',
      wait: 'Please wait before sending another star.',
      sharedSave: 'Unable to save right now. Check the information and try again.',
      sharedUnavailable: 'The shared galaxy could not save this star.',
      invalidRecord: 'The shared galaxy returned an invalid record.',
      saveFallback: 'Unable to save right now. Please try again.',
    },
    share: {
      pageButton: 'Share',
      pageKicker: 'SHARE',
      pageTitle: 'Share your afterlight',
      previewAlt: 'Share image preview',
      viewFull: 'Click to view full size',
      screenshotJoined: 'Your {own} disabled Claude {accounts} will light up this nebula together with {others} other {companions}',
      screenshotTotal: 'The nebula now holds {total} disabled Claude {accounts}',
      accounts: 'accounts',
      accountsOne: 'account',
      companions: 'companions',
      companionsOne: 'companion',
      copy: 'Copy',
      download: 'Download',
      shareToX: 'Share to X',
      xHint: 'The share image is copied to your clipboard automatically — paste it into X.',
      copiedForX: 'Share image copied to your clipboard — paste it directly into X.',
      copyOnX: 'The share image is ready. Click “Share to X” to copy it to your clipboard.',
      xImageCopied: 'Opened X. Image copied — paste it into your post.',
      xImageCopyFailed: 'Opened X, but the image could not be copied. Download it and attach it manually.',
      imagePreparing: 'Drawing the share image…',
      imageCopied: 'Share image copied to the clipboard',
      imageCopyFailed: 'Could not copy the image. Try Download instead.',
      imageDownloaded: 'Share image downloaded',
      imageDownloadFailed: 'Could not download the image. Please try again.',
      imageFailed: 'Could not generate the share image',
      postText: 'I left “{alias}” in the Claude Starry galaxy. Every disabled Claude account leaves a little afterlight. {url}',
      tweet: 'A disabled Claude account has not disappeared. It no longer responds, but it still leaves an afterlight: {url}',
    },
  },
});

function readPath(source, path) {
  return path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, source);
}

function flattenKeys(source, prefix = '') {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value) ? flattenKeys(value, path) : [path];
  });
}

export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized.startsWith('zh-')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return null;
}

export function localeFromSearch(search = '') {
  try {
    const value = new URLSearchParams(String(search).replace(/^\?/, '')).get('locale')
      ?? new URLSearchParams(String(search).replace(/^\?/, '')).get('lang');
    return normalizeLocale(value);
  } catch {
    return null;
  }
}

export function readStoredLocale(storage) {
  try {
    return normalizeLocale(storage?.getItem?.(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function safeStorage(valueOrGetter) {
  try {
    return typeof valueOrGetter === 'function' ? valueOrGetter() : valueOrGetter ?? null;
  } catch {
    return null;
  }
}

export function resolveLocale({ search = '', storage, languages = [] } = {}) {
  const fromSearch = localeFromSearch(search);
  if (fromSearch) return fromSearch;
  const fromStorage = readStoredLocale(storage);
  if (fromStorage) return fromStorage;
  const candidates = Array.isArray(languages) ? languages : [languages];
  for (const language of candidates) {
    const normalized = normalizeLocale(language);
    if (normalized) return normalized;
  }
  return 'en';
}

export function persistLocale(storage, locale) {
  const normalized = normalizeLocale(locale);
  if (!normalized) return false;
  try {
    storage?.setItem?.(LOCALE_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

export function localeSearchWithSelection(search = '', locale) {
  const normalized = normalizeLocale(locale);
  const original = String(search ?? '');
  if (!normalized) return original;
  try {
    const params = new URLSearchParams(original.replace(/^\?/, ''));
    let changed = false;
    for (const key of ['locale', 'lang']) {
      if (!params.has(key)) continue;
      params.set(key, normalized);
      changed = true;
    }
    return changed ? `?${params.toString()}` : original;
  } catch {
    return original;
  }
}

export function sloganForLocale(locale) {
  return SLOGANS[normalizeLocale(locale) || DEFAULT_LOCALE];
}

export function translate(locale, key, values = {}) {
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  const template = readPath(TRANSLATIONS[normalized], key) ?? readPath(TRANSLATIONS[DEFAULT_LOCALE], key) ?? key;
  return String(template).replace(/\{([\w-]+)\}/g, (match, name) => values[name] === undefined || values[name] === null ? match : String(values[name]));
}

export function missingTranslationKeys() {
  const canonical = flattenKeys(TRANSLATIONS[DEFAULT_LOCALE]);
  return Object.fromEntries(SUPPORTED_LOCALES.map(locale => [
    locale,
    canonical.filter(key => readPath(TRANSLATIONS[locale], key) === undefined),
  ]));
}

export function applyDocumentLocale(locale, root = typeof document === 'undefined' ? null : document) {
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  const translateKey = (key, values) => translate(normalized, key, values);
  const documentRoot = root?.documentElement || root?.ownerDocument?.documentElement;
  if (documentRoot) documentRoot.lang = normalized;

  root?.querySelectorAll?.('[data-i18n]').forEach(node => {
    node.textContent = translateKey(node.dataset.i18n);
  });
  root?.querySelectorAll?.('[data-i18n-content]').forEach(node => {
    node.setAttribute('content', translateKey(node.dataset.i18nContent));
  });
  root?.querySelectorAll?.('[data-i18n-placeholder]').forEach(node => {
    node.setAttribute('placeholder', translateKey(node.dataset.i18nPlaceholder));
  });
  root?.querySelectorAll?.('[data-i18n-attrs]').forEach(node => {
    for (const pair of node.dataset.i18nAttrs.split('|')) {
      const [attribute, key] = pair.split(':');
      if (attribute && key) node.setAttribute(attribute, translateKey(key));
    }
  });
  root?.querySelectorAll?.('[data-locale]').forEach(button => {
    button.setAttribute('aria-pressed', String(normalizeLocale(button.dataset.locale) === normalized));
  });
  return normalized;
}
