<script setup lang="ts">
// The card gene (GUI-DNA §5): a header on a tinted band (badge, title, one-line description, the `actions` slot, the
// collapse chevron) over its body. `isPane` makes it a workbench pane: it fills its share, its body scrolls and it
// does not collapse. `guideHref` adds a header link to this card's section of the guide.
import { ref } from 'vue'

withDefaults(defineProps<{
    title: string
    description?: string
    badgeIcon?: string
    badgeText?: string
    isPane?: boolean
    bodyClass?: string
    guideHref?: string
}>(), { description: '', badgeIcon: '', badgeText: '', isPane: false, bodyClass: '', guideHref: '' })

const isCollapsed = ref(false)
</script>

<template>
    <section class="smb-card" :class="{ 'is-pane': isPane, 'is-collapsed': isCollapsed }">
        <header class="smb-card-header">
            <span v-if="badgeIcon || badgeText" class="smb-badge">
                <i v-if="badgeIcon" class="fa-solid" :class="badgeIcon"></i>
                <template v-else>{{ badgeText }}</template>
            </span>
            <h3 class="smb-card-title">{{ title }}</h3>
            <p v-if="description" class="smb-card-desc">{{ description }}</p>
            <div v-if="$slots.actions || guideHref" class="smb-card-actions">
                <slot name="actions" />
                <a v-if="guideHref" class="smb-btn smb-btn-icon" :href="guideHref" target="_blank" rel="noopener"
                    title="Open this part of the guide"><i class="fa-solid fa-book-open"></i></a>
            </div>
            <button v-if="!isPane" type="button" class="smb-collapse" :aria-expanded="isCollapsed ? 'false' : 'true'"
                title="Show or hide" @click="isCollapsed = !isCollapsed"><i class="fa-solid fa-chevron-up"></i></button>
        </header>
        <div class="smb-card-body" :class="bodyClass"><slot /></div>
    </section>
</template>
