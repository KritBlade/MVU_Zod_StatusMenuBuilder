<script setup lang="ts">
// The result list gene (GUI-DNA §5): the outcome of a validation, an import or a generation, one line per finding with
// its status icon, under an optional heading.
import type { ResultLine, ResultStatus } from './gene-types'

withDefaults(defineProps<{ lines: ResultLine[]; heading?: string; isSpan?: boolean }>(), { heading: '', isSpan: false })

const ICONS: Record<ResultStatus, string> = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation', danger: 'fa-circle-xmark' }
</script>

<template>
    <ul class="smb-result" :class="{ 'smb-span': isSpan }">
        <li v-if="heading" class="smb-result-heading">{{ heading }}</li>
        <li v-for="(line, index) in lines" :key="index" class="smb-result-line" :class="'is-' + line.status">
            <i class="fa-solid" :class="ICONS[line.status]"></i><span>{{ line.text }}</span>
        </li>
    </ul>
</template>
