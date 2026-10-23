import { ref, computed } from 'vue'
import { EXPORT_CSS_CONTENT } from '../utils/sharedStyles'

// -- Types --
export type CardType = 'StatRow' | 'StatBar' | 'Image' | 'RichText' | 'QuestList' | 'GridContainer' | 'Checkbox' | 'ActionButton'

// A verb every row of a list offers (D8). What it NEEDS from the player is not declared here — the
// engine answers that at click time (inputs.<name>) — so the layout says WHICH verbs, never WHAT.
export interface RowActionConfig {
    title: string                    // the button's label
    action: string                   // the StatusMenu Engine action a click posts (actions.<name>)
    args?: Record<string, unknown>   // static JSON riding under the row's own listPath / itemKey
    confirm?: boolean | string       // presentation: ask first — true for a generic question, or the text ({itemKey} substituted)
}

export interface CardConfig {
    id: string
    type: CardType
    title: string
    mappedKey?: string
    customId?: string // User-defined ID for DOM/Scripts
    staticValue?: string // For RichText or fallback
    cards?: CardConfig[] // For nested containers (GridContainer)
    layoutMode?: 'list' | 'grid' // For GridContainer
    maxMappedKey?: string // For StatBar (Max Value)
    barColor?: string // For StatBar (e.g. 'red', 'green', 'blue')
    width?: number // Percentage width (e.g. 33, 50, 100)
    scale?: number // Font scale (e.g. 1.0, 1.2, 0.8)
    imageScale?: number // For Image cards (e.g. 100, 80, 120)
    sourceType?: 'variable' | 'lorebook' // Defaults to 'variable'
    lorebookKey?: string // Key to search if sourceType is 'lorebook'
    listType?: 'simple' | 'grid' | 'quest' | 'inventory' | 'equipment-action' | 'custom' // For QuestList/GenericList types
    customTemplateName?: string // For custom list templates (tmpl-custom-{name})
    customLogic?: string // User-defined JavaScript logic
    collapsed?: boolean // For QuestList: start collapsed by default
    allowEdit?: boolean // For QuestList: allow editing items in detail modal
    allowDelete?: boolean // For QuestList: allow deleting items from the list
    isReadOnly?: boolean // For Checkbox: the player sees the value but cannot toggle it (no write); default false
    action?: string // For ActionButton: the StatusMenu Engine action a click invokes (actions.<name>)
    args?: Record<string, unknown> // Static JSON posted with an action: an ActionButton's own click, or every action a QuestList's rows post (delete/edit/row verbs); the renderer adds scopePath
    rowActions?: RowActionConfig[] // For QuestList: the verbs every row offers (D8); the delete button stays the allowDelete flag
}

export interface BlockConfig {
    id: string
    title: string
    mappedKey?: string // For looping over a collection (e.g. "Familiar" or "Inventory")
    customId?: string // User-defined ID
    layoutMode?: 'list' | 'grid'
    width?: number // Percentage width
    scale?: number // Font scale
    continuation?: boolean // If true, merge visually into the previous block (no own card border/header)
    pageSize?: number // Items per page for collection blocks (default 5)
    showQuickJump?: boolean // Show dropdown selector for quick navigation in pagination bar
    cards: CardConfig[]
}

export interface TabConfig {
    id: string
    name: string
    containerWidth?: number
    containerWidthUnit?: 'px' | '%'
    blocks: BlockConfig[]
}

// -- State --
const layout = ref<TabConfig[]>([
    {
        id: 'tab-1',
        name: 'Overview',
        containerWidth: 50,
        containerWidthUnit: '%',
        blocks: []
    }
])

const activeTabId = ref<string>('tab-1')
const mvuDataRaw = ref<string>('')
const mvuDataParsed = ref<any>(null)
const clipboard = ref<any>(null)
const activeMenuId = ref<string | null>(null)
const selectedPaths = ref<Set<string>>(new Set())
const collectionPaths = ref<Set<string>>(new Set())
const lockedPaths = ref<Set<string>>(new Set())
const lockTopLevel = ref<boolean>(false)
const customTemplates = ref<Array<{ name: string, html: string }>>([])
const globalCss = ref<string>(EXPORT_CSS_CONTENT)

