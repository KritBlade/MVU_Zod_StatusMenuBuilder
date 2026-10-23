// Type surface for the StatusMenu Pack export module. It stays plain .js DELIBERATELY: node runs it
// directly (tools/test-statusmenu-pack.mjs), the same way the event-pack modules do. These
// declarations are the TS boundary only.

declare module '*/statusmenu-pack-export.js' {
    /** The renderer's declaration. The host carries it verbatim and reads nothing inside it. */
    export interface StatusMenuLayout {
        kind: string
        format: string
        tabs: unknown[]
        globalCss: string
        staticLocale: Record<string, string>
        collectionPaths: string[]
        customTemplates?: Array<{ name: string; html: string }>
    }
    export interface StatusMenuPackFile {
        format: string
        packType: 'statusmenu'
        id: string
        name: string
        description: string
        version: string
        builtWith: string
        engine: string
        layout: StatusMenuLayout
        targetsPackId?: string
        /** D7 — the pack-host shell, present on the single-file emit and absent from what the archives slice. */
        regex?: ShellRegexScript[]
    }
    export interface LiftedFormatter { name: string; path: string; field: string }
    export interface BuildResult {
        ok: boolean
        pack: StatusMenuPackFile | null
        errors: string[]
        warnings: string[]
        lifted: { formatters: LiftedFormatter[]; labels: Array<{ path: string; value: string }> }
        /** The engine as the workspace keeps it, in load order: layoutFormatters.cjs, then statusMenuLogic.cjs. Joined, they are `pack.engine`. */
        engineFiles: EngineFile[]
    }
    export interface EngineFile { name: string; text: string }
    export interface PackMeta {
        name: string
        description: string
        id?: string
        version?: string
        targetsPackId?: string
        builtWith?: string
        tabIds?: string[]
        formatterNames?: Record<string, string>
    }
    export interface ProjectSource {
        layout: unknown[]
        globalCss?: string
        staticLocale?: Record<string, string>
        collectionPaths?: Iterable<string>
        customTemplates?: Array<{ name: string; html: string }>
    }

    export const LAYOUT_KIND: string
    export const LAYOUT_FORMAT: string
    export const PACK_FILE_FORMAT: string

    export function buildStatusMenuPack(project: ProjectSource, meta: PackMeta): BuildResult
    export function validatePackDraft(pack: unknown): { errors: string[]; warnings: string[] }
    export function liftCustomLogic(tabs: unknown[], nameOverrides?: Record<string, string>): {
        layout: unknown[]
        formatters: Array<{ name: string; body: string; path: string; field: string }>
        labels: Array<{ path: string; value: string }>
        warnings: string[]
    }
    export function walkLayoutNodes(tabs: unknown[], visit: (node: any, path: string) => void): void
    export function readLiteralBody(body: string): string | null
    export function derivePackId(name: string): string
    export function suggestFormatterName(node: any, taken: Set<string>): string
    export function formatterFieldFor(node: any): string
    export const LAYOUT_FORMATTERS_FILE: string
    export const ENGINE_FILE: string
    export function buildLayoutFormattersText(formatters: Array<{ name: string; body: string; path: string; field: string; blockMappedKey?: string }>): string
    export function buildEngineText(packId: string, version: string): string
    export function readEngineExports(engineText: string): { ok: boolean; error: string; formatters: string[]; actions: string[] }
    export function scopePackCss(css: string, packId: string): { css: string; errors: string[]; warnings: string[] }
    export function scopeLocaleKeys(staticLocale: Record<string, string>, packId: string): Record<string, string>

    /** B6 — the artifact archives, each a re-slicing of buildStatusMenuPack's own result. */
    export interface ArchiveMember { path: string; text: string }
    /** Structurally the shell script from statusmenu-shell-export.js; the archive only carries it. */
    export interface ShellRegexScript { script_name: string; find_regex: string; replace_string: string }
    export function bootstrapArchiveMembers(pack: StatusMenuPackFile, shellRegexScript: ShellRegexScript, engineFiles: EngineFile[]): ArchiveMember[]
    export function refreshArchiveMembers(pack: StatusMenuPackFile, shellRegexScript: ShellRegexScript, engineFiles: EngineFile[]): ArchiveMember[]
    /** D7 — the single-file emit as it ships: the same pack, plus the shell that draws it. THROWS without one. */
    export function packFileWithShell(pack: StatusMenuPackFile, shellRegexScript: ShellRegexScript): StatusMenuPackFile
}

// The pack-host SHELL (B2) — the regex that draws the menu, carrying no project data and identical
// for every pack. Same plain-.js reason: tools/test-statusmenu-pack.mjs runs it directly.
declare module '*/statusmenu-shell-export.js' {
    export interface ShellRegexScript {
        id: string
        script_name: string
        enabled: boolean
        find_regex: string
        replace_string: string
        trim_strings: string[]
        source: Record<string, boolean>
        destination: Record<string, boolean>
        run_on_edit: boolean
        min_depth: number | null
        max_depth: number | null
    }
    export const SHELL_SCRIPT_NAME: string
    export const SHELL_REGEX_ID: string
    export const SHELL_PLACEHOLDER: string
    export const SHELL_RUNTIME_ORDER: string[]
    export function buildPackHostShellHtml(input: { runtimeParts: Record<string, string>; css: string }): { html: string; errors: string[] }
    export function buildShellRegexScript(html: string): ShellRegexScript
    export function shellArchiveMember(shellRegexScript: ShellRegexScript): { path: string; text: string }
}

// The stored-ZIP writer (B6). Plain .js for the same node-runnable reason as the export module.
declare module '*/stored-zip.js' {
    export function crc32(bytes: Uint8Array): number
    export function buildStoredZip(members: Array<{ path: string; text: string }>): Uint8Array
}
