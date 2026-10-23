<script setup lang="ts">
// The dialog gene (GUI-DNA §5) for askConfirm(): the question first, what it touches one per line, one line per
// answer, then the button bar: the action (danger when it destroys something), then Cancel, which has the focus.
// Escape and Cancel answer no; a dialog that cannot open answers no and says why in the console.
import { ref, watch, nextTick } from 'vue'
import { pendingConfirm } from './confirm-dialog'
import { createModuleLog } from '../log'

const log = createModuleLog('confirm-dialog')
const dialog = ref<HTMLDialogElement | null>(null)

watch(pendingConfirm, async (pending) => {
    if (!pending) return
    await nextTick()
    try {
        if (!dialog.value) throw new Error('the dialog element is not mounted')
        dialog.value.showModal()
    } catch (error) {
        log.warn('the confirm dialog could not open, so the answer is no:', error)
        finish(false)
    }
})

function finish(isConfirmed: boolean) {
    const pending = pendingConfirm.value
    if (!pending) return
    pendingConfirm.value = null
    if (dialog.value?.open) dialog.value.close()
    pending.resolve(isConfirmed)
}
</script>

<template>
    <dialog ref="dialog" class="smb-ui smb-dialog" @cancel.prevent="finish(false)" @close="finish(false)">
        <template v-if="pendingConfirm">
            <div class="smb-dialog-body">
                <div class="smb-dialog-text">
                    <p>{{ pendingConfirm.question }}</p>
                    <p v-for="fact in pendingConfirm.facts || []" :key="fact.label">
                        {{ fact.label }}: <span class="smb-dialog-value">{{ fact.value }}</span>
                    </p>
                    <p v-for="answer in pendingConfirm.answers" :key="answer">{{ answer }}</p>
                </div>
            </div>
            <div class="smb-dialog-buttons">
                <button type="button" class="smb-btn" :class="pendingConfirm.isDanger ? 'smb-btn-danger' : 'smb-btn-primary'"
                    @click="finish(true)"><i v-if="pendingConfirm.actionIcon" class="fa-solid" :class="pendingConfirm.actionIcon"></i>{{ pendingConfirm.actionText }}</button>
                <button type="button" class="smb-btn" autofocus @click="finish(false)">Cancel</button>
            </div>
        </template>
    </dialog>
</template>
