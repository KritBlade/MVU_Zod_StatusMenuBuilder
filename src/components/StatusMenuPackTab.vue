<script setup lang="ts">
// StatusMenuPackTab — emits a StatusMenu Pack file (pack-authoring-plan Track B / B1).
//
// Pick tabs, name the pack, export. Every decision lives in the pure module beside this file; this
// component only collects the meta, shows what the lift did, and hands over the text.
import { ref, reactive, computed } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import { buildStatusMenuPack, derivePackId, LAYOUT_KIND, bootstrapArchiveMembers, refreshArchiveMembers, packFileWithShell } from '../utils/statusmenu-pack-export.js'
import { buildStoredZip } from '../utils/stored-zip.js'
import { BUILT_WITH } from '../utils/app-version'
import { buildPackHostShellHtml, buildShellRegexScript } from '../utils/statusmenu-shell-export.js'
// The shell's parts, by the SAME `?raw` mechanism HtmlExportTab.vue uses — the two lanes share the
// runtime's source text and nothing else (§B.7d: do not unify them).
import RT_DATA_HELPERS from './exporttab-parts/rt_dataHelpers.js?raw'
import RT_LIST_RENDERER from './exporttab-parts/rt_listRenderer.js?raw'
import RT_TAB_AND_MODAL from './exporttab-parts/rt_tabAndModal.js?raw'
import RT_BLOCK_RENDERER from './exporttab-parts/rt_blockRenderer.js?raw'
import RT_BINDINGS from './exporttab-parts/rt_bindings.js?raw'
import RT_LOREBOOK from './exporttab-parts/rt_lorebook.js?raw'
import RT_MVU_CONNECTION from './exporttab-parts/rt_mvuConnection.js?raw'
import RT_MODAL_UI from './exporttab-parts/rt_modalUi.js?raw'
import RT_HTML_GENERATORS from './exporttab-parts/rt_htmlGenerators.js?raw'
import RT_PACK_LAYOUT from './exporttab-parts/rt_packLayout.js?raw'
import RT_MENU_ACTION from './exporttab-parts/rt_menuAction.js?raw'
import RT_ACTION_INPUTS from './exporttab-parts/rt_actionInputs.js?raw'

const SHELL_RUNTIME_PARTS = {
    'rt_dataHelpers.js': RT_DATA_HELPERS,
    'rt_listRenderer.js': RT_LIST_RENDERER,
    'rt_tabAndModal.js': RT_TAB_AND_MODAL,
    'rt_blockRenderer.js': RT_BLOCK_RENDERER,
    'rt_bindings.js': RT_BINDINGS,
    'rt_lorebook.js': RT_LOREBOOK,
    'rt_mvuConnection.js': RT_MVU_CONNECTION,
    'rt_modalUi.js': RT_MODAL_UI,
    'rt_htmlGenerators.js': RT_HTML_GENERATORS,
    'rt_packLayout.js': RT_PACK_LAYOUT,
    'rt_menuAction.js': RT_MENU_ACTION,
    'rt_actionInputs.js': RT_ACTION_INPUTS,
}


const { layout, globalCss, projectSnapshot } = useBuilderState()

const meta = reactive({ name: '', description: '', id: '', version: '1.0', targetsPackId: '' })
const pickedTabIds = ref<string[]>([])
const idTouched = ref(false)
const shellProblem = ref('')

// The id is derived until the author edits it: a CJK name slugifies to nothing, and the id rides
// lorebook needles, the CSS scope and locale keys, so it cannot be left to chance.
const effectiveId = computed(() => (idTouched.value && meta.id ? meta.id : derivePackId(meta.name)))
function onIdInput(e: Event) {
    idTouched.value = true
    meta.id = (e.target as HTMLInputElement).value
}

function toggleTab(id: string) {
    const i = pickedTabIds.value.indexOf(id)
    if (i === -1) pickedTabIds.value.push(id)
    else pickedTabIds.value.splice(i, 1)
}

const built = computed(() => buildStatusMenuPack(
    projectSnapshot(),
    {
        name: meta.name,
        description: meta.description,
        id: effectiveId.value,
        version: meta.version,
        targetsPackId: meta.targetsPackId,
        builtWith: BUILT_WITH,
        tabIds: pickedTabIds.value,
    },
))

// The pack-host shell — the regex whose replaceString IS the menu. Built ONCE here because BOTH
// outputs need the same bytes: the single file carries it as its `regex` section (D7), the bootstrap
// archive writes it as regex/StatusMenu.json. It carries no project data except the project's Global
// CSS, so it only rebuilds when that changes.
const shell = computed(() => buildPackHostShellHtml({
    runtimeParts: SHELL_RUNTIME_PARTS,
    css: globalCss.value,
}))

