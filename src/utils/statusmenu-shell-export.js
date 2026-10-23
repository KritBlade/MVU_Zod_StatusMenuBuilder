// Builds the PACK-HOST SHELL — the one regex a card needs before any StatusMenu Pack can render
// (plan B2; mvu-helper authority Track 2 G4 installs it).
//
// The shell is the menu's BODY: the runtime parts, the container, an EMPTY tab nav and the built-in
// list templates. It bakes NO layout data — no tabs, no locale, no collection paths — because every
// tab, every collection path, every locale key and every scoped stylesheet arrives at load time from
// the installed pack (`rt_packLayout.js`). That is the
// one-renderer rule (§B.7d): baked tabs in the regex are a SECOND renderer of `layout/`, and the day
// a card had both it showed every tab twice.
//
// It carries no pack identity either. The ONE thing that differs between two shells is the
// stylesheet: the menu's CHROME — the container, the tab nav, the detail modal — lives OUTSIDE every
// `[data-pack]` element (rt_packLayout stamps only the nav button and the tab pane), so a pack's
// scoped CSS provably cannot reach it and the chrome's look has to ride here. That stylesheet is the
// project's Global CSS (Templates tab) and nothing else. The app's own sheet (`utils/sharedStyles.ts`)
// is the editor's SEED for a new project, never a layer under a shipped menu: a project declares its
// whole look, and a rule the app gains later reaches a menu only when its author takes it into the
// project's sheet. An empty project sheet is refused, not filled from the app's.
//
// NOT the Export HTML tab, and deliberately not sharing its assembly. That lane bakes a project's
// tabs, CSS and locale into a THROWAWAY file with its own in-file formatter resolver and a paste
// region for `statusMenuLogic.cjs`; it is unreachable from the pack lane and §B.7d says to keep it
// that way. What the two share is the runtime PARTS' source text, nothing else.
//
// Pure by construction — no DOM, no Vue, no file I/O, no `?raw` imports. The caller supplies the
// parts' text and the stylesheet, so `tools/test-statusmenu-pack.mjs` builds the same shell the app
// ships (L6).
//
// WHERE THE SHELL RUNS. mvu-helper lifts the fenced document out of the regex row at install and runs
// it in its own frame, `sandbox="allow-scripts allow-modals"` with no allow-same-origin
// (mvu-helper doc/statusmenu-pack-format.md §7). The frame's origin is opaque: reading ANY property of
// window.parent or window.top throws, and a read at module top level kills the whole menu. So every
// runtime part reads its OWN window first and reaches the parent only inside a try; the host defines
// the TavernHelper names the parts ask for in-frame, and answers the rest over postMessage.
// `tools/test-contained-frame.mjs` loads the parts against a parent whose every read throws and pins
// the complete inventory of parent reaches — a new one fails there until it is shown to be guarded.

import { generateTemplates } from '../components/exporttab-parts/rt_htmlGenerators.js';

// ST's regex identity is `script_name` (mvu-helper rule 10: `id` is per-installation and cannot be
// matched across cards), so the name is the contract and the id is only a stable filler — fixed, not
// generated, because the bootstrap archive's bytes must be deterministic.
export const SHELL_SCRIPT_NAME = 'StatusMenu';
export const SHELL_REGEX_ID = '9f2c1a34-5d7e-4b16-8a90-3c5e7d1b4f28';

// What the regex replaces. The card's prompt emits this placeholder and G4 enforces exactly one
// enabled owner of it.
export const SHELL_PLACEHOLDER = '<StatusPlaceHolderImpl/>';

// THE REGION BOUNDARY mvu-helper publishes, restated here because the two repos share no code.
// Byte-identical to its `src/shared/rendered-region.js`, and pinned that way by
// `tools/test-pack-layout.mjs` — the same discipline the wire constants live under, for the same
// reason: a second spelling of a published contract is a second thing that can drift.
//
// WHAT IT BUYS. A message is built by an HTML parser, and a parser cannot reject a tag that never
// closes — it supplies the closing tag at end of input. So one unclosed tag anywhere in a reply
// adopts everything after it, and the menu, placed LAST on purpose by the marker-last rule, is
// adopted with certainty. Measured live 2026-09-03: a preset had the model author its own
// collapsible block, the model wrote one more opener than closer, and the menu rendered inside the
// survivor at 150px instead of 948. Wrapped, the menu is one findable element, and mvu-helper moves
// it back to the message it belongs to. Unwrapped, nothing can tell the menu from the prose.
//
// It also announces the boundary to any other extension reshaping a message: this is ours, move or
// skip it whole, do not walk into it.
export const REGION_ATTRIBUTE = 'data-mvu-helper';
export const REGION_CLASS = 'mvu-helper-region';
export const REGION_NAME = 'statusmenu';
export const REGION_CONTRACT_ATTRIBUTE = 'data-mvu-helper-contract';
export const REGION_CONTRACT_NOTE = 'move or hide this element whole - do not walk into it';

// The runtime parts, in the order the document runs them. Named here rather than taken from the
// caller's object key order, so a part cannot silently move or vanish.
export const SHELL_RUNTIME_ORDER = [
    'rt_dataHelpers.js',
    'rt_listRenderer.js',
    'rt_tabAndModal.js',
    'rt_blockRenderer.js',
    'rt_bindings.js',
    'rt_lorebook.js',
    'rt_mvuConnection.js',
    'rt_modalUi.js',
    'rt_htmlGenerators.js',
    'rt_packLayout.js',
    'rt_menuAction.js',
    'rt_actionInputs.js',
];

