import { APP_VERSION, MODEL_VERSION } from './domain/constants.js';
import { prepareScene } from './domain/render.js';
import { defaultScene, emitterAnchor, MODES, PARAMETERS, parseScene, readScene, sceneInMode, serializeScene } from './domain/scene.js';
import * as fields from './ui/fields.js';
import { kindViews } from './ui/kind-views.js';
import { ADD_EMITTERS, isSupersonic, KIND_PANELS } from './ui/kinds.js';
import { startFrame } from './shared/ui/frame.js';

startFrame({
  storage: 'rumbletect',
  appVersion: APP_VERSION,
  modelVersion: MODEL_VERSION,
  onsetName: 'the start',
  propagationStyle: 'geometry',
  worker: new URL('./render-worker.js', import.meta.url),
  scene: { MODES, PARAMETERS, defaultScene, parseScene, readScene, sceneInMode, serializeScene },
  prepareScene,
  fields,
  kinds: KIND_PANELS,
  views: kindViews(),
  anchor: emitterAnchor,
  add: ADD_EMITTERS,
  modes: {
    jet: { label: 'Jet', button: 'fa-jet-fighter', icon: 'fa-jet-fighter' },
    rocket: { label: 'Rocket', button: 'fa-rocket', icon: 'fa-rocket' },
    volcano: { label: 'Volcano', button: 'fa-volcano', icon: 'fa-volcano' }
  },
  preferences: { cone: true },
  toggles: {
    cone: {
      label: 'Mach cone',
      icon: '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="18" cy="12" rx="3" ry="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M18 4 3 12l15 8M3 12h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      hidden: scene => !scene.emitters.some(emitter => isSupersonic(emitter, scene))
    }
  }
});
