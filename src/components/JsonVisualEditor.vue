<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import draggable from 'vuedraggable'
import JsonVisualEditor from './JsonVisualEditor.vue' // Recursive

const props = defineProps<{
    modelValue: any
    label?: string
    depth?: number
}>()

const emit = defineEmits(['update:modelValue', 'paste-sibling'])

const depth = props.depth || 0
// Default collapsed if depth > 0 (children), Expanded if depth == 0 (root)
const isCollapsed = ref(depth > 0)
function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
}

// -- Helpers --
function getType(val: any) {
    if (Array.isArray(val)) return 'array'
    if (val === null) return 'null'
    if (typeof val === 'object') return 'object'
    return typeof val
}

const myType = computed(() => getType(props.modelValue))
const isCollection = computed(() => myType.value === 'array' || myType.value === 'object')

// -- Updates --
function updateKey(oldKey: string, newKey: string) {
    if (oldKey === newKey) return
    if (!props.modelValue || typeof props.modelValue !== 'object') return

    const newVal = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue }
    
    // Objects handling
    if (!Array.isArray(newVal)) {
        const val = newVal[oldKey]
        delete newVal[oldKey]
        newVal[newKey] = val
        emit('update:modelValue', newVal)
    }
}

function updateValue(key: string | number, val: any) {
    const newVal = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue }
    newVal[key] = val
    emit('update:modelValue', newVal)
}

function addItem() {
    if (Array.isArray(props.modelValue)) {
        const newVal = [...props.modelValue, null]
        emit('update:modelValue', newVal)
    } else {
        const newVal = { ...props.modelValue, [`new_prop_${Date.now()}`]: null }
        emit('update:modelValue', newVal)
    }
}

function removeItem(key: string | number) {
    if (Array.isArray(props.modelValue)) {
        const newVal = props.modelValue.filter((_, i) => i !== key)
        emit('update:modelValue', newVal)
    } else {
        const newVal = { ...props.modelValue }
        delete newVal[key as string]
        emit('update:modelValue', newVal)
    }
}

// For Type Switching (when value is null)
function changeType(newType: string) {
    let zeroVal: any = null
    if (newType === 'string') zeroVal = ""
    if (newType === 'number') zeroVal = 0
    if (newType === 'boolean') zeroVal = false
    if (newType === 'array') zeroVal = []
    if (newType === 'object') zeroVal = {}
    
    emit('update:modelValue', zeroVal)
}

const objectEntriesWritable = computed({
    get: () => {
        if (myType.value === 'object' && props.modelValue) {
            return Object.entries(props.modelValue).map(([k, v]) => ({ key: k, value: v }))
        }
        return []
    },
    set: (newEntries: any[]) => {
        if (myType.value !== 'object') return
        const newObj: any = {}
        newEntries.forEach(e => {
            newObj[e.key] = e.value
        })
        emit('update:modelValue', newObj)
    }
})

// For Array iteration
const arrayItems = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

// -- Copy / Paste --
const { clipboard, activeMenuId } = useBuilderState()
const menuId = `menu_${Math.random().toString(36).substr(2, 9)}`
const isMenuOpen = computed(() => activeMenuId.value === menuId)

function toggleMenu(e: Event) {
    e.stopPropagation() // Prevent background click from closing immediately
    if (isMenuOpen.value) {
        activeMenuId.value = null
    } else {
        activeMenuId.value = menuId
    }
}

function copyNode() {
    clipboard.value = JSON.parse(JSON.stringify(props.modelValue))
    activeMenuId.value = null
}

function pasteUnder() {
    if (!clipboard.value) return
    const data = JSON.parse(JSON.stringify(clipboard.value))
    activeMenuId.value = null // Close menu
    
    if (Array.isArray(props.modelValue)) {
        // ... (rest same)
        const newVal = [...props.modelValue, data]
        emit('update:modelValue', newVal)
    } else if (typeof props.modelValue === 'object' && props.modelValue !== null) {
        const key = `pasted_${Date.now()}`
        const newVal = { ...props.modelValue, [key]: data }
        emit('update:modelValue', newVal)
    }
}

