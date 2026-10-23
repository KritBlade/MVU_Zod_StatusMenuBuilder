
// This runtime writes NO state. Every change a player makes is posted to the pack's engine through
// dispatchMenuAction (rt_menuAction.js); the host applies what the engine returns and this frame
// re-reads. The portrait modal below is chrome only: it splits a URL from a local upload, keeps the
// upload in localStorage, and posts the rest.

// --- Modal State & Logic ---
const __modalState = { currentPath: null, scopePath: '' };

function openPortraitModeModal(path, scopePath) {
    __modalState.currentPath = path;
    __modalState.scopePath = String(scopePath || '');
    const modal = getOrCreateEditModal();
    if (modal) {
         const input = modal.querySelector('input');
         if(input) {
             // Pre-populate with existing value (localStorage or MVU)
             let currentValue = '';
             try {
                 // Try localStorage first (for local uploaded images)
                 currentValue = localStorage.getItem('mzsb_img_' + path) || '';
             } catch (e) {}
             
             // Fallback to MVU if not in localStorage
             if (!currentValue && typeof getV === 'function' && _lastStatData) {
                 const mvuValue = getV(_lastStatData, path, '');
                 if (mvuValue && mvuValue !== 'N/A') {
                     currentValue = Array.isArray(mvuValue) ? mvuValue[0] : mvuValue;
                 }
             }
             
             // Only show URLs in the text input, not base64 data
             if (currentValue && currentValue.toLowerCase().startsWith('data:')) {
                 input.value = '';
                 input.placeholder = '(Local image currently set) Enter URL to replace...';
             } else {
                 input.value = currentValue;
                 input.placeholder = 'https://...';
             }
         }
         modal.style.display = 'flex';
         if(input) input.focus();
    }
}

function handleEditClick(evt, btn) {
     const key = btn.dataset.key;
     const saveRoot = btn.getAttribute('data-save-root');
     const saveLeaf = btn.getAttribute('data-save-leaf');
     let fullPath = saveLeaf || '';
     
     if (key && saveRoot) {
         fullPath = saveRoot + "." + key + "." + saveLeaf;
     } else if (saveRoot) {
         fullPath = saveRoot + "." + saveLeaf;
     }

     openPortraitModeModal(fullPath, packScopeOf(btn));
}

function closePortraitModeModal() {
    const { context } = getModalContext();
    const modal = context.document.getElementById('portrait-mode-modal');
    if (modal) modal.style.display = 'none';
    __modalState.currentPath = null;
}

async function applyPortraitUpdate(rawInput) {
     const path = __modalState.currentPath;
     if (!path) return;

     const url = rawInput ? String(rawInput).trim() : '';

     // Basic validation – accept http/https URLs and data: URIs (from local file)
     if (url && !(url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://') || url.toLowerCase().startsWith('data:'))) {
         alert("Invalid URL format. Must start with http:// or https://");
         return;
     }
     if (!url) return;

     // --- Storage Strategy (chrome) ---
     // Local file (base64): stays in localStorage so a large string never reaches state; the state
     // member is posted EMPTY so the local copy takes priority on render.
     // URL: posted to the engine's setPortrait; the local copy is cleared so state takes priority.
     let stateValue = url;
     if (url.toLowerCase().startsWith('data:')) {
         try {
             localStorage.setItem('mzsb_img_' + path, url);
             console.log('[MZSMB] Saved local image to localStorage:', path);
         } catch (e) {
             console.warn('[MZSMB] localStorage save failed:', e);
             alert('Failed to save image. Storage may be full.');
             return;
         }
         stateValue = '';
     } else {
         try { localStorage.removeItem('mzsb_img_' + path); } catch (e) { console.warn('[MZSMB] localStorage clear failed:', e); }
     }
     const result = await dispatchMenuAction('setPortrait', { path, url: stateValue }, __modalState.scopePath);
     if (!result.ok) { alert('Portrait not saved: ' + result.reason); return; }
     closePortraitModeModal();
}

// --- Local Image Compression ---
function compressLocalImage(file, opts) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('no_file'));
        const maxSide = (opts && opts.maxSide) || 512;
        const maxBytes = (opts && opts.maxBytes) || 240 * 1024;
        const minQuality = (opts && opts.minQuality) || 0.5;
        let quality = (opts && opts.quality) || 0.85;

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read_failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode_failed'));
            img.onload = () => {
                const longest = Math.max(img.width, img.height) || 1;
                const scale = Math.min(1, maxSide / longest);
                const targetW = Math.max(1, Math.round(img.width * scale));
                const targetH = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('canvas_failed'));
                ctx.drawImage(img, 0, 0, targetW, targetH);

                const getSize = (s) => Math.ceil((s.split(',')[1] || '').length * 3 / 4);
                let out = canvas.toDataURL('image/jpeg', quality);
                while (getSize(out) > maxBytes && quality > minQuality) {
                    quality = Math.max(minQuality, quality - 0.1);
                    out = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(out);
            };
            img.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    });
}

