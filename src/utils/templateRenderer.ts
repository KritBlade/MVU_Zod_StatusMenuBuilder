/**
 * Shared Template Renderer (Option A: Modal Support)
 * 
 * Logic extracted from HtmlExportTab.vue to be used by both:
 * 1. The Exported HTML (via copy-paste of this logic, or bundled).
 * 2. The Builder Preview (imported directly).
 */

export const LOCALE = {
    empty_none: "None",
    empty_quest: "No active quests",
    empty_skills: "No skills learned",
    empty_equipped: "Nothing equipped",
    empty_inventory: "Empty inventory",
    header_kin_stats: "Status Attributes",
    header_core_status: "Core Status"
}

// --- Helpers ---

export const isTuple = (v: any) => Array.isArray(v) && v.length >= 2 && typeof v[1] === 'string'
export const tupleVal = (v: any) => isTuple(v) ? v[0] : v
export const tupleLabel = (v: any, fallback: string) => isTuple(v) ? (v[1] || fallback) : fallback

export const formatValue = (val: any): string => {
    if (val === null || val === undefined) return LOCALE.empty_none
    if (isTuple(val)) return formatValue(tupleVal(val))
    if (Array.isArray(val)) return JSON.stringify(val)
    if (typeof val === 'object') {
        if (val.Desc !== undefined) return formatValue(val.Desc)
        if (val.description !== undefined) return formatValue(val.description)
        if (val.name !== undefined) return formatValue(val.name)
        return ''
    }
    return String(val)
}

// The step counter a quest card shows — the twin of rt_listRenderer.js's questStepLabel, and the same
// rule: "N/M" only when both Step and StepMax are positive, '' otherwise so the row hides.
export function questStepLabel(stepRaw: unknown, stepMaxRaw: unknown): string {
    const num = (v: unknown) => (v === undefined || v === null) ? NaN : Number(isTuple(v) ? tupleVal(v) : v)
    const step = num(stepRaw), max = num(stepMaxRaw)
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(max) || max <= 0) return ''
    return step + '/' + max
}

export function getItemSummary(item: any) {
    if (typeof item !== 'object' || !item) return { name: String(item), qty: '' }

    // Heuristics for Name
    const nameKeys = ['Name', 'name', '$key']
    let name = 'Item'
    for (const k of nameKeys) {
        if (item[k]) { name = item[k]; break }
    }

    // Heuristics for Quantity
    const qtyKeys = ['Qty', 'qty']
    let qty = ''
    for (const k of qtyKeys) {
        if (item[k] !== undefined) { qty = String(item[k]); break }
    }

    return { name, qty }
}

// --- Pagination State ---
const _listPageState = new Map<string, number>() // Store current page per container

// ============================================
// PAGE SIZE CONFIGURATION (Change this value as needed)
// ============================================
const LIST_PAGE_SIZE = 5  // For QuestList (simple/quest templates)
// ============================================

// --- Main Renderer (with Pagination) ---