function pasteBelow() {
    if (!clipboard.value) return
    activeMenuId.value = null // Close menu
    emit('paste-sibling', JSON.parse(JSON.stringify(clipboard.value)))
}

function handleChildPasteSibling(indexOrKey: string | number, data: any) {
    // ... (rest same)
    if (Array.isArray(props.modelValue)) {
        const idx = typeof indexOrKey === 'number' ? indexOrKey : parseInt(indexOrKey as string)
        const newVal = [...props.modelValue]
        newVal.splice(idx + 1, 0, data)
        emit('update:modelValue', newVal)
    } else if (typeof props.modelValue === 'object') {
        const entries = Object.entries(props.modelValue)
        const idx = entries.findIndex(([k]) => k === indexOrKey)
        if (idx !== -1) {
            const newObj: any = {}
            entries.forEach(([k, v], i) => {
                newObj[k] = v
                if (i === idx) {
                    newObj[`pasted_${Date.now()}`] = data
                }
            })
            emit('update:modelValue', newObj)
        }
    }
}
</script>

<template>
    <div class="json-node" :style="{ marginLeft: depth > 0 ? '15px' : '0' }">
        
        <!-- Primitives -->
        <div v-if="!isCollection" class="primitive-row">
            <!-- Menu -->
            <div class="node-menu">
                <button class="menu-btn" title="Actions" @click="toggleMenu">⚙</button>
                <div class="menu-dropdown" :class="{ open: isMenuOpen }">
                    <button @click="copyNode">Copy</button>
                    <button @click="pasteBelow" v-if="clipboard">Paste Below</button>
                </div>
            </div>

            <span v-if="label" class="key-label">{{ label }}:</span>
            <input 
                v-if="myType === 'string'" 
                :value="modelValue" 
                @input="e => emit('update:modelValue', (e.target as HTMLInputElement).value)"
                class="val-input string"
            />
            <input 
                v-else-if="myType === 'number'" 
                type="number"
                :value="modelValue" 
                @input="e => emit('update:modelValue', Number((e.target as HTMLInputElement).value))"
                class="val-input number"
            />
            <input 
                v-else-if="myType === 'boolean'" 
                type="checkbox"
                :checked="modelValue" 
                @change="e => emit('update:modelValue', (e.target as HTMLInputElement).checked)"
            />
            <div v-else class="null-select-container">
                <select class="type-select" @change="e => changeType((e.target as HTMLSelectElement).value)">
                    <option value="null" selected>Null</option>
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">List []</option>
                    <option value="object">Object {}</option>
                </select>
            </div>
        </div>

        <!-- Collections (Array/Object) -->
        <div v-else class="collection-node">
            <div class="coll-header">
                <button class="toggle-btn" @click="toggleCollapse">
                    {{ isCollapsed ? '▶' : '▼' }}
                </button>

                <!-- Menu -->
                <div class="node-menu">
                    <button class="menu-btn" title="Actions" @click="toggleMenu">⚙</button>
                    <div class="menu-dropdown" :class="{ open: isMenuOpen }">
                        <button @click="copyNode">Copy</button>
                        <button @click="pasteBelow" v-if="clipboard">Paste Below</button>
                        <button @click="pasteUnder" v-if="clipboard">Paste Under</button>
                    </div>
                </div>

                <span v-if="label" class="key-label coll-label">{{ label }}</span>
                <span class="type-badge">{{ Array.isArray(modelValue) ? 'List []' : 'Obj {}' }}</span>
                <button class="add-btn" @click="addItem">+</button>
            </div>

            <div class="coll-body" v-show="!isCollapsed">
                <!-- ARRAY: Supports Drag Reorder -->
                <draggable 
                    v-if="myType === 'array'"
                    v-model="arrayItems"
                    :item-key="(_: any, i: number) => i" 
                    handle=".drag-handle"
                    class="array-list"
                >
                    <template #item="{ element, index }">
                        <div class="array-item-row">
                            <span class="drag-handle">⋮</span>
                            <div class="item-content">
                                <JsonVisualEditor 
                                    :modelValue="element" 
                                    :depth="depth + 1"
                                    @update:modelValue="val => updateValue(index, val)"
                                    @paste-sibling="data => handleChildPasteSibling(index, data)"
                                />
                            </div>
                            <button class="del-btn" @click="removeItem(index)">×</button>
                        </div>
                    </template>
                </draggable>

                <!-- OBJECT: Supports Drag Reorder (Visual Sort) -->
                <draggable 
                    v-else
                    v-model="objectEntriesWritable"
                    item-key="key"
                    handle=".drag-handle"
                    class="object-list"
                >
                    <template #item="{ element: entry }">
                        <div class="object-row">
                            <span class="drag-handle">⋮</span>
                            <div class="key-col">
                                <input 
                                    :value="entry.key" 
                                    @change="e => updateKey(entry.key, (e.target as HTMLInputElement).value)"
                                    class="key-input"
                                />
                            </div>
                            <div class="val-col">
                                 <JsonVisualEditor 
                                    :modelValue="entry.value" 
                                    :depth="depth + 1"
                                    @update:modelValue="val => updateValue(entry.key, val)"
                                    @paste-sibling="data => handleChildPasteSibling(entry.key, data)"
                                />
                            </div>
                            <button class="del-btn" @click="removeItem(entry.key)">×</button>
                        </div>
                    </template>
                </draggable>
            </div>
        </div>

    </div>
