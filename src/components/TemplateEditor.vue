<script setup lang="ts">
import { ref } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import { EXPORT_CSS_CONTENT } from '../utils/sharedStyles'
import { DEFAULT_STATIC_LOCALE } from '../composables/useBuilderState'

const { customTemplates, addCustomTemplate, removeCustomTemplate, updateCustomTemplate, generateStarterTemplate, globalCss, staticLocale } = useBuilderState()

const expandedTemplate = ref<string | null>(null)
const newTemplateName = ref('')

function toggleExpand(name: string) {
    expandedTemplate.value = expandedTemplate.value === name ? null : name
}

function handleAdd() {
    const name = newTemplateName.value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-')
    if (!name) return
    addCustomTemplate(name, generateStarterTemplate(''))
    newTemplateName.value = ''
    expandedTemplate.value = name
}

function handleRemove(name: string) {
    if (confirm(`Delete template "${name}"?`)) {
        removeCustomTemplate(name)
        if (expandedTemplate.value === name) expandedTemplate.value = null
    }
}

function handleHtmlChange(name: string, event: Event) {
    const textarea = event.target as HTMLTextAreaElement
    updateCustomTemplate(name, textarea.value)
}

function handleGlobalCssChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement
    globalCss.value = textarea.value
}

function handleResetGlobalCss() {
    if (confirm('Reset Global CSS to default values? This will overwrite your current CSS settings.')) {
        globalCss.value = EXPORT_CSS_CONTENT
    }
}

function handleStaticLocaleChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement
    try {
        const parsed = JSON.parse(textarea.value)
        if (parsed && typeof parsed === 'object') {
            staticLocale.value = parsed
        }
    } catch (e) {
        // Invalid JSON, don't update (or could show error message)
        console.warn('Invalid JSON in Static Locale editor')
    }
}

function handleResetStaticLocale() {
    if (confirm('Reset Static Locale to default values? This will overwrite your current locale settings.')) {
        staticLocale.value = { ...DEFAULT_STATIC_LOCALE }
    }
}
</script>

<template>
    <div class="template-editor">
        <div class="template-header">
            <h3>Custom Templates</h3>
            <div class="add-row">
                <input 
                    v-model="newTemplateName" 
                    class="name-input" 
                    placeholder="template name..." 
                    @keyup.enter="handleAdd"
                />
                <button class="add-btn" @click="handleAdd">+ New Template</button>
            </div>
        </div>

        <div class="template-list">
            <!-- Global CSS Entry (Pinned) -->
            <div class="template-item" :class="{ expanded: expandedTemplate === 'global-css' }">
                <div class="item-header" @click="toggleExpand('global-css')">
                    <span class="expand-icon">{{ expandedTemplate === 'global-css' ? '▼' : '▶' }}</span>
                    <span class="item-name" style="color: #ffd700;">StatusMenu (Global CSS)</span>
                    <span class="item-id">style.css</span>
                    <!-- No Delete Button -->
                </div>
                <div v-if="expandedTemplate === 'global-css'" class="item-body">
                     <div style="display: flex; justify-content: space-between; align-items: center;">
                        <label class="editor-label">Global Styles <span class="hint">Applied to whole Status Menu</span></label>
                        <button class="reset-btn" @click="handleResetGlobalCss">Reset to Default</button>
                     </div>
                     <textarea 
                         class="html-editor"
                         :value="globalCss"
                         @input="handleGlobalCssChange($event)"
                         spellcheck="false"
                     ></textarea>
                </div>
            </div>

            <!-- Static Locale Entry (Pinned) -->
            <div class="template-item" :class="{ expanded: expandedTemplate === 'static-locale' }">
                <div class="item-header" @click="toggleExpand('static-locale')">
                    <span class="expand-icon">{{ expandedTemplate === 'static-locale' ? '▼' : '▶' }}</span>
                    <span class="item-name" style="color: #ffd700;">Static Locale</span>
                    <span class="item-id">locale.json</span>
                    <!-- No Delete Button -->
                </div>
                <div v-if="expandedTemplate === 'static-locale'" class="item-body">
                     <div style="display: flex; justify-content: space-between; align-items: center;">
                        <label class="editor-label">Locale Strings <span class="hint">JSON key-value pairs for UI text</span></label>
                        <button class="reset-btn" @click="handleResetStaticLocale">Reset to Default</button>
                     </div>
                     <textarea 
                         class="html-editor"
                         :value="JSON.stringify(staticLocale, null, 4)"
                         @input="handleStaticLocaleChange($event)"
                         spellcheck="false"
                     ></textarea>
                </div>
            </div>

            <div 
                v-for="tmpl in customTemplates" 
                :key="tmpl.name" 
                class="template-item"
                :class="{ expanded: expandedTemplate === tmpl.name }"
            >
                <div class="item-header" @click="toggleExpand(tmpl.name)">
                    <span class="expand-icon">{{ expandedTemplate === tmpl.name ? '▼' : '▶' }}</span>
                    <span class="item-name">{{ tmpl.name }}</span>
                    <span class="item-id">tmpl-custom-{{ tmpl.name }}</span>
                    <button class="delete-btn" @click.stop="handleRemove(tmpl.name)">×</button>
                </div>
                <div v-if="expandedTemplate === tmpl.name" class="item-body">
                    <label class="editor-label">Template HTML <span class="hint">Use data-bind="fieldName" for dynamic values</span></label>
                    <textarea 
                        class="html-editor"
                        :value="tmpl.html"
                        @input="handleHtmlChange(tmpl.name, $event)"
                        spellcheck="false"
                    ></textarea>
                </div>
            </div>
        </div>

        <div v-if="customTemplates.length === 0" class="empty-state">
            No custom templates yet. Create one above, or select "Custom" layout on a QuestList card.
        </div>
    </div>
