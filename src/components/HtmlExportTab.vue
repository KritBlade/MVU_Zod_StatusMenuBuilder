<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMakerState } from '../composables/useMakerState'
import { embedJsonInPng } from '../utils/pngParser'
import defaultCoverUrl from '../assets/cover.jpg'
import { APP_NAME, APP_VERSION } from '../version'
import { getTemplateById } from '../templates/templateRegistry'

const { characterCard, cardName, originalPngBlob, selectedTemplateId } = useMakerState()

const bannerText = computed(() => {
    const genre = getTemplateById(selectedTemplateId.value)?.genre ?? 'Unknown'
    return `${APP_NAME} - ${genre} v${APP_VERSION}`
})

const selectedPngFile = ref<File | null>(null)
const pngFileInput = ref<HTMLInputElement | null>(null)

const generatedOutput = computed(() => {
    if (!characterCard.value) return '// Load a character card first'
    return JSON.stringify(characterCard.value, null, 2)
})

function copyJson() {
    navigator.clipboard.writeText(generatedOutput.value)
    alert('Copied to clipboard!')
}

function downloadJson() {
    const blob = new Blob([generatedOutput.value], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${cardName.value || 'character'}.json`
    a.click()
    URL.revokeObjectURL(url)
}

function selectPngFile() {
    pngFileInput.value?.click()
}

function onPngFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
        selectedPngFile.value = input.files[0]
    }
}

/**
 * Convert any image blob (JPG, PNG, WebP, etc.) to a PNG blob via canvas
 */
function convertToPng(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(blob)
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            canvas.toBlob((pngBlob) => {
                URL.revokeObjectURL(url)
                if (pngBlob) resolve(pngBlob)
                else reject(new Error('Canvas toBlob failed'))
            }, 'image/png')
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to load image'))
        }
        img.src = url
    })
}

/**
 * Convert image blob to PNG and overlay a text banner at the top
 */
function convertToPngWithBanner(blob: Blob, bannerText: string = 'Mvu Game Maker - RPG'): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(blob)
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)

            const fontSize = Math.max(16, Math.floor(canvas.width / 25))
            ctx.font = `bold ${fontSize}px 'Segoe UI', Arial, sans-serif`
            const bannerHeight = fontSize * 2

            ctx.fillStyle = 'rgba(0, 10, 30, 0.75)'
            ctx.fillRect(0, 0, canvas.width, bannerHeight)

            ctx.fillStyle = '#00e5ff'
            ctx.fillRect(0, bannerHeight - 2, canvas.width, 2)

            ctx.fillStyle = '#e0f7fa'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(bannerText, canvas.width / 2, bannerHeight / 2)

            canvas.toBlob((pngBlob) => {
                URL.revokeObjectURL(url)
                if (pngBlob) resolve(pngBlob)
                else reject(new Error('Canvas toBlob failed'))
            }, 'image/png')
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to load image'))
        }
        img.src = url
    })
}

async function downloadPngCard() {
    if (!characterCard.value) {
        alert('No character card loaded')
        return
    }
    
    try {
        let pngBlob: Blob
        
        if (selectedPngFile.value) {
            // User-selected file: convert + add banner
            pngBlob = await convertToPngWithBanner(selectedPngFile.value, bannerText.value)
        } else if (originalPngBlob.value) {
            // User's original loaded PNG: add banner
            pngBlob = await convertToPngWithBanner(originalPngBlob.value, bannerText.value)
        } else {
            // Use bundled default cover image (inlined as base64 by vite-plugin-singlefile)
            const response = await fetch(defaultCoverUrl)
            if (!response.ok) {
                alert('Failed to load default cover image.')
                return
            }
            const imgBlob = await response.blob()
            pngBlob = await convertToPng(imgBlob)
        }
        
        const cardPng = await embedJsonInPng(pngBlob, characterCard.value)
        const url = URL.createObjectURL(cardPng)
        const a = document.createElement('a')
        a.href = url
        a.download = `${cardName.value || 'character'}.png`
        a.click()
        URL.revokeObjectURL(url)
    } catch (error) {
        alert(`Error embedding JSON in PNG: ${error}`)
    }
}
</script>

<template>
    <div class="export-tab">
        <div class="toolbar">
            <button class="btn-primary" @click="copyJson" :disabled="!characterCard">Copy JSON</button>
            <button class="btn-primary" @click="downloadJson" :disabled="!characterCard">Download JSON</button>
            <div class="png-export-section">
                <input 
                    ref="pngFileInput" 
                    type="file" 
                    accept="image/png,image/jpeg,image/webp" 
                    style="display: none" 
                    @change="onPngFileSelected"
                />
                <button class="btn-secondary" @click="selectPngFile">
                    {{ selectedPngFile ? '✓ PNG Selected' : 'Select PNG Image' }}
                </button>
                <button 
                    class="btn-primary" 
                    @click="downloadPngCard" 
                    :disabled="!characterCard"
                >
                    Download PNG Card
                </button>
            </div>
            <span class="hint">Export as JSON or embed into PNG. Uses default image if none selected.</span>
        </div>
        <div class="code-viewport">
            <textarea readonly :value="generatedOutput" class="code-editor"></textarea>
        </div>
    </div>
</template>

<style scoped>
.export-tab {
    display: flex; flex-direction: column; height: 100%; background: #0f1115;
}
.toolbar {
    height: 70px; background: #1a1d24; border-bottom: 1px solid #333;
    display: flex; align-items: center; gap: 15px; padding: 0 20px;
    flex-wrap: wrap;
}
.png-export-section {
    display: flex; gap: 10px; align-items: center;
    padding-left: 15px; border-left: 1px solid #444;
}
.code-viewport { flex: 1; overflow: hidden; background: #1e1e1e; }
.code-editor {
    width: 100%; height: 100%;
    background: #1e1e1e; color: #d4d4d4;
    border: none; padding: 15px;
    font-family: 'Consolas', monospace; font-size: 13px;
    resize: none; outline: none;
}
.btn-primary {
    background: #0e639c; color: white; border: none;
    padding: 6px 12px; cursor: pointer; border-radius: 2px;
    white-space: nowrap;
}
.btn-secondary {
    background: #3a3d41; color: white; border: none;
    padding: 6px 12px; cursor: pointer; border-radius: 2px;
    white-space: nowrap;
}
.btn-primary:disabled, .btn-secondary:disabled { 
    opacity: 0.4; cursor: not-allowed; 
}
.btn-primary:hover:not(:disabled) { background: #1177bb; }
.btn-secondary:hover:not(:disabled) { background: #4a4d51; }
.hint { 
    color: #666; font-size: 0.8rem; font-style: italic; 
    flex: 1; min-width: 200px;
}
</style>
