// UI elements

const statusBar     = document.getElementById('statusBar');
const statusTxt     = document.getElementById('statusTxt');
const btnSvg        = document.getElementById('btnSvg');
const btnPng        = document.getElementById('btnPng');
const btnDnldPdf    = document.getElementById('btnDnldPdf');
const btnDnldSvg    = document.getElementById('btnDnldSvg');
const btnDnldPng    = document.getElementById('btnDnldPng');
const saveAsTgl     = document.getElementById('saveAsTgl');
const btnOlOpen     = document.getElementById('btnOlOpen');
const btnOlNew      = document.getElementById('btnOlNew');
const btnOlNewLabel = document.getElementById('btnOlNewLabel');


// UI helpers

/**
 * Set the status bar state and message.
 *
 * @param {'ready' | 'error' | 'working' | 'success' } state - The status bar state.
 * @param {string} msg - The status bar message.
 * @returns {void}
 */
function setStatus(state, msg) {
  statusBar.className = `status-bar ${state}`;
  statusTxt.textContent = msg;
}

/**
 * Enables or disables all action buttons in the UI.
 *
 * @param {boolean} state - If true, buttons are disabled; if false, buttons are enabled.
 * @returns {void}
 */
function setBtnDisabledState(state) {
  btnSvg.disabled = state;
  btnPng.disabled = state;
  btnDnldPdf.disabled = state;
  btnDnldSvg.disabled = state;
  btnDnldPng.disabled = state;
}

/**
 * Sets the UI to the "ready" state.
 *
 * Updates the status bar message and enables all action buttons.
 *
 * @returns {void}
 */
function setReady() {
  setStatus('ready', 'Ready ✓');
  setBtnDisabledState(false);
}


// Tab utilities

/**
 * Get the active tab in the current Chrome window.
 *
 * @returns {chrome.tabs.Tab} The active tab object.
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Try to parse a URL string to extract the current Overleaf project ID.
 *
 * @param {string} urlStr - The URL to parse.
 * @returns {string | null} Overleaf project ID if found, otherwise null.
 */
function tryParseProjectId(urlStr) {
  try {
    const u = new URL(urlStr);
    const m = u.pathname.match(/\/project\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Ensures the current Overleaf project tab is focused, or opens it.
 *
 * @returns {Promise<void>}
 */
async function focusOrOpenProjectTab() {
  const { projectId, tabId } = await chrome.storage.local.get(['projectId', 'tabId']);
  if (!projectId) return;

  const url = `https://www.overleaf.com/project/${projectId}`;

  // Check if the stored tab still exists and is the right URL
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url?.includes(projectId)) {
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  } catch {
    // Tab no longer exists
  }

  // Fall back to searching all tabs
  const [existing] = await chrome.tabs.query({ url: `https://www.overleaf.com/project/${projectId}*` });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

/**
 * Executes a function in a specific Chrome tab using the scripting API.
 *
 * @param {number} tabId - The ID of the tab where the function should run.
 * @param {Function} func - The function to execute in the tab context.
 * @param {Array} [args=[]] - Arguments to pass to the function.
 * @param {number} [timeoutMs=7000] - Maximum time to wait for the function to complete (in milliseconds).
 * @returns {Promise<Object>} Resolves with the execution result:
 *   - If successful: the `result` property of the first execution result.
 *   - If failed or timed out: an object `{ ok: false, msg: string }` describing the error.
 */
async function runInTab(tabId, func, args = [], timeoutMs = 7000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ ok: false, msg: 'Timed out' }); }
    }, timeoutMs);

    chrome.scripting.executeScript(
      { target: { tabId }, func, args },
      (results) => {
        if (done) return;
        clearTimeout(timer);
        if (chrome.runtime.lastError) return resolve({ ok: false, msg: chrome.runtime.lastError.message });
        resolve(results?.[0]?.result ?? { ok: false, msg: 'No result' });
      }
    );
  });
}


// Page-injected functions (run inside the tab via runInTab)

/**
 * Finds the most recent Overleaf output file for a given project ID.
 *
 * Searches the browser's performance resource entries for a URL matching the
 * Overleaf project build output pattern.
 *
 * @param {string} pid - The Overleaf project ID to search for.
 * @returns {{userId: string, buildId: string, lastFile: string} | null} An object containing:
 *   - `userId`: The ID of the user who built the project.
 *   - `buildId`: The build identifier.
 *   - `lastFile`: The most recent output file name.
 *   Returns `null` if no matching output is found.
 */
