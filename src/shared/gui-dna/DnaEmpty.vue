<script setup lang="ts">
// The empty state gene (GUI-DNA §5): a muted icon, one line, and an optional primary button in the default slot.
defineProps<{ icon: string; text: string }>()
</script>

<template>
    <div class="smb-empty">
        <i class="fa-solid" :class="icon"></i>
        <span>{{ text }}</span>
        <slot />
    </div>
</template>
