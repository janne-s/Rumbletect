import { emptyLibrary, ENVIRONMENT_PRESETS, environmentValues, mergedLibraries, presetName, presetsIn, readLibrary, withEnvironment, withoutPreset, withPreset } from '../domain/presets.js';

const EMITTER_TAB = 'emitter';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function iconNode(name) {
  const icon = node('i', `fa-solid ${name}`);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

const textButton = (text, onClick, className = '') => {
  const button = node('button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
};

/**
 * One window for the library: an emitter's device on one tab, the air and ground on the other. Presets stay in the
 * browser apart from the app's own data, so that a reset leaves them, and are saved to or merged from one file.
 */
export function createPresets({ tect, storageKey, state, commit, readScene, kinds, download }) {
  const title = `${tect[0].toUpperCase()}${tect.slice(1)}`;

  function load() {
    try { return readLibrary(JSON.parse(localStorage.getItem(storageKey)), tect); } catch { return emptyLibrary(tect); }
  }
  function store(library) {
    try { localStorage.setItem(storageKey, JSON.stringify(library)); } catch {}
  }

  const emitterOf = (scene, id) => scene.emitters.find(item => item.id === id);
  const presetOf = emitter => (emitter ? kinds[emitter.kind].preset ?? null : null);

  /** Each emitter section once, named after the first kind that gives it, in the order the tect lists its kinds. */
  const emitterSections = [];
  for (const [kind, panel] of Object.entries(kinds)) {
    if (panel.preset && !emitterSections.some(([section]) => section === panel.preset.section)) emitterSections.push([panel.preset.section, panel.label({ kind })]);
  }

  let tab = EMITTER_TAB;
  let emitterId = null;
  let message = '';
  let confirming = null;

  /** The emitter the Emitter tab saves from and loads into: the one whose bookmark opened it while it exists, else the selected one. */
  function currentEmitter() {
    const chosen = emitterOf(state.scene, emitterId);
    if (chosen) return chosen;
    return state.selection.type === 'emitter' ? emitterOf(state.scene, state.selection.id) ?? null : null;
  }

  function slot() {
    if (tab === ENVIRONMENT_PRESETS) {
      return { section: ENVIRONMENT_PRESETS, take: environmentValues, give: withEnvironment, pick: (from, into) => { into.air = from.air; into.ground = from.ground; } };
    }
    const emitter = currentEmitter();
    const preset = presetOf(emitter);
    if (!preset) return null;
    const id = emitter.id;
    return {
      section: preset.section,
      take: scene => structuredClone(preset.take(emitterOf(scene, id))),
      give: (scene, values) => { preset.give(emitterOf(scene, id), values); return scene; },
      pick: (from, into) => { const index = into.emitters.findIndex(item => item.id === id); into.emitters[index] = emitterOf(from, id); }
    };
  }

  const dialog = document.body.appendChild(Object.assign(node('dialog', 'presets-dialog'), { tabIndex: -1 }));
  dialog.setAttribute('aria-labelledby', 'presets-title');
  const fileInput = Object.assign(node('input'), { type: 'file', accept: 'application/json,.json', hidden: true });

  /** A preset's values are read as an opened scene's are, so a library from another version still loads. */
  function apply(values) {
    const { give, pick } = slot();
    let read;
    try {
      read = readScene(give(structuredClone(state.scene), structuredClone(values)));
    } catch (error) {
      message = error.message;
      render();
      return;
    }
    dialog.close();
    commit(scene => pick(read, scene));
  }

  function presetRow(preset, section, loadable) {
    const row = node('li');
    const loadButton = textButton(preset.name, () => apply(preset.values), 'preset-load');
    loadButton.disabled = !loadable;
    const deleting = confirming === `${section}\n${preset.name}`;
    let remove;
    if (deleting) {
      remove = textButton('Delete', () => { store(withoutPreset(load(), section, preset.name)); confirming = null; render(); }, 'preset-delete');
    } else {
      remove = node('button', 'icon-button preset-remove');
      remove.type = 'button';
      remove.title = `Delete ${preset.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.append(iconNode('fa-xmark'));
      remove.addEventListener('click', () => { confirming = `${section}\n${preset.name}`; render(); });
    }
    row.append(loadButton, remove);
    return row;
  }

  function saveRow(section) {
    const row = node('div', 'preset-save');
    const nameInput = Object.assign(node('input'), { type: 'text', maxLength: 64, id: 'preset-name' });
    nameInput.setAttribute('aria-label', 'Preset name');
    const existing = presetsIn(load(), section);
    const saveButton = textButton('Save', () => {
      const name = presetName(nameInput.value);
      if (!name) return;
      const { take } = slot();
      store(withPreset(load(), { section, name, values: take(state.scene) }));
      message = '';
      render();
    });
    const sync = () => {
      const name = presetName(nameInput.value);
      saveButton.disabled = !name;
      saveButton.textContent = existing.some(preset => preset.name === name) ? 'Replace' : 'Save';
    };
    nameInput.addEventListener('input', sync);
    nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveButton.click(); } });
    sync();
    row.append(nameInput, saveButton);
    return row;
  }

  function tabButton(key, label) {
    const button = textButton(label, () => { tab = key; message = ''; confirming = null; render(); }, 'preset-tab');
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab === key));
    return button;
  }

  /** The emitter's own kind first and loadable, the other kinds dimmed below it, so the whole library shows. */
  function emitterBody(body) {
    const emitter = currentEmitter();
    const own = presetOf(emitter)?.section ?? null;
    if (emitter) body.append(node('p', 'preset-target', emitter.name));
    const library = load();
    const sections = [...emitterSections].sort(([a], [b]) => (b === own) - (a === own));
    for (const [section, label] of sections) {
      const presets = presetsIn(library, section);
      if (section !== own && !presets.length) continue;
      const group = node('section', section === own ? 'preset-group' : 'preset-group other');
      group.append(node('h3', '', label));
      const list = node('ul', 'preset-list');
      presets.forEach(preset => list.append(presetRow(preset, section, section === own)));
      group.append(list);
      if (section === own) group.append(saveRow(section));
      body.append(group);
    }
  }

  function environmentBody(body) {
    const list = node('ul', 'preset-list');
    presetsIn(load(), ENVIRONMENT_PRESETS).forEach(preset => list.append(presetRow(preset, ENVIRONMENT_PRESETS, true)));
    body.append(list, saveRow(ENVIRONMENT_PRESETS));
  }

  function render() {
    const header = node('header', 'details-header');
    const titleNode = node('h2', '', 'Presets');
    titleNode.id = 'presets-title';
    header.append(titleNode, textButton('Done', () => dialog.close(), 'primary'));
    const tabs = node('div', 'preset-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.append(tabButton(EMITTER_TAB, 'Emitter'), tabButton(ENVIRONMENT_PRESETS, 'Air and ground'));
    const body = node('div', 'presets-body');
    body.setAttribute('role', 'tabpanel');
    if (tab === EMITTER_TAB) emitterBody(body); else environmentBody(body);
    if (message) body.append(node('p', 'preset-message', message));
    const footer = node('footer', 'export-actions');
    footer.append(
      textButton('Import library…', () => fileInput.click()),
      textButton('Export library…', () => download(`${tect}-presets.json`, new Blob([`${JSON.stringify(load(), null, 2)}\n`], { type: 'application/json' })))
    );
    dialog.replaceChildren(header, tabs, body, footer, fileInput);
  }

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (!file) return;
    try {
      const incoming = readLibrary(JSON.parse(await file.text()), tect);
      store(mergedLibraries(load(), incoming));
      message = `${incoming.presets.length} ${incoming.presets.length === 1 ? 'preset' : 'presets'} from ${file.name}`;
    } catch (error) {
      message = error instanceof SyntaxError ? `${file.name} is not a ${title} preset library.` : error.message;
    }
    render();
  });

  function open(next) {
    tab = next === ENVIRONMENT_PRESETS ? ENVIRONMENT_PRESETS : EMITTER_TAB;
    emitterId = next === ENVIRONMENT_PRESETS ? null : next;
    message = '';
    confirming = null;
    render();
    dialog.showModal();
    dialog.focus();
  }

  /** Only an emitter whose kind gives its device as a preset has the button; it opens the window on its own tab. */
  function button(next) {
    if (next !== ENVIRONMENT_PRESETS && !presetOf(emitterOf(state.scene, next))) return null;
    const element = node('button', 'icon-button dice-button');
    element.type = 'button';
    element.title = 'Presets';
    element.setAttribute('aria-label', 'Presets');
    element.setAttribute('aria-haspopup', 'dialog');
    element.append(iconNode('fa-bookmark'));
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(next); });
    element.addEventListener('keydown', event => event.stopPropagation());
    return element;
  }

  return { button };
}
