// --- Lorebook Logic (Refactored Phase 6) ---
const _lbContentCache = new Map(); // Cache content, not just images

// Generic function to retrieve simple string content from a Lorebook Entry
async function fetchLorebookContent(key) {
    if (!key) return null;
    const searchKey = String(key).trim().toLowerCase();
    if (_lbContentCache.has(searchKey)) return _lbContentCache.get(searchKey);
    


    try {
        // A contained frame (mvu-helper's sandboxed mount) has no book to search: it asks the host for
        // ONE entry's content by key, and the host matches keys[] / comment exactly as below.
        if (window.MvuHelperFrame && typeof window.MvuHelperFrame.lorebookContent === 'function') {
            const hosted = await window.MvuHelperFrame.lorebookContent(searchKey);
            if (hosted) _lbContentCache.set(searchKey, hosted);
            return hosted || null;
        }

        // API Discovery (Match statusmenu.html exactly)
        const _getPrimaryBook = (typeof getCurrentCharPrimaryLorebook === 'function')
            ? getCurrentCharPrimaryLorebook
            : (window.parent && window.parent.getCurrentCharPrimaryLorebook);

        const _getEntries = (typeof getLorebookEntries === 'function')
            ? getLorebookEntries
            : (window.parent && window.parent.getLorebookEntries);

        if (typeof _getPrimaryBook === 'function' && typeof _getEntries === 'function') {
            const bookName = await _getPrimaryBook();
            // console.log("[MZSMB] [LB] Primary Book:", bookName);
            if (bookName) {
                const entries = await _getEntries(bookName);
                if (Array.isArray(entries)) {
                     const entry = entries.find(e => {
                         // Check Keys (Array)
                         if (Array.isArray(e.keys)) {
                             if (e.keys.some(k => k.trim().toLowerCase() === searchKey)) return true;
                         }
                         // Check Comment
                         if (e.comment && e.comment.trim().toLowerCase() === searchKey) return true;
                         return false;
                     });
                     
                     if (entry && entry.content) {
                         const content = entry.content.trim();
                         _lbContentCache.set(searchKey, content);
                         return content;
                     }
                }
            }
        }
    } catch(e) { console.error("[MZSMB][LB] Fetch Error:", e); }
    return null;
}

async function updateLorebookContent(root) {
    if (!root) return;
    const lbEls = root.querySelectorAll('[data-lb-key], [data-lb-text-key]');
    for (const el of lbEls) {
        const key = el.getAttribute('data-lb-key') || el.getAttribute('data-lb-text-key');
        if (key) {
            const content = await fetchLorebookContent(key);
            if (content) {
                 if (el.tagName === 'IMG') {
                      // Image handling (URL validation)
                      if (content.toLowerCase().startsWith('http://') || content.toLowerCase().startsWith('https://')) {
                          if (el.src !== content) {
                              el.src = content;
                              el.style.display = 'block';
                          }
                      }
                 } else {
                      // Text handling (RichText / StatRow)
                      if (el.innerHTML !== content) {
                          el.innerHTML = content;
                      }
                 }
            }
        }
    }
}