// `rt_pastedEngine.js` is NOT in that list: it resolves an engine pasted into the throwaway file, and
// a pack's engine runs in mvu-helper's Worker instead. `rt_mvuConnection.js` calls it through a
// `typeof … === 'function'` guard, so its absence is the documented no-op, not a break.

/**
 * The shell document.
 *
 * @param {{ runtimeParts: Record<string, string>, css: string }} input
 *   `runtimeParts` maps each SHELL_RUNTIME_ORDER name to that file's source text; `css` is the
 *   project's Global CSS (Templates tab) — the whole stylesheet the shell ships, which styles the
 *   menu's CHROME — tab nav, modal, containers. A pack's stylesheet is scoped under `[data-pack]` and
 *   cannot reach the chrome (§B.5), so the chrome's look belongs to the shell.
 * @returns {{ html: string, errors: string[] }} `errors` non-empty means nothing may ship.
 */
export function buildPackHostShellHtml({ runtimeParts, css } = {}) {
    const errors = [];
    const parts = runtimeParts && typeof runtimeParts === 'object' ? runtimeParts : {};
    for (const name of SHELL_RUNTIME_ORDER) {
        const text = parts[name];
        if (typeof text !== 'string' || !text.trim()) {
            errors.push('the shell needs the source text of ' + name + ' and got ' + (text === undefined ? 'nothing' : typeof text));
        }
    }
    const extra = Object.keys(parts).filter((k) => !SHELL_RUNTIME_ORDER.includes(k));
    if (extra.length) errors.push('the shell was handed parts it does not run: ' + extra.join(', '));
    if (typeof css !== 'string' || !css.trim()) errors.push('the shell needs a stylesheet and got none — the project\'s Global CSS (Templates tab) is empty');
    if (errors.length) return { html: '', errors };

    // LF throughout. The parts and the stylesheet come from a checkout, and a Windows checkout hands
    // them over as CRLF; without this, two machines export two different documents from the same
    // source, and every re-export diff is buried under line endings.
    const lf = (text) => String(text).replace(/\r\n?/g, '\n');
    const runtime = SHELL_RUNTIME_ORDER.map((name) => '        ' + lf(parts[name]).trim()).join('\n\n');

    // The fenced block is how SillyTavern renders the replacement as HTML rather than as text, and the
    // region container around it is what makes the rendered menu FINDABLE afterwards — one element
    // carrying our published attribute, so a swallowed menu can be moved back and any other extension
    // can skip it whole (see the REGION_* constants above).
    //
    // The blank lines are structure, not formatting: markdown ends a raw block-level tag at the next
    // blank line, and without them the fence is absorbed into the container's HTML block, never becomes
    // the <pre> TavernHelper mounts on, and the menu stops rendering at all.
    const regionOpen = `<div class="${REGION_CLASS}" ${REGION_ATTRIBUTE}="${REGION_NAME}" ${REGION_CONTRACT_ATTRIBUTE}="${REGION_CONTRACT_NOTE}">\n\n`
        + `<!-- mvu-helper:begin ${REGION_NAME} -->\n\n`;
    const regionClose = `\n\n<!-- mvu-helper:end ${REGION_NAME} -->\n\n</div>`;

    const html = regionOpen + '```\n' + `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusMenu</title>
<style>
${lf(css)}
</style>
</head>
<body>
    <!-- DB Upgrade Utility Placeholder -->
    <UpgradeAR_DB_Holder/>

    <!-- Main Container -->
    <div class="status-container" style="width: 100%">

        <!-- Tab Navigation — EMPTY by design: every tab comes from an installed pack -->
        <div class="tab-nav">
        </div>

    </div>

    <!-- Templates -->
    ${generateTemplates([])}

    <!-- Runtime -->
    <script type="module">
        // --- LOCALE: the pack brings its own; the shell declares none ---
        const LOCALE = {};
        // --- SCHEMA MAP: the pack merges its collection paths in at load ---
        const COLLECTION_PATHS = new Set([]);
${runtime}

        // Initialize — links first: they need no state, so they work even if the connection fails
        if (typeof window.parent !== 'undefined') {
            wireMenuLinkClicks();
            initMvuConnection()
                .then(() => initPackLayout())
                .then(() => wireMenuActionClicks())
                .catch((err) => {
                    console.error('[MZSMB] init failed:', err);
                });
        }
    <\/script>
</body>
</html>` + '\n```' + regionClose;

    return { html, errors };
}

/**
 * The shell wrapped as a TavernHelper regex script — the object a `regex/` source file holds and
 * mvu-helper's rule 10 validates.
 *
 * @param {string} html
 * @returns {object}
 */
export function buildShellRegexScript(html) {
    return {
        id: SHELL_REGEX_ID,
        script_name: SHELL_SCRIPT_NAME,
        enabled: true,
        find_regex: SHELL_PLACEHOLDER,
        replace_string: html,
        trim_strings: [],
        // Display only: the menu is drawn for the reader and never enters a prompt.
        source: { user_input: false, ai_output: true, slash_command: false, world_info: false, reasoning: false },
        destination: { display: true, prompt: false },
        run_on_edit: true,
        min_depth: null,
        max_depth: null,
    };
}

/** The archive member the bootstrap ships, and the file a workspace's `regex/` holds. */
export function shellArchiveMember(shellRegexScript) {
    return { path: 'regex/StatusMenu.json', text: JSON.stringify(shellRegexScript, null, 2) + '\n' };
}
