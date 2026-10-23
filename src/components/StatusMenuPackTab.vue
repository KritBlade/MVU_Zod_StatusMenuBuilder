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
import DnaPageHeader from '../shared/gui-dna/DnaPageHeader.vue'
import DnaCard from '../shared/gui-dna/DnaCard.vue'
import DnaField from '../shared/gui-dna/DnaField.vue'
import DnaNotice from '../shared/gui-dna/DnaNotice.vue'
import DnaRow from '../shared/gui-dna/DnaRow.vue'
import DnaEmpty from '../shared/gui-dna/DnaEmpty.vue'
import DnaResultList from '../shared/gui-dna/DnaResultList.vue'
import DnaActionCard from '../shared/gui-dna/DnaActionCard.vue'
import CopyTextButton from '../shared/CopyTextButton.vue'
import { saveFile } from '../shared/browser-file'
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
// and engine are both perfect. So the shell's failure is the FILE's failure: no file, no archive, and a
// notice saying why as soon as it happens, rather than a download that looks fine.
const shellProblem = computed(() => shell.value.errors.join(' · '))
const packFile = computed(() => {
    if (!built.value.ok || !built.value.pack) return null
    if (shell.value.errors.length) return null
    return packFileWithShell(built.value.pack, buildShellRegexScript(shell.value.html))
})
const packText = computed(() => (packFile.value ? JSON.stringify(packFile.value, null, 2) : ''))
const fileName = computed(() => (effectiveId.value || 'statusmenu') + '-statusmenu-pack.json')

function downloadPack() {
    if (!packFile.value) return
    saveFile(fileName.value, new Blob([packText.value], { type: 'application/json' }))
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
    if (shell.value.errors.length) return
    const shellScript = buildShellRegexScript(shell.value.html)
    const members = kind === 'bootstrap'
        ? bootstrapArchiveMembers(pack, shellScript, built.value.engineFiles)
        : refreshArchiveMembers(pack, shellScript, built.value.engineFiles)
    // Copy into a fresh ArrayBuffer-backed view — TS 5.7's Uint8Array<ArrayBufferLike> is not a
    // BlobPart, and the copy also detaches the blob from the builder's scratch memory.
    const bytes = buildStoredZip(members)
    saveFile(kind === 'bootstrap' ? 'statusmenu.zip' : 'statusmenu-refresh.zip', new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }))
}

const errorLines = computed(() => built.value.errors.map((text: string) => ({ status: 'danger' as const, text })))
const warningLines = computed(() => built.value.warnings.map((text: string) => ({ status: 'warning' as const, text })))
</script>