// --- Image Popup ---
// The full-window image viewer: an Image cell's click, and every web link in the menu
// (rt_tabAndModal.js wireMenuLinkClicks). It mounts in the parent document when that is reachable and in
// this frame otherwise — mvu-helper's contained frame, which its host expands to cover the window while a
// full-screen popup is open. So the image is sized in viewport units, never in pixels read at open time:
// in the contained frame the viewport is still the menu's own size at that moment and becomes the
// window's a moment later, and viewport units follow it. `title` is the image's alt text. A target that
// is not an image says so and prints its address instead of a broken-image icon.
function showImagePopup(url, title) {
    if (!url || url === 'N/A') return;

    // Try to access parent context (SillyTavern)
    let context = window;
    let targetBody = document.body;
    try {
        if (window.parent && window.parent !== window && window.parent.document) {
            context = window.parent;
            targetBody = window.parent.document.body;
        }
    } catch (e) { console.info("[MZSMB] Cross-origin parent access blocked"); }

    let overlay = context.document.getElementById('img-popup-overlay');
    if (!overlay) {
        overlay = context.document.createElement('div');
        overlay.id = 'img-popup-overlay';
        overlay.className = 'img-popup-overlay';

        // Inline Critical Styles because Parent might not have CSS
        overlay.style.cssText = 'position:fixed; inset:0; width:100vw; height:100dvh; min-height:100dvh; background:rgba(0,0,0,0.85); z-index:55000; display:flex; align-items:center; justify-content:center; overflow:auto; cursor:zoom-out; padding:12px; box-sizing:border-box;';

        overlay.onclick = (e) => {
             if (e.target === overlay) {
                 overlay.style.display = 'none';
                 if (context !== window) overlay.remove(); // Clean up if in parent
             }
        };

        const closeBtn = context.document.createElement('button');
        closeBtn.id = 'img-popup-close-btn';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close image preview');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'position:fixed; top:12px; right:12px; width:42px; height:42px; border-radius:50%; border:1px solid rgba(255,255,255,0.5); background:rgba(0,0,0,0.65); color:#fff; font-size:28px; line-height:1; cursor:pointer; z-index:1; display:flex; align-items:center; justify-content:center;';
        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.style.display = 'none';
            if (context !== window) overlay.remove();
        };

        const img = context.document.createElement('img');
        img.className = 'img-popup-content';
        img.style.cssText = 'max-width:calc(100vw - 24px); max-height:calc(100dvh - 24px); width:auto; height:auto; display:block; border-radius:4px; box-shadow:0 0 20px rgba(0,0,0,0.5); object-fit:contain;';

        const note = context.document.createElement('div');
        note.className = 'img-popup-note';
        note.style.cssText = 'display:none; max-width:calc(100vw - 48px); color:#ddd; text-align:center; word-break:break-all;';

        overlay.appendChild(closeBtn);
        overlay.appendChild(img);
        overlay.appendChild(note);
        targetBody.appendChild(overlay);
    }

    // Keep popup layers exclusive to avoid stacked overlays on mobile
    const portraitModal = context.document.getElementById('portrait-mode-modal');
    if (portraitModal) portraitModal.style.display = 'none';

    const img = overlay.querySelector('img');
    const note = overlay.querySelector('.img-popup-note');
    img.alt = title || '';
    img.style.display = 'block';
    note.style.display = 'none';
    img.onerror = () => {
        console.warn('[MZSMB][image] not an image the menu can show: ' + url);
        img.style.display = 'none';
        note.textContent = 'Not an image the menu can show: ' + url;
        note.style.display = 'block';
    };
    img.src = url;
    overlay.style.display = 'flex';
}

// Initialize Modal (Lazy or On Load)
// We defer modal creation to ensure we attach to the right context

function getModalContext() {
     let context = window;
     let targetBody = document.body;
     try {
        if (window.parent && window.parent !== window && window.parent.document) {
            context = window.parent;
            targetBody = window.parent.document.body;
        }
     } catch (e) { }
     return { context, targetBody };
}