function page_findBuild(pid) {
  const entries = performance.getEntriesByType('resource');
  for (let i = entries.length - 1; i >= 0; i--) {
    const url = entries[i].name;
    const m = url.match(
      new RegExp(`/project/${pid}/user/([^/]+)/build/([^/]+)/output/([^?]+)`)
    );
    if (m) {
      const [_, userId, buildId, file] = m;
      return { userId, buildId, lastFile: file };
    }
  }
  return null;
}

/**
 * Performs a HEAD request to a URL to check its availability and HTTP status.
 *
 * Includes credentials in the request. Returns a simplified result object
 * indicating success and the HTTP status code.
 *
 * @param {string} url - The URL to check.
 * @returns {Promise<{ok: boolean, status: number}>} Resolves with an object:
 *   - `ok`: true if the response status is in the 200–299 range, false otherwise.
 *   - `status`: The HTTP status code of the response (or 0 if the request failed).
 */
async function page_fetchHead(url) {
  try {
    const res = await fetch(url, { credentials: 'include', method: 'HEAD' });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Fetches a URL and converts the response into a payload suitable for processing.
 *
 * Handles text/plain, image/svg+xml and image/png, encoding the PNG as Base64.
 * Includes credentials in the request.
 *
 * @param {string} url - The URL to fetch.
 * @param {'text/plain' | 'image/svg+xml' | 'image/png'} mime - The expected MIME type of the response
 * @returns {Promise<Object>} Resolves with an object:
 *   - If successful:
 *     - `ok: true`
 *     - `data: string` – the SVG as text or Base64-encoded PNG
 *     - `encoding: 'text' | 'base64'`
 *   - If unsuccessful:
 *     - `ok: false`
 *     - `msg: string` describing the error (e.g., HTTP error or fetch failure)
 */
async function page_fetchToPayload(url, mime) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 404) throw new Error('File not found — recompile and try again');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (mime === 'image/svg+xml' || mime === 'text/plain') {
      const text = await res.text();
      return { ok: true, data: text, encoding: 'text' };
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return { ok: true, data: btoa(binary), encoding: 'base64' };
  } catch (err) {
    return { ok: false, msg: err.message || 'Fetch failed' };
  }
}


// URL construction

/**
 * Constructs the URL for a specific Overleaf project output file.
 *
 * @param {string} pid      - The Overleaf project ID.
 * @param {string} userId   - The user ID who built the project.
 * @param {string} buildId  - The build ID.
 * @param {string} filename - The output file name.
 * @returns {string} The full URL pointing to the Overleaf output file.
 */
function makeOutputUrl(pid, userId, buildId, filename) {
  return `https://www.overleaf.com/project/${pid}/user/${userId}/build/${buildId}/output/${filename}`;
}


// Core actions

/**
 * Gets the URL of an Overleaf output file for the active tab.
 *
 * Determines the current Overleaf project ID from the active tab URL,
 * retrieves the latest build info, and constructs the URL for the requested
 * output file.
 *
 * @param {string} filename - The name of the output file (e.g., "main.pdf").
 * @returns {Promise<Object>} Resolves with an object:
 *   - If successful: `{ ok: true, tab: chrome.tabs.Tab, url: string }`.
 *   - If unsuccessful: `{ ok: false, msg: string }` describing the error.
 */
async function getOutputFileUrl(filename) {
  const tab = await getActiveTab();
  const projectId = tryParseProjectId(tab?.url || '');
  if (!projectId) return { ok: false, msg: 'Could not determine project ID' };
  await chrome.storage.local.set({ projectId, tabId: tab.id });
  const found = await runInTab(tab.id, page_findBuild, [projectId]);
  if (!found || !found.userId || !found.buildId) {
    return { ok: false, msg: 'No build detected — compile the project and try again' };
  }

  const url = makeOutputUrl(projectId, found.userId, found.buildId, filename);
  return { ok: true, tab, url };
}


