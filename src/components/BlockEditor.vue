<script setup lang="ts">
import { computed } from 'vue'
import { useBuilderState, type BlockConfig } from '../composables/useBuilderState'
import draggable from 'vuedraggable'
import CardEditor from './CardEditor.vue'

const props = defineProps<{
    tabId: string
    block: BlockConfig
}>()

const { removeBlock, addCard, flatKeys } = useBuilderState()

function updateBlockTitle(e: Event) {
    props.block.title = (e.target as HTMLInputElement).value
}

// Ensure visual default is 'list' if undefined
const layoutModeModel = computed({
    get: () => props.block.layoutMode || 'list',
    set: (val: any) => { props.block.layoutMode = val }
})
</script>

<template>
  <div class="block-editor">
      <div class="block-header">
          <div style="flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;">
              <span class="drag-handle block-drag-handle">⋮⋮</span>
              <input :value="block.title" @input="updateBlockTitle" class="block-title-input" placeholder="Block Title" />
              <input v-model.number="block.width" class="config-text-input" placeholder="Width %" style="width: 70px;" title="Width % (Default 100)" />
              <input v-model.number="block.scale" class="config-text-input" placeholder="Scale" style="width: 50px;" title="Font Scale (Default 1.0)" />
              <input v-model="block.customId" class="config-text-input" placeholder="ID (Optional)" style="width: 100px;" title="Custom DOM ID" />
              <select v-model="block.mappedKey" class="type-select" style="max-width: 120px;" title="Map Block to List (Repeater)">
                  <option value="">Global</option>
                  <option v-for="k in flatKeys" :key="k" :value="k">{{ k }}</option>
              </select>
              <select v-model="layoutModeModel" class="type-select" style="max-width: 80px;" title="Layout Mode">
                  <option value="list">List</option>
                  <option value="grid">Grid</option>
              </select>
              <input v-model.number="block.pageSize" class="config-text-input" type="number" min="1" placeholder="Page Size" style="width: 70px;" title="Items per page for collections (Default 5)" />
              <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; color: #888; cursor: pointer; white-space: nowrap;" title="Show quick-jump dropdown in pagination bar">
                  <input type="checkbox" v-model="block.showQuickJump" style="cursor: pointer;" />
                  Jump
              </label>
          </div>
          <button class="icon-btn" @click="removeBlock(tabId, block.id)">🗑️</button>
      </div>

      <div class="cards-container">
          <draggable 
            v-model="block.cards" 
            item-key="id" 
            handle=".card-drag-handle" 
            group="cards" 
            ghost-class="ghost-card"
            class="cards-draggable"
          >
            <template #item="{ element: card }">
                 <CardEditor 
                   :tabId="tabId" 
                   :blockId="block.id" 
                   :card="card" 
                 />
            </template>
          </draggable>

          <div class="add-card-row">
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'StatRow')">+ Add Stat</button>
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'Image')">+ Add Image</button>
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'RichText')">+ Add Block</button>
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'QuestList')">+ Add List</button>
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'ActionButton')">+ Add Action</button>
              <button class="btn-outlined" @click="addCard(tabId, block.id, 'GridContainer')">+ Add Grid Group</button>
          </div>
      </div>
  </div>
</template>

<style scoped>
.block-editor {
    background: #1c1f26;
    border: 1px solid #333;
    border-radius: 6px;
    margin-bottom: 15px;
    overflow: hidden;
}

.block-header {
    background: #252932;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #333;
}

.block-title-input {
    background: transparent;
    border: none;
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    background: transparent;
    border: 1px dashed transparent; /* Hint that it is editable */
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    flex: 1; /* Take remaining space */
    min-width: 50px;
}
.block-title-input:hover, .block-title-input:focus {
    border-color: #444;
    background: rgba(0,0,0,0.2);
}

.cards-container {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.type-select {
    background: #222;
    color: #aaa;
    border: none;
    border-radius: 3px;
    font-size: 0.8rem;
    padding: 2px 5px;
}

.icon-btn { 
    background: none; 
    border: none; 
    cursor: pointer; 
    opacity: 0.5; 
    flex-shrink: 0; /* Prevent shrinking */
    min-width: 24px;
}
.icon-btn:hover { opacity: 1; color: #ff5252; }

.config-text-input {
    width: 100%;
    background: #0f1115;
    border: 1px solid #333;
    color: #ddd;
    padding: 4px;
    border-radius: 3px;
    font-size: 0.85rem;
}

.add-card-row {
    display: flex;
    gap: 5px;
    margin-top: 5px;
}

.btn-outlined {
    flex: 1;
    background: transparent;
    border: 1px dashed #444;
    color: #888;
    padding: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 3px;
}
.btn-outlined:hover { border-color: #666; color: #ccc; }

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
