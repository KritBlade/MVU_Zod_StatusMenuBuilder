<script setup lang="ts">
import { computed } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import {
    escapeHtml,
    createLocaleAccumulator,
    generateCss,
    generateTabHtml,
    generateTemplates
} from './exporttab-parts/rt_htmlGenerators.js'
import { liftCustomLogic, buildLayoutFormattersText } from '../utils/statusmenu-pack-export.js'

// Runtime JS parts (imported as raw strings, concatenated at build time)
import RT_DATA_HELPERS from './exporttab-parts/rt_dataHelpers.js?raw'
import RT_LIST_RENDERER from './exporttab-parts/rt_listRenderer.js?raw'
import RT_TAB_AND_MODAL from './exporttab-parts/rt_tabAndModal.js?raw'
import RT_BLOCK_RENDERER from './exporttab-parts/rt_blockRenderer.js?raw'
import RT_BINDINGS from './exporttab-parts/rt_bindings.js?raw'
import RT_LOREBOOK from './exporttab-parts/rt_lorebook.js?raw'
import RT_MVU_CONNECTION from './exporttab-parts/rt_mvuConnection.js?raw'
import RT_MODAL_UI from './exporttab-parts/rt_modalUi.js?raw'
import RT_ACTION_INPUTS from './exporttab-parts/rt_actionInputs.js?raw'
// B2: the generators ride into the document AS TEXT too (isomorphic — `export` is legal and inert
// inside the module script), because rt_packLayout renders pack tabs with them at runtime.
import RT_HTML_GENERATORS from './exporttab-parts/rt_htmlGenerators.js?raw'
import RT_PACK_LAYOUT from './exporttab-parts/rt_packLayout.js?raw'
// B5 step 1: the action caller — ActionButton clicks post to mvu-helper's dispatcher.
import RT_MENU_ACTION from './exporttab-parts/rt_menuAction.js?raw'
import RT_PASTED_ENGINE from './exporttab-parts/rt_pastedEngine.js?raw'

const { layout, collectionPaths, customTemplates, globalCss, staticLocale } = useBuilderState()