export const DEFAULT_STATIC_LOCALE: Record<string, string> = {
    empty_none: "None",
    empty_quest: "No active quests",
    empty_skills: "No skills learned",
    empty_equipped: "Nothing equipped",
    empty_inventory: "Empty inventory",
    header_kin_stats: "Status Attributes",
    header_core_status: "Core Status"
}

const staticLocale = ref<Record<string, string>>({ ...DEFAULT_STATIC_LOCALE })

// The Logic tab is RETIRED (B4/D6, 2026-08-28). `globalLogic` is gone with it: shared menu
// logic lives in the StatusMenu Engine (a workspace source file), not in an iframe-realm bake.
// A saved project still carrying the key imports clean — ignored, never migrated (BV16).

// -- Getters --
const activeTab = computed(() => layout.value.find(t => t.id === activeTabId.value))

// Helper to check if an object looks like a collection (Array or Map of same-shaped objects)
// Helper to check if a value looks like an MVU Entity (Record with labeled tuples)
export const isMvuEntity = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false
    const vals = Object.values(obj)
    if (vals.length === 0) return true

    // Check for MVU Tuples [val, label]
    if (vals.some(v => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string')) return true

    // Check for primitives (less likely for nested entities but possible)
    if (vals.some(v => v !== null && typeof v !== 'object')) return true

    return false
}

// Helper to check if an object looks like a collection (Array or Map of same-shaped objects)
export const isCollection = (obj: any): boolean => {
    if (Array.isArray(obj)) {
        // FIRST: Check if this is a labeled tuple [value, label]
        // This must come BEFORE the simple list check!
        if (obj.length === 2 && typeof obj[1] === 'string') return false

        // If array of strings/numbers, it's a simple list
        if (obj.length > 0 && typeof obj[0] !== 'object') return true

        return true
    }
    if (!obj || typeof obj !== 'object') return false

    const values = Object.values(obj)
    if (values.length === 0) return false // Empty object

    const first = values[0]

    // CRITICAL FIX: If the first child is an ARRAY (Tuple), then 'obj' is a Record of Tuples (like Mainchar).
    // do NOT treat it as a collection.
    if (Array.isArray(first)) return false

    // If the FIRST child looks like an MVU Entity (and is NOT an array/tuple), then THIS object is a Collection of Entities
    if (values.length > 0 && isMvuEntity(first)) {
        return true
    }

    // Fallback: Check for schema overlap roughly
    if (values.length >= 2) {
        const v1 = values[0]
        const v2 = values[1]

        if (isMvuEntity(v1)) return false // Should have been caught above if true collection (or rejected if tuple)

        // If children are objects and share keys
        if (v1 && typeof v1 === 'object' && v2 && typeof v2 === 'object') {
            const keys1 = Object.keys(v1)
            const keys2 = Object.keys(v2)
            const overlap = keys1.filter(k => keys2.includes(k))
            return overlap.length > 0
        }
    }

    return false
}

const flatKeys = computed(() => {
    if (!mvuDataParsed.value) return []

    const keys: string[] = []

    // Helper to extract merged schema from a list of objects
    const getSchemaKeys = (objects: any[], prefix: string) => {
        const allKeys = new Set<string>()
        objects.forEach(o => {
            if (o && typeof o === 'object') {
                Object.keys(o).forEach(k => allKeys.add(k))
            }
        })

        for (const k of allKeys) {
            const fullKey = prefix ? `${prefix}.${k}` : k
            keys.push(fullKey)

            // Collect values for this key to see if we need to recurse
            const childValues = objects.map(o => o?.[k]).filter(v => v && typeof v === 'object')

            // Skip labeled tuples [value, label] - we don't need .0 and .1 indices
            const firstChild = childValues[0]
            const isLabeledTuple = Array.isArray(firstChild) && firstChild.length === 2 && typeof firstChild[1] === 'string'

            // If we have child objects (and they're not tuples), recurse schema extraction
            if (childValues.length > 0 && !isLabeledTuple) {
                getSchemaKeys(childValues, fullKey)
            }
        }
    }

    const traverse = (obj: any, prefix = '') => {
        // CRITICAL: Never treat root level as a collection - it should always
        // enumerate top-level keys like 'World', 'Mainchar' separately
        if (prefix && isCollection(obj)) {
            // It's a collection (but NOT at root level)!

            // Extract schema from items
            const items = Array.isArray(obj) ? obj : Object.values(obj)
            getSchemaKeys(items, prefix)

            // Stop recursion (don't add specific IDs like "Engni")
            return
        }

        // Standard traversal for non-collections
        for (const k in obj) {
            const val = obj[k]
            const newKey = prefix ? `${prefix}.${k}` : k

            keys.push(newKey)

            // Don't recurse into labeled tuples [value, label] - we don't need .0 and .1 indices
            const isLabeledTuple = Array.isArray(val) && val.length === 2 && typeof val[1] === 'string'

            if (val && typeof val === 'object' && !isLabeledTuple) {
                traverse(val, newKey)
            }
        }
    }

    traverse(mvuDataParsed.value)
    return keys
})

// -- Actions --
function addTab(name: string = 'New Page') {
    const id = `tab-${Date.now()}`
    layout.value.push({
        id,
        name,
        containerWidth: 50,
        containerWidthUnit: '%',
        blocks: []
    })
    activeTabId.value = id
}

function removeTab(id: string) {
    const idx = layout.value.findIndex(t => t.id === id)
    if (idx !== -1) {
        layout.value.splice(idx, 1)
        if (activeTabId.value === id) {
            activeTabId.value = layout.value[0]?.id || ''
        }
    }
}

function addBlock(tabId: string) {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const id = `blk-${Date.now()}`
        tab.blocks.push({
            id,
            title: 'New Block',
            width: 100,
            layoutMode: 'list',
            cards: []
        })
        return id
    }
    return null
}

