// rt_htmlGenerators.d.ts — the TypeScript face of the plain-JS generators (B0).
//
// WHY A DECLARATION FILE AND NOT `allowJs`: allowJs is repo-wide. Turning it on made TypeScript
// analyse every OTHER .js module the app imports, replacing their implicit `any` with concrete
// inferred unions — which broke EventPackTab.vue with 9 errors in code this phase never touched
// (measured: 0 errors before, 9 after). A declaration file scopes the typing to this ONE module.
//
// This is the only copy of these signatures TypeScript reads — the JSDoc in rt_htmlGenerators.js
// documents the same shapes for anyone reading the implementation, so a signature change has to be
// made in BOTH. Keep them in step.

import type { CardConfig, BlockConfig, TabConfig } from '../../composables/useBuilderState'

export interface LocaleAccumulator {
    /** Registers a label and returns its key. */
    register(prefix: string, id: string, text: string): string
    /** The collected keys, in INSERTION order — the export merges them in that order. */
    entries(): Map<string, string>
}

/** One accumulator per render; the generators hold no module state. */
export function createLocaleAccumulator(): LocaleAccumulator

export function escapeHtml(str: string): string

/** Links — the URL a link click shows as an image inside the menu, or '' for a click the browser keeps. */
export function menuLinkImageUrl(rawHref: unknown, baseUrl: string): string

/** ActionButton (B5 step 1) — the click-side validation of what a button will post. */
export const RESERVED_ACTION_ARG_KEYS: string[]
export function actionNameProblem(name: unknown): string
export function actionArgsProblem(args: unknown): string
/** Row actions (D8) — the verbs a list cell puts on every row. */
export function rowActionsProblem(list: unknown): string
export function encodeJsonAttribute(value: unknown): string
export function generateCss(globalCssContent: string): string
export function generateCardHtml(
    card: CardConfig,
    blockKey: string | undefined,
    absolutePrefix: string | undefined,
    locale: LocaleAccumulator,
): string
export function generateBlockHtml(block: BlockConfig, locale: LocaleAccumulator): string
export function generateTabHtml(tab: TabConfig, index: number, locale: LocaleAccumulator): string
export function generateTemplates(customTemplatesList: { name: string; html: string }[]): string
