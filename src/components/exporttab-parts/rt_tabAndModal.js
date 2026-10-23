const tabScrollStates = {};
const tabVisited = {}; // Track which tabs have been visited
let pendingScrollReapplyTimer = null;

function selectTab(tabId, btn) {
    // Cancel stale delayed re-apply from previous tab switches.
    if (pendingScrollReapplyTimer !== null) {
        clearTimeout(pendingScrollReapplyTimer);
        pendingScrollReapplyTimer = null;
    }

    // 1. Save parent #chat scroll position for current tab
    const currentTab = document.querySelector('.tab-content.active');
    if (currentTab && currentTab.id) {
        try {
            if (window.parent && window.parent !== window) {
                const chatEl = window.parent.document.querySelector('#chat');
                if (chatEl) {
                    tabScrollStates[currentTab.id] = chatEl.scrollTop;
                }
            }
        } catch (e) { /* cross-origin */ }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const newTab = document.getElementById(tabId);
    if (newTab) newTab.classList.add('active');
    btn.classList.add('active');

    // If selecting a collection tab, always reset list/block paging and scroll to top.
    const isCollectionTab = (() => {
        if (!newTab) return false;
        const bindRoots = newTab.querySelectorAll('[data-bind-root]');
        for (const el of bindRoots) {
            const root = el.getAttribute('data-bind-root');
            if (root && (COLLECTION_PATHS.has(root) || COLLECTION_PATHS.has('.' + root))) {
                return true;
            }
        }
        return false;
    })();
    
    // 2. Set parent #chat scroll based on visit history
    try {
        if (window.parent && window.parent !== window) {
            const chatEl = window.parent.document.querySelector('#chat');
            if (chatEl) {
                let targetY = 0;
                const chatRect = chatEl.getBoundingClientRect();
                
                // First-time visits → scroll to iframe position (top of status menu, not top of chat)
                if (!tabVisited[tabId]) {
                    const iframe = window.frameElement;
                    if (iframe) {
                        const iframeRect = iframe.getBoundingClientRect();
                        targetY = chatEl.scrollTop + iframeRect.top - chatRect.top;
                    }
                }
                // Previously visited tabs → restore saved position
                else if (tabScrollStates[tabId] !== undefined) {
                    targetY = tabScrollStates[tabId];
                }
                
                // Mark this tab as visited
                tabVisited[tabId] = true;
                
                // Apply scroll immediately (may be clamped if collection tab content hasn't rendered yet)
                const maxScrollTop = chatEl.scrollHeight - chatEl.clientHeight;
                const wasClamped = targetY > maxScrollTop;
                chatEl.scrollTop = targetY;

                // If clamped, the tab's content (e.g. a long Partner list) hasn't fully rendered yet.
                // Re-apply after 150ms once scrollHeight has expanded, recalculating from fresh measurements.
                if (wasClamped) {
                    pendingScrollReapplyTimer = setTimeout(() => {
                        try {
                            const iframe = window.frameElement;
                            if (iframe) {
                                const freshIframeRect = iframe.getBoundingClientRect();
                                const freshChatRect = chatEl.getBoundingClientRect();
                                const freshTargetY = chatEl.scrollTop + freshIframeRect.top - freshChatRect.top;
                                const freshMax = chatEl.scrollHeight - chatEl.clientHeight;
                                chatEl.scrollTop = Math.max(0, Math.min(freshTargetY, freshMax));
                            }
                        } catch(e) { /* cross-origin */ }
                        pendingScrollReapplyTimer = null;
                    }, 150);
                }

            }
        }
    } catch (e) { /* cross-origin */ }
    
    // Also reset internal scroll in case there's no iframe wrapper
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

// --- Renderers ---
// --- Modal Logic ---
// The detail modal, ready to fill: created on first use, restyled from the project's palette, titled
// and emptied. It mounts into the parent document when that is reachable and into this frame
// otherwise (mvu-helper's contained frame); either way its look is resolved here and written inline,
// because the parent is out of this frame's stylesheet's reach. The caller fills `body` and `footer`,
// then calls `show()`. null when the modal's own elements are missing.
function openDetailModal(title) {
    const _theme = readMenuTheme();
    const _accent = _theme.accent;
    const _bg = _theme.background;
    const _text = _theme.text;
    const _border = _theme.border;

    // Try to access parent context (SillyTavern) for better positioning in iframe
    let context = window;
    let targetBody = document.body;
    try {
        if (window.parent && window.parent !== window && window.parent.document) {
            context = window.parent;
            targetBody = window.parent.document.body;
        }
    } catch (e) { console.info("[MZSMB] Cross-origin parent access blocked, using local context"); }
    
    // Check for existing modal or create new one
    let overlay = context.document.getElementById('detail-modal-overlay');
    if (!overlay) {
        overlay = context.document.createElement('div');
        overlay.id = 'detail-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; width:100vw; height:100dvh; min-height:100dvh; background:rgba(0,0,0,0.85); z-index:50000; display:flex; justify-content:center; align-items:center; overflow:auto; padding:12px; box-sizing:border-box; backdrop-filter:blur(2px);';
        
        const content = context.document.createElement('div');
        content.id = 'detail-modal-content';
        
        const header = context.document.createElement('div');
        header.id = 'detail-modal-header';
        
        const titleEl = context.document.createElement('h3');
        titleEl.id = 'detail-modal-title';
        
        const closeBtn = context.document.createElement('button');
        closeBtn.id = 'detail-modal-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            overlay.style.display = 'none';
            if (context !== window) overlay.remove(); // Clean up if in parent
        };
        
        header.appendChild(titleEl);
        header.appendChild(closeBtn);
        
        const body = context.document.createElement('div');
        body.id = 'detail-modal-body';

        const footer = context.document.createElement('div');
        footer.id = 'detail-modal-footer';
        footer.style.cssText = 'margin-top:15px; display:flex; justify-content:flex-end; gap:8px;';
        
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        overlay.appendChild(content);
        
        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
                if (context !== window) overlay.remove();
            }
        };
        
        targetBody.appendChild(overlay);
    }

    // The palette goes on EVERY call, not only at creation: the overlay lives in the parent document
    // and can outlive this frame, so after a theme change it would otherwise keep the old chrome
    // around a body rendered in the new one (seen: dark card, new green title, unreadable).
    const styleDetailModal = () => {
        const content = context.document.getElementById('detail-modal-content');
        const header = context.document.getElementById('detail-modal-header');
        const titleEl = context.document.getElementById('detail-modal-title');
        const closeBtn = context.document.getElementById('detail-modal-close');
        if (content) content.style.cssText = `background:${_bg}; border:1px solid ${_accent}; padding:20px; border-radius:8px; width:90%; max-width:min(500px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; color:${_text}; position:relative; box-shadow:0 0 20px ${_border}; box-sizing:border-box;`;
        if (header) header.style.cssText = `display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid ${_border};`;
        if (titleEl) titleEl.style.cssText = `margin:0; color:${_accent}; font-weight:600;`;
        if (closeBtn) closeBtn.style.cssText = `background:none; border:none; color:${_text}; font-size:1.5em; cursor:pointer; padding:0 5px;`;
    };
    styleDetailModal();
    
    const elTitle = context.document.getElementById('detail-modal-title');
    const elBody = context.document.getElementById('detail-modal-body');
    const elFooter = context.document.getElementById('detail-modal-footer');

    if (!elTitle || !elBody) return null;

    elTitle.textContent = title;
    elBody.innerHTML = '';
    if (elFooter) elFooter.innerHTML = '';
    return { context, theme: _theme, body: elBody, footer: elFooter, show: () => { overlay.style.display = 'flex'; } };
}

