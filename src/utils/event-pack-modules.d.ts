// Type surface for the event-pack pure modules. They stay plain .js DELIBERATELY: node runs them
// directly (tools/test-event-pack.mjs), and when-dsl-grammar.js must remain byte-identical to
// mvu-helper's copy (three-file sync). These declarations are the TS boundary only.

declare module '*/event-pack-card-ingest.js' {
    export interface EventPackHeaders {
        format: string
        paths: Record<string, string>
        fx: string[]
        sugar: string[]
        scopes: string[]
    }
    export type IngestResult =
        | { ok: true; cardName: string; headers: EventPackHeaders; statData: Record<string, unknown>; dslPaths: string[] }
        | { ok: false; reason: string }
    export function ingestCard(bytesOrText: string | Uint8Array | ArrayBuffer): IngestResult
    export function parseCardFile(bytesOrText: string | Uint8Array | ArrayBuffer): { ok: boolean; card?: unknown; reason?: string }
    /** What the card's engine declares about event packs, read by RUNNING the engine bundle. */
    export function readEngineDeclarations(code: string): { ok: boolean; headers?: EventPackHeaders; reason?: string }
    export function deriveDslPaths(statData: Record<string, unknown>): string[]
    export function isCardDeclaredLhs(lhs: string, declaredPaths: string[]): boolean
    export function collectionItemKeys(declaredPaths: string[]): string[]
    export function booleanMemberSelectors(statData: Record<string, unknown>, collectionPath: string): string[]
    export function canonicalRosterKey(typed: string, candidateKeys: string[]): string
}

declare module '*/event-pack-serializer.js' {
    export function slug(s: string): string
    export function packId(creator: string, event: string): string
    export function keyPrefix(creator: string, event: string): string
    export function isSharedWrite(entry: unknown): boolean
    export function writeRecordKey(entry: unknown, typed: string): string
    export function canOwnRecords(entry: unknown): boolean
    export function deriveFormat(pack: { triggers: unknown[] }): string
    export function emitPack(
        pack: unknown,
        opts: { armedPath: string; builtWith?: string },
    ): { ok: true; text: string; format: string } | { ok: false; reason: string }
    export function parsePackFile(
        text: string,
    ): { ok: true; packs: any[]; armedPath: string; warnings: string[] } | { ok: false; reason: string }
}

declare module '*/event-pack-artifact.js' {
    export function artifactIdFromPackId(packId: string): string
    export function eventPackArtifactMembers(input: {
        text: string
        packId: string
        version: string
        eventName?: string
        builtWith?: string
    }): { folder: string; members: Array<{ path: string; text: string }>; errors: string[] }
}
