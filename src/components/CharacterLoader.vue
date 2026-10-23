<script setup lang="ts">
import { ref } from 'vue'
import { useMakerState, type CharacterCard } from '../composables/useMakerState'
import { extractJsonFromPng } from '../utils/pngParser'
import { mergeWithTemplate } from '../utils/templateMerge'
import { templates, getTemplateById } from '../templates/templateRegistry'

const { setCharacterCard, fileName, selectedTemplateId } = useMakerState()
const fileInput = ref<HTMLInputElement | null>(null)
const error = ref<string>('')
const loading = ref(false)

function browseFile() {
    fileInput.value?.click()
}

async function handleFile(event: Event) {
    const input = event.target as HTMLInputElement
    if (!input.files?.length) return

    const file = input.files[0]
    error.value = ''
    loading.value = true

    try {
        let jsonString: string
        let pngBlob: Blob | null = null

        if (file.name.toLowerCase().endsWith('.png')) {
            const extracted = await extractJsonFromPng(file)
            if (!extracted) {
                throw new Error('No character card data found in PNG (missing "chara" tEXt chunk)')
            }
            jsonString = extracted
            pngBlob = file
        } else if (file.name.toLowerCase().endsWith('.json')) {
            jsonString = await file.text()
        } else {
            throw new Error('Unsupported file type. Please select a .json or .png file.')
        }

        const parsed = JSON.parse(jsonString) as CharacterCard

        // Validate it looks like a character card
        if (!parsed.data && !parsed.first_mes) {
            throw new Error('File does not appear to be a valid SillyTavern character card.')
        }

        // Normalize V1 cards or cards that have top-level fields but no data block
        if (!parsed.data) {
            parsed.data = {
                name: parsed.name || 'Unknown',
                description: parsed.description || '',
                personality: parsed.personality || '',
                scenario: parsed.scenario || '',
                first_mes: parsed.first_mes || '',
                mes_example: parsed.mes_example || '',
                creator_notes: '',
                system_prompt: '',
                post_history_instructions: '',
                alternate_greetings: [],
                tags: [],
                creator: '',
                character_version: '',
                extensions: {}
            }
        }

        // Merge user's character card into the selected template
        const selectedEntry = getTemplateById(selectedTemplateId.value)
        if (!selectedEntry) {
            throw new Error(`Template "${selectedTemplateId.value}" not found`)
        }
        const merged = mergeWithTemplate(parsed, selectedEntry.template, selectedEntry.genre)
        setCharacterCard(merged, file.name, pngBlob)
    } catch (e: unknown) {
        error.value = (e instanceof Error) ? e.message : 'Failed to load file'
    } finally {
        loading.value = false
        // Reset input so the same file can be re-selected
        input.value = ''
    }
}
</script>

<template>
    <div class="loader-bar">
        <input
            ref="fileInput"
            type="file"
            accept=".json,.png"
            style="display: none"
            @change="handleFile"
        />
        <div class="template-selector">
            <label class="template-label">Template:</label>
            <select v-model="selectedTemplateId" class="template-dropdown">
                <option value="" disabled>— choose template —</option>
                <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
        </div>
        <button class="btn-browse" @click="browseFile" :disabled="loading || !selectedTemplateId">
            {{ loading ? 'Loading...' : '📂 Load Character Card' }}
        </button>
        <span v-if="fileName" class="file-name">{{ fileName }}</span>
        <span v-if="error" class="error-msg">{{ error }}</span>
    </div>
</template>

<style scoped>
.loader-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 15px;
    background: #1a1d24;
    border-bottom: 1px solid #333;
    flex-wrap: wrap;
}

.template-selector {
    display: flex;
    align-items: center;
    gap: 6px;
}
.template-label {
    color: #81d4fa;
    font-size: 0.85rem;
    white-space: nowrap;
}
.template-dropdown {
    background: #1e2128;
    color: #e0f7fa;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 0.85rem;
    cursor: pointer;
}
.template-dropdown:focus {
    outline: none;
    border-color: #00e5ff;
}
.btn-browse {
    background: #0e639c;
    color: white;
    border: none;
    padding: 8px 16px;
    cursor: pointer;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.9rem;
    transition: background 0.2s;
}
.btn-browse:hover:not(:disabled) { background: #1177bb; }
.btn-browse:disabled { opacity: 0.5; cursor: not-allowed; }

.file-name {
    color: #81d4fa;
    font-size: 0.85rem;
    font-style: italic;
}

.error-msg {
    color: #ff5252;
    font-size: 0.85rem;
}
</style>
