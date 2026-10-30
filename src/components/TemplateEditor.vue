<script setup lang="ts">
// TemplateEditor — the Templates page: the menu's Global CSS and static locale, and the custom HTML templates a
// QuestList card's Custom layout draws each item with. Each is a record whose editor opens under its header.
import { ref } from 'vue'
import { useBuilderState, DEFAULT_STATIC_LOCALE } from '../composables/useBuilderState'
import { EXPORT_CSS_CONTENT } from '../utils/sharedStyles'
import DnaPageHeader from '../shared/gui-dna/DnaPageHeader.vue'
import DnaCard from '../shared/gui-dna/DnaCard.vue'
import DnaRecord from '../shared/gui-dna/DnaRecord.vue'
import DnaField from '../shared/gui-dna/DnaField.vue'
import DnaNotice from '../shared/gui-dna/DnaNotice.vue'
import DnaEmpty from '../shared/gui-dna/DnaEmpty.vue'
import { askConfirm } from '../shared/gui-dna/confirm-dialog'

const { customTemplates, addCustomTemplate, removeCustomTemplate, updateCustomTemplate, generateStarterTemplate, isTemplateInUse, globalCss, staticLocale } = useBuilderState()

const newTemplateName = ref('')
const openedTemplate = ref('')        // a template just created opens; the rest start closed
const isLocaleInvalid = ref(false)

function handleAdd() {
    const name = newTemplateName.value.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-')
    if (!name) return
    addCustomTemplate(name, generateStarterTemplate(''))
    newTemplateName.value = ''
    openedTemplate.value = name
}

async function handleRemove(name: string) {
    const answers = ['Its HTML is lost.', 'Delete removes it; Cancel keeps it.']
    if (isTemplateInUse(name)) answers.unshift('A card in the layout still uses it.')
    const isConfirmed = await askConfirm({
        question: 'Delete the template?',
        facts: [{ label: 'Template', value: name }],
        answers,
        actionText: 'Delete',
        actionIcon: 'fa-trash',
    })
    if (isConfirmed) removeCustomTemplate(name)
}

function handleHtmlChange(name: string, event: Event) {
    updateCustomTemplate(name, (event.target as HTMLTextAreaElement).value)
}

function handleGlobalCssChange(event: Event) {
    globalCss.value = (event.target as HTMLTextAreaElement).value
}

async function handleResetGlobalCss() {
    const isConfirmed = await askConfirm({
        question: 'Reset Global CSS to the default?',
        answers: ["Your CSS is replaced by the builder's default stylesheet.", 'Reset replaces it; Cancel keeps yours.'],
        actionText: 'Reset',
        actionIcon: 'fa-rotate-left',
    })
    if (isConfirmed) globalCss.value = EXPORT_CSS_CONTENT
}

// The locale is applied only while its text parses; until then the menu keeps the last locale that did.
function handleStaticLocaleChange(event: Event) {
    try {
        const parsed = JSON.parse((event.target as HTMLTextAreaElement).value)
        if (parsed && typeof parsed === 'object') {
            staticLocale.value = parsed
            isLocaleInvalid.value = false
        }
    } catch {
        // EXPECTED: text typed into the box is not JSON until it is finished; the page shows it as invalid
        isLocaleInvalid.value = true
    }
}

async function handleResetStaticLocale() {
    const isConfirmed = await askConfirm({
        question: 'Reset the static locale to the default?',
        answers: ["Your locale strings are replaced by the builder's defaults.", 'Reset replaces them; Cancel keeps yours.'],
        actionText: 'Reset',
        actionIcon: 'fa-rotate-left',
    })
    if (isConfirmed) {
        staticLocale.value = { ...DEFAULT_STATIC_LOCALE }
        isLocaleInvalid.value = false
    }
}
</script>

<template>
    <div class="smb-page">
        <DnaPageHeader icon="fa-file-code" eyebrow="Menu / Templates" title="Templates"
            subtitle="The menu's Global CSS and static locale, and custom HTML for List cells." />

        <DnaCard title="Global CSS and locale" badge-icon="fa-palette" body-class="smb-list"
            description="The whole menu's stylesheet, and the fixed words its UI shows.">
            <DnaRecord name="Global CSS" icon="fa-palette" body-class="" starts-collapsed>
                <template #pills><code class="smb-code">style.css</code></template>
                <DnaField label="Global styles" for-id="templates_global_css" hint="Applied to the whole status menu.">
                    <template #label-actions>
                        <button type="button" class="smb-btn smb-btn-quiet" @click="handleResetGlobalCss">Reset to default</button>
                    </template>
                    <textarea id="templates_global_css" class="smb-textarea is-code" rows="18" spellcheck="false"
                        :value="globalCss" @input="handleGlobalCssChange($event)"></textarea>
                </DnaField>
            </DnaRecord>

            <DnaRecord name="Static locale" icon="fa-language" body-class="smb-stack" starts-collapsed>
                <template #pills>
                    <code class="smb-code">locale.json</code>
                    <span v-if="isLocaleInvalid" class="smb-pill is-danger">Invalid JSON</span>
                </template>
                <DnaField label="Locale strings" for-id="templates_static_locale" hint="JSON key-value pairs for the menu's UI text.">
                    <template #label-actions>
                        <button type="button" class="smb-btn smb-btn-quiet" @click="handleResetStaticLocale">Reset to default</button>
                    </template>
                    <textarea id="templates_static_locale" class="smb-textarea is-code" :class="{ 'is-missing': isLocaleInvalid }"
                        rows="14" spellcheck="false" :value="JSON.stringify(staticLocale, null, 4)"
                        @input="handleStaticLocaleChange($event)"></textarea>
                </DnaField>
                <DnaNotice v-if="isLocaleInvalid" status="warning" text="Not valid JSON yet; the menu keeps the last locale that parsed." />
            </DnaRecord>
        </DnaCard>

        <DnaCard title="Custom templates" badge-icon="fa-code" body-class="smb-stack"
            description="HTML a List cell's Custom layout draws each item with.">
            <div class="smb-control-row">
                <input v-model="newTemplateName" class="smb-input" placeholder="template name" aria-label="New template name" @keyup.enter="handleAdd" />
                <button type="button" class="smb-btn smb-btn-primary" :disabled="!newTemplateName.trim()" @click="handleAdd">
                    <i class="fa-solid fa-plus"></i>New template
                </button>
            </div>

            <div v-if="customTemplates.length" class="smb-list">
                <DnaRecord v-for="tmpl in customTemplates" :key="tmpl.name" :name="tmpl.name" icon="fa-code" body-class=""
                    :starts-collapsed="tmpl.name !== openedTemplate">
                    <template #pills><code class="smb-code">tmpl-custom-{{ tmpl.name }}</code></template>
                    <template #actions>
                        <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Delete template" @click="handleRemove(tmpl.name)">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </template>
                    <DnaField label="Template HTML" :for-id="'template_html_' + tmpl.name">
                        <template #hint><span>Use</span> <code class="smb-code">data-bind="fieldName"</code> <span>for dynamic values.</span></template>
                        <textarea :id="'template_html_' + tmpl.name" class="smb-textarea is-code" rows="12" spellcheck="false"
                            :value="tmpl.html" @input="handleHtmlChange(tmpl.name, $event)"></textarea>
                    </DnaField>
                </DnaRecord>
            </div>
            <DnaEmpty v-else icon="fa-file-circle-plus" text="No custom templates yet; name one above, or pick Custom on a List cell." />
        </DnaCard>
    </div>
</template>
