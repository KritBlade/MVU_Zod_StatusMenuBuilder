<script setup lang="ts">
// JsonVisualEditor — one node of the MVU data drawn as a tree (GUI-DNA tree gene), and through itself every node under
// it. A row shows the node's key (editable inside an object, its index inside a list), its value control or its
// collection chip, and its actions: copy, paste below or inside (while something is copied), add an item, delete.
// Rows inside a collection drag into a new order by their grip. Deleting a collection that holds anything asks first;
// a single value goes at once (GUI-DNA §7).
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import { useBuilderState } from '../composables/useBuilderState'
import { askConfirm } from '../shared/gui-dna/confirm-dialog'
import JsonVisualEditor from './JsonVisualEditor.vue' // Recursive

const props = defineProps<{
    modelValue: any
    depth?: number
    entryKey?: string | number            // this node's key in its parent object, or its index in its parent list
    parentKind?: 'object' | 'array'       // what holds this node; the root has no parent
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: any): void
    (e: 'paste-sibling', value: any): void
    (e: 'rename', newKey: string): void
    (e: 'remove'): void
}>()

const depth = props.depth || 0
// Default collapsed if depth > 0 (children), Expanded if depth == 0 (root)
const isCollapsed = ref(depth > 0)

// -- Helpers --
function getType(val: any) {
    if (Array.isArray(val)) return 'array'
    if (val === null) return 'null'
    if (typeof val === 'object') return 'object'
    return typeof val
}

const myType = computed(() => getType(props.modelValue))
const isCollection = computed(() => myType.value === 'array' || myType.value === 'object')
const childCount = computed(() => (isCollection.value ? Object.keys(props.modelValue).length : 0))

// -- Updates --
function updateKey(oldKey: string, newKey: string) {
    if (oldKey === newKey) return
    if (!props.modelValue || typeof props.modelValue !== 'object' || Array.isArray(props.modelValue)) return
    const newVal = { ...props.modelValue }
    const val = newVal[oldKey]
    delete newVal[oldKey]
    newVal[newKey] = val
    emit('update:modelValue', newVal)
}

function updateValue(key: string | number, val: any) {
    const newVal = Array.isArray(props.modelValue) ? [...props.modelValue] : { ...props.modelValue }
    newVal[key] = val
    emit('update:modelValue', newVal)
}

function addItem() {
    if (Array.isArray(props.modelValue)) {
        emit('update:modelValue', [...props.modelValue, null])
    } else {
        emit('update:modelValue', { ...props.modelValue, [`new_prop_${Date.now()}`]: null })
    }
    isCollapsed.value = false
}

function removeItem(key: string | number) {
    if (Array.isArray(props.modelValue)) {
        emit('update:modelValue', props.modelValue.filter((_, i) => i !== key))
    } else {
        const newVal = { ...props.modelValue }
        delete newVal[key as string]
        emit('update:modelValue', newVal)
    }
}