</template>

<style scoped>
.template-editor {
    padding: 15px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.template-header h3 {
    color: #00f2ea;
    margin: 0 0 10px 0;
    font-size: 1.1rem;
}

.add-row {
    display: flex;
    gap: 8px;
    margin-bottom: 15px;
}

.name-input {
    flex: 1;
    background: #0f1115;
    border: 1px solid #333;
    color: #ddd;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 0.9rem;
}

.add-btn {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid #00e5ff;
    color: #00e5ff;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
}
.add-btn:hover {
    background: rgba(0, 229, 255, 0.2);
}

.template-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.template-item {
    background: #14161b;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    overflow: hidden;
}
.template-item.expanded {
    border-color: #00e5ff44;
}

.item-header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    gap: 8px;
}
.item-header:hover {
    background: rgba(255,255,255,0.03);
}

.expand-icon {
    color: #666;
    font-size: 0.7em;
    width: 12px;
}

.item-name {
    font-weight: bold;
    color: #fff;
    font-size: 0.95rem;
}

.item-id {
    color: #555;
    font-size: 0.75rem;
    margin-left: auto;
    font-family: monospace;
}

.delete-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 1.3rem;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
    margin-left: 8px;
}
.delete-btn:hover {
    color: #ff5252;
}

.item-body {
    padding: 0 12px 12px 12px;
    border-top: 1px solid #2a2a2a;
}

.editor-label {
    display: block;
    font-size: 0.75rem;
    color: #888;
    margin: 8px 0 4px 0;
}

.hint {
    color: #555;
    font-style: italic;
}

.html-editor {
    width: 100%;
    min-height: 200px;
    background: #0a0c10;
    border: 1px solid #333;
    color: #ccc;
    padding: 10px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.82rem;
    line-height: 1.5;
    resize: vertical;
    white-space: pre;
    tab-size: 4;
}
.html-editor:focus {
    border-color: #00e5ff44;
    outline: none;
}

.reset-btn {
    background: rgba(255, 138, 128, 0.1);
    border: 1px solid #ff8a80;
    color: #ff8a80;
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.75rem;
    margin-top: 4px;
}
.reset-btn:hover {
    background: rgba(255, 138, 128, 0.2);
}

.empty-state {
    color: #666;
    text-align: center;
    padding: 30px 20px;
    border: 1px dashed #333;
    border-radius: 6px;
    font-size: 0.9rem;
}
</style>
