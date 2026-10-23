<script setup lang="ts">
import { useBuilderState } from '../composables/useBuilderState'
import draggable from 'vuedraggable'

const { layout, activeTabId, addTab, removeTab } = useBuilderState()

</script>

<template>
  <div class="tab-manager">
    <div class="tabs-row">
        <draggable 
            v-model="layout" 
            item-key="id"
            class="tabs-drag-area"
            ghost-class="ghost-tab"
        >
            <template #item="{ element: tab }">
                <div 
                    class="tab-pill"
                    :class="{ active: tab.id === activeTabId }"
                    @click="activeTabId = tab.id"
                >
                    <input 
                        v-if="tab.id === activeTabId"
                        v-model="tab.name"
                        class="tab-input"
                        @click.stop
                    />
                    <span v-else>{{ tab.name }}</span>
                    
                    <button class="close-btn" @click.stop="removeTab(tab.id)" v-if="layout.length > 1">×</button>
                </div>
            </template>
        </draggable>
        <button class="add-btn" @click="addTab()">+</button>
    </div>
  </div>
</template>

<style scoped>
.tab-manager {
    margin-bottom: 10px;
}

.tabs-row {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    padding-bottom: 5px;
    align-items: center;
}

.tabs-drag-area {
    display: flex;
    gap: 5px;
}

.ghost-tab {
    opacity: 0.5;
    background: #00f2ea !important;
    color: black !important;
}

.tab-pill {
    background: #222;
    border: 1px solid #333;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    transition: all 0.2s;
}

.tab-pill:hover {
    background: #2a2a2a;
}

.tab-pill.active {
    background: rgba(0, 242, 234, 0.1);
    border-color: #00f2ea;
    color: #00f2ea;
}

.tab-input {
    background: transparent;
    border: none;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    width: 80px;
    border-bottom: 1px solid #00f2ea;
    outline: none;
}

.close-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 0.8;
}
.close-btn:hover { color: #ff5252; }

.add-btn {
    background: #222;
    border: 1px dashed #444;
    color: #888;
    padding: 5px 10px;
    cursor: pointer;
    border-radius: 4px;
}
.add-btn:hover { border-color: #666; color: #fff; }
</style>
