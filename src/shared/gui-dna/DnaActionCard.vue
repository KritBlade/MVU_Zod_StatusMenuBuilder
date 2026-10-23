<script setup lang="ts">
// The action card gene (GUI-DNA §5): an icon, a title, a description of at most two lines, and its one button in the
// default slot. `isPrimary` marks the grid's main action.
withDefaults(defineProps<{ icon: string; title: string; description: string; isPrimary?: boolean }>(), { isPrimary: false })
</script>

<template>
    <div class="smb-action-card" :class="{ 'is-primary': isPrimary }">
        <i class="fa-solid smb-action-icon" :class="icon"></i>
        <span class="smb-action-title">{{ title }}</span>
        <p class="smb-action-desc">{{ description }}</p>
        <slot />
    </div>
</template>
