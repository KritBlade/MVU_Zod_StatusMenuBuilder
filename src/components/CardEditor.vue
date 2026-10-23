<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useBuilderState, type CardConfig, type RowActionConfig } from '../composables/useBuilderState'
import draggable from 'vuedraggable'
import { defaultLogicBody, isUntouched } from '../utils/card-logic-defaults.js'
import { actionNameProblem, actionArgsProblem, rowActionsProblem } from './exporttab-parts/rt_htmlGenerators.js'

const props = defineProps<{
    tabId: string
    blockId: string
    card: CardConfig
}>()

const { removeCard, addNestedCard, flatKeys, checkBlockMapping, addCustomTemplate, generateStarterTemplate, customTemplates, cleanupOrphanedTemplate } = useBuilderState()

// Track the previous template name so we can clean up orphans on rename
const previousTemplateName = ref(props.card.customTemplateName || '')

// Separate model for QuestList layout (uses listType, not layoutMode)
const listLayoutModel = computed({
    get: () => props.card.listType || props.card.layoutMode || 'list',
    set: (val: any) => { props.card.listType = val }
})

// Handle custom template auto-creation when name is entered
function onCustomNameBlur() {
    const name = props.card.customTemplateName?.trim()
    if (!name) return

    const oldName = previousTemplateName.value

    // Auto-create template if it doesn't exist
    if (!customTemplates.value.find(t => t.name === name)) {
        const mappedKey = props.card.mappedKey || ''
        addCustomTemplate(name, generateStarterTemplate(mappedKey))
    }

    // Clean up the old template if the name changed and no other card uses it
    if (oldName && oldName !== name) {
        cleanupOrphanedTemplate(oldName)
    }

    previousTemplateName.value = name
}

// Auto-reset source type if switching to unsupported card
watch(() => props.card.type, (newType) => {
    if (!['StatRow', 'Image', 'RichText'].includes(newType)) {
        if (props.card.sourceType === 'lorebook') {
            props.card.sourceType = 'variable'
        }
    }
})

// Logic Toggle State
const logicOpen = ref<Record<string, boolean>>({})

function toggleLogic(id: string) {
    logicOpen.value[id] = !logicOpen.value[id]
    if (logicOpen.value[id]) {
        ensureDefaultLogic(props.card)
    }
}

// Sync logic with title for RichText
watch(() => props.card.title, (_newTitle, oldTitle) => {
    if (props.card.type !== 'RichText') return
    if (!isUntouched(props.card.customLogic, defaultLogicBody({ ...props.card, title: oldTitle }, blockMappedKey()))) return
    props.card.customLogic = generateLogic(props.card.mappedKey || '')
})

// Sync logic with mappedKey for StatRow/Image
watch(() => props.card.mappedKey, (newKey, oldKey) => {
    if (!['StatRow', 'Image'].includes(props.card.type)) return
    if (!props.card.customLogic) return
    if (!isUntouched(props.card.customLogic, defaultLogicBody({ ...props.card, mappedKey: oldKey }, blockMappedKey()))) return

    props.card.customLogic = generateLogic(newKey || 'path.to.var')
})

// Sync logic with lorebookKey for StatRow/Image
watch(() => props.card.lorebookKey, (_newKey, oldKey) => {
    if (!['StatRow', 'Image', 'RichText'].includes(props.card.type)) return
    if (props.card.sourceType !== 'lorebook') return
    if (!props.card.customLogic) return
    if (!isUntouched(props.card.customLogic, defaultLogicBody({ ...props.card, lorebookKey: oldKey }, blockMappedKey()))) return

    props.card.customLogic = generateLogic(props.card.mappedKey || '')
})

// Sync logic with sourceType (Variable <-> Lorebook)
watch(() => props.card.sourceType, (_newSource, oldSource) => {
    if (!isUntouched(props.card.customLogic, defaultLogicBody({ ...props.card, sourceType: oldSource }, blockMappedKey()))) return
    props.card.customLogic = generateLogic(props.card.mappedKey || '')
})


