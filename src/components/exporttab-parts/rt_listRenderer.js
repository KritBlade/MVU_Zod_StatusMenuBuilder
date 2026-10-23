// Helper to extract Name/Qty from various object keys (ported from Builder)
function getItemSummary(item) {
    if (typeof item !== 'object' || !item) return { name: String(item), qty: '' };
    
    // Heuristics for Name (dictionary key is already promoted to Name by flatten())
    const nameKeys = ['Name', 'name'];
    let name = 'Item';
    for (const k of nameKeys) {
        if (item[k]) { name = item[k]; break; }
    }
    
    // Heuristics for Quantity
    const qtyKeys = ['Qty', 'qty'];
    let qty = '';
    for (const k of qtyKeys) {
        if (item[k] !== undefined) { qty = String(item[k]); break; }
    }
    
    return { name, qty };
}

// Every verb a row offers, from ONE source (D8): the list cell's declared `rowActions`
// (data-row-actions) plus the delete its `allowDelete` flag has always meant — read here as the
// declaration it is, so no layout file changes and a new row verb is one array entry. The buttons
// carry data-row-action, never data-action: a row verb posts the row's observations and goes
// through runRowAction (rt_actionInputs.js), not the baked-button listener, which would double-fire
// it. A template without a row-actions slot gets the strip appended to its root.
const _rowActionsWarned = new Set();
function renderRowActions(clone, container, itemKey, cellArgsText) {
    const parsed = parseRowActions(container.getAttribute('data-row-actions'));
    if (parsed.reason && !_rowActionsWarned.has(container.id)) {
        _rowActionsWarned.add(container.id);
        console.warn('[MZSMB][action] ' + (container.id || 'a list') + ': ' + parsed.reason + ' — its declared row actions are not drawn');
    }
    const actions = parsed.actions.slice();
    if (container.getAttribute('data-allow-delete') === '1') {
        actions.push({ title: '×', action: 'deleteListItem', args: {}, confirm: 'Delete "{itemKey}"?\n\nAre you sure you want to delete this item?', hint: 'Delete', danger: true });
    }
    const rootEl = clone.firstElementChild;
    if (!rootEl) return;
    let slot = clone.querySelector('[data-slot="row-actions"]');
    if (!slot && actions.length) {
        slot = document.createElement('span');
        slot.className = 'row-actions';
        rootEl.appendChild(slot);
    }
    if (!slot) return;
    slot.innerHTML = '';
    if (!actions.length) { slot.style.display = 'none'; return; }
    const listPath = container.getAttribute('data-bind-list-fullpath') || container.getAttribute('data-bind-list') || '';
    for (const rowAction of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'row-action-btn' + (rowAction.danger ? ' row-action-delete' : '');
        btn.textContent = rowAction.title;
        btn.title = rowAction.hint || rowAction.title;
        btn.setAttribute('data-row-action', rowAction.action);
        btn.onclick = (e) => {
            e.stopPropagation();
            void runRowAction(rowAction, { listPath, itemKey }, cellArgsText, { scopePath: packScopeOf(btn), button: btn });
        };
        slot.appendChild(btn);
    }
}

// The step counter a quest card shows, as ONE string the template binds blind: "2/3" when the record
// carries a positive Step AND a positive StepMax (the ladder RES stamps on an ad-hoc quest), '' for
// anything else — a signpost's bare cursor with no total, an older genre's record with neither, a Zod
// prefault 0 — so the row hides rather than print half a readout. Tuples unwrap the way every other
// field does. The join happens HERE: the template stays zero-logic. Exported for the node suite.
export function questStepLabel(stepRaw, stepMaxRaw) {
    const num = (v) => (v === undefined || v === null) ? NaN : Number(isTuple(v) ? tupleVal(v) : v);
    const step = num(stepRaw), max = num(stepMaxRaw);
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(max) || max <= 0) return '';
    return step + '/' + max;
}

// --- Pagination State ---
const _listPageState = new Map(); // Store current page per container ID
const _blockPageState = new Map(); // Store current page per block container

// ============================================
// PAGE SIZE CONFIGURATION (Change these values as needed)
// ============================================
const LIST_PAGE_SIZE = 5;   // For QuestList (simple/quest templates)
const BLOCK_PAGE_SIZE = 5;  // For Familiar-type blocks
// ============================================