export function renderTemplateList(containerOrId: HTMLElement | string, data: any, templateId: string, emptyText: string = LOCALE.empty_none, shouldFlatten: boolean = false) {
    const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId
    if (!container) return

    // Get container ID for pagination state
    const containerId = container.id || (containerOrId as string) || `list-${Math.random().toString(36).slice(2)}`
    if (!container.id) container.id = containerId

    // Reset container style/class
    container.innerHTML = ''
    container.className = ''
    container.removeAttribute('style')

    // Handle Grid View specific styling
    if (templateId === 'tmpl-grid') {
        container.className = 'list-grid-view'
    } else if (templateId === 'tmpl-inventory') {
        container.className = 'list-inventory-view'
    }

    // 1. Prepare Items
    let items: any[] = []

    if (!data || Object.keys(data).length === 0) {
        // Empty State
    } else {
        if (shouldFlatten) {
            // Flattening Logic (for Grid)
            const flatten = (obj: any) => {
                let res: any[] = []
                if (!obj || typeof obj !== 'object') return res
                for (const [key, value] of Object.entries(obj)) {
                    if (key === '$meta' || key === '$key' || key === 'template' || value === null || value === undefined) continue
                    const unwrapped = isTuple(value) ? tupleVal(value) : value
                    if (unwrapped === null || unwrapped === undefined) continue

                    if (typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
                        res.push({ $key: key, ...(unwrapped as object) })
                    } else {
                        res.push({ name: isTuple(value) ? tupleLabel(value, key) : key, quantity: unwrapped })
                    }
                }
                return res
            }
            items = flatten(data)
        } else {
            // Direct mapping (for Simple/Quest)
            for (const [key, raw] of Object.entries(data)) {
                if (key === '$meta' || key === '$key' || key === 'template') continue
                items.push({ $key: key, $raw: raw })
            }
        }
    }

    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:10px;">' + emptyText + '</div>'
        if (templateId === 'tmpl-grid' || templateId === 'tmpl-inventory') {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary);">' + emptyText + '</div>'
        }
        return
    }

    const tmpl = document.getElementById(templateId) as HTMLTemplateElement
    if (!tmpl) {
        console.error('Template not found:', templateId)
        return
    }

    // --- Pagination Logic (skip for Grid) ---
    const totalItems = items.length
    const totalPages = Math.ceil(totalItems / LIST_PAGE_SIZE)
    const isGrid = templateId === 'tmpl-grid' || templateId === 'tmpl-inventory'
    const needsPagination = !isGrid && totalItems > LIST_PAGE_SIZE

    const listPath = container.getAttribute('data-bind-list-fullpath') || container.getAttribute('data-bind-list') || ''
    const isQuestSource = listPath.includes('Quests') || listPath.includes('quest')

    // Get or initialize current page
    let currentPage = _listPageState.get(containerId) || 0
    // Clamp to valid range
    if (currentPage >= totalPages) currentPage = totalPages - 1
    if (currentPage < 0) currentPage = 0
    _listPageState.set(containerId, currentPage)

    // Calculate visible items
    const startIdx = needsPagination ? currentPage * LIST_PAGE_SIZE : 0
    const endIdx = needsPagination ? Math.min(startIdx + LIST_PAGE_SIZE, totalItems) : totalItems
    const visibleItems = items.slice(startIdx, endIdx)

    // 2. Iterate & Render visible items
    visibleItems.forEach(item => {
        let title = '', desc = '', qty = '', difficulty = '', reward = '', lastUpdated = '', status = '', objective = '', nextUnlock = '', step = ''

        // Extraction Logic
        if (shouldFlatten) {
            // Item is an object from flatten()
            const summary = getItemSummary(item)
            title = summary.name // Use name as title
            // qty
            let qVal = Number(summary.qty)
            if (!isNaN(qVal) && qVal >= 1) qty = 'x' + qVal

            // Try to find other fields (desc intentionally omitted: grid/inventory only shows $key)
            if (item.Difficulty !== undefined) difficulty = String(formatValue(item.Difficulty))
            else if (item.difficulty !== undefined) difficulty = String(formatValue(item.difficulty))
            if (item.Reward !== undefined) reward = String(formatValue(item.Reward))
            else if (item.reward !== undefined) reward = String(formatValue(item.reward))

            // NEW: Fallback for 'desc' if it's just a simple key-value pair and not an object with description
            if (!desc && item.quantity && typeof item.quantity === 'string' && item.quantity.length > 20) {
                // Maybe use value as desc if long? (Optional heuristic)
            }
        } else {
            // Item is { $key, $raw }
            const key = item.$key
            const raw = item.$raw

            title = key

            // Special Handling: If input was Array but items possess $key (from Builder)
            if (raw && typeof raw === 'object' && raw.$key) {
                title = raw.$key
            } else if (raw && typeof raw === 'object' && raw.customId) {
                // Fallback to custom Ids?
                // No, stick to $key parity.
            }

            if (isTuple(raw)) {
                title = tupleLabel(raw, title) // Use updated title
                desc = String(formatValue(tupleVal(raw)))
            } else {
                // Array/Object handling
                if (Array.isArray(data)) {
                    if (raw && typeof raw !== 'object') {
                        title = String(raw)
                    }
                }

                if (raw && typeof raw === 'object') {
                    // A NON-BLANK Title heads the card; a Zod prefault '' must read as absent, so blank → the key
                    const titleText = (raw as any).Title !== undefined ? String(formatValue((raw as any).Title)).trim() : ''
                    if (titleText) title = titleText
                    if (raw.Desc !== undefined) desc = String(formatValue(raw.Desc))
                    else if (raw.description !== undefined) desc = String(formatValue(raw.description))
                    else if (raw.name !== undefined) desc = String(formatValue(raw.name))
                    else if (raw.type !== undefined) desc = String(formatValue(raw.type))

                    if (raw.Difficulty !== undefined) difficulty = String(formatValue(raw.Difficulty))
                    else if (raw.difficulty !== undefined) difficulty = String(formatValue(raw.difficulty))
                    if (raw.Reward !== undefined) reward = String(formatValue(raw.Reward))
                    else if (raw.reward !== undefined) reward = String(formatValue(raw.reward))

                    if (templateId === 'tmpl-quest' && isQuestSource) {
                        if (raw.LastUpdated !== undefined) lastUpdated = String(formatValue(raw.LastUpdated))

                        if (raw.Status !== undefined) status = String(formatValue(raw.Status))
                        else if (raw.status !== undefined) status = String(formatValue(raw.status))
                        if ((raw as any).Objective !== undefined) objective = String(formatValue((raw as any).Objective)).trim()
                        if ((raw as any).NextUnlock !== undefined) nextUnlock = String(formatValue((raw as any).NextUnlock)).trim()
                        step = questStepLabel((raw as any).Step, (raw as any).StepMax)
                    }
                } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
                    desc = String(raw)
                }
            }
        }

        // Clone Template
        const clone = tmpl.content.cloneNode(true) as HTMLElement
        const rootEl = clone.firstElementChild as HTMLElement

        // Attach Click Handler for Modal (Option A)
        if (rootEl) {
            rootEl.style.cursor = 'pointer'
            const modalData = shouldFlatten ? item : (item.$raw || {})
            // Ensure global showModal exists or is intercepted
            rootEl.onclick = () => {
                if ((window as any).showModal) {
                    (window as any).showModal(title, modalData)
                } else {
                    console.warn('showModal not defined')
                }
            }
        }

        // Fill Slots
        const setSlot = (name: string, val: string) => {
            const el = (clone as any).querySelector(`[data-slot="${name}"]`)
            if (el) {
                if (val) {
                    el.textContent = val
                    el.style.display = '' // Unhide
                } else {
                    // Keep hidden
                }
            }
        }

        setSlot('title', title)
        setSlot('desc', desc)
        setSlot('name', title) // Alias
        setSlot('qty', qty)
        setSlot('difficulty', difficulty)
        setSlot('reward-text', reward)
        setSlot('LastUpdated', lastUpdated)
        setSlot('status', status)
        setSlot('objective', objective)
        setSlot('next-unlock', nextUnlock)
        setSlot('step', step)

        if (objective) {
            const objEl = (clone as any).querySelector(`[data-slot="objective-row"]`)
            if (objEl) objEl.style.display = 'block'
        }
        if (nextUnlock) {
            const nextEl = (clone as any).querySelector(`[data-slot="next-unlock-row"]`)
            if (nextEl) nextEl.style.display = 'block'
        }
        if (step) {
            const stepEl = (clone as any).querySelector(`[data-slot="step-row"]`)
            if (stepEl) stepEl.style.display = 'block'
        }

        if (status) {
            const stEl = (clone as any).querySelector(`[data-slot="status-row"]`)
            if (stEl) stEl.style.display = 'block'
        }

        if (lastUpdated) {
            const luEl = (clone as any).querySelector(`[data-slot="last-updated-row"]`)
            if (luEl) luEl.style.display = 'block'
        }

        if (reward) {
            const rewardEl = (clone as any).querySelector(`[data-slot="reward"]`)
            if (rewardEl) rewardEl.style.display = 'block'
        }

        // Row verbs are the exported runtime's (rt_listRenderer renderRowActions); the preview draws none.
        container.appendChild(clone)
    })

    // 3. Add Pagination Controls if needed
    if (needsPagination) {
        const paginationBar = document.createElement('div')
        paginationBar.className = 'list-pagination-bar'
        paginationBar.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 4px; margin-top:8px; border-top:1px solid var(--border-color);'

        // Previous Button
        const prevBtn = document.createElement('button')
        prevBtn.textContent = '<'
        prevBtn.className = 'pager-btn'
        if (currentPage === 0) {
            prevBtn.disabled = true
            prevBtn.style.opacity = '0.3'
        }
        prevBtn.onclick = (e) => {
            e.stopPropagation()
            if (currentPage > 0) {
                _listPageState.set(containerId, currentPage - 1)
                renderTemplateList(container, data, templateId, emptyText, shouldFlatten)
            }
        }

        // Page Indicator
        const pageIndicator = document.createElement('span')
        pageIndicator.style.cssText = 'color:var(--text-secondary); font-size:0.85em;'
        pageIndicator.textContent = (currentPage + 1) + ' / ' + totalPages

        // Next Button
        const nextBtn = document.createElement('button')
        nextBtn.textContent = '>'
        nextBtn.className = 'pager-btn'
        if (currentPage >= totalPages - 1) {
            nextBtn.disabled = true
            nextBtn.style.opacity = '0.3'
        }
        nextBtn.onclick = (e) => {
            e.stopPropagation()
            if (currentPage < totalPages - 1) {
                _listPageState.set(containerId, currentPage + 1)
                renderTemplateList(container, data, templateId, emptyText, shouldFlatten)
            }
        }

        paginationBar.appendChild(prevBtn)
        paginationBar.appendChild(pageIndicator)
        paginationBar.appendChild(nextBtn)
        container.appendChild(paginationBar)
    }
}

