<script setup lang="ts">
// The record card gene (GUI-DNA §5): a user-made record with many fields, drawn like a card: a header (the `toggle`
// slot for an enable switch, its icon, its name, the `pills` and `actions` slots, the collapse chevron) over its body.
import { ref } from 'vue'

const props = withDefaults(defineProps<{
    name: string
    icon?: string
    bodyClass?: string
    startsCollapsed?: boolean
}>(), { icon: '', bodyClass: 'smb-grid', startsCollapsed: false })

const isCollapsed = ref(props.startsCollapsed)
</script>

<template>
    <div class="smb-record" :class="{ 'is-collapsed': isCollapsed }">
        <div class="smb-record-header">
            <slot name="toggle" />
            <i v-if="icon" class="fa-solid" :class="icon"></i>
            <span class="smb-record-name">{{ name }}</span>
            <slot name="pills" />
            <slot name="actions" />
            <button type="button" class="smb-collapse" :aria-expanded="isCollapsed ? 'false' : 'true'" title="Show or hide"
                @click="isCollapsed = !isCollapsed"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
        <div class="smb-record-body" :class="bodyClass"><slot /></div>
    </div>
</template>
