<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilderState, type CardConfig } from '../composables/useBuilderState'
import HtmlListRenderer from './HtmlListRenderer.vue'

const props = defineProps<{
    card: CardConfig
    context?: any
    blockKey?: string
    index?: number // Absolute index if in a list
}>()

const { isCollection, resolveValue, customTemplates, mvuDataParsed } = useBuilderState()

// -- Helpers --

function renderNested(val: any): string {
    if (val === null || val === undefined) return ''
    if (typeof val !== 'object') return String(val)
    
    // Arrays
    if (Array.isArray(val)) {
        return val.map(v => {
            if (typeof v === 'object') return JSON.stringify(v)
            return v
        }).join(', ')
    }

    // Objects
    const keys = Object.keys(val)
    // Heuristic: if small number of keys, show k:v
    if (keys.length <= 3) {
        return keys.map(k => `${k}: ${val[k]}`).join(', ')
    }
    // Simple comma list of keys if values are complex objects
    return keys.join(', ')
}

// Helper to execute custom logic for preview
function executeCustomLogic(card: CardConfig, context: any): any {
    if (!card.customLogic) return undefined
    
    try {
        // Mocking the runtime environment
        // We need to provide a minimal set of helpers: getV, getL, stat, root, itemKey, _

        // 1. Prepare Data — what the live formatter is handed. Inside a collection block the
        //    preview's item carries a `$key` marker the stored item does not, so `stat` drops it and
        //    the key arrives as `itemKey`, exactly as the engine's itemKeyOf reads it off the item's
        //    path. Anywhere else `itemKey` is undefined.
        const isCollectionItem = !!context && typeof context === 'object' && !Array.isArray(context) && '$key' in context
        const itemKey = isCollectionItem ? context.$key : undefined
        const stat = isCollectionItem
            ? Object.fromEntries(Object.entries(context).filter(([k]) => k !== '$key'))
            : (context || {})
        const root = mvuDataParsed.value || {}
        
        // 2. Mock _ (Lodash) - Minimal subset or just null if not available in builder
        const _ = null 

        // 3. Mock Helpers
        const getRaw = (obj: any, path: string, def: any) => {
             if (!obj) return def
             const parts = path.split('.')
             let cur = obj
             for (const p of parts) {
                 if (cur === undefined || cur === null) return def
                 cur = cur[p]
             }
             return (cur === undefined || cur === null) ? def : cur
        }

        const getV = (obj: any, path: string, def: any) => {
             const val = getRaw(obj, path, def)
             if (Array.isArray(val) && val.length >= 2 && typeof val[1] === 'string') return val[0]
             return val
        }

        const getL = (obj: any, path: string, def: any) => {
             const val = getRaw(obj, path, def)
             if (Array.isArray(val) && val.length >= 2 && typeof val[1] === 'string') return val[1]
             return def
        }

        // 4. Construct Function
        // We wrap in a try-catch block inside the function to ensure it returns something safe
        const userFn = new Function('stat', 'getV', 'getL', 'getRaw', '_', 'el', 'root', 'itemKey', `
            let _output = undefined;
            ${card.customLogic}
            return _output;
        `)

        // 5. Execute
        // 'el' is null in preview (we don't want them manipulating DOM here)
        return userFn(stat, getV, getL, getRaw, _, null, root, itemKey)

    } catch (e) {
        console.warn("Preview Logic Error:", e)
        return `(Logic Error: ${e})`
    }
}

