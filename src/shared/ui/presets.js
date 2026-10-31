import { emptyLibrary, ENVIRONMENT_PRESETS, environmentValues, mergedLibraries, presetName, presetsIn, readLibrary, withEnvironment, withoutPreset, withPreset } from '../domain/presets.js';

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
 * Named presets of an emitter's device or of the air and ground, kept in the browser apart from the app's own data,
 * so that a reset leaves them, and saved to or merged from one library file.
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
  const presetOf = emitter => kinds[emitter.kind].preset ?? null;

  /** A target is the air and ground or an emitter's id; its section is what its presets are listed under. */
  function slot(target) {
    if (target === ENVIRONMENT_PRESETS) {
      return { section: ENVIRONMENT_PRESETS, heading: 'Air and ground presets', take: environmentValues, give: withEnvironment, pick: (from, into) => { into.air = from.air; into.ground = from.ground; } };
    }
    const emitter = emitterOf(state.scene, target);
    const preset = presetOf(emitter);
    return {
      section: preset.section,
      heading: `${kinds[emitter.kind].label(emitter)} presets`,
      take: scene => structuredClone(preset.take(emitterOf(scene, target))),
      give: (scene, values) => { preset.give(emitterOf(scene, target), values); return scene; },
      pick: (from, into) => { const index = into.emitters.findIndex(item => item.id === target); into.emitters[index] = emitterOf(from, target); }
    };
  }

  const dialog = document.body.appendChild(Object.assign(node('dialog', 'presets-dialog'), { tabIndex: -1 }));
  dialog.setAttribute('aria-labelledby', 'presets-title');
  const fileInput = Object.assign(node('input'), { type: 'file', accept: 'application/json,.json', hidden: true });
  let target = null;
  let message = '';
  let confirming = null;

  /** A preset's values are read as an opened scene's are, so a library from another version still loads. */
  function apply(values) {
    const { give, pick } = slot(target);
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

  function save(name) {
    const { section, take } = slot(target);
    store(withPreset(load(), { section, name, values: take(state.scene) }));
    message = '';
    render();
  }

  function render() {
    const { section, heading } = slot(target);
    const presets = presetsIn(load(), section);
    const header = node('header', 'details-header');
    const titleNode = node('h2', '', heading);
    titleNode.id = 'presets-title';
    header.append(titleNode, textButton('Done', () => dialog.close(), 'primary'));

    const list = node('ul', 'preset-list');
    for (const preset of presets) {
      const row = node('li');
      const loadButton = textButton(preset.name, () => apply(preset.values), 'preset-load');
      const deleting = confirming === preset.name;
      const remove = deleting
        ? textButton('Delete', () => { store(withoutPreset(load(), section, preset.name)); confirming = null; render(); }, 'preset-delete')
        : node('button', 'icon-button preset-remove');
      if (!deleting) {
        remove.type = 'button';
        remove.title = `Delete ${preset.name}`;
        remove.setAttribute('aria-label', remove.title);
        remove.append(iconNode('fa-xmark'));
        remove.addEventListener('click', () => { confirming = preset.name; render(); });
      }
      row.append(loadButton, remove);
      list.append(row);
    }

    const saveRow = node('div', 'preset-save');
    const nameInput = Object.assign(node('input'), { type: 'text', maxLength: 64, id: 'preset-name' });
    nameInput.setAttribute('aria-label', 'Preset name');
    const saveButton = textButton('Save', () => { const name = presetName(nameInput.value); if (name) save(name); });
    const syncSave = () => {
      const name = presetName(nameInput.value);
      saveButton.disabled = !name;
      saveButton.textContent = presets.some(preset => preset.name === name) ? 'Replace' : 'Save';
    };
    nameInput.addEventListener('input', syncSave);
    nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); saveButton.click(); } });
    syncSave();
    saveRow.append(nameInput, saveButton);

    const body = node('div', 'presets-body');
    body.append(list, saveRow);
    if (message) body.append(node('p', 'preset-message', message));

    const footer = node('footer', 'export-actions');
    footer.append(
      textButton('Import library…', () => fileInput.click()),
      textButton('Export library…', () => download(`${tect}-presets.json`, new Blob([`${JSON.stringify(load(), null, 2)}\n`], { type: 'application/json' })))
    );
    dialog.replaceChildren(header, body, footer, fileInput);
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
    target = next;
    message = '';
    confirming = null;
    render();
    dialog.showModal();
    dialog.focus();
  }

  /** Only an emitter whose kind gives its device as a preset has the button. */
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
