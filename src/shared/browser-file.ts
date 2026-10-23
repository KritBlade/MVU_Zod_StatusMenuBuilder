// browser-file.ts — the builder's two file doors: a download the user saves, and a file the user picks.
//
// A PICKER IS MADE FOR EACH PICK and never joins the page (GUI-DNA §7): an <input type="file"> left in the page fires
// a `cancel` that bubbles when the picker is dismissed.

/** Hands `blob` to the browser as a download named `name`. */
export function saveFile(name: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
}

/** Opens the file picker for `accept` (e.g. ".json,.png"); resolves with the picked file, or null when dismissed. */
export function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const picker = document.createElement('input')
        picker.type = 'file'
        picker.accept = accept
        picker.addEventListener('change', () => resolve(picker.files?.[0] ?? null), { once: true })
        picker.addEventListener('cancel', () => resolve(null), { once: true })
        picker.click()
    })
}
