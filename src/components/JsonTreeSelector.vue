<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
    data: any
    path: string
    fullPath: string
    depth: number
    selectedPaths: Set<string>
    collectionPaths?: Set<string>
    lockedPaths?: Set<string>
    showCollectionToggle?: boolean
    showLockedToggle?: boolean
}>(), {
    showCollectionToggle: true,
    showLockedToggle: true
})

const emit = defineEmits<{
    (e: 'toggle', path: string, checked: boolean): void
    (e: 'toggle-collection', path: string, checked: boolean): void
    (e: 'toggle-lock', path: string, checked: boolean): void
}>()

const isCollapsed = ref(props.depth > 1)

const myType = computed(() => {
    if (props.data === null) return 'null'
    if (Array.isArray(props.data)) return 'array'
    return typeof props.data
})

const isChecked = computed(() => props.selectedPaths.has(props.fullPath))
const isCollection = computed(() => props.collectionPaths?.has(props.fullPath) ?? false)
const isLocked = computed(() => props.lockedPaths?.has(props.fullPath) ?? false)

// Show collection toggle for Objects/Arrays AND if enabled via prop
const showCollToggle = computed(() => props.showCollectionToggle && (myType.value === 'object' || myType.value === 'array'))

const children = computed(() => {
    if (myType.value === 'object') {
        return Object.entries(props.data).map(([k, v]) => ({ key: k, val: v }))
    }
    if (myType.value === 'array' && (props.data as any[]).length > 0) {
        return [{ key: '0', val: (props.data as any[])[0], isArrayItem: true }]
    }
    return []
})

function onCheckChange(e: Event) {
    emit('toggle', props.fullPath, (e.target as HTMLInputElement).checked)
}

function onCollChange(e: Event) {
    emit('toggle-collection', props.fullPath, (e.target as HTMLInputElement).checked)
}

function onLockChange(e: Event) {
    emit('toggle-lock', props.fullPath, (e.target as HTMLInputElement).checked)
}

function onChildToggle(path: string, checked: boolean) {
    emit('toggle', path, checked)
}

function onChildCollToggle(path: string, checked: boolean) {
    emit('toggle-collection', path, checked)
}

function onChildLockToggle(path: string, checked: boolean) {
    emit('toggle-lock', path, checked)
}

function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
}
</script>

<template>
    <div class="tree-node" :style="{ marginLeft: depth * 10 + 'px' }">
        <div class="node-row" :class="{ 'deselected': !isChecked }">
            <!-- Expand/Collapse -->
            <button 
                v-if="children.length > 0" 
                class="toggle-btn" 
                @click="toggleCollapse"
            >
                {{ isCollapsed ? '▶' : '▼' }}
            </button>
            <span v-else class="spacer"></span>

            <!-- Checkbox -->
            <input 
                type="checkbox" 
                :checked="isChecked" 
                @change="onCheckChange" 
                class="node-checkbox"
            />

            <!-- Label -->
            <span class="node-key">{{ path }}</span>
            <span class="type-info">{{ myType === 'array' ? '[]' : (myType === 'object' ? '{}' : '') }}</span>

            <!-- Locked Toggle -->
            <label v-if="showLockedToggle && showCollToggle && isChecked" class="lock-toggle" title="Strict schema (no custom keys)">
                <input type="checkbox" :checked="isLocked" @change="onLockChange" />
                <span>Locked</span>
            </label>

            <!-- Collection Toggle -->
            <label v-if="showCollToggle && isChecked" class="coll-toggle" title="Treat as Collection (Loop items)">
                <input type="checkbox" :checked="isCollection" @change="onCollChange" />
                <span>Collection</span>
            </label>
        </div>

        <!-- CHILDREN -->
        <div v-if="!isCollapsed && children.length > 0" class="children-container">
            <JsonTreeSelector
                v-for="child in children"
                :key="child.key"
                :data="child.val"
                :path="child.key"
                :fullPath="fullPath + '.' + child.key"
                :depth="depth + 1"
                :selectedPaths="selectedPaths"
                :collectionPaths="collectionPaths"
                :lockedPaths="lockedPaths"
                :showCollectionToggle="showCollectionToggle"
                :showLockedToggle="showLockedToggle"
                @toggle="onChildToggle"
                @toggle-collection="onChildCollToggle"
                @toggle-lock="onChildLockToggle"
            />
        </div>
    </div>
</template>

<style scoped>
.tree-node {
    font-family: 'Consolas', monospace;
    font-size: 13px;
    color: #ccc;
    line-height: 1.5;
}

.node-row {
    display: flex;
    align-items: center;
    padding: 2px 0;
}
.node-row:hover { background: rgba(255,255,255,0.05); }
.node-row.deselected { opacity: 0.6; }

.node-checkbox {
    margin-right: 6px;
    cursor: pointer;
}

.toggle-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    width: 20px;
    text-align: center;
    padding: 0;
    font-size: 10px;
}
.spacer { width: 20px; display: inline-block; }

.node-key { color: #e0e0e0; margin-right: 6px; }
.type-info { font-size: 0.8em; color: #666; margin-right: 10px; }

.coll-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    color: #50fa7b;
    cursor: pointer;
    background: rgba(80, 250, 123, 0.1);
    padding: 0 4px;
    border-radius: 3px;
    margin-left: auto;
    margin-right: 5px;
}
.coll-toggle input { margin: 0; }

.lock-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    color: #ffb86c;
    cursor: pointer;
    background: rgba(255, 184, 108, 0.1);
    padding: 0 4px;
    border-radius: 3px;
    margin-left: auto;
    margin-right: 5px;
}
.lock-toggle input { margin: 0; }

.children-container {
    border-left: 1px solid #333;
    margin-left: 9px;
}
</style>