function resolveCardValue(key: string, context: any, blockKey: string = '', sourceType: string = 'variable', loreKey: string = '', card?: CardConfig) {
    // 0. Custom Logic Takeover
    if (card && card.customLogic && ['StatRow', 'Image', 'RichText'].includes(card.type)) {
        // We use the root context (mvuDataParsed) if available, or the passed context
        // In Builder, 'context' passed to CardRenderer is usually the *Block* context (item) if inside a list,
        // OR standard mvuDataParsed if global.
        
        const result = executeCustomLogic(card, context)
        if (result !== undefined) {
             return { value: result, label: card.title || 'Dynamic' }
        }
    }

    // 0.1 Lorebook Handling
    if (sourceType === 'lorebook') {
        if (!loreKey) return { value: '(No Key)', label: 'Lorebook' }
        // In Builder Preview, we return placeholders
        return { 
            value: `(Content of '${loreKey}')`, 
            label: loreKey,
            isLorebook: true,
            loreKey: loreKey 
        }
    }

    if (!context) return resolveValue(key)
    
    // 1. Try path relative to blockKey (for collections/arrays)
    if (blockKey && key.startsWith(blockKey)) {
        let relative = key.slice(blockKey.length)
        if (relative.startsWith('.')) relative = relative.slice(1)

        // If key is exactly blockKey, return the item itself
        if (!relative) {
             if (Array.isArray(context) && context.length >= 2) {
                 return { value: context[0], label: context[1] }
             }
             return { value: context, label: key }
        }

        // Resolve relative path against context
        const parts = relative.split('.')
        let current = context
        let valid = true
        for (const p of parts) {
            if (current && current[p] !== undefined) {
                current = current[p]
            } else {
                valid = false
                break
            }
        }

        if (valid) {
             let val = current
             if (Array.isArray(val) && val.length >= 2) {
                 return { value: val[0], label: val[1] }
             }
             return { value: val, label: parts[parts.length - 1] }
        }
    }
    
    // 2. Heuristic: try to find the property by the last part of the key
    const parts = key.split('.')
    const leaf = parts[parts.length - 1]

    if (leaf && context && context[leaf] !== undefined) {
        let val = context[leaf]
        if (Array.isArray(val) && val.length >= 2) {
             return { value: val[0], label: val[1] }
        }
        return { value: val, label: leaf }
    }
    
    // Fallback: try standard resolution
    // STRICT SCOPING FIX: If blockKey is present, we DO NOT fall back to global.
    if (blockKey) {
        return { value: '???', label: key }
    }
    
    return resolveValue(key)
}

function getList(key: string, context?: any, blockKey?: string) {
    let res: any = null

    // 1. Try resolving relative to context first
    if (context && blockKey && key.startsWith(blockKey)) {
        let relative = key.slice(blockKey.length)
        if (relative.startsWith('.')) relative = relative.slice(1)

        // Find property relative to context
        if (relative && context[relative] !== undefined) {
             res = context[relative]
        } else {
             // Deep dive if needed (simple implementation for now)
            const parts = relative.split('.')
            let current = context
            let valid = true
            for (const p of parts) {
                if (current && current[p] !== undefined) {
                    current = current[p]
                } else {
                    valid = false
                    break
                }
            }
            if (valid) res = current
        }
    }

    // 2. Fallback to global resolution
    if (!res) {
         // STRICT SCOPING FIX: If blockKey is present, do NOT check global.
         if (blockKey) {
             return []
         }
         res = resolveValue(key).value
    }

    if (Array.isArray(res)) return res
    // Only treat object as list if it PASSES isCollection check
    if (res && typeof res === 'object' && isCollection(res)) {
        // Map object to array but preserve keys for display
        return Object.entries(res)
            .filter(([k]) => k !== '$key' && k !== '$meta' && k !== 'template')
            .map(([k, v]) => {
            if (typeof v === 'object' && v !== null) {
                return { $key: k, ...(v as object) }
            }
            return { $key: k, value: v }
        })
    }
    return []
}

// -- Pagination State (Local per card instance) --
const page = ref(0)
// expandedItems removed

// Compute items per page based on layout
const itemsPerPage = computed(() => {
    if (props.card.type === 'QuestList' && props.card.layoutMode === 'grid') return 20
    return 5
})

const listItems = computed(() => {
    // Only applicable for QuestList
    if (props.card.type !== 'QuestList') return []
    return getList(props.card.mappedKey || '', props.context, props.blockKey)
})

const visibleItems = computed(() => {
    const list = listItems.value
    const start = page.value * itemsPerPage.value
    return list.slice(start, start + itemsPerPage.value)
})

