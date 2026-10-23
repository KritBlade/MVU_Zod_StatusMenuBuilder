// The one place the app's version is read. The number lives in landing-app/package.json; Vite injects
// it at build time (`define` in vite.config.ts), so the header and every pack's `builtWith` stamp carry
// the same value and nothing else in src/ spells a version out.
export const APP_NAME = 'MvuStatMenuBuilder'
export const APP_VERSION: string = __APP_VERSION__
export const BUILT_WITH = APP_NAME + ' ' + APP_VERSION
