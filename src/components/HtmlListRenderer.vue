<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { renderTemplateList } from '../utils/templateRenderer'

const props = defineProps<{
    data: any
    templateId: string
    emptyText?: string
    shouldFlatten?: boolean
}>()

const container = ref<HTMLElement | null>(null)

// Modal State for Option A
const showModal = ref(false)
const modalTitle = ref('')
const modalContent = ref<any>({})

// Global shim to allow inline onclick from templateRenderer
const openModal = (title: string, data: any) => {
    modalTitle.value = title
    modalContent.value = data
    showModal.value = true
}

onMounted(() => {
    // Expose global method for inline onclicks
    (window as any).showModal = openModal
    render()
})

onUnmounted(() => {
    // Cleanup if needed
})

watch(() => [props.data, props.templateId], () => {
    render()
}, { deep: true })

function render() {
    if (container.value) {
        renderTemplateList(container.value, props.data, props.templateId, props.emptyText, props.shouldFlatten)
    }
}
</script>

<template>
    <div class="html-list-renderer-root">
        <div ref="container"></div>

        <!-- Detail Modal (Builder Version) — its look comes from the project's sheet variables, the same
             five the exported modal resolves, so the preview shows what the card will show -->
        <div v-if="showModal" class="html-renderer-modal-overlay" @click.self="showModal = false">
            <div class="html-renderer-modal">
                <div class="modal-header">
                    <h3>{{ modalTitle }}</h3>
                    <button @click="showModal = false" class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Clean Table Layout -->
                    <table class="detail-table" v-if="typeof modalContent === 'object'">
                        <tbody>
                            <tr v-for="(val, key) in modalContent" :key="key">
                                <template v-if="key !== '$key' && key !== 'name'">
                                    <td class="detail-key">{{ key }}</td>
                                    <td class="detail-val">{{ val }}</td>
                                </template>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else>{{ modalContent }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.html-renderer-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999; /* Higher z-index to ensure visibility */
}
.html-renderer-modal {
    background: var(--background-card);
    border: 1px solid var(--accent-primary);
    padding: 20px;
    border-radius: 8px;
    width: 300px;
    max-width: 90%;
    color: var(--text-primary);
}
.modal-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; border-bottom: 1px solid var(--border-color);
    padding-bottom: 5px;
}
.close-btn {
    background: none; border: none; color: var(--text-primary); font-size: 1.5em; cursor: pointer;
}
.detail-table {
    width: 100%;
    border-collapse: collapse;
    border-left: 2px solid var(--accent-primary);
    padding-left: 10px;
}
.detail-table td {
    padding: 6px 8px;
    vertical-align: top;
}
.detail-key {
    color: var(--accent-primary);
    font-weight: bold;
    width: 100px;
    text-align: left;
}
.detail-key::after {
    content: ':';
}
.detail-val {
    color: var(--text-primary);
}
</style>