const totalPages = computed(() => {
    const list = listItems.value
    return Math.ceil(list.length / itemsPerPage.value)
})

function nextPage() {
    if (page.value < totalPages.value - 1) page.value++
}

function prevPage() {
    if (page.value > 0) page.value--
}

// -- Custom Template Rendering --
function getCustomTemplateHtml(name: string): string | null {
    const tmpl = customTemplates.value.find(t => t.name === name)
    return tmpl ? tmpl.html : null
}

function renderCustomItem(html: string, item: any): string {
    // Build a flat field map from the item's data
    const fieldMap: Record<string, string> = { '$key': item.$key || '' }
    const raw = item
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) {
            if (k === '$meta' || k === '$key') continue
            const val = v as any
            // Handle MVU tuples [value, label]
            if (Array.isArray(val) && val.length >= 2 && typeof val[1] === 'string') {
                fieldMap[k] = String(val[0])
            } else if (val !== null && val !== undefined) {
                fieldMap[k] = typeof val === 'object' ? JSON.stringify(val) : String(val)
            }
        }
    }
    
    // Replace data-bind content using regex on the HTML string
    // This creates a rendered version by inserting text content into spans with data-bind
    let rendered = html
    // For each data-bind="fieldName", insert the value as text content
    rendered = rendered.replace(/(<[^>]*data-bind="([^"]+)"[^>]*>)(.*?)(<\/[^>]+>)/gs, (_match, openTag, field, _content, closeTag) => {
        const value = fieldMap[field] !== undefined ? fieldMap[field] : ''
        return openTag + value + closeTag
    })
    return rendered
}

function isImageUrl(val: any): boolean {
    if (typeof val !== 'string') return false
    const s = val.toLowerCase()
    return s.startsWith('http') && (
        s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || 
        s.endsWith('.gif') || s.endsWith('.webp') 
    )
}

function getEffectiveId(c: any) {
    if (c.customId) {
        return props.index !== undefined ? `${c.customId}-${props.index}` : c.customId
    }
    if (!c.mappedKey) return undefined
    const base = c.mappedKey.replace(/\./g, '-')
    return props.index !== undefined ? `${base}-${props.index}` : base
}

function getBarPercent(card: CardConfig, context: any, blockKey: string = '') {
    const curVal = resolveCardValue(card.mappedKey || '', context, blockKey).value
    const maxVal = resolveCardValue(card.maxMappedKey || '', context, blockKey).value
    
    const cur = parseFloat(curVal) || 0
    const max = parseFloat(maxVal) || 100
    
    if (max <= 0) return 0
    let pct = (cur / max) * 100
    if (pct > 100) pct = 100
    if (pct < 0) pct = 0
    return pct
}


</script>

