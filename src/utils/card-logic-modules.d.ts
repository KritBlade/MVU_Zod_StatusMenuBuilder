// Type surface for the card-editor's pure decision module. Plain .js DELIBERATELY: node runs it
// directly (tools/test-statusmenu-pack.mjs), which is what makes the regeneration guard testable.

declare module '*/card-logic-defaults.js' {
    export function defaultLogicBody(
        card: { type?: string; mappedKey?: string; title?: string; sourceType?: string; lorebookKey?: string },
        blockMappedKey?: string,
    ): string
    export function isUntouched(current: string | undefined, previousDefault: string): boolean
}
