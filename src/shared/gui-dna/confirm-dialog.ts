// confirm-dialog.ts — the builder's one confirm helper (GUI-DNA §7). askConfirm() opens DnaConfirmDialog, which the
// shell mounts once, and resolves true only when its action button is pressed; a dialog that cannot open answers no.
// Every destructive action, and every load over work in progress, asks through here; never the browser's confirm().
// So every question here is destructive, and opens on Cancel (DnaConfirmDialog).
import { shallowRef } from 'vue'

export interface ConfirmQuestion {
    question: string                                // one line, shown bold
    facts?: { label: string; value: string }[]      // what it touches, one per line, the value bold
    answers: string[]                               // one line per answer, each naming its button
    actionText: string                              // the action button's verb
    actionIcon?: string
    isDanger?: boolean                              // a safety question only (GUI-DNA §7): a danger button, not a primary one
}

export interface PendingConfirm extends ConfirmQuestion {
    resolve: (isConfirmed: boolean) => void
}

export const pendingConfirm = shallowRef<PendingConfirm | null>(null)

export function askConfirm(question: ConfirmQuestion): Promise<boolean> {
    // One question at a time: a second one while the first is open is answered no, never stacked over it.
    if (pendingConfirm.value) return Promise.resolve(false)
    return new Promise((resolve) => { pendingConfirm.value = { ...question, resolve } })
}