<template>
    <div class="card-renderer-wrapper" :style="{ fontSize: (card.scale ? card.scale + 'em' : undefined) }">
        <!-- 1. StatRow -->
        <div v-if="card.type === 'StatRow'" class="prop-row">
            <span class="prop-label">{{ card.title || resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey, card).label }}</span>
            <div class="prop-val-container">
                <img v-if="isImageUrl(resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey, card).value)" 
                     :src="resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey, card).value" 
                     class="row-img-preview" 
                     :id="getEffectiveId(card)" 
                />
                <span v-else class="prop-val" :id="getEffectiveId(card)"
                      v-html="renderNested(resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey, card).value)">
                </span>
            </div>
        </div>

        <!-- 1.5 StatBar (HP Bar) -->
        <div v-else-if="card.type === 'StatBar'" class="stat-bar-card" :id="getEffectiveId(card)">
            <div class="stat-bar-header">
                <span class="stat-bar-label">
                     {{ card.title || resolveCardValue(card.mappedKey || '', context, blockKey).label }}
                </span>
                <span class="stat-bar-val">
                    {{ resolveCardValue(card.mappedKey || '', context, blockKey).value }} 
                    / 
                    {{ resolveCardValue(card.maxMappedKey || '', context, blockKey).value }}
                </span>
            </div>
            <div class="stat-bar-track">
                <div 
                    :class="['stat-bar-fill', `bar-${card.barColor || 'default'}`]" 
                    :style="{ 
                        width: getBarPercent(card, context, blockKey) + '%'
                    }"
                ></div>
            </div>
        </div>

        <!-- 1.8 Checkbox -->
        <div v-else-if="card.type === 'Checkbox'" class="prop-row">
             <label class="prop-label" :for="getEffectiveId(card)" style="cursor: pointer;">
                {{ card.title || resolveCardValue(card.mappedKey || '', context, blockKey).label }}
             </label>
             <div class="checkbox-display">
                 <input 
                    type="checkbox" 
                    :id="getEffectiveId(card)"
                    :checked="resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey).value == 'true' || resolveCardValue(card.mappedKey || '', context, blockKey, card.sourceType, card.lorebookKey).value === true"
                    :disabled="card.isReadOnly"
                    class="st-checkbox"
                 />
             </div>
        </div>

        <!-- 1.9 ActionButton — the preview draws the button; only an exported menu can post the action -->
        <div v-else-if="card.type === 'ActionButton'" class="prop-row action-row">
            <button type="button" class="menu-action-btn" :id="getEffectiveId(card)"
                    :title="card.action ? 'actions.' + card.action : 'no action named yet'">
                {{ card.title || card.action || 'Action' }}
            </button>
        </div>

        <!-- 2. Image -->
        <div v-else-if="card.type === 'Image'" class="image-card" :id="getEffectiveId(card)">
            <div v-if="card.sourceType === 'lorebook'" class="lorebook-placeholder-img">
                <span>📷 Image from Lorebook: <strong>{{ card.lorebookKey }}</strong></span>
            </div>
            <img v-else 
                 :src="resolveCardValue(card.mappedKey || '', context, blockKey, 'variable', '', card).value || 'https://placehold.co/200x300'" 
                 class="p-avatar" 
                 :style="{ width: (card.imageScale || 100) + '%' }"
            />
        </div>

        <!-- 3. RichText (Section Header / Text Block) -->
        <div 
            v-else-if="card.type === 'RichText'" 
            class="nested-section-header" 
            :id="getEffectiveId(card)"
            v-html="renderNested(
                card.sourceType === 'lorebook' 
                ? resolveCardValue('', context, blockKey, card.sourceType, card.lorebookKey, card).value
                : (card.mappedKey 
                    ? resolveCardValue(card.mappedKey, context, blockKey, 'variable', '', card).value
                    : (card.customLogic ? executeCustomLogic(card, context) : card.title)
                )
            )"
        >
        </div>

        <!-- 4. QuestList (Nested Loop) -->
        <div v-else-if="card.type === 'QuestList'" class="simple-list" :id="getEffectiveId(card)">
            <div 
                class="nested-section-header list-collapse-header"
                :class="{ 'list-collapsed': card.collapsed }"
                @click="card.collapsed = !card.collapsed"
                style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;"
            >
                <span>{{ card.title }}</span>
                <span style="font-size:0.8em; opacity:0.6;">{{ card.collapsed ? '▶' : '▼' }}</span>
            </div>
            <div v-show="!card.collapsed" class="sub-list-content">
                 <!-- Grid Mode -->
                 <HtmlListRenderer 
                    v-if="card.listType === 'grid'"
                    :data="visibleItems" 
                    templateId="tmpl-grid" 
                    :emptyText="'No items'"
                    :shouldFlatten="true"
                 />
                 <!-- Inventory Mode -->
                 <HtmlListRenderer 
                    v-else-if="card.listType === 'inventory'"
                    :data="visibleItems" 
                    templateId="tmpl-inventory" 
                    :emptyText="'Empty inventory'"
                    :shouldFlatten="true"
                 />
                 <!-- Equipment Action Mode -->
                 <HtmlListRenderer 
                    v-else-if="card.listType === 'equipment-action'"
                    :data="visibleItems" 
                    templateId="tmpl-equipment-action" 
                    :emptyText="'Nothing equipped'"
                 />
                 <!-- Custom Template Mode -->
                 <div v-else-if="card.listType === 'custom' && card.customTemplateName && getCustomTemplateHtml(card.customTemplateName)">
                     <div 
                         v-for="(item, idx) in visibleItems" 
                         :key="idx"
                         v-html="renderCustomItem(getCustomTemplateHtml(card.customTemplateName)!, item)"
                     ></div>
                     <div v-if="visibleItems.length === 0" style="text-align:center; color:var(--text-secondary); padding:10px;">No items</div>
                 </div>
                 <!-- Quest Mode (default) -->
                 <HtmlListRenderer 
                    v-else
                    :data="visibleItems" 
                    templateId="tmpl-quest" 
                    :emptyText="'No active quests'"
                 />
            </div>
            
            <!-- Card Pagination -->
            <div class="pagination-controls-sm" v-if="totalPages > 1 && !card.collapsed">
                <button class="pager-btn-sm" :disabled="page === 0" @click="prevPage">&lt;</button>
                <span class="page-info-sm">{{ page + 1 }} / {{ totalPages }}</span>
                <button class="pager-btn-sm" :disabled="page >= totalPages - 1" @click="nextPage">&gt;</button>
            </div>
        </div>

        <!-- 5. GridContainer (Recursive Group) -->
        <div v-else-if="card.type === 'GridContainer'" class="grid-group-card" :id="getEffectiveId(card)">
             <div class="grid-group-header" v-if="card.title">{{ card.title }}</div>
             <div class="grid-group-content">
                 <!-- Recursive Call -->
                 <CardRenderer 
                    v-for="sub in card.cards" 
                    :key="sub.id" 
                    :card="sub" 
                    :context="context" 
                    :blockKey="blockKey"
                    class="grid-item"
                    :style="{ width: (sub.width || (sub.type === 'QuestList' || sub.type === 'GridContainer' ? 100 : 50)) + '%' }"
                    :id="getEffectiveId(sub)"
                    :index="index"
                 />
             </div>
        </div>

    </div>
