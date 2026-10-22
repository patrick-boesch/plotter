import { generatePath } from './path.js';

self.onmessage = ({ data }) => {
  try {
    const result = generatePath(data.field, data.width, data.height, data.options,
      progress => self.postMessage({ type: 'progress', progress }));
    self.postMessage({ type: 'result', ...result }, [result.points.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