// What actually ships. A pack file with no shell installs a menu that renders NOTHING — mvu-helper
// substitutes its placeholder and the author sees "this pack ships no menu" on a card whose layout
// and engine are both perfect. So the shell's failure is the FILE's failure, surfaced beside the
// button rather than swallowed into a download that looks fine.
const packFile = computed(() => {
    if (!built.value.ok || !built.value.pack) return null
    if (shell.value.errors.length) return null
    return packFileWithShell(built.value.pack, buildShellRegexScript(shell.value.html))
})
const packText = computed(() => (packFile.value ? JSON.stringify(packFile.value, null, 2) : ''))
const fileName = computed(() => (effectiveId.value || 'statusmenu') + '-statusmenu-pack.json')

function copyPack() {
    if (!packFile.value) { reportShellProblem(); return }
    navigator.clipboard.writeText(packText.value)
}
function downloadPack() {
    if (!packFile.value) { reportShellProblem(); return }
    const blob = new Blob([packText.value], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.value
    a.click()
    URL.revokeObjectURL(url)
}

// Not a user mistake and not silently droppable: whatever this says, the output would have been a
// menu that never draws. Surfaced where the click happened.
function reportShellProblem() {
    shellProblem.value = shell.value.errors.join(' · ')
}

// The B6 archives — the workspace-facing outputs. Bootstrap starts a workspace (EMPTY statusmenu/
// only: its other possible origin is mvu-helper's blank-pack skeleton, and extracting one over the
// other overwrites whichever landed first); refresh re-exports the three files this app
// generates — the layout, engine/layoutFormatters.cjs and the shell — and is therefore always safe over
// a live workspace. Both slice the SAME built pack the JSON emit above ships.
//
// NAMED FOR THE TARGET FOLDER, not for the pack — and the pack id is deliberately left out. The
// archives carry no wrapper directory (pack.json sits at the root), so whatever folder you extract
// INTO becomes the artifact folder, and Windows' “Extract All” pre-fills that folder with the
// archive's own basename. `artifickoi-statusmenu-bootstrap.zip` therefore lands a SECOND artifact
// beside a real `statusmenu/`, carrying the same packType+id — and the library entry is keyed on
// exactly that pair, so the two silently overwrite each other and then diverge as the developer
// edits one of them. `statusmenu.zip` extracts to `statusmenu/`, which is either correct or a
// visible file-replace prompt; either way there is no second copy to debug against. The cost is
// that two packs both download as `statusmenu.zip` — accepted, because a duplicate id is a bug and
// a `(1)` suffix is an inconvenience.
function downloadArchive(kind: 'bootstrap' | 'refresh') {
    const pack = built.value.pack
    if (!built.value.ok || !pack) return
    // Both archives carry the shell as a FILE, so the pack they slice carries NO regex section:
    // pack.json holding a second copy would be two spellings of one shell for the assembler to
    // disagree about.
    if (shell.value.errors.length) { reportShellProblem(); return }
    shellProblem.value = ''
    const shellScript = buildShellRegexScript(shell.value.html)
    const members = kind === 'bootstrap'
        ? bootstrapArchiveMembers(pack, shellScript, built.value.engineFiles)
        : refreshArchiveMembers(pack, shellScript, built.value.engineFiles)
    // Copy into a fresh ArrayBuffer-backed view — TS 5.7's Uint8Array<ArrayBufferLike> is not a
    // BlobPart, and the copy also detaches the blob from the builder's scratch memory.
    const bytes = buildStoredZip(members)
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'bootstrap' ? 'statusmenu.zip' : 'statusmenu-refresh.zip'
    a.click()
    URL.revokeObjectURL(url)
}
</script>

<template>
    <div class="pack-tab">
        <div class="toolbar">
            <button class="btn-primary" :disabled="!built.ok" @click="copyPack">Copy pack JSON</button>
            <button class="btn-sm" :disabled="!built.ok" @click="downloadPack">Download {{ fileName }}</button>
            <button class="btn-sm" :disabled="!built.ok" @click="downloadArchive('bootstrap')">Bootstrap workspace .zip</button>
            <button class="btn-sm" :disabled="!built.ok" @click="downloadArchive('refresh')">Refresh .zip (layout + shell)</button>
            <span v-if="shellProblem" class="shell-problem">the shell could not be built, so no archive was written: {{ shellProblem }}</span>
            <span class="hint">Bootstrap (<code>statusmenu.zip</code>): extract into <code>&lt;workspace&gt;/</code> — it creates <code>statusmenu/</code> with pack.json + layout + <code>engine/layoutFormatters.cjs</code> (the layout's formulas, generated) + a starter <code>engine/statusMenuLogic.cjs</code> + the menu shell regex; statusMenuLogic.cjs is yours in VS Code from then on. Do this into an EMPTY <code>statusmenu/</code>: over a live one it replaces your engine. Refresh (<code>statusmenu-refresh.zip</code>): layout.json + the regenerated layoutFormatters.cjs + the menu shell regex — extract it INTO <code>&lt;workspace&gt;/statusmenu/</code>, always safe over work in progress: it never carries statusMenuLogic.cjs. Never edit layoutFormatters.cjs; change the formula here and export again. Keep one folder per pack id; two folders claiming one id overwrite each other in the library. The pack JSON is the SHIPPING file — layout, starter engine and the menu shell in one, installable by paste or Load file with no folder anywhere; the workspace lane is how the engine becomes yours.</span>
        </div>

        <div class="body">
            <section class="panel">
                <h3>Pack identity</h3>
                <label>Name<input v-model="meta.name" placeholder="Artific Realm menu" /></label>
                <label>Id<input :value="effectiveId" placeholder="artific-realm-menu" @input="onIdInput" /></label>
                <p class="note">Kebab-case. It rides lorebook needles, the CSS scope <code>[data-pack]</code> and locale
                    keys, and is FROZEN once published.</p>
                <label>Description<input v-model="meta.description" placeholder="Status menu for …" /></label>
                <label>Version<input v-model="meta.version" placeholder="1.0" /></label>
                <label>Built for (label only)<input v-model="meta.targetsPackId" placeholder="rpg-artific" /></label>
                <p class="note">A label shown while picking — never a gate. The host never version-matches a menu to a
                    game.</p>
                <p class="note">Renderer: <code>{{ LAYOUT_KIND }}</code></p>

                <h3>Tabs to export</h3>
                <label v-for="t in layout" :key="t.id" class="check">
                    <input type="checkbox" :checked="pickedTabIds.includes(t.id)" @change="toggleTab(t.id)" />
                    {{ t.name }}
                </label>
                <p class="note" v-if="!pickedTabIds.length">Nothing picked — pick at least one tab.</p>
            </section>

            <section class="panel">
                <h3>What the lift did</h3>
                <p class="note" v-if="!built.lifted.formatters.length && !built.lifted.labels.length">
                    No cell logic in the picked tabs.
                </p>
                <ul class="lift" v-else>
                    <li v-for="f in built.lifted.formatters" :key="f.path">
                        <b>{{ f.name }}</b> ← {{ f.path }} <span class="tag">{{ f.field }}</span>
                    </li>
                    <li v-for="l in built.lifted.labels" :key="l.path">
                        <span class="tag label">label</span> "{{ l.value }}" ← {{ l.path }}
                    </li>
                </ul>

                <h3 v-if="built.errors.length" class="bad">Refused ({{ built.errors.length }})</h3>
                <ul class="msg bad" v-if="built.errors.length">
                    <li v-for="(e, i) in built.errors" :key="i">{{ e }}</li>
                </ul>

                <h3 v-if="built.warnings.length">Warnings ({{ built.warnings.length }})</h3>
                <ul class="msg warn" v-if="built.warnings.length">
                    <li v-for="(w, i) in built.warnings" :key="i">{{ w }}</li>
                </ul>
            </section>
        </div>

        <div class="code-viewport">
            <textarea readonly :value="packText" class="code-editor"
                placeholder="Fill the identity fields and pick a tab — the pack file appears here."></textarea>
        </div>
    </div>
</template>

<style scoped>
.pack-tab { display: flex; flex-direction: column; height: 100%; background: #0f1115; color: #ddd; }
.toolbar {
    height: 50px; background: #1a1d24; border-bottom: 1px solid #333;
    display: flex; align-items: center; gap: 12px; padding: 0 20px;
}
.body { display: flex; gap: 16px; padding: 14px 20px; overflow: auto; max-height: 45%; }
.panel { flex: 1; min-width: 0; }
h3 { margin: 12px 0 6px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #8aa; }
h3.bad { color: #e57373; }
label { display: block; margin-bottom: 6px; font-size: 0.8rem; color: #aaa; }
label input[type="text"], label input:not([type]) {
    display: block; width: 100%; margin-top: 2px; padding: 5px 7px;
    background: #14171d; border: 1px solid #333; color: #ddd; border-radius: 2px;
}
label.check { display: flex; align-items: center; gap: 6px; color: #ddd; }
.note { font-size: 0.75rem; color: #777; margin: 2px 0 10px; }
.lift { list-style: none; padding: 0; font-size: 0.78rem; }
.lift li { padding: 3px 0; border-bottom: 1px solid #1e222a; }
.tag { background: #22303a; color: #8cf; padding: 0 5px; border-radius: 2px; font-size: 0.7rem; }
.tag.label { background: #2a2a1e; color: #dc8; }
.msg { font-size: 0.78rem; padding-left: 18px; }
.msg.bad li { color: #e57373; }
.msg.warn li { color: #d2b06a; }
.code-viewport { flex: 1; overflow: hidden; background: #1e1e1e; border-top: 1px solid #333; }
.code-editor {
    width: 100%; height: 100%; background: #1e1e1e; color: #d4d4d4;
    border: none; padding: 15px; font-family: 'Consolas', monospace; font-size: 13px;
    resize: none; outline: none;
}
.btn-primary { background: #0e639c; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 2px; }
.btn-primary:disabled, .btn-sm:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-sm { background: #2a2f3a; color: #ddd; border: 1px solid #3a4150; padding: 5px 10px; cursor: pointer; border-radius: 2px; }
.hint { color: #fff; font-size: 0.8rem; font-style: italic; }
.shell-problem { color: #e57373; font-size: 0.8rem; }
</style>