// ActionButton (B5 step 1). The args are authored as JSON text and stored as the OBJECT the layout
// carries; the text model parses on every edit and the same validators the export and the click run
// judge it here, so a refusal is seen while typing, not at export.
const argsText = ref(props.card.type === 'ActionButton' ? JSON.stringify(props.card.args || {}, null, 2) : '')
const argsProblem = ref('')
const actionProblem = computed(() => props.card.type === 'ActionButton' ? actionNameProblem(props.card.action) : '')

function onArgsInput() {
    const text = argsText.value.trim()
    if (!text) { props.card.args = {}; argsProblem.value = ''; return }
    let parsed: unknown
    try { parsed = JSON.parse(text) }
    catch (e) { argsProblem.value = 'not valid JSON: ' + (e as Error).message; return }
    const problem = actionArgsProblem(parsed)
    argsProblem.value = problem
    if (!problem) props.card.args = parsed as Record<string, unknown>
}

watch(() => props.card.type, (newType) => {
    if (newType !== 'ActionButton') return
    if (props.card.action === undefined) props.card.action = ''
    if (!props.card.args) props.card.args = {}
    argsText.value = JSON.stringify(props.card.args, null, 2)
    argsProblem.value = ''
})

// Row actions (D8): the verbs every row of a list offers, authored as a JSON array and stored as the
// ARRAY the layout carries — the same text-model pattern as a button's args, judged by the same
// validator the export and the click run, so a refusal is seen while typing.
const rowActionsText = ref(props.card.type === 'QuestList' && props.card.rowActions ? JSON.stringify(props.card.rowActions, null, 2) : '')
const rowActionsProblemText = ref('')
function onRowActionsInput() {
    const text = rowActionsText.value.trim()
    if (!text) { delete props.card.rowActions; rowActionsProblemText.value = ''; return }
    let parsed: unknown
    try { parsed = JSON.parse(text) }
    catch (e) { rowActionsProblemText.value = 'not valid JSON: ' + (e as Error).message; return }
    const problem = rowActionsProblem(parsed)
    rowActionsProblemText.value = problem
    if (!problem) props.card.rowActions = parsed as RowActionConfig[]
}

function ensureDefaultLogic(card: CardConfig) {
    if (card.customLogic && card.customLogic.trim().length > 0) return
    const logic = generateLogic(card.mappedKey || '')
    if (logic) card.customLogic = logic
}

// The block a card sits in decides its scope: inside a collection block the renderer hands each
// ITEM to its cells, so the default body reads `stat` relative to that item.
function blockMappedKey(): string {
    const tab = useBuilderState().layout.value.find(t => t.id === props.tabId)
    return tab?.blocks.find(b => b.id === props.blockId)?.mappedKey || ''
}

function generateLogic(targetKey: string, specificLbKey?: string): string {
    return defaultLogicBody(
        { ...props.card, mappedKey: targetKey, lorebookKey: specificLbKey || props.card.lorebookKey },
        blockMappedKey(),
    )
}

// Re-expose this component for recursion
</script>