const generatedOutput = computed(() => {
    // 0. One accumulator per render. The generators hold no module state (B0), so the pack layouts
    //    B2 renders at runtime cannot leak locale keys into this bake or into each other.
    const locale = createLocaleAccumulator()

    // 1. Pre-calc HTML (populates the accumulator).
    //    The SAME lift the pack path runs (B5 step 4): a cell's `customLogic` body becomes a NAMED
    //    formatter and the markup bakes `data-fmt-*` naming it — without this the engine exports
    //    `maincharMoney` and nothing in the file ever says which cell wants it. `liftCustomLogic`
    //    deep-clones its input, so it cannot reach builder state or the pack lane. The names it picks
    //    may differ from the pack's (that lift takes a tab SUBSET plus the export UI's overrides);
    //    fine here, because nothing this lane emits ships and the paste reconciles names.
    const lifted = liftCustomLogic(layout.value)
    const bakedTabs = lifted.layout as typeof layout.value
    //    What the paste has to provide, written INTO the file: the reader (usually an AI) is being
    //    asked to supply `statusMenuLogic.cjs`, and without this the names it must export are visible
    //    nowhere but scattered `data-fmt-*` attributes. Lift warnings ride along rather than being
    //    dropped — a silently renamed collision is exactly what would make a paste miss a cell.
    const wantedNames = lifted.formatters.map((f) => `        //   formatters.${f.name}   ← ${f.path}`)
    const liftWarnings = lifted.warnings.map((w) => `        // ⚠ ${w}`)
    const pasteWanted = [
        wantedNames.length
            ? `        // This file's cells ask for ${wantedNames.length} formatter(s), all computed by LAYOUT_FORMATTERS in the block:\n${wantedNames.join('\n')}`
            : '        // This layout gives no cell a customLogic body, so a paste has nothing to resolve.',
        ...liftWarnings,
    ].join('\n')
    //    The layout's formatters, written into the paste block exactly as layoutFormatters.cjs sits
    //    before statusMenuLogic.cjs in a workspace: the pasted file reaches them as LAYOUT_FORMATTERS.
    const layoutFormattersInBlock = buildLayoutFormattersText(lifted.formatters)
        .split('\n').map((l) => (l ? '            ' + l : l)).join('\n')
    const navHtml = bakedTabs.map((t, i) => `            <div class="tab-btn ${i === 0 ? 'active' : ''}" onclick="selectTab('tab-${t.id}', this)">${escapeHtml(t.name)}</div>`).join('\n')
    const tabsHtml = bakedTabs.map((t, i) => generateTabHtml(t, i, locale)).join('\n')

    // 2. Build Locale JSON (merge static locale with dynamic entries)
    const mergedLocale: Record<string, string> = { ...staticLocale.value }
    locale.entries().forEach((val, key) => { mergedLocale[key] = val })
    const jsonLocale = JSON.stringify(mergedLocale, null, 4)

    // 3. Header (Basic HTML5)
    // Wrapped in triple backticks for SillyTavern
    const header = "```\n"
    let out = header + `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusMenu</title>
    ${generateCss(globalCss.value)}
</head>
<body>
    <!-- DB Upgrade Utility Placeholder -->
    <UpgradeAR_DB_Holder/>

    <!-- Main Container -->
    <!-- Forced to 100% width for export as requested -->
    <div class="status-container" style="width: 100%">
        
        <!-- Tab Navigation -->
        <div class="tab-nav">
${navHtml}
        </div>

        <!-- Tab Content -->
${tabsHtml}
    </div>

    <!-- Templates -->
    ${generateTemplates(customTemplates.value)}


    <!-- MVU Data Binding Script (Phase 2 + Locale) -->
    <script type="module">
        // --- LOCALE (Template Tab Static Locale definition) ---
        const LOCALE = ${jsonLocale};
        // --- SCHEMA MAP (User defined collections) ---
        const COLLECTION_PATHS = new Set(${JSON.stringify(Array.from(collectionPaths.value || []))});
        // all these variables are coming from js file inside exporttab-parts, concatenated at build time
        ${RT_DATA_HELPERS}

        ${RT_LIST_RENDERER}

        ${RT_TAB_AND_MODAL}

        ${RT_BLOCK_RENDERER}

        ${RT_BINDINGS}

        ${RT_LOREBOOK}

        ${RT_MVU_CONNECTION}

        ${RT_MODAL_UI}

        ${RT_HTML_GENERATORS}

        ${RT_PACK_LAYOUT}

        ${RT_MENU_ACTION}

        // ─────────────────────────────────────────────────────────────────────────────
        // PASTE statusMenuLogic.cjs INSIDE THE BLOCK BELOW — the whole file, unedited.
        // The braces are required: the .cjs declares isTuple/getRaw/getV/getL, which this
        // document already has, and a flat paste is a SyntaxError that kills the menu.
        // The layout's own formatters are already written into the block, as layoutFormatters.cjs
        // is in a workspace; the pasted file reaches them as LAYOUT_FORMATTERS.
        // Without a paste this file renders every formatter cell as its raw value.
${pasteWanted}
        const PASTED_ENGINE = { exports: {} };
        {
            const module = PASTED_ENGINE;
${layoutFormattersInBlock}
            // ==== PASTE BELOW =======================================================

            // ==== PASTE ABOVE =======================================================
        }

        ${RT_PASTED_ENGINE}

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

        ${RT_ACTION_INPUTS}
    <\/script>
</body>
</html>`
    return out + "\n```"
})

function copyCode() {
    navigator.clipboard.writeText(generatedOutput.value)
    alert('Copied to clipboard!')
}
</script>

<template>
    <div class="export-tab">
        <div class="toolbar">
            <button class="btn-primary" @click="copyCode">Copy HTML</button>
            <span class="hint">Phase 1: Generates static HTML structure based on your layout. Interactions coming in later phases.</span>
        </div>
        <div class="code-viewport">
            <!-- Using textarea for crude syntax highlight imitation -->
            <textarea readonly :value="generatedOutput" class="code-editor"></textarea>
        </div>
    </div>
</template>

<style scoped>
.export-tab {
    display: flex; flex-direction: column; height: 100%; background: #0f1115;
}
.toolbar {
    height: 50px; background: #1a1d24; border-bottom: 1px solid #333;
    display: flex; align-items: center; gap: 15px; padding: 0 20px;
}
.code-viewport { flex: 1; overflow: hidden; background: #1e1e1e; }
.code-editor {
    width: 100%; height: 100%;
    background: #1e1e1e; color: #d4d4d4;
    border: none; padding: 15px;
    font-family: 'Consolas', monospace; font-size: 13px;
    resize: none; outline: none;
}
.btn-primary {
    background: #0e639c; color: white; border: none;
    padding: 6px 12px; cursor: pointer; border-radius: 2px;
}
.hint { color: #666; font-size: 0.8rem; font-style: italic; }
</style>