<script setup lang="ts">
// The page header gene (GUI-DNA §5): icon tile, eyebrow "<group> / <tab>", title and one-line subtitle; the tab's
// status pills go in the `status` slot.
defineProps<{ icon: string; eyebrow: string; title: string; subtitle: string }>()
</script>

<template>
    <header class="smb-page-header">
        <span class="smb-page-icon"><i class="fa-solid" :class="icon"></i></span>
        <div class="smb-page-heading">
            <div class="smb-page-eyebrow">{{ eyebrow }}</div>
            <h2 class="smb-page-title">{{ title }}</h2>
            <p class="smb-page-subtitle">{{ subtitle }}</p>
        </div>
        <div class="smb-page-status"><slot name="status" /></div>
    </header>
</template>