// --- Merged Generic List Renderer (with Pagination) ---
function renderTemplateList(containerOrId, data, templateId, emptyText = LOCALE.empty_none, shouldFlatten = false, rootData) {
     const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
     if (!container) return;
     
     // Get container ID for pagination state
     const containerId = container.id || containerOrId;
     
     // Reset container style/class
     container.innerHTML = '';
     container.className = ''; 
     container.removeAttribute('style');

     // Handle Grid View specific styling (legacy support for existing CSS)
     if (templateId === 'tmpl-grid') {
         container.className = 'list-grid-view'; 
     } else if (templateId === 'tmpl-inventory') {
         container.className = 'list-inventory-view';
     }

     // 1. Prepare Items
     let items = [];
     
     if (!data || Object.keys(data).length === 0) {
         // Empty State
     } else {
         if (shouldFlatten) {
             // Flattening Logic (for Grid)
             function flatten(obj) {
                 let res = [];
                 if (!obj || typeof obj !== 'object') return res;
                 for (const [key, value] of Object.entries(obj)) {
                     if (key === '$meta' || key === '$key' || key === 'template' || value === null || value === undefined) continue;
                     const unwrapped = isTuple(value) ? tupleVal(value) : value;
                     if (unwrapped === null || unwrapped === undefined) continue;
                     
                     if (typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
                         // Use dictionary key as Name when item lacks its own Name/name
                         const hasName = unwrapped.Name || unwrapped.name ;
                         // Dictionary key MUST be the source of truth for $key (place it last so it overwrites any $key in unwrapped)
                         res.push({ ...(!hasName ? { Name: key } : {}), ...unwrapped, $key: key });
                     } else {
                         res.push({ name: isTuple(value) ? tupleLabel(value, key) : key, quantity: unwrapped });
                     }
                 }
                 return res;
             }
             items = flatten(data);
         } else {
             // Direct mapping (for Simple/Quest)
             for (const [key, raw] of Object.entries(data)) {
                 if (key === '$meta' || key === '$key' || key === 'template') continue;
                 items.push({ $key: key, $raw: raw });
             }
         }
     }

     if (items.length === 0) { 
         container.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:10px;">' + emptyText + '</div>';
         if (templateId === 'tmpl-grid' || templateId === 'tmpl-inventory') {
              container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary);">' + emptyText + '</div>'; 
         }
         return; 
     }
     
     const tmpl = document.getElementById(templateId);
     if (!tmpl) {
         console.error('[MZSMB] Template not found:', templateId);
         return;
     }

     // --- Pagination Logic (skip for Grid) ---
     const totalItems = items.length;
     const totalPages = Math.ceil(totalItems / LIST_PAGE_SIZE);
     const isGrid = templateId === 'tmpl-grid' || templateId === 'tmpl-inventory';
     const needsPagination = !isGrid && totalItems > LIST_PAGE_SIZE;
     
     // Get or initialize current page
     let currentPage = _listPageState.get(containerId) || 0;
     // Clamp to valid range
     if (currentPage >= totalPages) currentPage = totalPages - 1;
     if (currentPage < 0) currentPage = 0;
     _listPageState.set(containerId, currentPage);
     
     // Calculate visible items (only slice if pagination is needed)
     let visibleItems;
     if (needsPagination) {
         const startIdx = currentPage * LIST_PAGE_SIZE;
         const endIdx = Math.min(startIdx + LIST_PAGE_SIZE, totalItems);
         visibleItems = items.slice(startIdx, endIdx);
     } else {
         visibleItems = items; // Show all items (e.g., for Grid)
     }

     // --- Render Function for Items ---
     const renderItems = (itemsToRender) => {
          const listPath = container.getAttribute('data-bind-list-fullpath') || container.getAttribute('data-bind-list') || '';
          const isQuestSource = listPath.includes('Quests') || listPath.includes('quest');
         itemsToRender.forEach(item => {
             let lastUpdated = ''; let title = '', desc = '', qty = '', difficulty = '', reward = '', status = '', objective = '', nextUnlock = '', step = '';
             
             // Extraction Logic
             if (shouldFlatten) {
                  // Item is an object from flatten()
                  const summary = getItemSummary(item);
                  title = summary.name; // Use name as title
                  // qty
                  let qVal = Number(summary.qty);
                  if (!isNaN(qVal) && qVal >= 1) qty = 'x' + qVal;
                  
                  // Try to find other fields if they exist in the flattened object
                  // (desc intentionally omitted: grid/inventory only shows $key)
                  if (item.Difficulty !== undefined) difficulty = String(formatValue(item.Difficulty));
                  else if (item.difficulty !== undefined) difficulty = String(formatValue(item.difficulty));
                  if (item.Reward !== undefined) reward = String(formatValue(item.Reward));
                  else if (item.reward !== undefined) reward = String(formatValue(item.reward));

             } else {
                  // Item is { $key, $raw }
                  const key = item.$key;
                  const raw = item.$raw;
                  
                  title = key;

                  if (isTuple(raw)) {
                      title = tupleLabel(raw, key);
                      desc = String(formatValue(tupleVal(raw)));
                  } else {
                      // Array/Object handling
                      if (Array.isArray(data)) { // Check original data is array?
                          // Simplification: In loop of Object.entries(data), if data is array, key is index.
                          // But we want value as title if primitive.
                          if (raw && typeof raw !== 'object') {
                              title = String(raw);
                          }
                      }

                      if (raw && typeof raw === 'object') {
                          // The headline takes Title only when the record carries a NON-BLANK one: a Zod prefault leaves
                          // '' on every record, and '' as the headline is a card with no name at all. Blank → the key.
                          const titleText = raw.Title !== undefined ? String(formatValue(raw.Title)).trim() : '';
                          if (titleText) title = titleText;
                          if (raw.Desc !== undefined) desc = String(formatValue(raw.Desc));
                          else if (raw.description !== undefined) desc = String(formatValue(raw.description));
                          else if (raw.name !== undefined) desc = String(formatValue(raw.name));
                          else if (raw.type !== undefined) desc = String(formatValue(raw.type));
                          
                          if (raw.Difficulty !== undefined) difficulty = String(formatValue(raw.Difficulty));
                          else if (raw.difficulty !== undefined) difficulty = String(formatValue(raw.difficulty));
                          if (raw.Reward !== undefined) reward = String(formatValue(raw.Reward));
                          else if (raw.reward !== undefined) reward = String(formatValue(raw.reward));
                           if (templateId === 'tmpl-quest' && isQuestSource) {
                               if (raw.LastUpdated !== undefined) lastUpdated = String(formatValue(raw.LastUpdated));

                               if (raw.Status !== undefined) status = String(formatValue(raw.Status));
                               else if (raw.status !== undefined) status = String(formatValue(raw.status));
                               // quest-revisit 2b: the LIVE step's goal, and the engine-owned counter over its ladder
                               if (raw.Objective !== undefined) objective = String(formatValue(raw.Objective)).trim();
                               // what the next step still waits on — one line the genre's engine composes, shown as given
                               if (raw.NextUnlock !== undefined) nextUnlock = String(formatValue(raw.NextUnlock)).trim();
                               step = questStepLabel(raw.Step, raw.StepMax);
                           }
                      } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
                         if (!Array.isArray(data)) desc = String(raw);
                      }
                  }
             }

             // Clone & Fill
             const clone = tmpl.content.cloneNode(true);
             
             // Attach Click Handler for Modal. The row hands the modal WHERE it sits (its scope, read
             // off the DOM at click time) and what its list cell declared — the modal's save posts both.
             const rootEl = clone.firstElementChild;
             const cellArgsText = container.getAttribute('data-args');
             if (rootEl) {
                 rootEl.style.cursor = 'pointer';
                 const modalData = shouldFlatten ? item : (item.$raw || {});
                 const allowEdit = container.getAttribute('data-allow-edit') === '1';
                 const itemKey = item.$key || title;
                 const listPath = container.getAttribute('data-bind-list-fullpath') || container.getAttribute('data-bind-list') || '';
                 rootEl.onclick = () => showModal(title, modalData, allowEdit, listPath, itemKey,
                     { scopePath: packScopeOf(rootEl), cellArgsText });
             }
             
             // Helper to safely set content
             const setSlot = (name, val, isHtml = false) => {
                 const el = clone.querySelector('[data-slot="' + name + '"]');
                 if (el) {
                     if (val) {
                         if (isHtml) el.innerHTML = val;
                         else el.textContent = val;
                         el.style.display = ''; // Un-hide if hidden
                     } else {
                         // If empty, keep hidden (or hide if not already) via CSS or logic?
                         // Our templates use style="display:none" for optional fields, so we only unhide if present.
                         // But for text/qty, usually always visible.
                     }
                 }
             };

             setSlot('title', title);
             setSlot('name', title); // Alias for Grid
             setSlot('desc', desc, true);
             setSlot('qty', qty);
             setSlot('difficulty', difficulty);
             setSlot('reward-text', reward);
              setSlot('LastUpdated', lastUpdated);
              setSlot('status', status);
              setSlot('objective', objective);
              setSlot('next-unlock', nextUnlock);
              setSlot('step', step);

              if (objective) {
                  const elObj = clone.querySelector('[data-slot="objective-row"]');
                  if (elObj) elObj.style.display = 'block';
              }
              if (nextUnlock) {
                  const elNext = clone.querySelector('[data-slot="next-unlock-row"]');
                  if (elNext) elNext.style.display = 'block';
              }
              if (step) {
                  const elStep = clone.querySelector('[data-slot="step-row"]');
                  if (elStep) elStep.style.display = 'block';
              }

              if (status) {
                  const elStatus = clone.querySelector('[data-slot="status-row"]');
                  if (elStatus) elStatus.style.display = 'block';
              }

              if (lastUpdated) {
                  const elLU = clone.querySelector('[data-slot="last-updated-row"]');
                  if (elLU) elLU.style.display = 'block';
              }

             // Special handling for parent containers of slots (like Reward wrapper)
             if (reward) {
                 const elRewardParams = clone.querySelector('[data-slot="reward"]');
                 if (elRewardParams) elRewardParams.style.display = 'block';
             }
             if (difficulty) {
                 const elDiff = clone.querySelector('[data-slot="difficulty"]');
                 if (elDiff) elDiff.style.display = 'inline-block';
             }

             renderRowActions(clone, container, item.$key || title, cellArgsText);

             // Universal Binding Update (Adding Support for Dynamic Logic)
             const bindData = shouldFlatten ? item : (item.$raw || {});
             updateBindingsIn(clone, bindData, rootData);

             container.appendChild(clone);
         });
     };

     // 2. Render visible items
     renderItems(visibleItems);

     // 3. Add Pagination Controls if needed
     if (needsPagination) {
         const paginationBar = document.createElement('div');
         paginationBar.className = 'list-pagination-bar';
         paginationBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 4px; margin-top:8px; border-top:1px solid var(--border-color);';
         
         // Previous Button
         const prevBtn = document.createElement('button');
         prevBtn.textContent = '<';
         prevBtn.className = 'pager-btn';
         prevBtn.disabled = currentPage === 0;
         if (prevBtn.disabled) prevBtn.style.opacity = '0.3';
         prevBtn.onclick = (e) => {
             e.stopPropagation();
             if (currentPage > 0) {
                 _listPageState.set(containerId, currentPage - 1);
                 renderTemplateList(container, data, templateId, emptyText, shouldFlatten);
             }
         };
         
         // Page Indicator
         const pageIndicator = document.createElement('span');
         pageIndicator.style.cssText = 'color:var(--text-secondary); font-size:0.85em;';
         pageIndicator.textContent = (currentPage + 1) + ' / ' + totalPages;
         
         // Next Button
         const nextBtn = document.createElement('button');
         nextBtn.textContent = '>';
         nextBtn.className = 'pager-btn';
         nextBtn.disabled = currentPage >= totalPages - 1;
         if (nextBtn.disabled) nextBtn.style.opacity = '0.3';
         nextBtn.onclick = (e) => {
             e.stopPropagation();
             if (currentPage < totalPages - 1) {
                 _listPageState.set(containerId, currentPage + 1);
                 renderTemplateList(container, data, templateId, emptyText, shouldFlatten);
             }
         };
         
         paginationBar.appendChild(prevBtn);
         paginationBar.appendChild(pageIndicator);
         paginationBar.appendChild(nextBtn);
         container.appendChild(paginationBar);
     }
}