function addBlockWithGridGroup(tabId: string) {
    const blockId = addBlock(tabId)
    if (blockId) {
        // Find the block we just added (redundant but safe)
        const tab = layout.value.find(t => t.id === tabId)
        const block = tab?.blocks.find(b => b.id === blockId)
        if (block) {
            block.title = 'New Grid Group' // Auto-name it
            block.cards.push({
                id: `crd-${Date.now()}`,
                type: 'GridContainer',
                title: 'Main Group',
                width: 100,
                layoutMode: 'list',
                sourceType: 'variable',
                mappedKey: '',
                cards: []
            })
        }
    }
}

function removeBlock(tabId: string, blockId: string) {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const idx = tab.blocks.findIndex(b => b.id === blockId)
        if (idx !== -1) {
            tab.blocks.splice(idx, 1)
        }
    }
}

function addBlockAfter(tabId: string, afterBlockId: string) {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const idx = tab.blocks.findIndex(b => b.id === afterBlockId)
        if (idx !== -1) {
            const id = `blk-${Date.now()}`
            tab.blocks.splice(idx + 1, 0, {
                id,
                title: 'New Block',
                width: 100,
                layoutMode: 'list',
                cards: []
            })
            return id
        }
    }
    return null
}

function addCard(tabId: string, blockId: string, type: CardType = 'StatRow') {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const block = tab.blocks.find(b => b.id === blockId)
        if (block) {
            block.cards.push({
                id: `crd-${Date.now()}`,
                type,
                title: type === 'StatRow' ? 'Stat Name' : type === 'ActionButton' ? 'Action' : 'Card Title',
                width: 100,
                imageScale: type === 'Image' ? 100 : undefined,
                sourceType: 'variable',
                layoutMode: type === 'GridContainer' ? 'list' : undefined,
                mappedKey: '',
                action: type === 'ActionButton' ? '' : undefined,
                args: type === 'ActionButton' ? {} : undefined,
            })
        }
    }
}

