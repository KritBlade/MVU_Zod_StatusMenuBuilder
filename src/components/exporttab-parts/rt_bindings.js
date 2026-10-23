// --- Collapse State Persistence ---
// Keyed by data-target (list ID). Stores true=open, false=closed.
// Survives renderBlock re-renders so user-toggled state is preserved.
const _collapseState = new Map();

function updateBindingsIn(root, data, rootData) {
     if (!root || !data) return;
     
    root.querySelectorAll('[data-bind-val]').forEach(el => {
        const path = el.getAttribute('data-bind-val');
        if (path !== null) { 
            const val = getV(data, path, '???');
            el.textContent = val;
        }
    });

    root.querySelectorAll('[data-bind-label]').forEach(el => {
        const path = el.getAttribute('data-bind-label');
        if (path !== null) {
            const label = getL(data, path, null);
            if (label) el.textContent = label;
        }
    });

    // --- Inject $key into fullpaths for nested components ---
    if (data.$key) {
        root.querySelectorAll('[data-bind-list-fullpath]').forEach(el => {
            const fullpath = el.getAttribute('data-bind-list-fullpath');
            // For example, fullpath might be "Familiar.Equipment"
            // And data.$key is "Bob"
            // We need it to be "Familiar.Bob.Equipment"
            // To do this simply, we assume any nested list inside a collection is relative to that collection's root.
            // A quick heuristic: if the first part of the full path matches the root collection (Familiar), insert the key.
            // Though actually, if it's rendered here, it *must* belong to this item.
            if (fullpath && !fullpath.includes('.' + data.$key + '.')) {
                const parts = fullpath.split('.');
                if (parts.length > 1) {
                    // parts[0] is root (e.g. Familiar), parts[1] is prop (e.g. Equipment)
                    // insert $key after root
                    parts.splice(1, 0, data.$key);
                    el.setAttribute('data-bind-list-fullpath', parts.join('.'));
                }
            }
        });

        // Do the same for data-bind-fullpath (e.g., checkboxes inside grid items)
        root.querySelectorAll('[data-bind-fullpath]').forEach(el => {
            const fullpath = el.getAttribute('data-bind-fullpath');
             if (fullpath && !fullpath.includes('.' + data.$key) && fullpath !== data.$key) {
                const parts = fullpath.split('.');
                if (parts.length > 1) {
                    parts.splice(1, 0, data.$key);
                    el.setAttribute('data-bind-fullpath', parts.join('.'));
                } else if (parts.length === 1) {
                    // If it's just 'Familiar', make it 'Familiar.Bob'
                    el.setAttribute('data-bind-fullpath', parts[0] + '.' + data.$key);
                }
            }
        });
    }

    root.querySelectorAll('[data-bind-curr]').forEach(el => {
         const path = el.getAttribute('data-bind-curr');
         if(path !== null) el.textContent = getV(data, path, 0);
    });
    
    // --- Image Edit & Popup Handlers ---
    // We attach the data source to the element for the handler to read
    root.querySelectorAll('.img-edit-btn').forEach(el => {
        // Store the current data context 
        // We can't easily pass the whole object, but we can pass the key if it exists
        if (data.$key) el.dataset.key = data.$key;
    });

    root.querySelectorAll('[data-bind-max]').forEach(el => {
         const path = el.getAttribute('data-bind-max');
         if(path !== null) el.textContent = getV(data, path, 100);
    });
    root.querySelectorAll('[data-bind-bar]').forEach(el => {
        const path = el.getAttribute('data-bind-bar');
        if (path !== null) {
            const explicitMaxPath = el.getAttribute('data-bind-bar-max');
            let maxPath;
            if (explicitMaxPath) {
                maxPath = explicitMaxPath;
            } else {
                maxPath = path.replace('_curr', '_max');
                if (maxPath === path) maxPath = path + '_max';
            }
            const cur = Number(getV(data, path, 0)) || 0;
            const max = Number(getV(data, maxPath, 100)) || 100;
            const pct = Math.min(100, Math.max(0, (cur / max) * 100));
            el.style.width = pct + '%';
        }
    });

    root.querySelectorAll('[data-bind-img]').forEach(el => {
        const path = el.getAttribute('data-bind-img');
        if (path !== null) {
            // --- Image Loading Priority ---
            // 1. localStorage (local files uploaded by user, base64 data: URIs)
            // 2. MVU variable (URLs, synced across sessions)
            // 3. Placeholder (when no image is set)
            let url = '';
            
            // For localStorage lookup, use the full path from parent wrapper
            // This matches the key used when saving in rt_modalUi.js
            const wrapper = el.closest('[data-bind-fullpath]');
            const fullPath = wrapper ? wrapper.getAttribute('data-bind-fullpath') : path;
            
            try {
                const cached = localStorage.getItem('mzsb_img_' + fullPath);
                if (cached) url = cached;
            } catch (e) {}
            
            if (!url) {
                url = getV(data, path, '');
                if(Array.isArray(url)) url = url[0];
            }
            
            if (url && url !== 'N/A') {
                el.src = url;
                el.style.display = 'block';
            } else {
                // Show placeholder when no image is set
                el.src = noImageSrc();
                el.style.display = 'block';
            }
        }
    });

    root.querySelectorAll('[data-bind-checked]').forEach(el => {
        const path = el.getAttribute('data-bind-checked');
        if (path !== null) {
            const val = getV(data, path, false);
            el.checked = Boolean(val);
        }
        
        // The click posts WHERE it sat and WHAT it now reads — the engine's setValue decides what
        // the member becomes (its label, its type). A refused write reverts the box, because the
        // host wrote nothing and a re-read would find nothing changed to redraw.
        const saveRoot = el.getAttribute('data-save-root');
        const saveLeaf = el.getAttribute('data-save-leaf');

        if (saveRoot || saveLeaf) {
             el.onclick = async () => {
                 let fullPath = saveLeaf || '';
                 if (data.$key && saveRoot) {
                     // Collection Item: Root + Key + Leaf
                     fullPath = saveRoot + '.' + data.$key + '.' + saveLeaf;
                 } else if (saveRoot) {
                     // Single Item / Global: Root + Leaf
                     fullPath = saveRoot + '.' + saveLeaf;
                 } else {
                     // No root: just leaf (global variable?)
                     fullPath = saveLeaf;
                 }
                 const value = el.checked;
                 const result = await dispatchMenuAction('setValue', { path: fullPath, value }, packScopeOf(el));
                 if (!result.ok) el.checked = !value;
             };
        }
    });
    
    // NO cell-logic execution. The HTML export is a LAYOUT export: cells render from their
    // bindings (data-bind-val, data-lb-key) and nothing else. A cell body lives on as pack-lane
    // source only — liftCustomLogic turns it into a named StatusMenu Engine formatter — so the
    // exported HTML no longer runs new Function() over base64'd author text at all.

     // 4. Generic Lists (Simple & Grid & Quest & Custom & Equipment & Inventory)
    const listTypeMap = {
        'simple': (cid, data, txn, rootData) => renderTemplateList(cid, data, 'tmpl-simple', txn, false, rootData),
        'grid': (cid, data, txn, rootData) => renderTemplateList(cid, data, 'tmpl-grid', txn, true, rootData),
        'inventory': (cid, data, txn, rootData) => renderTemplateList(cid, data, 'tmpl-inventory', txn, true, rootData),
        'equipment-action': (cid, data, txn, rootData) => renderTemplateList(cid, data, 'tmpl-equipment-action', txn, false, rootData),
        'quest': (cid, data, txn, rootData) => renderTemplateList(cid, data, 'tmpl-quest', txn, false, rootData)
    };

    root.querySelectorAll('[data-bind-list]').forEach(el => {
        const path = el.getAttribute('data-bind-list');
        const type = el.getAttribute('data-list-type') || 'simple';
        const emptyText = LOCALE['empty_' + type] || LOCALE.empty_none;
        
        if (path !== null) {
            // Use getListData to avoid aggressive tuple unwrapping
            const listData = getListData(data, path, {});
            
            // Check for custom-* type
            if (type.startsWith('custom-')) {
                const customName = type.substring(7); // strip 'custom-'
                const customTmplId = 'tmpl-custom-' + customName;
                const customTmpl = document.getElementById(customTmplId);
                
                if (customTmpl) {
                    // Use custom template with data-bind rendering
                    renderCustomTemplateList(el, listData, customTmplId, emptyText, rootData);
                } else {
                    // Fallback: show error banner + render with tmpl-simple
                    const errorBanner = document.createElement('div');
                    errorBanner.style.cssText = 'background:#ff525233; border:1px solid #ff5252; color:#ff8a80; padding:6px 10px; border-radius:4px; margin-bottom:8px; font-size:0.85em;';
                    errorBanner.textContent = '⚠ Custom template "' + customName + '" not found. Using fallback.';
                    el.appendChild(errorBanner);
                    renderTemplateList(el, listData, 'tmpl-simple', emptyText, false);
                }
            } else {
                const renderer = listTypeMap[type] || listTypeMap['simple'];
                renderer(el, listData, emptyText, rootData);
            }
        }
    });
    
    // --- Collapsible List Headers ---
    root.querySelectorAll('.list-collapse-header').forEach(header => {
        const targetId = header.getAttribute('data-target') || '';

        if (header.dataset.collapseInit) return;
        header.dataset.collapseInit = '1';

        // Restore persisted open/close state if available (overrides template default)
        if (targetId && _collapseState.has(targetId)) {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.list-collapse-arrow');
            const isOpen = _collapseState.get(targetId);
            if (body) body.style.display = isOpen ? '' : 'none';
            if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
        }

        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const arrow = header.querySelector('.list-collapse-arrow');
            if (!body) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? '' : 'none';
            if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
            // Persist so re-renders restore the same state
            if (targetId) _collapseState.set(targetId, isHidden); // isHidden → we are opening it
        });
    });

    // --- Custom Template Renderer (data-bind based) ---
    function renderCustomTemplateList(container, data, templateId, emptyText, rootData) {

        container.innerHTML = '';
        
        let items = [];
        if (data && Object.keys(data).length > 0) {
            for (const [key, raw] of Object.entries(data)) {
                if (key === '$meta' || key === 'template') continue;
                items.push({ $key: key, $raw: raw });
            }
        }
        
        
        if (items.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:10px;">' + emptyText + '</div>';
            return;
        }
        
        const tmpl = document.getElementById(templateId);

        if (!tmpl) return;
        
        items.forEach(item => {
            const clone = tmpl.content.cloneNode(true);
            const raw = item.$raw;
            
            // Build a flat field map from the item's data
            const fieldMap = { '$key': item.$key };
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                for (const [k, v] of Object.entries(raw)) {
                    if (k === '$meta') continue;
                    fieldMap[k] = isTuple(v) ? formatValue(tupleVal(v)) : formatValue(v);
                }
            } else if (raw !== null && raw !== undefined) {
                fieldMap['$value'] = isTuple(raw) ? formatValue(tupleVal(raw)) : formatValue(raw);
            }
            

            
            // Fill all data-bind elements
            clone.querySelectorAll('[data-bind]').forEach(bindEl => {
                const field = bindEl.getAttribute('data-bind');

                if (field && fieldMap[field] !== undefined) {
                    bindEl.textContent = String(fieldMap[field]);
                    bindEl.style.display = '';
                } else if (field && fieldMap[field] === undefined) {
                    // Hide elements whose field doesn't exist in this item
                    bindEl.textContent = '';
                }
            });
            
            // Attach click handler for modal
            const rootEl = clone.firstElementChild;
            if (rootEl) {
                rootEl.style.cursor = 'pointer';
                const modalData = raw || {};
                const allowEdit = container.getAttribute('data-allow-edit') === '1';
                const listPath = container.getAttribute('data-bind-list-fullpath') || container.getAttribute('data-bind-list') || '';
                const cellArgsText = container.getAttribute('data-args');
                rootEl.onclick = () => showModal(item.$key, modalData, allowEdit, listPath, item.$key,
                    { scopePath: packScopeOf(rootEl), cellArgsText });
            }
            
            container.appendChild(clone);
        });
    }
    // StatusMenu Pack formatter values (rt_packLayout) — applied AFTER the raw bindings, so a
    // resolved formatter overwrites and a missing one leaves the raw value standing (warn lane).
    if (typeof applyPackFormatterValues === 'function') applyPackFormatterValues(root);

}