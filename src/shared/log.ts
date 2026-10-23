// log.ts — the builder's console lines, each naming who wrote it: `[MvuStatMenuBuilder] [<source>] message`.
// error and warn only: the builder has no debug levels to gate. This is the one file that calls console.*.
import { APP_NAME } from '../utils/app-version'

export function createModuleLog(source: string) {
    const prefix = `[${APP_NAME}] [${source}]`
    return {
        error: (message: string, ...details: unknown[]) => console.error(prefix, message, ...details),
        warn: (message: string, ...details: unknown[]) => console.warn(prefix, message, ...details),
    }
}
