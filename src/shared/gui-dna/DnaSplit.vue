<script setup lang="ts">
// The split gene (GUI-DNA §4–§5): the `start` and `end` panes (one element each, a pane card) and the divider between
// them. The divider sets --smb-split-start, the start pane's width, while it is dragged or moved with the keys (the
// arrows 16px a step, Home and End to the limits): the one style a script writes. Each pane keeps
// `minimumPaneWidth`; the width is not saved.
//
// The width asked for is kept apart from the width shown: the shown one is the asked one fitted to the split as it is
// now, so a split measured while its page is hidden (0 wide) or a narrowed window never loses what was asked for.
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{ initialStartWidth?: number; minimumPaneWidth?: number }>(), {
    initialStartWidth: 400,
    minimumPaneWidth: 240,
})

const KEY_STEP = 16
const DIVIDER_WIDTH = 12

const split = ref<HTMLDivElement | null>(null)
const startWidth = ref(props.initialStartWidth)
const widestStartWidth = ref(props.initialStartWidth)
const isDragging = ref(false)
let askedStartWidth = props.initialStartWidth
let sizeWatcher: ResizeObserver | null = null

function showStartWidth() {
    const splitWidth = split.value?.getBoundingClientRect().width ?? 0
    if (!splitWidth) return   // a hidden page: nothing to fit to until it shows
    widestStartWidth.value = Math.max(props.minimumPaneWidth, Math.round(splitWidth - DIVIDER_WIDTH - props.minimumPaneWidth))
    startWidth.value = Math.round(Math.min(Math.max(askedStartWidth, props.minimumPaneWidth), widestStartWidth.value))
    split.value?.style.setProperty('--smb-split-start', startWidth.value + 'px')
}

function askStartWidth(width: number) {
    askedStartWidth = width
    showStartWidth()
    askedStartWidth = startWidth.value
}

onMounted(() => {
    showStartWidth()
    sizeWatcher = new ResizeObserver(showStartWidth)
    if (split.value) sizeWatcher.observe(split.value)
})
onBeforeUnmount(() => sizeWatcher?.disconnect())

function startDrag(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    isDragging.value = true
}

function drag(event: PointerEvent) {
    if (!isDragging.value || !split.value) return
    askStartWidth(event.clientX - split.value.getBoundingClientRect().left)
}

function stopDrag() {
    isDragging.value = false
}

const KEY_MOVES: Record<string, () => number> = {
    ArrowLeft: () => startWidth.value - KEY_STEP,
    ArrowRight: () => startWidth.value + KEY_STEP,
    Home: () => props.minimumPaneWidth,
    End: () => widestStartWidth.value,
}

function moveWithKey(event: KeyboardEvent) {
    const move = KEY_MOVES[event.key]
    if (!move) return
    event.preventDefault()
    askStartWidth(move())
}
</script>

<template>
    <div ref="split" class="smb-split">
        <slot name="start" />
        <div class="smb-split-divider" :class="{ 'is-dragging': isDragging }" role="separator" aria-orientation="vertical"
            aria-label="Resize the panes" title="Drag to resize the panes" tabindex="0"
            :aria-valuenow="startWidth" :aria-valuemin="minimumPaneWidth" :aria-valuemax="widestStartWidth"
            @pointerdown="startDrag" @pointermove="drag" @pointerup="stopDrag" @pointercancel="stopDrag" @keydown="moveWithKey"></div>
        <slot name="end" />
    </div>
</template>
