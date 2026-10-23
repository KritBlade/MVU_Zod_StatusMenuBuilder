<script setup lang="ts">
// LayoutBuilderTab — the Builder tab: the layout editor (tabs, blocks, cards) beside the live preview of the menu.
// It is a surface the builder draws itself (GUI-DNA §4): it sits in a workbench page and keeps its own classes and
// styles, and its root sets the font, colour and line height it had before the shell moved to the DNA.
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { useBuilderState } from '../composables/useBuilderState'
import TabManager from './TabManager.vue'
import BlockEditor from './BlockEditor.vue'
import PreviewRenderer from './PreviewRenderer.vue'

const { activeTab, addBlock, addBlockWithGridGroup, activeTabId } = useBuilderState()

// -- Resizer State --
const leftPanelWidth = ref(450)
const isResizing = ref(false)

function startResize() {
    isResizing.value = true
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stopResize)
}

function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value) return
    let newWidth = e.clientX
    if (newWidth < 300) newWidth = 300
    if (newWidth > window.innerWidth * 0.7) newWidth = window.innerWidth * 0.7
    leftPanelWidth.value = newWidth
}

function stopResize() {
    isResizing.value = false
    document.body.style.cursor = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopResize)
}
</script>

<template>
  <div class="smb-page is-workbench">
    <div class="layout-builder">
      <!-- Left: Editor -->
      <div class="editor-pane" :style="{ width: leftPanelWidth + 'px', minWidth: '300px', flex: 'none' }">
        <div class="config-area">
            <h3>Layout Configuration</h3>
            <TabManager />

            <div v-if="activeTab" class="blocks-list">
                <div class="tab-controls">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span>Editing: <strong>{{ activeTab.name }}</strong></span>
                        <div class="width-control" style="display: flex; gap: 5px; align-items: center; margin-left: 15px; font-size: 0.8em; color: #a0a6b0;">
                            <span>Width:</span>
                            <input
                                v-model.number="activeTab.containerWidth"
                                type="number"
                                class="config-input-sm"
                                placeholder="100"
                                style="width: 50px;"
                            />
                            <select v-model="activeTab.containerWidthUnit" class="config-select-sm">
                                <option value="%">%</option>
                                <option value="px">px</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                         <button class="btn-primary" @click="addBlockWithGridGroup(activeTabId)">+ Add Group Block</button>
                         <button class="btn-primary" @click="addBlock(activeTabId)">+ Add Block</button>
                    </div>
                </div>

                <div class="blocks-scroll">
                    <draggable
                        v-model="activeTab.blocks"
                        item-key="id"
                        handle=".drag-handle"
                        ghost-class="ghost-card"
                        class="blocks-draggable"
                    >
                        <template #item="{ element: block }">
                            <BlockEditor
                                :key="block.id"
                                :tabId="activeTabId"
                                :block="block"
                            />
                        </template>
                    </draggable>

                    <div v-if="activeTab.blocks.length === 0" class="empty-state">
                        No blocks yet. Add one to start.
                    </div>
                </div>
            </div>
            <div v-else class="empty-state">
                Select or create a tab.
            </div>
        </div>
      </div>

      <!-- RESIZER -->
      <div class="resizer" :class="{ active: isResizing }" @mousedown="startResize"></div>

      <!-- Right: Preview -->
      <div class="preview-pane">
        <div class="preview-header">Live Preview</div>
        <div class="preview-viewport">
            <PreviewRenderer />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-builder {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: #0f1115;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  line-height: normal;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: linear-gradient(-45deg, #050507, #101216, #23262c, #101216);
  background-size: 400% 400%;
  animation: editor-pane-drift 30s ease infinite;
  overflow: hidden;
}

/* The column's gradient drifts like the default menu's (sharedStyles.ts), so its light moves from corner to corner. */
@keyframes editor-pane-drift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .editor-pane {
    animation: none;
  }
}

.resizer {
    width: 6px;
    background: #252830;
    cursor: col-resize;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
    z-index: 10;
}
.resizer:hover, .resizer.active {
    background: #00f2ea;
}

.preview-pane {
  flex: 2;
  display: flex;
  flex-direction: column;
  background: #050507;
}

.config-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 15px;
    overflow-y: hidden;
}

.blocks-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-top: 15px;
}

.blocks-scroll {
    overflow-y: auto;
    flex: 1;
    padding-right: 5px;
}

.preview-header {
    background: #000;
    padding: 5px 10px;
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.preview-viewport {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    justify-content: center;
}

.btn-primary {
    background: #00f2ea;
    color: #000;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
}

.tab-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgb(255 255 255 / 15%);
}

.empty-state {
    color: #a0a6b0;
    text-align: center;
    padding: 20px;
    border: 1px dashed rgb(255 255 255 / 25%);
    border-radius: 6px;
}

.config-input-sm, .config-select-sm {
    background: #0f1115;
    border: 1px solid #333;
    color: #ddd;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.85rem;
}
</style>