async function requestRemove() {
    if (childCount.value > 0) {
        const isConfirmed = await askConfirm({
            question: 'Delete this ' + (myType.value === 'array' ? 'list' : 'object') + '?',
            facts: [{ label: 'Key', value: String(props.entryKey) }],
            answers: ['Its ' + childCount.value + ' ' + (myType.value === 'array' ? 'items' : 'fields') + ' are lost with it.', 'Delete removes it; Cancel keeps it.'],
            actionText: 'Delete',
            actionIcon: 'fa-trash',
            isDanger: true,
        })
        if (!isConfirmed) return
    }
    emit('remove')
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
const { clipboard } = useBuilderState()
const hasCopy = computed(() => clipboard.value !== null)

function copyNode() {
    clipboard.value = JSON.parse(JSON.stringify(props.modelValue))
}

function pasteUnder() {
    if (!hasCopy.value) return
    const data = JSON.parse(JSON.stringify(clipboard.value))
    if (Array.isArray(props.modelValue)) {
        emit('update:modelValue', [...props.modelValue, data])
    } else if (typeof props.modelValue === 'object' && props.modelValue !== null) {
        emit('update:modelValue', { ...props.modelValue, [`pasted_${Date.now()}`]: data })
    }
    isCollapsed.value = false
}

function pasteBelow() {
    if (!hasCopy.value) return
    emit('paste-sibling', JSON.parse(JSON.stringify(clipboard.value)))
}

function handleChildPasteSibling(indexOrKey: string | number, data: any) {
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
    <div>
        <div class="smb-tree-row">
            <span v-if="parentKind" class="smb-tree-grip" data-drag-handle title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
            <button v-if="isCollection" type="button" class="smb-tree-toggle" :aria-expanded="isCollapsed ? 'false' : 'true'"
                :title="isCollapsed ? 'Open' : 'Close'" @click="isCollapsed = !isCollapsed"><i class="fa-solid fa-chevron-down"></i></button>
            <span v-else class="smb-tree-spacer"></span>

            <input v-if="parentKind === 'object'" class="smb-input is-code" :value="entryKey" title="Key"
                @change="emit('rename', ($event.target as HTMLInputElement).value)" />
            <code v-else-if="parentKind === 'array'" class="smb-code">{{ entryKey }}</code>

            <code v-if="isCollection" class="smb-code">{{ myType === 'array' ? 'List []' : 'Object {}' }}</code>
            <input v-else-if="myType === 'string'" class="smb-input" :value="modelValue" title="Text value"
                @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
            <input v-else-if="myType === 'number'" type="number" class="smb-input" :value="modelValue" title="Number value"
                @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))" />
            <input v-else-if="myType === 'boolean'" type="checkbox" role="switch" class="smb-switch" :checked="modelValue" title="True or false"
                @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
            <select v-else class="smb-select" title="Value type" @change="changeType(($event.target as HTMLSelectElement).value)">
                <option value="null" selected>Null</option>
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="array">List []</option>
                <option value="object">Object {}</option>
            </select>

            <span class="smb-tree-actions">
                <button type="button" class="smb-btn smb-btn-icon" title="Copy this value" @click="copyNode"><i class="fa-solid fa-copy"></i></button>
                <button v-if="hasCopy && parentKind" type="button" class="smb-btn smb-btn-icon" title="Paste the copied value below this one"
                    @click="pasteBelow"><i class="fa-solid fa-paste"></i></button>
                <button v-if="hasCopy && isCollection" type="button" class="smb-btn smb-btn-icon" title="Paste the copied value inside this one"
                    @click="pasteUnder"><i class="fa-solid fa-arrow-turn-down"></i></button>
                <button v-if="isCollection" type="button" class="smb-btn smb-btn-icon" title="Add an item" @click="addItem"><i class="fa-solid fa-plus"></i></button>
                <button v-if="parentKind" type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Delete" @click="requestRemove"><i class="fa-solid fa-trash"></i></button>
            </span>
        </div>

        <!-- ARRAY: rows drag into a new order -->
        <draggable
            v-if="myType === 'array'"
            v-show="!isCollapsed"
            v-model="arrayItems"
            :item-key="(_: any, i: number) => i"
            handle="[data-drag-handle]"
            class="smb-tree-branch"
        >
            <template #item="{ element, index }">
                <JsonVisualEditor
                    :modelValue="element"
                    :depth="depth + 1"
                    :entryKey="index"
                    parentKind="array"
                    @update:modelValue="val => updateValue(index, val)"
                    @paste-sibling="data => handleChildPasteSibling(index, data)"
                    @remove="removeItem(index)"
                />
            </template>
        </draggable>

        <!-- OBJECT: rows drag into a new order (the key order is the object's) -->
        <draggable
            v-else-if="myType === 'object'"
            v-show="!isCollapsed"
            v-model="objectEntriesWritable"
            item-key="key"
            handle="[data-drag-handle]"
            class="smb-tree-branch"
        >
            <template #item="{ element: entry }">
                <JsonVisualEditor
                    :modelValue="entry.value"
                    :depth="depth + 1"
                    :entryKey="entry.key"
                    parentKind="object"
                    @update:modelValue="val => updateValue(entry.key, val)"
                    @paste-sibling="data => handleChildPasteSibling(entry.key, data)"
                    @rename="newKey => updateKey(entry.key, newKey)"
                    @remove="removeItem(entry.key)"
                />
            </template>
        </draggable>
    </div>
</template>
