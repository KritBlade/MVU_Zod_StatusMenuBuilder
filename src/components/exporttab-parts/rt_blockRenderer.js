// Helper to create pagination controls
function createBlockPaginationBar(containerId, currentPage, totalPages, data, templateId, position, allItems, effectivePageSize) {
    const bar = document.createElement('div');
    bar.className = 'block-pagination-bar';
    // Use width:100% and flex properties to ensure it spans full width in grid/flex containers
    bar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 4px; width:100%; flex-basis:100%; flex-shrink:0; box-sizing:border-box; ' + 
        (position === 'top' ? 'margin-bottom:8px; border-bottom:1px solid var(--border-color);' : 'margin-top:8px; border-top:1px solid var(--border-color);');

    // Previous Button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '<';
    prevBtn.className = 'pager-btn';
    prevBtn.disabled = currentPage === 0;
    if (prevBtn.disabled) prevBtn.style.opacity = '0.3';
    prevBtn.onclick = (e) => {
        e.stopPropagation();
        if (currentPage > 0) {
            _blockPageState.set(containerId, currentPage - 1);
            renderBlock(containerId, data, templateId);
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
            _blockPageState.set(containerId, currentPage + 1);
            renderBlock(containerId, data, templateId);
        }
    };

    bar.appendChild(prevBtn);

    // Quick-Jump Dropdown (top bar only)
    if (position === 'top' && allItems && allItems.length > 0) {
        const container = document.getElementById(containerId);
        const showQuickJump = container && container.getAttribute('data-quick-jump') === '1';
        if (showQuickJump) {
            const jumpSelect = document.createElement('select');
            jumpSelect.className = 'block-jump-select';
            const firstVisibleIdx = currentPage * effectivePageSize;
            for (let i = 0; i < allItems.length; i++) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.style.background = '#1a1d24';
                opt.style.color = '#e0e0e0';
                const item = allItems[i];
                const name = (item.Name ? (Array.isArray(item.Name) ? item.Name[0] : item.Name) : null) || item.$key || ('Item ' + (i + 1));
                opt.textContent = name;
                if (i === firstVisibleIdx) opt.selected = true;
                jumpSelect.appendChild(opt);
            }
            jumpSelect.onchange = () => {
                const selectedIdx = parseInt(jumpSelect.value, 10);
                const targetPage = Math.floor(selectedIdx / effectivePageSize);
                const currentPage = _blockPageState.get(containerId) || 0;
                // Only rebuild DOM if the page actually changes
                if (targetPage !== currentPage) {
                    _blockPageState.set(containerId, targetPage);
                    renderBlock(containerId, data, templateId);
                    // Restore the selection on the newly-rendered select (renderBlock rebuilds DOM)
                    const newContainer = document.getElementById(containerId);
                    if (newContainer) {
                        const newSelect = newContainer.querySelector('.block-jump-select');
                        if (newSelect) newSelect.value = String(selectedIdx);
                    }
                }
                // Scroll in RAF so DOM layout is stable before measuring positions
                requestAnimationFrame(() => {
                    const anchorId = containerId + '-item-' + selectedIdx;
                    const anchor = document.getElementById(anchorId);
                    if (anchor) {
                        // The chat scroller is the parent page's. A contained frame cannot reach it (the
                        // read throws), and the anchor then scrolls into view inside the frame instead.
                        let chatEl = null;
                        try {
                            chatEl = window.parent && window.parent !== window && window.parent.document && window.parent.document.querySelector('#chat');
                        } catch (e) {
                            chatEl = null;   // EXPECTED: a contained frame has an opaque origin; scrollIntoView below is its path
                        }
                        if (chatEl) {
                            const iframeEl = window.frameElement;
                            const iframeRect = iframeEl ? iframeEl.getBoundingClientRect() : { top: 0 };
                            const chatRect = chatEl.getBoundingClientRect();
                            const anchorRect = anchor.getBoundingClientRect();
                            const scrollDelta = (iframeRect.top + anchorRect.top) - chatRect.top - 8;
                            chatEl.scrollTop += scrollDelta;
                        } else {
                            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                });
            };
            bar.appendChild(jumpSelect);
        }
    }

    bar.appendChild(pageIndicator);
    bar.appendChild(nextBtn);
    return bar;
}

function renderBlock(containerId, data, templateId, rootData) {
     const container = document.getElementById(containerId);
     const template = document.getElementById(templateId);
     if (!container || !template) return;
     
     container.innerHTML = '';
     if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
         container.innerHTML = '<div style="width:100%; text-align:center; padding:10px; color:#666;">No Data</div>';
         return;
     }

     // Determine items to loop
     let items = [];
     if (Array.isArray(data)) {
         items = data;
     } else if (typeof data === 'object') {
         // STRICT MODE: Check Schema (COLLECTION_PATHS)
         const rootKey = container.getAttribute('data-bind-root');
         const isSchemaCollection = COLLECTION_PATHS.has(rootKey) || COLLECTION_PATHS.has('.' + rootKey);
         
         if (!isSchemaCollection) {
            items = [data]; // Treat as single Record
         } else {
             // It is a Collection -> Loop values
             items = Object.entries(data)
                 .filter(([k, v]) => k !== '$meta' && k !== '$key' && k !== 'template' && v && typeof v === 'object' && !Array.isArray(v))
                 .map(([k, v]) => ({ $key: k, ...v }));
         }
     } else {
         items = [data];
     }

     if (items.length === 0) {
         container.innerHTML = '<div style="width:100%; text-align:center; padding:10px; color:#666;">No Data</div>';
         return;
     }

     // --- Block Pagination Logic ---
     const totalItems = items.length;
     const effectivePageSize = parseInt(container.getAttribute('data-page-size'), 10) || BLOCK_PAGE_SIZE;
     const totalPages = Math.ceil(totalItems / effectivePageSize);
     const needsPagination = totalItems > effectivePageSize;

     let currentPage = _blockPageState.get(containerId) || 0;
     if (currentPage >= totalPages) currentPage = totalPages - 1;
     if (currentPage < 0) currentPage = 0;
     _blockPageState.set(containerId, currentPage);

     const startIdx = needsPagination ? currentPage * effectivePageSize : 0;
     const endIdx = needsPagination ? Math.min(startIdx + effectivePageSize, totalItems) : totalItems;
     const visibleItems = items.slice(startIdx, endIdx);

     // Add TOP pagination bar
     if (needsPagination) {
         container.appendChild(createBlockPaginationBar(containerId, currentPage, totalPages, data, templateId, 'top', items, effectivePageSize));
     } else if (container.getAttribute('data-quick-jump') === '1' && items.length > 0) {
         // Show quick-jump dropdown even without pagination (e.g. single item collections)
         container.appendChild(createBlockPaginationBar(containerId, currentPage, totalPages, data, templateId, 'top', items, effectivePageSize));
     }

     // Render visible items
     for (let i = 0; i < visibleItems.length; i++) {
         const item = visibleItems[i];
         const globalIdx = startIdx + i;
         const anchor = document.createElement('div');
         anchor.id = containerId + '-item-' + globalIdx;
         anchor.style.cssText = 'height:0;margin:0;padding:0;width:100%;flex-basis:100%;flex-shrink:0;';
         container.appendChild(anchor);
         const clone = template.content.cloneNode(true);
         const wrapper = document.createElement('div');
         wrapper.style.display = 'contents';
         // The item's identity, readable from the DOM — pack formatter cells resolve per ITEM and
         // look their scope up via closest('[data-item-key]') (rt_packLayout).
         if (item && item.$key !== undefined) wrapper.setAttribute('data-item-key', String(item.$key));
         wrapper.appendChild(clone);
         container.appendChild(wrapper);
         updateBindingsIn(wrapper, item, rootData);
     }

     // Add BOTTOM pagination bar
     if (needsPagination) {
         container.appendChild(createBlockPaginationBar(containerId, currentPage, totalPages, data, templateId, 'bottom', items, effectivePageSize));
     }

     // After rendering, scroll the parent tab to top if this is a collection in the active tab
     const rootKey = container.getAttribute('data-bind-root');
     const isCollection = COLLECTION_PATHS.has(rootKey) || COLLECTION_PATHS.has('.' + rootKey);
     if (isCollection) {
         const parentTab = container.closest('.tab-content');
         if (parentTab && parentTab.classList.contains('active')) {
             // Use requestAnimationFrame to ensure scroll happens after browser layout
             requestAnimationFrame(() => {
                 parentTab.scrollTop = 0;
             });
         }
     }
}