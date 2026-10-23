<script setup lang="ts">
import { ref } from 'vue'
import { APP_VERSION } from '../utils/app-version'
import { useBuilderState } from '../composables/useBuilderState'
import DataConfigTab from './DataConfigTab.vue'
import TabManager from './TabManager.vue'
import BlockEditor from './BlockEditor.vue'
import PreviewRenderer from './PreviewRenderer.vue'
import SchemaGeneratorTab from './SchemaGeneratorTab.vue'
import EventPackTab from './EventPackTab.vue'
import HtmlExportTab from './HtmlExportTab.vue'
import StatusMenuPackTab from './StatusMenuPackTab.vue'
import TemplateEditor from './TemplateEditor.vue'
import draggable from 'vuedraggable'

const { activeTab, addBlock, addBlockWithGridGroup, activeTabId, exportConfig, importConfig } = useBuilderState()
const navTab = ref<'builder'|'data'|'schema'|'events'|'export'|'pack'|'templates'>('builder')
const fileInput = ref<HTMLInputElement | null>(null)

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

function doExport() {
    const json = exportConfig()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'layout.json'
    a.click()
    URL.revokeObjectURL(url)
}

function triggerImport() {
    fileInput.value?.click()
}

function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (evt) => {
        const txt = evt.target?.result as string
        if (txt) {
            const success = importConfig(txt)
            if (success) alert('Configuration loaded!')
            else alert('Failed to load configuration (invalid format).')
        }
    }
    reader.readAsText(file)
    // reset
    if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div class="builder-container">
    <!-- Header -->
    <header class="builder-header">
      <div class="logo">MVU Zod Status Menu Builder v{{ APP_VERSION }}</div>
      
      <!-- Mode Tabs -->
      <div class="nav-tabs">
          <button 
            class="nav-tab" 
            :class="{ active: navTab === 'builder' }" 
            @click="navTab = 'builder'"
          >
            Builder
          </button>
          <button 
            class="nav-tab" 
            :class="{ active: navTab === 'data' }" 
            @click="navTab = 'data'"
          >
            Data Configuration
          </button>
          <button 
            class="nav-tab" 
            :class="{ active: navTab === 'schema' }" 
            @click="navTab = 'schema'"
          >
            Schema Output
          </button>
          <button
            class="nav-tab"
            :class="{ active: navTab === 'events' }"
            @click="navTab = 'events'"
          >
            Event Pack
          </button>
          <button 
            class="nav-tab" 
            :class="{ active: navTab === 'templates' }" 
            @click="navTab = 'templates'"
          >
            Templates
          </button>
          <button 
            class="nav-tab" 
            :class="{ active: navTab === 'export' }" 
            @click="navTab = 'export'"
          >
            Export HTML
          </button>
          <button
            class="nav-tab"
            :class="{ active: navTab === 'pack' }"
            @click="navTab = 'pack'"
          >
            StatusMenu Pack
          </button>
      </div>

      <div class="actions">
        <button class="btn-sm" @click="doExport">Export Config</button>
        <button class="btn-sm" @click="triggerImport">Import Config</button>
        <input ref="fileInput" type="file" accept=".json" style="display: none" @change="handleFile" />
      </div>
    </header>

    <!-- Main Content -->
    
    <!-- MODE: Data Configuration -->
    <div v-show="navTab === 'data'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <DataConfigTab />
        </div>
    </div>

    <!-- MODE: Schema Output -->
    <div v-show="navTab === 'schema'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <SchemaGeneratorTab />
        </div>
    </div>

    <!-- MODE: Event Pack builder -->
    <div v-show="navTab === 'events'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <EventPackTab />
        </div>
    </div>

    <!-- MODE: HTML Export -->
    <div v-show="navTab === 'export'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <HtmlExportTab />
        </div>
    </div>

    <!-- MODE: StatusMenu Pack export -->
    <div v-show="navTab === 'pack'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <StatusMenuPackTab />
        </div>
    </div>

    <!-- MODE: Templates -->
    <div v-show="navTab === 'templates'" class="main-split">
        <div style="flex:1; overflow:hidden;">
            <TemplateEditor />
        </div>
    </div>

    <!-- MODE: Builder -->
    <div v-show="navTab === 'builder'" class="main-split">
      <!-- Left: Editor -->
      <div class="editor-pane" :style="{ width: leftPanelWidth + 'px', minWidth: '300px', flex: 'none' }">
        <div class="config-area">
            <h3>Layout Configuration</h3>
            <TabManager />

            <div v-if="activeTab" class="blocks-list">
                <div class="tab-controls">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span>Editing: <strong>{{ activeTab.name }}</strong></span>
                        <div class="width-control" style="display: flex; gap: 5px; align-items: center; margin-left: 15px; font-size: 0.8em; color: #888;">
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
.builder-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0f1115;
  color: #fff;
  font-family: 'Outfit', sans-serif;
}

.builder-header {
  height: 50px;
  background: #1a1d24;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #333;
}

.logo {
  font-weight: bold;
  color: #00f2ea;
  letter-spacing: 1px;
}

.nav-tabs {
    display: flex;
    gap: 2px;
    height: 100%;
}
.nav-tab {
    background: transparent;
    border: none;
    color: #666;
    height: 100%;
    padding: 0 15px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-weight: 500;
}
.nav-tab:hover { color: #eee; }
.nav-tab.active {
    color: #00f2ea;
    border-bottom-color: #00f2ea;
    background: rgba(0, 242, 234, 0.05);
}

.main-split {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: #14161b;
  overflow: hidden;
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

.data-panel-wrap {
    height: 200px;
    border-bottom: 1px solid #333;
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

.actions {
    display: flex;
    gap: 10px; /* Added gap here */
}

.btn-sm {
    background: #333;
    border: none;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-sm:hover { background: #444; }

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
    border-bottom: 1px solid #333;
}

.empty-state {
    color: #666;
    text-align: center;
    padding: 20px;
    border: 1px dashed #333;
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