<template>
    <div class="smb-page">
        <DnaPageHeader icon="fa-box" eyebrow="Export / StatusMenu Pack" title="StatusMenu Pack"
            subtitle="The menu as an installable pack: its identity, the tabs it ships, its files.">
            <template #status>
                <span v-if="packFile" class="smb-pill is-success">Ready</span>
                <span v-else-if="built.errors.length" class="smb-pill is-danger">Refused</span>
                <span v-else class="smb-pill is-warning">Not ready</span>
            </template>
        </DnaPageHeader>

        <DnaCard title="Pack identity" badge-text="1" body-class="smb-grid" description="What the library and the install dialog show.">
            <DnaField label="Name" for-id="statusmenu_pack_name">
                <input id="statusmenu_pack_name" v-model="meta.name" class="smb-input" placeholder="Artific Realm menu" />
            </DnaField>
            <DnaField label="Id" for-id="statusmenu_pack_id" hint="Kebab-case, and frozen once published."
                detail="It rides lorebook needles, the CSS scope [data-pack] and locale keys.">
                <input id="statusmenu_pack_id" class="smb-input is-code" :value="effectiveId" placeholder="artific-realm-menu" @input="onIdInput" />
            </DnaField>
            <DnaField label="Description" for-id="statusmenu_pack_description" is-span>
                <input id="statusmenu_pack_description" v-model="meta.description" class="smb-input" placeholder="Status menu for …" />
            </DnaField>
            <DnaField label="Version" for-id="statusmenu_pack_version">
                <input id="statusmenu_pack_version" v-model="meta.version" class="smb-input" placeholder="1.0" />
            </DnaField>
            <DnaField label="Built for" for-id="statusmenu_pack_target" hint="A label shown while picking, never a gate."
                detail="The host never version-matches a menu to a game.">
                <input id="statusmenu_pack_target" v-model="meta.targetsPackId" class="smb-input is-code" placeholder="rpg-artific" />
            </DnaField>
            <p class="smb-hint smb-span"><span>Renderer:</span> <code class="smb-code">{{ LAYOUT_KIND }}</code></p>
        </DnaCard>

        <DnaCard title="Tabs to export" badge-text="2" body-class="smb-stack" description="The layout tabs this pack ships.">
            <div class="smb-check-list">
                <label v-for="t in layout" :key="t.id" class="smb-check-item">
                    <input type="checkbox" class="smb-check" :checked="pickedTabIds.includes(t.id)" @change="toggleTab(t.id)" /><span>{{ t.name }}</span>
                </label>
            </div>
            <DnaNotice v-if="!pickedTabIds.length" status="warning" text="Nothing picked; pick at least one tab." />
        </DnaCard>

        <DnaCard title="What the lift did" badge-text="3" body-class="smb-stack" description="The cell logic and labels the export lifted out of the picked tabs.">
            <div v-if="built.lifted.formatters.length || built.lifted.labels.length" class="smb-list">
                <DnaRow v-for="f in built.lifted.formatters" :key="f.path" icon="fa-calculator" :name="f.name" :sub="['From ' + f.path]">
                    <template #pills><span class="smb-pill is-accent">{{ f.field }}</span></template>
                </DnaRow>
                <DnaRow v-for="l in built.lifted.labels" :key="l.path" icon="fa-tag" :name="'&quot;' + l.value + '&quot;'" :sub="['From ' + l.path]">
                    <template #pills><span class="smb-pill is-neutral">label</span></template>
                </DnaRow>
            </div>
            <DnaEmpty v-else icon="fa-wand-magic-sparkles" text="No cell logic in the picked tabs." />
            <DnaResultList v-if="errorLines.length" :heading="'Refused (' + errorLines.length + ')'" :lines="errorLines" />
            <DnaResultList v-if="warningLines.length" :heading="'Warnings (' + warningLines.length + ')'" :lines="warningLines" />
        </DnaCard>

        <DnaCard title="Pack file" badge-text="4" body-class="smb-stack" description="The shipping file, and the workspace archives that make the engine yours.">
            <template #actions>
                <CopyTextButton :text="packText" label="Copy pack JSON" is-primary :is-disabled="!packFile" />
                <button type="button" class="smb-btn" :disabled="!packFile" @click="downloadPack"><i class="fa-solid fa-download"></i>Download {{ fileName }}</button>
            </template>
            <DnaNotice v-if="built.ok && shellProblem" status="danger" :text="'The shell could not be built, so no file or archive is written: ' + shellProblem" />
            <div class="smb-action-grid">
                <DnaActionCard icon="fa-box-open" title="Bootstrap workspace"
                    description="Starts a workspace: pack, layout, formulas, starter engine and shell. Extract into an EMPTY statusmenu/ only.">
                    <button type="button" class="smb-btn" :disabled="!packFile" @click="downloadArchive('bootstrap')"><i class="fa-solid fa-download"></i>Download statusmenu.zip</button>
                </DnaActionCard>
                <DnaActionCard icon="fa-arrows-rotate" title="Refresh workspace"
                    description="Layout, regenerated formulas and shell, never statusMenuLogic.cjs: safe to extract over work in progress.">
                    <button type="button" class="smb-btn" :disabled="!packFile" @click="downloadArchive('refresh')"><i class="fa-solid fa-download"></i>Download refresh .zip</button>
                </DnaActionCard>
            </div>
            <DnaField label="Pack JSON" for-id="statusmenu_pack_text" hint="Layout, starter engine and shell in one file, installed by paste or Load file."
                detail="Never edit layoutFormatters.cjs: change the formula here and export again. Keep one folder per pack id; two folders claiming one id overwrite each other in the library.">
                <textarea id="statusmenu_pack_text" readonly class="smb-textarea is-code" rows="14" :value="packText"
                    placeholder="Fill the identity fields and pick a tab; the pack file appears here."></textarea>
            </DnaField>
        </DnaCard>
    </div>
</template>
