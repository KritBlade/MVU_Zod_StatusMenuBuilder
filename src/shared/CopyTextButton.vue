<script setup lang="ts">
// A copy button that says what happened: a "Copied" pill after the copy, "Copy failed" when the clipboard refuses.
import { ref, onBeforeUnmount } from 'vue'
import { copyText } from './copy-text'

const props = withDefaults(defineProps<{ text: string; label: string; isPrimary?: boolean; isDisabled?: boolean }>(), {
    isPrimary: false,
    isDisabled: false,
})

const outcome = ref<'' | 'copied' | 'failed'>('')
let clearTimer = 0

async function copy() {
    const isCopied = await copyText(props.text)
    outcome.value = isCopied ? 'copied' : 'failed'
    window.clearTimeout(clearTimer)
    clearTimer = window.setTimeout(() => { outcome.value = '' }, 2500)
}

onBeforeUnmount(() => window.clearTimeout(clearTimer))
</script>

<template>
    <button type="button" class="smb-btn" :class="{ 'smb-btn-primary': isPrimary }" :disabled="isDisabled" @click="copy">
        <i class="fa-solid fa-copy"></i>{{ label }}
    </button>
    <span v-if="outcome === 'copied'" class="smb-pill is-success">Copied</span>
    <span v-else-if="outcome === 'failed'" class="smb-pill is-danger">Copy failed</span>
</template>
