// copy-text.ts — puts text on the clipboard. A refusal (no permission, a page that is not secure) is logged and
// answered false, so the button that asked can say so.
import { createModuleLog } from './log'

const log = createModuleLog('clipboard')

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch (error) {
        log.warn('the clipboard refused the copy:', error)
        return false
    }
}