function updateCard(tabId: string, blockId: string, cardId: string, updates: Partial<CardConfig>) {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const block = tab.blocks.find(b => b.id === blockId)
        if (block) {
            const card = block.cards.find(c => c.id === cardId)
            if (card) {
                Object.assign(card, updates)
            }
        }
    }
}

// Recursively find a card and its parent list
function findCardRecursive(cards: CardConfig[], targetId: string): { found: CardConfig, parentList: CardConfig[] } | null {
    for (const card of cards) {
        if (card.id === targetId) {
            return { found: card, parentList: cards }
        }
        if (card.cards) {
            const res = findCardRecursive(card.cards, targetId)
            if (res) return res
        }
    }
    return null
}

function removeCard(tabId: string, blockId: string, cardId: string) {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const block = tab.blocks.find(b => b.id === blockId)
        if (block) {
            const res = findCardRecursive(block.cards, cardId)
            if (res) {
                const idx = res.parentList.indexOf(res.found)
                if (idx !== -1) {
                    res.parentList.splice(idx, 1)
                }
            }
        }
    }
}

function addNestedCard(tabId: string, blockId: string, parentCardId: string, type: CardType = 'StatRow') {
    const tab = layout.value.find(t => t.id === tabId)
    if (tab) {
        const block = tab.blocks.find(b => b.id === blockId)
        if (block) {
            const res = findCardRecursive(block.cards, parentCardId)
            if (res && res.found) {
                if (!res.found.cards) res.found.cards = []
                res.found.cards.push({
                    id: `crd-${Date.now()}`,
                    type,
                    title: type === 'StatRow' ? 'Nested Stat' : type === 'GridContainer' ? 'Sub Group' : 'Card Title',
                    width: 100,
                    imageScale: type === 'Image' ? 100 : undefined,
                    sourceType: 'variable',
                    layoutMode: type === 'GridContainer' ? 'list' : undefined,
                    mappedKey: ''
                })
            }
        }
    }
}

function setMvuData(json: string) {
    mvuDataRaw.value = json
    try {
        mvuDataParsed.value = JSON.parse(json)
        pruneOrphanedSelectedPaths()
    } catch (e) {
        console.error("Invalid JSON", e)
        mvuDataParsed.value = null
    }
}

// Remove selectedPaths entries whose path no longer exists in mvuDataParsed.
// Paths are dot-prefixed like ".Partner.Hana.Trust" or ".Partner.Hana.Trust.0"
function pruneOrphanedSelectedPaths() {
    const data = mvuDataParsed.value
    if (!data || selectedPaths.value.size === 0) return
    const toDelete: string[] = []
    for (const path of selectedPaths.value) {
        const parts = path.replace(/^\./, '').split('.')
        let current: any = data
        let valid = true
        for (const part of parts) {
            if (current != null && typeof current === 'object' && part in current) {
                current = current[part]
            } else {
                valid = false
                break
            }
        }
        if (!valid) toDelete.push(path)
    }
    for (const p of toDelete) selectedPaths.value.delete(p)
}

// Logic to retrieve values for preview
// Returns { value: string, label: string }
function resolveValue(key: string, source: any = mvuDataParsed.value): { value: any, label: string } {
    if (!source || !key) return { value: '???', label: 'Label' }

    // Key might be "Mainchar.Strength" OR just "Strength" if source is a nested object
    // In mvu.json, keys might map to arrays like [15, "Strength"]

    const parts = key.split('.')
    let current = source

    for (const part of parts) {
        if (current && current[part] !== undefined) {
            current = current[part]
        } else {
            return { value: '???', label: key }
        }
    }

    // If result is array [val, label]
    if (Array.isArray(current) && current.length >= 2) {
        return { value: current[0], label: current[1] }
    }

    return { value: current, label: key }
}

