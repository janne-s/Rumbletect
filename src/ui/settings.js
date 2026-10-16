const $ = id => document.getElementById(id);

export function createSettings({ read, save }) {
  const dialog = $('settings-dialog');
  let threads = null;

  function slider(grid, label, value, maximum) {
    const id = 'setting-threads';
    const name = document.createElement('label');
    name.htmlFor = id;
    name.textContent = label;
    const input = Object.assign(document.createElement('input'), { type: 'range', id, min: 1, max: maximum, step: 1 });
    input.value = String(value);
    const output = document.createElement('output');
    output.htmlFor = id;
    const fill = () => {
      input.style.setProperty('--to', `${maximum > 1 ? (Number(input.value) - 1) / (maximum - 1) * 100 : 100}%`);
      output.textContent = `${input.value} of ${maximum}`;
    };
    input.addEventListener('input', fill);
    fill();
    grid.append(name, input, output);
    return () => Number(input.value);
  }

  function open() {
    const settings = read();
    $('device-grid').replaceChildren();
    threads = slider($('device-grid'), 'Threads', settings.threads, settings.maximumThreads);
    dialog.returnValue = 'cancel';
    dialog.showModal();
    dialog.focus();
  }

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') save({ threads: threads() });
  });

  $('settings').addEventListener('click', open);
}