</template>

<style scoped>
.json-node {
    font-size: 0.9em;
    color: #eee;
    margin-bottom: 2px;
}

.primitive-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.key-label {
    color: #00f2ea;
    font-weight: bold;
}
.val-input {
    background: #222;
    border: 1px solid #444;
    color: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    min-width: 100px;
}
.val-input.string { color: #ce9178; }
.val-input.number { color: #b5cea8; }

.coll-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px;
    background: rgba(255,255,255,0.02);
    border-radius: 4px;
}
.coll-label { margin-right: 5px; }
.type-badge {
    font-size: 0.75em;
    background: #333;
    padding: 2px 4px;
    border-radius: 3px;
    color: #aaa;
}
.add-btn {
    background: none;
    border: 1px solid #444;
    color: #50fa7b;
    width: 20px;
    height: 20px;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.toggle-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 0.8em;
    width: 20px;
    text-align: center;
    padding: 0;
}
.toggle-btn:hover { color: #fff; }

.coll-body {
    padding-left: 10px;
    border-left: 1px dashed #333;
    margin-top: 5px;
}

.array-item-row {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-bottom: 5px;
    background: rgba(0,0,0,0.1);
    padding: 4px;
    border-radius: 4px;
}

.object-row {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-bottom: 5px;
    padding: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}

.key-col {
    width: 120px;
    flex-shrink: 0;
}
.key-input {
    width: 100%;
    background: transparent;
    border: none;
    color: #00f2ea;
    text-align: right;
    padding-right: 5px;
    border-right: 1px solid #444;
}

.val-col, .item-content {
    flex: 1;
}

.drag-handle {
    cursor: move;
    color: #666;
    padding-top: 2px;
}
.del-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 1.2em;
}
.del-btn:hover { color: #ff5252; }

.type-select {
    background: #444;
    color: #fff;
    border: 1px solid #555;
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.85em;
    cursor: pointer;
}
.type-select:hover { border-color: #00f2ea; }

/* Menu */
.node-menu {
    position: relative;
    display: inline-block;
    margin-right: 5px;
}
.menu-btn {
    background: transparent;
    border: none;
    color: #666;
    font-size: 1.2em;
    cursor: pointer;
    padding: 0 4px;
}
.menu-btn:hover { color: #fff; }

.menu-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    background: #252526;
    border: 1px solid #454545;
    border-radius: 4px;
    z-index: 1000;
    min-width: 120px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
}
/* .node-menu:hover used to handle this, now handled by click .open */
.menu-dropdown.open {
    display: block;
}

.menu-dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: #ccc;
    padding: 10px 14px;
    cursor: pointer;
    font-size: 1.0em;
}
.menu-dropdown button:hover {
    background: #37373d;
    color: #fff;
}
</style>