/**
 * Copies an Overleaf output file to the system clipboard.
 *
 * Retrieves the output file URL for the active tab, fetches its contents, and
 * writes it to the clipboard in the specified MIME type.
 *
 * @param {string} filename - The name of the output file to copy.
 * @param {'image/svg+xml' | 'image/png'} mimeType - The MIME type for the clipboard data.
 * @returns {Promise<Object>} Resolves with an object describing the result:
 *   - On success: `{ ok: true, msg: 'Copied!' }`.
 *   - On failure: `{ ok: false, msg: string }` describing the error.
 */
async function copyOutputFile(filename, mimeType) {
  const outputFileResult = await getOutputFileUrl(filename);
  if (!outputFileResult.ok) return outputFileResult;

  const { tab, url } = outputFileResult;

  const payload = await runInTab(tab.id, page_fetchToPayload, [url, mimeType]);
  if (!payload?.ok) {
    return { ok: false, msg: payload?.msg || 'Fetch failed' };
  }

  try {
    await writeToClipboard(mimeType, payload);
    return { ok: true, msg: 'Copied!' };
  } catch (err) {
    return { ok: false, msg: `Clipboard write failed: ${err.message}` };
  }
}

/**
 * Writes a payload to the system clipboard with a specified MIME type.
 *
 * Handles both text and Base64-encoded binary payloads.
 *
 * @param {string} mimeType - The MIME type for the clipboard data.
 * @param {{data: string, encoding: 'text' | 'base64'}} payload - The payload to write:
 *   - `data`: The text content or Base64-encoded binary string.
 *   - `encoding`: Either `'text'` for plain text or `'base64'` for binary data.
 * @returns {Promise<void>} Resolves when the data has been successfully written to clipboard.
 */
async function writeToClipboard(mimeType, payload) {
  const blobPromise = new Promise((resolve) => {
    if (payload.encoding === 'text') {
      resolve(new Blob([payload.data], { type: mimeType }));
    } else {
      const binary = atob(payload.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: mimeType }));
    }
  });

  await navigator.clipboard.write([
    new ClipboardItem({ [mimeType]: blobPromise })
  ]);
}

/**
 * Downloads an Overleaf output file via the extension background script.
 *
 * Locates the current project's output URL, performs a preflight HEAD request
 * (to confirm availability and avoid unnecessary downloads), and then
 * delegates the actual download to the background script.
 *
 * @param {string} filename - The name of the output file to download.
 * @returns {Promise<{ok: boolean, msg?: string}>} Resolves with:
 *   - `{ ok: true, ... }` if the background download request succeeds.
 *   - `{ ok: false, msg: string }` if the file cannot be located,
 *     the server responds with an error, or the background script fails.
 */
async function downloadOutputFile(filename) {
  // 1) Locate the output URL (project/user/build/filename)
  const outputFileResult = await getOutputFileUrl(filename);
  if (!outputFileResult.ok) return outputFileResult;

  const { tab, url } = outputFileResult;

  // 2) Preflight with HEAD (page context, cookies included)
  const head = await runInTab(tab.id, page_fetchHead, [url]);
  if (head.status === 404) {
    return { ok: false, msg: 'File not found — recompile and try again' };
  }
  if (!head.ok) {
    return { ok: false, msg: `Server error (HTTP ${head.status})` };
  }

  // 3) Ask background to download (optionally prompt "Save As…")
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'download',
        url,
        filename,
        saveAs: !!saveAsTgl.checked
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, msg: chrome.runtime.lastError.message });
        } else {
          resolve(response ?? { ok: false, msg: 'No response from background' });
        }
      }
    );
  });
}

/**
 * Checks whether the current Overleaf project is an AFES Brand Factory project
 * and whether afesbrand.sty is up to date with the latest GitHub release.
 *
 * If a newer version is available, updates the status bar with a warning.
 * Silently does nothing if the version cannot be determined.
 *
 * @param {string} latestVersion - The latest version string from GitHub.
 * @returns {Promise<void>}
 */
