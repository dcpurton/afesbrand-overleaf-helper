// Inject the fetch interceptor into page context
const s = document.createElement('script');
s.src = chrome.runtime.getURL('interceptor.js');
s.onload = () => s.remove();
(document.head || document.documentElement).prepend(s);

// Listen for build ID discovered by interceptor and cache it
window.addEventListener('overleaf-build-found', (e) => {
  window.__overleafBuildCache = e.detail;
  // Mirror to DOM so isolated-world executeScript can see it
  document.documentElement.dataset.overleafInterceptorActive = 'true';
});

// Set the flag immediately so the reload check works even before first compile
document.documentElement.dataset.overleafInterceptorActive = 'true';