function checkBlockMapping(tabId: string, blockId: string, key: string) {
    if (!key) return
    const tab = layout.value.find(t => t.id === tabId)
    if (!tab) return
    const block = tab.blocks.find(b => b.id === blockId)
    if (!block) return

    // NEW LOGIC: Use collectionPaths from Schema to determine if this field belongs to a collection
    // Special case: If a collection is nested inside a non-collection (singleton), use the singleton
    // Example: Mainchar.Equipment → loop at "Mainchar" level (singleton), not "Mainchar.Equipment"
    
    const parts = key.split('.')
    
    // Check from longest to shortest path to find the collection parent
    // NOTE: collectionPaths stores paths with leading "." (e.g. ".Familiar", ".Mainchar.Equipment")
    for (let i = parts.length; i >= 1; i--) {
        const testPath = parts.slice(0, i).join('.')
        const testPathWithDot = '.' + testPath
        if (collectionPaths.value.has(testPathWithDot)) {
            // Found a collection - now check if its parent is a non-collection (singleton)
            if (i > 1) {
                const parentPath = parts.slice(0, i - 1).join('.')
                const parentPathWithDot = '.' + parentPath
                
                // If parent exists and is NOT a collection → use parent (singleton) instead
                if (!collectionPaths.value.has(parentPathWithDot)) {
                    block.mappedKey = parentPath
                    return
                }
            }
            
            // Otherwise use the collection itself (top-level collection like "Familiar")
            block.mappedKey = testPath
            return
        }
    }
    
    // No collection parent found → set to Global
    block.mappedKey = ""
}

// -- Custom Template Actions --
function addCustomTemplate(name: string, html: string) {
    if (customTemplates.value.find(t => t.name === name)) return // already exists
    customTemplates.value.push({ name, html })
}

function removeCustomTemplate(name: string) {
    const idx = customTemplates.value.findIndex(t => t.name === name)
    if (idx !== -1) customTemplates.value.splice(idx, 1)
}

function updateCustomTemplate(name: string, html: string) {
    const tmpl = customTemplates.value.find(t => t.name === name)
    if (tmpl) tmpl.html = html
}

// Check if any card in the entire layout still references this template name
function isTemplateInUse(name: string): boolean {
    function checkCards(cards: CardConfig[]): boolean {
        for (const card of cards) {
            if (card.customTemplateName === name) return true
            if (card.cards && checkCards(card.cards)) return true
        }
        return false
    }
    for (const tab of layout.value) {
        for (const block of tab.blocks) {
            if (checkCards(block.cards)) return true
        }
    }
    return false
}

// Remove a template only if no card in the layout references it
function cleanupOrphanedTemplate(name: string) {
    if (!name) return
    if (!isTemplateInUse(name)) {
        removeCustomTemplate(name)
    }
}

function generateStarterTemplate(mappedKey: string): string {
    if (!mappedKey || !flatKeys.value.length) {
        return `<div style="padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
    <span style="font-weight:bold;" data-bind="$key"></span>
</div>`
    }
    // Find sub-fields: keys that start with mappedKey + '.'
    const prefix = mappedKey + '.'
    const subFields = flatKeys.value
        .filter(k => k.startsWith(prefix))
        .map(k => k.substring(prefix.length))
        .filter(k => !k.includes('.')) // Only direct children

    let fieldsHtml = subFields.map(f =>
        `    <div style="font-size:0.85em; color:var(--text-secondary);">\n        <span data-bind="${f}"></span>\n    </div>`
    ).join('\n')

    return `<div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:4px; margin-bottom:8px; border-left:3px solid var(--accent-primary); cursor:pointer;">
    <div style="font-weight:bold; color:var(--text-primary);">
        <span data-bind="$key"></span>
    </div>
${fieldsHtml}
</div>`
}