// --- Shared Helper for Modal Creation/Retrieval ---
function getOrCreateEditModal() {
     const { context, targetBody } = getModalContext();
     // The picker lives in the parent document, out of this frame's stylesheet's reach: its look is
     // resolved from the project's palette and written inline, on creation and on every retrieval.
     const theme = readMenuTheme();
     let modal = context.document.getElementById('portrait-mode-modal');
     
     if (!modal) {
          modal = context.document.createElement('div');
          modal.id = 'portrait-mode-modal';
          modal.style.cssText = 'display:none; position:fixed; inset:0; width:100vw; height:100dvh; min-height:100dvh; background:rgba(0,0,0,0.85); z-index:60000; justify-content:center; align-items:center; overflow:auto; padding:12px; box-sizing:border-box; backdrop-filter: blur(2px);';
          
          // Use innerHTML but keep it simpler
          const content = context.document.createElement('div');
          content.id = 'portrait-mode-content';
          content.style.cssText = 'background:' + theme.background + '; border:1px solid ' + theme.accent + '; padding:20px; border-radius:8px; width:90%; max-width:min(400px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; color:' + theme.text + '; position:relative; box-shadow: 0 0 20px ' + theme.border + '; box-sizing:border-box;';
          
          const closeBtn = context.document.createElement('button');
          closeBtn.id = 'portrait-mode-close-btn';
          closeBtn.innerHTML = '&times;';
          closeBtn.style.cssText = 'position:absolute; top:10px; right:15px; background:none; border:none; color:' + theme.textSecondary + '; font-size:24px; cursor:pointer;';
          content.appendChild(closeBtn);
          
          const title = context.document.createElement('h3');
          title.textContent = 'Select Image Source';
          title.style.cssText = 'margin-top:0; color:' + theme.accent + '; font-family: sans-serif;';
          content.appendChild(title);
          
          const bodyDiv = context.document.createElement('div');
          bodyDiv.id = 'portrait-mode-body-row';
          bodyDiv.style.marginTop = '20px';
          bodyDiv.style.display = 'flex';
          bodyDiv.style.flexWrap = 'wrap';
          bodyDiv.style.gap = '8px';
          
          const urlInput = context.document.createElement('input');
          urlInput.id = 'ui-input-url';
          urlInput.type = 'text';
          urlInput.placeholder = 'https://...';
          urlInput.style.cssText = 'flex:1 1 220px; min-width:0; width:100%; padding:10px; background:' + theme.tint(8) + '; border:1px solid ' + theme.border + '; color:' + theme.text + '; border-radius:4px; outline:none; transition: border 0.2s; font-family: sans-serif;';
          urlInput.onfocus = () => { urlInput.style.borderColor = theme.accent; };
          urlInput.onblur = () => { urlInput.style.borderColor = theme.border; };
          
          const saveBtn = context.document.createElement('button');
          saveBtn.id = 'portrait-mode-save-btn';
          saveBtn.textContent = 'Save';
          saveBtn.style.cssText = 'padding:10px 20px; background:' + theme.tint(20) + '; border:1px solid ' + theme.accent + '; color:' + theme.accent + '; border-radius:4px; cursor:pointer; font-weight:bold; transition: background 0.2s; font-family: sans-serif; white-space:nowrap;';
          saveBtn.onmouseover = () => { saveBtn.style.background = theme.tint(40); saveBtn.style.color = theme.text; };
          saveBtn.onmouseout = () => { saveBtn.style.background = theme.tint(20); saveBtn.style.color = theme.accent; };
          
          bodyDiv.appendChild(urlInput);
          bodyDiv.appendChild(saveBtn);

          const hint = context.document.createElement('div');
          hint.textContent = 'Paste a direct link to an image (http/https).';
          hint.style.cssText = 'font-size:0.8em; color:' + theme.textSecondary + '; margin-top:5px; margin-bottom:10px; font-family: sans-serif;';

          // --- Divider ---
          const divider = context.document.createElement('div');
          divider.style.cssText = 'display:flex; align-items:center; gap:10px; margin:12px 0 10px;';
          const divLine1 = context.document.createElement('div');
          divLine1.style.cssText = 'flex:1; height:1px; background:' + theme.tint(20) + ';';
          const divText = context.document.createElement('span');
          divText.textContent = 'OR';
          divText.style.cssText = 'font-size:0.75em; color:' + theme.textSecondary + '; font-weight:bold; font-family:sans-serif; letter-spacing:1px;';
          const divLine2 = context.document.createElement('div');
          divLine2.style.cssText = 'flex:1; height:1px; background:' + theme.tint(20) + ';';
          divider.appendChild(divLine1);
          divider.appendChild(divText);
          divider.appendChild(divLine2);

          // --- Browse Local File Button ---
          const browseBtn = context.document.createElement('button');
          browseBtn.id = 'portrait-mode-browse-btn';
          browseBtn.textContent = '\uD83D\uDCC2 Browse Local File';
          browseBtn.style.cssText = 'width:100%; padding:10px 20px; background:' + theme.tint(10) + '; border:1px dashed ' + theme.tint(40) + '; color:' + theme.textSecondary + '; border-radius:4px; cursor:pointer; font-weight:bold; transition: background 0.2s, border-color 0.2s; font-family: sans-serif;';
          browseBtn.onmouseover = () => { browseBtn.style.background = theme.tint(25); browseBtn.style.borderColor = theme.accent; browseBtn.style.color = theme.text; };
          browseBtn.onmouseout = () => { browseBtn.style.background = theme.tint(10); browseBtn.style.borderColor = theme.tint(40); browseBtn.style.color = theme.textSecondary; };

          const browseHint = context.document.createElement('div');
          browseHint.textContent = 'Select an image from your device. It will be compressed and stored locally (max 1920px, ~1.5MB).';
          browseHint.style.cssText = 'font-size:0.75em; color:' + theme.textSecondary + '; margin-top:5px; font-family: sans-serif;';

          const wrapper = context.document.createElement('div');
          wrapper.appendChild(bodyDiv);
          wrapper.appendChild(hint);
          wrapper.appendChild(divider);
          wrapper.appendChild(browseBtn);
          wrapper.appendChild(browseHint);
          
          content.appendChild(wrapper);
          modal.appendChild(content);
          targetBody.appendChild(modal);
          
          // Bind Events
          const closeModal = () => {
              modal.style.display = 'none';
          };
          
          closeBtn.onclick = (e) => { e.preventDefault(); closeModal(); };
          modal.onclick = (e) => { if(e.target === modal) closeModal(); };
          
          saveBtn.onclick = (e) => {
              e.preventDefault(); e.stopPropagation();
              const url = urlInput.value.trim();
              if (url) {
                  // Call back to original window context
                  if (window.applyPortraitUpdate) window.applyPortraitUpdate(url);
                  urlInput.value = ''; // Reset
              }
          };
          
          // Enter key to save
          urlInput.onkeydown = (e) => {
              if (e.key === 'Enter') {
                  e.preventDefault();
                  saveBtn.click();
              }
          };

          // Browse local file handler
          browseBtn.onclick = (e) => {
              e.preventDefault(); e.stopPropagation();
              const fileInput = context.document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = 'image/*';
              fileInput.onchange = async (ev) => {
                  const file = ev.target.files && ev.target.files[0];
                  if (!file) return;
                  try {
                      browseBtn.textContent = 'Processing...';
                      browseBtn.disabled = true;
                      const base64 = await compressLocalImage(file, { maxSide: 1920, maxBytes: 1536 * 1024, quality: 0.9, minQuality: 0.6 });
                      if (window.applyPortraitUpdate) window.applyPortraitUpdate(base64);
                  } catch (err) {
                      console.warn('[MZSMB] Local image processing failed:', err);
                      alert('Failed to process image: ' + (err.message || err));
                  } finally {
                      browseBtn.textContent = '\uD83D\uDCC2 Browse Local File';
                      browseBtn.disabled = false;
                  }
              };
              fileInput.click();
          };
     }

     // --- CRITICAL FIX: RE-BIND EVENTS EVERY TIME ---
     // Because the modal persists in parent, but 'window' (iframe) dies on reload,
     // the old onclick handlers point to a dead window context.
     // We must re-bind them to the CURRENT window context.
     
     // Refresh styles every call because parent-stored modal can outlive iframe reloads
     modal.style.cssText = 'display:none; position:fixed; inset:0; width:100vw; height:100dvh; min-height:100dvh; background:rgba(0,0,0,0.85); z-index:60000; justify-content:center; align-items:center; overflow:auto; padding:12px; box-sizing:border-box; backdrop-filter: blur(2px);';

     const content = modal.querySelector('#portrait-mode-content');
     if (content) {
         content.style.cssText = 'background:' + theme.background + '; border:1px solid ' + theme.accent + '; padding:20px; border-radius:8px; width:90%; max-width:min(400px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; color:' + theme.text + '; position:relative; box-shadow: 0 0 20px ' + theme.border + '; box-sizing:border-box;';
     }

     const bodyRow = modal.querySelector('#portrait-mode-body-row');
     if (bodyRow) {
         bodyRow.style.marginTop = '20px';
         bodyRow.style.display = 'flex';
         bodyRow.style.flexWrap = 'wrap';
         bodyRow.style.gap = '8px';
     }

     const saveBtn = modal.querySelector('#portrait-mode-save-btn') || modal.querySelector('button:last-child') || modal.querySelectorAll('button')[1]; // fallback for legacy structure
     const urlInput = modal.querySelector('input');
     const closeBtn = modal.querySelector('#portrait-mode-close-btn');

     if (saveBtn && urlInput) {
         urlInput.style.cssText = 'flex:1 1 220px; min-width:0; width:100%; padding:10px; background:' + theme.tint(8) + '; border:1px solid ' + theme.border + '; color:' + theme.text + '; border-radius:4px; outline:none; transition: border 0.2s; font-family: sans-serif;';
         saveBtn.style.cssText = 'padding:10px 20px; background:' + theme.tint(20) + '; border:1px solid ' + theme.accent + '; color:' + theme.accent + '; border-radius:4px; cursor:pointer; font-weight:bold; transition: background 0.2s; font-family: sans-serif; white-space:nowrap;';

         // Clear old listeners by overwriting
         saveBtn.onclick = (e) => {
              e.preventDefault(); e.stopPropagation();
              const url = urlInput.value.trim();
              if (url) {
                  if (window.applyPortraitUpdate) window.applyPortraitUpdate(url);
                  urlInput.value = ''; 
              }
         };
         // Re-bind Enter key too
         urlInput.onkeydown = (e) => {
              if (e.key === 'Enter') {
                  e.preventDefault();
                  saveBtn.click();
              }
         };
     }
     
     // Re-bind browse button handler on every modal retrieval
     const browseBtn = modal.querySelector('#portrait-mode-browse-btn');
     if (browseBtn) {
         browseBtn.style.cssText = 'width:100%; padding:10px 20px; background:' + theme.tint(10) + '; border:1px dashed ' + theme.tint(40) + '; color:' + theme.textSecondary + '; border-radius:4px; cursor:pointer; font-weight:bold; transition: background 0.2s, border-color 0.2s; font-family: sans-serif;';
         browseBtn.onclick = (e) => {
             e.preventDefault(); e.stopPropagation();
             const { context: ctx } = getModalContext();
             const fileInput = ctx.document.createElement('input');
             fileInput.type = 'file';
             fileInput.accept = 'image/*';
             fileInput.onchange = async (ev) => {
                 const file = ev.target.files && ev.target.files[0];
                 if (!file) return;
                 try {
                     browseBtn.textContent = 'Processing...';
                     browseBtn.disabled = true;
                     const base64 = await compressLocalImage(file, { maxSide: 1920, maxBytes: 1536 * 1024, quality: 0.9, minQuality: 0.6 });
                     if (window.applyPortraitUpdate) window.applyPortraitUpdate(base64);
                 } catch (err) {
                     console.warn('[MZSMB] Local image processing failed:', err);
                     alert('Failed to process image: ' + (err.message || err));
                 } finally {
                     browseBtn.textContent = '\uD83D\uDCC2 Browse Local File';
                     browseBtn.disabled = false;
                 }
             };
             fileInput.click();
         };
     }

     if (closeBtn) {
         closeBtn.onclick = (e) => { 
             e.preventDefault(); 
             modal.style.display = 'none'; 
         };
     }
     
     // Ensure modal close on background click is also fresh
     modal.onclick = (e) => { 
         if(e.target === modal) modal.style.display = 'none'; 
     };

     return modal;
}

// Initialize Modal on Load (Optional cleanup)
document.addEventListener('DOMContentLoaded', () => {
     // Clean up local if exists (legacy)
     const existing = document.getElementById('portrait-mode-modal');
     if (existing) existing.remove();
});

// Global Handlers
window.closePortraitModeModal = () => {
    const { context } = getModalContext();
    const modal = context.document.getElementById('portrait-mode-modal');
    if (modal) modal.style.display = 'none';
};

// Expose functions to global scope for HTML event handlers
window.selectTab = selectTab;
window.openPortraitModeModal = openPortraitModeModal;
window.applyPortraitUpdate = applyPortraitUpdate;
window.handleEditClick = handleEditClick;
window.showImagePopup = showImagePopup;

// Start Polling
initLabels();