// `origin` (optional): { scopePath, cellArgsText } — where the row sat and what its list cell
// declared, both observations the save posts along with the form's strings.
function showModal(title, data, allowEdit, listPath, itemKey, origin) {
    const scopePath = origin && origin.scopePath ? String(origin.scopePath) : '';
    const cellArgsText = origin ? origin.cellArgsText : null;
    const modal = openDetailModal(title);
    if (!modal) return;
    const { context, theme: _theme, body: elBody, footer: elFooter } = modal;
    const _accent = _theme.accent;
    const _text = _theme.text;
    const _border = _theme.border;

    // Sanitize text to prevent XSS when inserting into HTML
    // Entities use \u0026 escapes — see escapeHtml in rt_htmlGenerators.js. The document ships as an
    // iframe `srcdoc` attribute, which is entity-decoded once, so a literal entity here silently
    // becomes the character it was meant to escape and this function stops escaping anything.
    const esc = (s) => String(s).replace(/&/g,'\u0026amp;').replace(/</g,'\u0026lt;').replace(/>/g,'\u0026gt;').replace(/"/g,'\u0026quot;');
    
    // Recursive formatter with inline styles (read-only view)
    const formatData = (obj) => {
        if (obj === null || obj === undefined) return `<span style="color:${_theme.textSecondary}">null</span>`;
        if (typeof obj !== 'object') return esc(String(obj));
        
        let html = '';
        if (Array.isArray(obj)) {
            html += `<div style="padding-left:10px; border-left:1px solid ${_border}">`;
            obj.forEach((v, i) => {
                html += `<div><span style="color:${_theme.textSecondary}">[${i}]</span> ${formatData(v)}</div>`;
            });
            html += '</div>';
        } else {
            html += `<div style="padding-left:10px; border-left:2px solid ${_accent}">`;
            for (const [k, v] of Object.entries(obj)) {
                if (k === '$meta' || k === 'template' || k === '$key' || k === 'name') continue;
                 html += `<div style="padding:4px 0; border-bottom:1px dotted ${_border};"><span style="color:${_accent}; font-weight:bold;">${esc(k)}:</span> <span style="color:${_text};">${formatData(v)}</span></div>`;
            }
            html += '</div>';
        }
        return html;
    };

    // Build editable form (flat key-value inputs for top-level fields)
    const buildEditForm = (obj) => {
        const wrap = context.document.createElement('div');
        wrap.style.cssText = `padding-left:10px; border-left:2px solid ${_accent};`;
        for (const [k, v] of Object.entries(obj)) {
            if (k === '$meta' || k === 'template' || k === '$key' || k === 'name') continue;
            const row = context.document.createElement('div');
            row.style.cssText = `padding:4px 0; border-bottom:1px dotted ${_border}; display:flex; align-items:flex-start; gap:8px;`;
            
            const label = context.document.createElement('span');
            label.style.cssText = `color:${_accent}; font-weight:bold; min-width:80px; padding-top:6px; flex-shrink:0;`;
            label.textContent = k + ':';
            
            const isObj = v !== null && typeof v === 'object';
            // Always use textarea: easier to edit long strings, still fine for short ones
            const input = context.document.createElement('textarea');
            input.setAttribute('data-field', k);
            input.style.cssText = `flex:1; background:${_theme.tint(8)}; border:1px solid ${_border}; color:${_text}; padding:4px 8px; border-radius:4px; font-size:0.9em; font-family:inherit; resize:vertical; box-sizing:border-box;`;
            if (isObj) {
                input.value = JSON.stringify(v, null, 2);
            } else {
                input.value = v === null || v === undefined ? '' : String(v);
            }
            // Auto-size: rows based on content length and newlines
            const lines = input.value.split('\n').length;
            const charsPerRow = 40; // rough estimate for wrapping
            const wrappedRows = Math.ceil(input.value.length / charsPerRow);
            input.rows = Math.min(12, Math.max(2, lines, wrappedRows));

            row.appendChild(label);
            row.appendChild(input);
            wrap.appendChild(row);
        }
        return wrap;
    };
    
    // Render read-only view
    elBody.innerHTML = formatData(data);

    // Add Edit button if allowEdit is enabled
    if (allowEdit && elFooter && listPath && itemKey) {
        const editBtn = context.document.createElement('button');
        editBtn.textContent = '✏ Edit';
        editBtn.style.cssText = `background:${_theme.tint(15)}; border:1px solid ${_theme.tint(40)}; color:${_accent}; padding:6px 16px; border-radius:4px; cursor:pointer; font-size:0.9em;`;
        
        editBtn.onclick = () => {
            // Switch to edit mode
            elBody.innerHTML = '';
            const form = buildEditForm(data);
            elBody.appendChild(form);
            elFooter.innerHTML = '';
            
            const saveBtn = context.document.createElement('button');
            saveBtn.textContent = '💾 Save';
            saveBtn.style.cssText = `background:rgba(0,200,100,0.2); border:1px solid rgba(0,200,100,0.5); color:#00c864; padding:6px 16px; border-radius:4px; cursor:pointer; font-size:0.9em;`;
            
            const cancelBtn = context.document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `background:rgba(255,100,100,0.15); border:1px solid rgba(255,100,100,0.4); color:#ff6b6b; padding:6px 16px; border-radius:4px; cursor:pointer; font-size:0.9em;`;
            
            cancelBtn.onclick = () => {
                // Revert to read-only view
                elBody.innerHTML = formatData(data);
                elFooter.innerHTML = '';
                elFooter.appendChild(editBtn);
            };
            
            saveBtn.onclick = async () => {
                // The form posts STRINGS — what was typed, per field, nothing more. What each field
                // IS (a number, a flag, text) is the engine's editListItem, from the pack's own
                // table; deciding it here from how the text looked was the observer judging.
                const fields = {};
                form.querySelectorAll('[data-field]').forEach(inp => { fields[inp.getAttribute('data-field')] = inp.value; });
                const merged = mergeCellArgs(cellArgsText, { listPath, itemKey, fields });
                if (merged.reason) console.warn('[MZSMB][action] editListItem: ' + merged.reason + ' — posting without the cell\'s args');
                saveBtn.disabled = true;
                const result = await dispatchMenuAction('editListItem', merged.args, scopePath, { button: saveBtn });
                saveBtn.disabled = false;
                if (!result.ok) { alert('Edit not saved: ' + result.reason); return; }

                // The host wrote and this frame re-read; show the item as it now IS, never as typed.
                const fresh = typeof getRaw === 'function' ? getRaw(_lastStatData, listPath + '.' + itemKey, null) : null;
                if (fresh && typeof fresh === 'object') {
                    for (const k of Object.keys(data)) delete data[k];
                    Object.assign(data, fresh);
                }
                elBody.innerHTML = formatData(data);
                elFooter.innerHTML = '';
                elFooter.appendChild(editBtn);
            };
            
            elFooter.appendChild(cancelBtn);
            elFooter.appendChild(saveBtn);
        };
        
        elFooter.appendChild(editBtn);
    }

    modal.show();
}

// Every web link in the menu opens its target in the full-window image viewer (rt_modalUi.js
// showImagePopup) instead of navigating (menuLinkImageUrl says which), with the link's own text as the
// image's alt. Capture phase, so a link inside a clickable row opens the image and not the row's own
// detail.
function wireMenuLinkClicks() {
    document.addEventListener('click', (event) => {
        const target = event.target;
        const link = target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
        if (!link) return;
        const url = menuLinkImageUrl(link.getAttribute('href'), document.baseURI);
        if (!url) return;
        event.preventDefault();
        event.stopPropagation();
        showImagePopup(url, (link.textContent || '').trim() || url);
    }, true);
}

// Initialize: Mark the first active tab as visited
(function initTabTracking() {
    const initialTab = document.querySelector('.tab-content.active');
    if (initialTab && initialTab.id) {
        tabVisited[initialTab.id] = true;
    }
})();