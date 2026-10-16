import { renderReceiver } from './domain/jet-render.js';

self.addEventListener('message', ({ data }) => {
  const { revision, scene, receivers } = data;
  try {
    const results = receivers.map((index, position) => renderReceiver(scene, index, {
      onProgress: fraction => self.postMessage({ revision, type: 'progress', fraction: (position + fraction) / receivers.length })
    }));
    self.postMessage({ revision, type: 'result', results }, results.flatMap(result => result.channels.map(channel => channel.buffer)));
  } catch (error) {
    self.postMessage({ revision, type: 'error', message: error.message });
  }
});
