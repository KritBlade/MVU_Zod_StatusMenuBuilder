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
    <div>
        <div class="smb-tree-row" :class="{ 'is-off': !isChecked }">
            <button v-if="children.length > 0" type="button" class="smb-tree-toggle"
                :aria-expanded="isCollapsed ? 'false' : 'true'" :title="isCollapsed ? 'Open' : 'Close'"
                @click="toggleCollapse"><i class="fa-solid fa-chevron-down"></i></button>
            <span v-else class="smb-tree-spacer"></span>
            <input type="checkbox" class="smb-check" :checked="isChecked" :aria-label="'Include ' + path" @change="onCheckChange" />
            <span class="smb-tree-name">{{ path }}</span>
            <code v-if="myType === 'array' || myType === 'object'" class="smb-code">{{ myType === 'array' ? '[]' : '{}' }}</code>
            <span v-if="showCollToggle && isChecked" class="smb-tree-actions">
                <button v-if="showLockedToggle" type="button" class="smb-btn smb-btn-icon" :class="{ 'is-on': isLocked }"
                    :aria-pressed="isLocked ? 'true' : 'false'" title="Locked: strict schema, no custom keys"
                    @click="emit('toggle-lock', fullPath, !isLocked)"><i class="fa-solid fa-lock"></i></button>
                <button type="button" class="smb-btn smb-btn-icon" :class="{ 'is-on': isCollection }"
                    :aria-pressed="isCollection ? 'true' : 'false'" title="Collection: loop over its items"
                    @click="emit('toggle-collection', fullPath, !isCollection)"><i class="fa-solid fa-layer-group"></i></button>
            </span>
        </div>

        <div v-if="!isCollapsed && children.length > 0" class="smb-tree-branch">
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