async function checkAFESBrandFactoryProject(latestVersion) {
  const result = await getOutputFileUrl('output.log');
  if (!result.ok) {
    setStatus('error', 'Compile the project first');
    setBtnDisabledState(true);
    return;
  }
  const payload = await runInTab(result.tab.id, page_fetchToPayload, [result.url, 'text/plain']);
  if (!payload?.ok) {
    setStatus('error', 'Project needs to be recompiled');
    setBtnDisabledState(true);
    return;
  }
  const m = payload.data.match(/^Package: afesbrand \S+ v(\S+)/m);
  if (!m) {
    setStatus('error', 'This project does not seem to be an AFES Brand Factory project');
    setBtnDisabledState(true);
    return;
  }
  const styVersion = m[1];
  if (styVersion !== latestVersion) {
    setStatus('info', `Update available: v${styVersion} → v${latestVersion}`);
    setBtnDisabledState(false);
  } else {
    setReady();
  }
}


// Preferences

/**
 * Loads the persisted "Save As" preference from extension storage
 * and updates the corresponding checkbox state in the UI.
 *
 * Defaults to `false` if the preference is not set or if retrieval fails.
 *
 * @returns {Promise<void>} Resolves once the checkbox state has been updated.
 */
async function loadSaveAsPreference() {
  try {
    const { saveAs = false } = await chrome.storage.local.get({ saveAs: false });
    saveAsTgl.checked = !!saveAs;
  } catch (e) {
    saveAsTgl.checked = false;
  }
}

/**
 * Attaches a change listener to the "Save As" checkbox and persists
 * its state to extension storage whenever it is toggled.
 *
 * Errors during persistence are silently ignored.
 *
 * @returns {void}
 */
function wireSaveAsPersistence() {
  saveAsTgl.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ saveAs: !!saveAsTgl.checked });
    } catch (e) {
    }
  });
}


// Initialisation & event wiring

/**
 * Fetch the latest version number of the afesbrand LaTeX package and add it to
 * the link to create a new Overleaf project.
 *
 * If the request fails for any reason the span is silently cleared.
 *
 * @returns {string | null} The version string of found, null otherwise.
 */
async function fetchAFESBrandVersion() {
  try {
    const res = await fetch('https://api.github.com/repos/dcpurton/afesbrand/releases/latest');
    if (!res.ok) throw new Error();
    const { tag_name } = await res.json();
    btnOlNewLabel.textContent = tag_name ? `Create new (${tag_name})` : '';
    return tag_name ? tag_name.replace(/^v/, '') : null;
  } catch {
    btnOlNewLabel.textContent = '';
    return null;
  }
}

// Set initial state.
(async () => {
  await loadSaveAsPreference();
  wireSaveAsPersistence();
  const latestVersion = await fetchAFESBrandVersion();
  const { projectId, tabId } = await chrome.storage.local.get(['projectId', 'tabId']);
  try {
    const tab = await getActiveTab();
    if (!tab.url?.includes('overleaf.com/project/')) {
      setStatus('error', 'Open AFESBrandFactory Overleaf project tab first');
      if (projectId) {
        btnOlOpen.classList.remove('hidden');
      }
      return;
    }
    if (latestVersion) {
      checkAFESBrandFactoryProject(latestVersion);
    }
  } catch (err) {
    setStatus('error', 'Init error: ' + err.message);
  }
})();

// Add button listeners.
const buttonActions = [
  { el: btnSvg, working: 'Fetching SVG...',
      action: () => copyOutputFile('AFESBrandFactory.svg', 'image/svg+xml') },
  { el: btnPng, working: 'Fetching PNG...',
      action: () => copyOutputFile('AFESBrandFactory.png', 'image/png') },
  { el: btnDnldPdf, working: 'Downloading PDF...',
      action: () => downloadOutputFile('AFESBrandFactory.pdf') },
  { el: btnDnldSvg, working: 'Downloading SVG...',
      action: () => downloadOutputFile('AFESBrandFactory.svg') },
  { el: btnDnldPng, working: 'Downloading PNG...',
      action: () => downloadOutputFile('AFESBrandFactory.png') },
];

buttonActions.forEach(({ el, working, action }) => {
  el.addEventListener('click', async () => {
    setBtnDisabledState(true);
    setStatus('working', working);
    const res = await action();
    setStatus(res?.ok ? 'success' : 'error', res?.msg ?? 'Unknown error');
    setBtnDisabledState(false);
  });
});

btnOlNew.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.overleaf.com/docs?snip_uri=https://github.com/dcpurton/afesbrand/releases/latest/download/AFESBrandFactory.zip' });
});

btnOlOpen.addEventListener('click', focusOrOpenProjectTab);

