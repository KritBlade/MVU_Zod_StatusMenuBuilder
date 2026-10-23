<script setup lang="ts">
// The field gene (GUI-DNA §5): a label row (the label, the (?) when there is a detail, and the `label-actions` slot),
// the control in the default slot, a one-line hint (`hint`, or the `hint` slot when it holds a code chip), the detail
// the (?) opens, and the "More detail" link to the guide, shown with the detail. `forId` names the control a <label>
// points at; without it the label is a caption over a group of controls.
import { ref } from 'vue'

withDefaults(defineProps<{
    label: string
    forId?: string
    hint?: string
    detail?: string
    moreHref?: string
    isSpan?: boolean
}>(), { forId: '', hint: '', detail: '', moreHref: '', isSpan: false })

const isHelpOpen = ref(false)
</script>

<template>
    <div class="smb-field" :class="{ 'smb-span': isSpan, 'is-help-open': isHelpOpen }">
        <div class="smb-field-label">
            <label v-if="forId" :for="forId">{{ label }}</label>
            <span v-else>{{ label }}</span>
            <button v-if="detail" type="button" class="smb-help-toggle" :aria-expanded="isHelpOpen ? 'true' : 'false'"
                title="More about this" @click="isHelpOpen = !isHelpOpen"><i class="fa-solid fa-circle-question"></i></button>
            <slot name="label-actions" />
        </div>
        <slot />
        <p v-if="hint || $slots.hint" class="smb-hint"><slot name="hint">{{ hint }}</slot></p>
        <p v-if="detail" class="smb-detail">{{ detail }}</p>
        <a v-if="detail && moreHref" class="smb-more" :href="moreHref" target="_blank" rel="noopener">
            <i class="fa-solid fa-book-open"></i><span>More detail</span>
        </a>
    </div>
</template>
