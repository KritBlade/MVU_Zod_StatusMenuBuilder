<script setup lang="ts">
// The notice gene (GUI-DNA §5): a full-width banner for a condition (a refusal, a read that failed, something missing):
// its icon, one sentence (`text`, or the default slot when it holds a code chip) and the `action` slot for the one fix
// it offers. Never for help.
import type { NoticeStatus } from './gene-types'

withDefaults(defineProps<{ status?: NoticeStatus; text?: string; isSpan?: boolean }>(), { status: 'info', text: '', isSpan: false })

const ICONS: Record<NoticeStatus, string> = { info: 'fa-circle-info', warning: 'fa-triangle-exclamation', danger: 'fa-circle-exclamation' }
</script>

<template>
    <div class="smb-notice" :class="['is-' + status, { 'smb-span': isSpan }]">
        <i class="fa-solid" :class="ICONS[status]"></i>
        <p class="smb-notice-text"><slot>{{ text }}</slot></p>
        <slot name="action" />
    </div>
</template>
