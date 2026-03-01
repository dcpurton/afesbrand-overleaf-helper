// background listener to download a file (optionally prompting to "Save As...")

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'download') {
    chrome.downloads.download(
      {
        url: msg.url,
        filename: msg.filename,
        saveAs: !!msg.saveAs,
        conflictAction: msg.saveAs ? 'prompt' : 'overwrite'
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, msg: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, msg: 'Downloaded!' });
        }
      }
    );
    return true;
  }
});