<template>
    <div class="card-item">
        <div class="card-row">
            <span class="drag-handle card-drag-handle">⋮⋮</span>
            <select v-model="card.type" class="type-select">
                <option value="Checkbox">Checkbox (New)</option>
                <option value="StatRow">Stat Row</option>
                <option value="StatBar">Stat Bar (HP)</option>
                <option value="QuestList">List (Loop)</option>
                <option value="Image">Image</option>
                <option value="RichText">Text</option>
                <option value="GridContainer">Grid Group</option>
                <option value="ActionButton">Action Button</option>
            </select>
            <button class="icon-btn-sm" @click="removeCard(tabId, blockId, card.id)">×</button>
        </div>
        
        <!-- GENERIC CONFIG (Not Container) -->
        <div class="card-config" v-if="card.type !== 'GridContainer'">
            <!-- Title Input -->
            <div class="input-group">
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1;">
                        <label>Label/Title</label>
                        <input v-model="card.title" class="config-input" />
                    </div>
                    <div style="width: 80px;">
                        <label>Width %</label>
                        <input v-model.number="card.width" class="config-input" placeholder="100" title="Width % (Default 100)" />
                    </div>
                    <div style="width: 60px;">
                        <label>Scale</label>
                        <input v-model.number="card.scale" class="config-input" placeholder="1.0" title="Font Scale" />
                    </div>
                    <div v-if="card.type === 'Image'" style="width: 80px;">
                        <label>Img Scale %</label>
                        <input v-model.number="card.imageScale" class="config-input" placeholder="100" title="Image Size % (Scale)" />
                    </div>
                </div>
            </div>

            <div class="input-group">
                <label>Element ID (Optional)</label>
                <input v-model="card.customId" class="config-input" placeholder="e.g. lbl-strength" />
            </div>

            <!-- ActionButton: what a click posts. The engine action is authored in the workspace. -->
            <div v-if="card.type === 'ActionButton'" class="input-group">
                <label>Action (a StatusMenu Engine export — actions.&lt;name&gt;)</label>
                <input v-model="card.action" class="config-input" placeholder="e.g. equip" />
                <div v-if="actionProblem" class="field-problem">{{ actionProblem }}</div>
                <label style="margin-top:5px;">Args (JSON object, posted with the action)</label>
                <textarea v-model="argsText" @input="onArgsInput" class="config-input"
                          style="width:100%; height:60px; font-family:monospace; font-size:0.8em;"
                          placeholder='{ "amount": 1 }'></textarea>
                <div v-if="argsProblem" class="field-problem">{{ argsProblem }}</div>
            </div>

            <!-- Data Source Configuration -->
            <div class="input-group" v-if="card.type !== 'ActionButton'">
                 <div style="display:flex; gap:10px; margin-bottom:5px;">
                     <label style="cursor:pointer">
                         <input type="radio" v-model="card.sourceType" value="variable" :name="'sourceType-' + card.id" /> Variable
                     </label>
                     <label style="cursor:pointer" v-if="['StatRow', 'Image', 'RichText'].includes(card.type)">
                         <input type="radio" v-model="card.sourceType" value="lorebook" :name="'sourceType-' + card.id" /> Lorebook
                     </label>
                 </div>

                 <!-- Variable Source -->
                 <div v-if="card.sourceType !== 'lorebook'">
                     <label>Map to Data</label>
                     <select v-model="card.mappedKey" class="config-select" @change="checkBlockMapping(tabId, blockId, card.mappedKey || '')">
                         <option value="">-- Select Key --</option>
                         <option v-for="k in flatKeys" :key="k" :value="k">{{ k }}</option>
                     </select>
                 </div>

                 <!-- Lorebook Source -->
                 <div v-else>
                     <label>Lorebook Key(s)</label>
                     <input v-model="card.lorebookKey" class="config-input" placeholder="e.g. World Map, pre-70-map" title="Enter the Key or Comment of the lore entry" />
                 </div>
                 
                 <!-- Generic Layout for Lists -->
                 <div v-if="card.type === 'QuestList'" style="display: flex; align-items: center; gap: 4px; margin-top: 5px;">
                      <span style="font-size: 0.7em; color: #888;">Layout:</span>
                      <select v-model="listLayoutModel" class="type-select-sm" style="width: 80px;" title="Layout Mode">
                          <option value="list">List</option>
                          <option value="grid">Grid</option>
                          <option value="quest">Quest</option>
                          <option value="inventory">Inventory</option>
                          <option value="equipment-action">Equipment</option>
                          <option value="custom">Custom</option>
                      </select>
                      <div v-if="listLayoutModel === 'custom'" style="display:flex; align-items:center; gap:4px; margin-left:4px;">
                          <input 
                              v-model="card.customTemplateName" 
                              class="config-input" 
                              placeholder="template name" 
                              style="width:120px; font-size:0.8em;" 
                              @blur="onCustomNameBlur"
                          />
                      </div>
                 </div>
                 <div v-if="card.type === 'QuestList'" style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                      <input type="checkbox" :id="'collapse-' + card.id" v-model="card.collapsed" style="cursor:pointer;" />
                      <label :for="'collapse-' + card.id" style="font-size:0.75em; color:#888; cursor:pointer; user-select:none;">Collapse by default</label>
                 </div>
                 <div v-if="card.type === 'QuestList'" style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                      <input type="checkbox" :id="'allowedit-' + card.id" v-model="card.allowEdit" style="cursor:pointer;" />
                      <label :for="'allowedit-' + card.id" style="font-size:0.75em; color:#888; cursor:pointer; user-select:none;">Allow Edit</label>
                 </div>
                 <div v-if="card.type === 'QuestList'" style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                      <input type="checkbox" :id="'allowdelete-' + card.id" v-model="card.allowDelete" style="cursor:pointer;" />
                      <label :for="'allowdelete-' + card.id" style="font-size:0.75em; color:#888; cursor:pointer; user-select:none;">Allow Delete</label>
                 </div>
                 <div v-if="card.type === 'Checkbox'" style="display:flex; align-items:center; gap:6px; margin-top:5px;">
                      <input type="checkbox" :id="'readonly-' + card.id" v-model="card.isReadOnly" style="cursor:pointer;" />
                      <label :for="'readonly-' + card.id" style="font-size:0.75em; color:#888; cursor:pointer; user-select:none;">Read only</label>
                 </div>
                 <!-- Row actions (D8): WHICH verbs sit on a row. WHAT each needs is the engine's inputs.<name>. -->
                 <div v-if="card.type === 'QuestList'" class="input-group" style="margin-top:8px;">
                      <label>Row actions (JSON array — the verbs every row offers)</label>
                      <textarea v-model="rowActionsText" @input="onRowActionsInput" class="config-input"
                                style="width:100%; height:60px; font-family:monospace; font-size:0.8em;"
                                placeholder='[ { "title": "⚔ Equip", "action": "equip" } ]'></textarea>
                      <div v-if="rowActionsProblemText" class="field-problem">{{ rowActionsProblemText }}</div>
                 </div>
            </div>

            <!-- StatBar Extra Config -->
            <div v-if="card.type === 'StatBar'" class="input-group">
                <label>Max Value Data</label>
                <select v-model="card.maxMappedKey" class="config-select">
                    <option value="">-- Select Max Key --</option>
                    <option v-for="k in flatKeys" :key="k" :value="k">{{ k }}</option>
                </select>
                
                <label style="margin-top:5px;">Bar Color</label>
                <select v-model="card.barColor" class="config-select">
                    <option value="red">Red</option>
                    <option value="green">Green (Lime)</option>
                    <option value="blue">Blue</option>
                    <option value="cyan">Cyan</option>
                    <option value="orange">Orange</option>
                    <option value="yellow">Yellow</option>
                    <option value="purple">Purple</option>
                    <option value="pink">Pink</option>
                    <option value="brown">Brown</option>
                    <option value="darkgreen">Dark Green</option>
                </select>
            </div>

            <!-- ADVANCED LOGIC (Collapsible) -->
            <div v-if="['StatRow', 'Image', 'RichText'].includes(card.type)" style="margin-top:10px; border-top:1px solid #333; padding-top:8px;">
                 <div @click="toggleLogic(card.id)" style="display:flex; justify-content:space-between; cursor:pointer; font-size:0.75em; color:#888; user-select:none;">
                     <span>Advanced Logic</span>
                     <span>{{ logicOpen[card.id] ? '▲' : '▼' }}</span>
                 </div>
                 
                 <div v-if="logicOpen[card.id]" style="margin-top:5px;">
                     <textarea 
                        v-model="card.customLogic" 
                        class="config-input" 
                        style="width:100%; height:80px; font-family:monospace; font-size:0.8em; color:#aaffaa; background:#000;"
                        placeholder="// Enter JS logic here..."
                        @focus="ensureDefaultLogic(card)"
                     ></textarea>
                     <div style="font-size:0.65em; color:#666; margin-top:2px;">
                         Available: <code>stat</code>, <code>root</code>, <code>itemKey</code> (the collection item's key), <code>getV</code>, <code>_output</code>
                     </div>
                 </div>
            </div>
        </div>
        
        <!-- CONTAINER CONFIG (Recursive) -->
        <div v-if="card.type === 'GridContainer'" class="card-config nested-config">
            <div class="nested-header">
                <span class="label">Group Title:</span>
                <input v-model="card.title" placeholder="Group Title" class="config-input" />
                <input v-model.number="card.width" placeholder="Width %" class="config-input" style="width: 70px;" title="Width % (Default 100)" />
                <input v-model.number="card.scale" placeholder="Scale" class="config-input" style="width: 50px;" title="Font Scale" />
            </div>
            
            <div class="nested-cards-area">
                <draggable 
                  v-model="card.cards" 
                  item-key="id" 
                  handle=".card-drag-handle" 
                  group="cards" 
                  ghost-class="ghost-card"
                  class="nested-draggable"
                >
                  <template #item="{ element: sub }">
                      <CardEditor 
                          :tabId="tabId" 
                          :blockId="blockId"
                          :card="sub"
                      />
                  </template>
                </draggable>
                
                <div class="add-sub-row">
                    <button class="add-sub-btn" @click="addNestedCard(tabId, blockId, card.id, 'StatRow')">+ Stat</button>
                    <button class="add-sub-btn" @click="addNestedCard(tabId, blockId, card.id, 'Image')">+ Img</button>
                    <button class="add-sub-btn" @click="addNestedCard(tabId, blockId, card.id, 'QuestList')">+ List</button>
                    <button class="add-sub-btn" @click="addNestedCard(tabId, blockId, card.id, 'RichText')">+ Block</button>
                    <button class="add-sub-btn" @click="addNestedCard(tabId, blockId, card.id, 'GridContainer')">+ Group</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.field-problem { color: #ff8a80; font-size: 0.75em; margin-top: 3px; }
.card-item {
    background: #14161b;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    padding: 8px;
    margin-bottom: 5px;
}

.card-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
}

.type-select {
    background: #222;
    color: #aaa;
    border: none;
    border-radius: 3px;
    font-size: 0.8rem;
    padding: 2px 5px;
}

.icon-btn-sm {
    background: none; 
    border: none; 
    color: #666; 
    cursor: pointer; 
    font-size: 1.2rem; 
    line-height: 0.5;
    flex-shrink: 0;
    min-width: 20px;
}
.icon-btn-sm:hover { color: #ff5252; }

.input-group {
    margin-bottom: 5px;
}
.input-group label {
    display: block;
    font-size: 0.7rem;
    color: #666;
    margin-bottom: 2px;
}

.config-input, .config-select, .config-text-input {
    width: 100%;
    background: #0f1115;
    border: 1px solid #333;
    color: #ddd;
    padding: 4px;
    border-radius: 3px;
    font-size: 0.85rem;
}

/* Nested Specifics */
.nested-config {
    background: rgba(0,0,0,0.1);
    border: 1px dashed #666;
    padding: 8px;
    border-radius: 4px;
    margin-top: 5px;
}
.nested-header { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.nested-cards-area { margin-left: 10px; display: flex; flex-direction: column; gap: 5px; }

.nested-draggable {
    min-height: 10px;
}

.add-sub-row {
    display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px;
}
.add-sub-btn { 
    background: rgba(0, 229, 255, 0.1); 
    border: 1px dashed #00e5ff; 
    color: #00e5ff; 
    font-size: 0.75em; 
    cursor: pointer; 
    padding: 2px 6px; 
    border-radius: 3px; 
}

.drag-handle {
    cursor: move;
    color: #444;
    padding-right: 5px;
    font-size: 1.1rem;
    user-select: none;
}
.drag-handle:hover { color: #888; }
.ghost-card {
    opacity: 0.5;
    background: #333;
    border: 1px dashed #666;
}
</style>