</template>

<style scoped>
/* 
   Shared styles (Export Parity) are provided globally by PreviewRenderer from sharedStyles.ts.
   Critical layout AND spacing rules MUST also live here so they work even when the
   user's saved globalCss (editable in TemplateEditor) doesn't include them.
*/

.grid-group-content {
    display: flex;
    flex-wrap: wrap;
    margin: 0 -4px;
}

.grid-item {
    box-sizing: border-box;
    padding: 4px;
    min-width: 80px; /* Responsive limit */
    flex: 1 0 auto !important; /* Don't shrink below user-defined width % */
}

/* Adaptive Stats Layout (Side-by-side if space, wrap if not) */
.prop-row {
    display: flex !important;
    flex-wrap: wrap !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 4px !important;
}

.prop-label {
    flex: 0 0 auto !important;
    width: auto !important;
    max-width: 100% !important;
    margin-right: 4px !important;
    margin-bottom: 1px !important;
    white-space: nowrap !important;
}

.prop-val-container {
    flex: 1 1 auto !important;
    width: auto !important;
    justify-content: flex-end !important;
}

.prop-val {
    width: auto !important;
    max-width: 100% !important;
}

/* Each child rendered inside a GridContainer */
.card-renderer-wrapper {
    min-width: 0;
    box-sizing: border-box;
}

/* Grid items inside GridContainer need padding for spacing between cells */
.grid-item {
    box-sizing: border-box;
    padding: 4px;
    min-width: 0;
}

/* List content fallback (works even where :has is unsupported) */
.prop-val :deep(ul),
.prop-val :deep(ol) {
    margin: 0;
    padding-left: 1.2em;
    text-align: left;
    line-height: 1.35;
    list-style-position: outside;
    list-style-type: disc;
}
.prop-val :deep(ol) { list-style-type: decimal; }
.prop-val :deep(li) { margin-bottom: 4px; }
.prop-val :deep(li:last-child) { margin-bottom: 0; }

</style>