export function useBuilderState() {
    return {
        layout,
        activeTabId,
        activeTab,
        mvuDataRaw,
        mvuDataParsed,
        clipboard,
        activeMenuId,
        selectedPaths,
        collectionPaths,
        lockedPaths,
        lockTopLevel,
        customTemplates,
        globalCss,
        staticLocale,
        flatKeys,
        addTab,
        removeTab,
        addBlock,
        addBlockAfter,
        addBlockWithGridGroup,
        removeBlock,
        addCard,
        addNestedCard,
        updateCard,
        removeCard,
        setMvuData,
        // Everything an exporter needs, assembled in ONE place. A caller that lists the fields
        // itself silently drops whatever it forgets — which is how the pack export ran its
        // formatter checks against no sample state at all.
        projectSnapshot: () => ({
            layout: layout.value,
            globalCss: globalCss.value,
            staticLocale: staticLocale.value,
            collectionPaths: Array.from(collectionPaths.value),
            customTemplates: customTemplates.value,
            mvuDataParsed: mvuDataParsed.value,
        }),
        resolveValue,
        isCollection,
        checkBlockMapping,
        addCustomTemplate,
        removeCustomTemplate,
        updateCustomTemplate,
        generateStarterTemplate,
        isTemplateInUse,
        cleanupOrphanedTemplate,
        exportConfig: () => {
            const exportData = {
                layout: layout.value,
                mvuData: mvuDataRaw.value,
                // Schema selections
                selectedPaths: Array.from(selectedPaths.value),
                collectionPaths: Array.from(collectionPaths.value),
                lockedPaths: Array.from(lockedPaths.value),
                lockTopLevel: lockTopLevel.value,
                customTemplates: customTemplates.value,
                globalCss: globalCss.value,
                staticLocale: staticLocale.value,
            }
            return JSON.stringify(exportData, null, 2)
        },
        importConfig: (json: string) => {
            try {
                const parsed = JSON.parse(json)

                // Support legacy format (just array) or new format (object)
                let newLayout = parsed
                let newData = ''

                if (!Array.isArray(parsed) && parsed.layout) {
                    newLayout = parsed.layout
                    newData = parsed.mvuData || ''
                }

                if (Array.isArray(newLayout) && newLayout.every((t: any) => t.id && t.blocks)) {
                    layout.value = newLayout as TabConfig[]
                    activeTabId.value = newLayout[0]?.id || ''

                    if (newData) {
                        setMvuData(newData)
                    }

                    // Restore schema selections
                    if (Array.isArray(parsed.selectedPaths)) {
                        selectedPaths.value = new Set(parsed.selectedPaths)
                    }
                    if (Array.isArray(parsed.collectionPaths)) {
                        collectionPaths.value = new Set(parsed.collectionPaths)
                    }
                    if (Array.isArray(parsed.lockedPaths)) {
                        lockedPaths.value = new Set(parsed.lockedPaths)
                    }
                    if (typeof parsed.lockTopLevel === 'boolean') {
                        lockTopLevel.value = parsed.lockTopLevel
                    }
                    if (Array.isArray(parsed.customTemplates)) {
                        customTemplates.value = parsed.customTemplates
                    }

                    if (parsed.globalCss && typeof parsed.globalCss === 'string') {
                        globalCss.value = parsed.globalCss
                    } else {
                        globalCss.value = EXPORT_CSS_CONTENT // Reset to default if missing
                    }

                    if (parsed.staticLocale && typeof parsed.staticLocale === 'object') {
                        staticLocale.value = { ...DEFAULT_STATIC_LOCALE, ...parsed.staticLocale }
                    } else {
                        staticLocale.value = { ...DEFAULT_STATIC_LOCALE } // Reset to default if missing
                    }


                    return true
                }
                return false
            } catch (e) {
                console.error('Import failed', e)
                return false
            }
        }
    }
}
