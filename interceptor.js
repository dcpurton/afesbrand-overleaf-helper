//intercept userId and buildId on compile

const _fetch = window.fetch;
window.fetch = async function(...args) {
  const res = await _fetch(...args);
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
  const m = url.match(/\/project\/([^/]+)\/user\/([^/]+)\/build\/([^/]+)\/output\/([^?]+)/);
  if (m) {
    window.dispatchEvent(new CustomEvent('overleaf-build-found', {
      detail: { projectId: m[1], userId: m[2], buildId: m[3], lastFile: m[4] }
    }));
  }
  return res;
};
