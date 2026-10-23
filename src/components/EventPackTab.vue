<script setup lang="ts">
// EventPackTab — the visual event-pack builder (pack-authoring-plan Track A / §A.7).
//
// COMPLETELY MECHANICAL: reads what the uploaded card's engine declares (armedPath, the paths a
// pack may write and their rules, the sugar forms) and what the card's own Zod declares (which fields
// exist at those paths), offers dropdowns + condition rows + a writes editor over exactly that, emits
// pack TEXT via the vendored grammar. No installer knowledge, no genre knowledge, no typed-in vocabulary.
import { ref, reactive, computed } from 'vue'
import { ingestCard, collectionItemKeys, booleanMemberSelectors } from '../utils/event-pack-card-ingest.js'
import { emitPack, parsePackFile, deriveFormat, packId, keyPrefix, isSharedWrite, canOwnRecords, writeRecordKey } from '../utils/event-pack-serializer.js'

import { buildStoredZip } from '../utils/stored-zip.js'
import { BUILT_WITH } from '../utils/app-version'
import { eventPackArtifactMembers } from '../utils/event-pack-artifact.js'

// ---- types (UI state mirrors the serializer's state; a write's fields come from the card's schema) ----
interface Descriptor { kind: string; lhs?: string; op?: string; rhs?: string; set?: string[]; name?: string; flag?: string; state?: string; arg?: string; neg?: boolean }
interface FxPair { k: string; v: string }
// one write: a declared path, the record key SUFFIX (the pack prefix is prepended on emit, exactly as for
// trigger keys — a pack can only ever name records it owns), the schema fields' values, which of them are
// deltas, free extra fields (an open shape only), and the remove flag (a removable path only)
interface WriteUi { path: string; recordKey: string; values: Record<string, string>; modes: Record<string, 'set' | 'add'>; extras: FxPair[]; remove: boolean }
// one payout line: which KIND the card declares, WHO it pays when the kind is keyed, which of that
// kind's fields, and how much. Kept as a list of lines rather than a nested map so the editor can hold a
// half-typed row the way writes do.
interface RewardUi { kind: string; memberKey: string; field: string; amount: string }
interface TriggerUi {
    keySuffix: string; title: string; step: string; cat: string; series: string
    prereq: Descriptor[]; whenGroups: Descriptor[][]
    fxSummary: string; fxScope: string
    writes: WriteUi[]
    rewards: RewardUi[]
    doText: string; fireNote: string
}
interface PackUi { creator: string; event: string; version: string; triggers: TriggerUi[] }

// ---- card ingest ----
const cardInput = ref<HTMLInputElement | null>(null)
const card = ref<any>(null)          // { cardName, headers, statData, dslPaths }
const cardError = ref('')

function triggerCardUpload() { cardInput.value?.click() }
function onCardFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const isPng = /\.png$/i.test(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
        const raw = evt.target?.result
        const r = ingestCard(isPng ? new Uint8Array(raw as ArrayBuffer) : (raw as string))
        if (r.ok) { card.value = r; cardError.value = '' }
        else { card.value = null; cardError.value = r.reason }
    }
    if (isPng) reader.readAsArrayBuffer(file); else reader.readAsText(file)
    if (cardInput.value) cardInput.value.value = ''
}

// the paths a pack may write, each joined to its schema node (fields, record-or-object, open-or-closed)
const cardWrites = computed<any[]>(() => card.value ? card.value.writes : [])
const writeEntry = (path: string) => cardWrites.value.find((w: any) => w.path === path)
// WHAT a row may PAY on this card, each kind joined to its schema node. Empty ⇒ the card's engine
// declares no payout at all, and the editor says so rather than offering a kind it invented.
const cardRewards = computed<any[]>(() => (card.value && card.value.rewards) ? card.value.rewards : [])
const rewardKind = (name: string) => cardRewards.value.find((k: any) => k.name === name)
const rewardFields = (name: string): any[] => { const k = rewardKind(name); return k ? k.fields : [] }
// the ceiling the card holds an author to, quoted back in the editor so the limit is visible while typing
// rather than discovered when the engine caps the payout at play time. It is PER FIELD: one kind's fields
// need not share a scale (a wallet and an attribute never do), so the engine may cap each separately.
const rewardMax = (name: string, field: string): number =>
    Number(rewardFields(name).find((f: any) => f.name === field)?.max) || 0
const isKeyedKind = (name: string): boolean => rewardKind(name)?.keyed === true
// A keyed reward may point at a FIELD instead of naming a member: `<path>.*.<field>` pays the one member
// that field marks. Offered only when the loaded card's engine declares format 1.2 or later — on an older one the
// key is refused as illegal and the payout silently does not happen.
const cardPaysSelector = computed<boolean>(() => {
    const parts = String(card.value?.headers?.format || '1.0').split('.').map(Number)
    const maj = parts[0] || 0, min = parts[1] || 0
    return maj > 1 || (maj === 1 && min >= 2)
})
const isMemberSelector = (kind: string, key: string): boolean => {
    const path = rewardKind(kind)?.path
    return !!path && key.trim().startsWith(path + '.*.')
}
// Only fields the card SEEDS AS BOOLEANS: a selector pays the member whose field is true, so a number or
// a string can never pick anyone. Offering those produced a line that looks right and refuses at fire.
const selectorsFor = (kind: string): string[] => {
    const path = rewardKind(kind)?.path
    if (!path || !card.value) return []
    return booleanMemberSelectors(card.value.statData, path)
}
// "To" answers WHO, and it takes two kinds of answer: a name, or a rule for finding her. The hint below
// the row spells the whole sentence, because a bare path in a box labelled To reads like a target — and
// it is not one. The selector's field is READ to choose her; the Field box is what actually changes.
const selectorFieldName = (key: string): string => String(key).trim().split('.').pop() || ''
const rewardPathLabel = (r: RewardUi): string => {
    const path = rewardKind(r.kind)?.path || ''
    const change = isTextKind(r.kind)
        ? 'rewrites her ' + r.field
        : (Number(r.amount) < 0 ? 'takes ' : 'gives ') + (Math.abs(Number(r.amount)) || '‹amount›') + ' ' + r.field
    if (!isKeyedKind(r.kind)) return path + '.' + r.field
    if (isMemberSelector(r.kind, r.memberKey)) {
        return 'the one ' + path + ' whose ' + selectorFieldName(r.memberKey) + ' is true — ' + change
    }
    return (r.memberKey ? path + '.' + r.memberKey : path + '.‹who›') + ' — ' + change
}
// A prose kind WRITES OVER the field instead of adding to it, so its box takes words and its bound is a
// length. The two never mix within a kind — a number has nothing to add to a string, and vice versa.
const isTextKind = (name: string): boolean => rewardKind(name)?.text === true
const rewardMaxLength = (name: string): number => Number(rewardKind(name)?.maxLength) || 0
function rewardTooLong(r: RewardUi): boolean {
    const limit = rewardMaxLength(r.kind)
    return isTextKind(r.kind) && limit > 0 && r.amount.trim().length > limit
}
// the members the card's SEED carries — offered as suggestions, never as the only choice: a live save
// holds people the seed never did, and refusing to name them would make the editor wrong about the game
const rewardMembers = (name: string): string[] => rewardKind(name)?.memberKeys || []
function rewardOver(r: RewardUi): boolean {
    if (isTextKind(r.kind)) return false
    const max = rewardMax(r.kind, r.field)
    const amount = Number(r.amount)
    return max > 0 && Number.isFinite(amount) && Math.abs(amount) > max
}
// an alias's expansion, shown beside it in the path picker so either spelling can be chosen knowingly
const aliasOf = (p: string): string => (card.value && card.value.headers.aliases && card.value.headers.aliases[p]) || ''
// the scope VALUES the card's engine declares — offered as-is; what each means stays in the genre
// doc. Empty ⇒ the card declares none and the field is free text.
const scopeChoices = computed<string[]>(() => card.value ? card.value.headers.scopes : [])
const dslPaths = computed<string[]>(() => card.value ? card.value.dslPaths : [])
// the Present() name surface — every collection key the card actually seeds. Empty when the
// card seeds no populated collection, which leaves that box exactly as free-form as before.
const rosterKeys = computed<string[]>(() => collectionItemKeys(dslPaths.value))

// ---- pack state ----
function blankTrigger(): TriggerUi {
    return { keySuffix: '', title: '', step: '', cat: 'TRG', series: '', prereq: [], whenGroups: [[]], fxSummary: '', fxScope: '', writes: [], rewards: [], doText: '', fireNote: '' }
}
const pack = reactive<PackUi>({ creator: '', event: '', version: '1.0', triggers: [] })
const importWarnings = ref<string[]>([])

const idPreview = computed(() => packId(pack.creator, pack.event))
const prefixPreview = computed(() => keyPrefix(pack.creator, pack.event))
// A path the card declares `fillOnly: true` is a SHARED registry — the engine lifts the key fence exactly
// there, and so does this editor. The rule itself lives in the serializer, where a test can open it.
const isSharedPath = (path: string) => isSharedWrite(writeEntry(path))
const derivedFormat = computed(() => deriveFormat(serializable()))
const formatExceedsCard = computed(() => {
    if (!card.value) return false
    const dM = Number(derivedFormat.value.split('.')[0] || 0)
    const cM = Number(String(card.value.headers.format).split('.')[0] || 0)
    return dM > cM
})

// A new beat added to a pack that already has one INHERITS the series and is pre-gated on the previous
// beat having FIRED: prereq `flag:<previous full key>`. That is the only order a chain may read — the
// engine writes that marker itself and never deletes it, while a quest record one beat wrote is deleted
// at the day's settle once it completes, which is how a chain ordered on `Quest(X).Step` dies. The opener
// gets no prereq at all; the fired-marker is what makes it a one-shot. The previous beat's key is taken
// as it stands now — an author who renames the suffix or the pack afterwards edits this row like any other.
function addTrigger() {
    const prev = pack.triggers[pack.triggers.length - 1]
    const t = blankTrigger()
    if (prev && prev.series.trim()) {
        t.series = prev.series
        if (prev.keySuffix.trim()) t.prereq.push({ kind: 'flag', flag: prefixPreview.value + prev.keySuffix.trim(), state: 'done' })
    }
    pack.triggers.push(t)
}
function removeTrigger(i: number) { pack.triggers.splice(i, 1) }

// ---- condition rows ----
function blankDescriptor(): Descriptor { return { kind: 'cmp', lhs: '', op: '>=', rhs: '' } }
function addCondition(list: Descriptor[]) { list.push(blankDescriptor()) }
function removeCondition(list: Descriptor[], i: number) { list.splice(i, 1) }
function addOrGroup(t: TriggerUi) { t.whenGroups.push([]) }
function removeOrGroup(t: TriggerUi, i: number) { if (t.whenGroups.length > 1) t.whenGroups.splice(i, 1) }
// ---- writes ----
function addWrite(t: TriggerUi) {
    const first = cardWrites.value[0]
    t.writes.push({ path: first ? first.path : '', recordKey: '', values: {}, modes: {}, extras: [], remove: false })
}
function removeWrite(t: TriggerUi, i: number) { t.writes.splice(i, 1) }
// ---- rewards ----
function addReward(t: TriggerUi) {
    const first = cardRewards.value[0]
    const field = first && first.fields.length ? first.fields[0].name : ''
    t.rewards.push({ kind: first ? first.name : '', memberKey: '', field, amount: '' })
}
function removeReward(t: TriggerUi, i: number) { t.rewards.splice(i, 1) }
// changing the kind re-points the field, because a field belongs to the kind that declares it
function onRewardKind(r: RewardUi) {
    const fields = rewardFields(r.kind)
    if (!fields.some((f: any) => f.name === r.field)) r.field = fields.length ? fields[0].name : ''
}
function addExtra(w: WriteUi) { w.extras.push({ k: '', v: '' }) }
function removeExtra(w: WriteUi, i: number) { w.extras.splice(i, 1) }
// the fields an author sees for a write: the schema's, minus the ones the card LOCKS (hidden); the ones
// the engine OWNS (fixed + its stamp field) stay visible but read-only, so the author knows they will be written
function editableFields(w: WriteUi): any[] { const e = writeEntry(w.path); return e ? e.fields.filter((f: any) => !f.locked) : [] }
// a value typed as the card's schema says — number, boolean, labeled tuple `[value, label]` — so the
// record an event CREATES has its tuple shape from the start (a bare value in a tuple field would fail
// the card's parse and strip the record). The serializer spells values; it never types them.
function typedValue(field: any, raw: string): any {
    const v = String(raw ?? '').trim()
    if (v === '') return ''
    let out: any = v
    if (field.type === 'number' || field.type === 'integer') { const n = Number(v); out = Number.isFinite(n) ? n : v }
    else if (field.type === 'boolean') out = v === 'true' || v === '1' || v === 'yes'
    if (field.tuple) out = [out, field.tuple.label]
    return out
}

// ---- emit ----
function serializable() {
    return {
        creator: pack.creator, event: pack.event, version: pack.version,
        triggers: pack.triggers.map((t) => {
            const writes = t.writes.map((w) => {
                const entry = writeEntry(w.path)
                const set: Record<string, any> = {}, add: Record<string, any> = {}
                for (const f of editableFields(w)) {
                    if (f.engineOwned) continue
                    const raw = w.values[f.name]
                    if (raw === undefined || String(raw).trim() === '') continue
                    if (w.modes[f.name] === 'add' && f.addable) add[f.name] = Number(raw)
                    else set[f.name] = typedValue(f, raw)
                }
                for (const p of w.extras) if (p.k.trim()) set[p.k.trim()] = p.v
                // The record key is the one the PLAYER reads. Nothing is prepended: the engine stamps who
                // granted a record and gates overwrites on that, so a pack may claim any unclaimed name.
                const key = writeRecordKey(entry, w.recordKey)
                return { path: w.path, key, set, add, remove: w.remove }
            })
            // the payout lines collapse into the format's own shape, { kind: { field: amount } }; two lines
            // naming one field are summed, because two lines that silently overwrote each other would pay
            // less than the editor shows
            const reward: Record<string, any> = {}
            for (const r of t.rewards) {
                if (!r.kind || !r.field) continue
                const text = isTextKind(r.kind)
                const amount = Number(r.amount)
                if (text ? !r.amount.trim() : (!Number.isFinite(amount) || amount === 0)) continue
                const keyed = isKeyedKind(r.kind)
                if (keyed && !r.memberKey.trim()) continue          // a payout aimed at nobody is not a payout
                const bucket = reward[r.kind] || (reward[r.kind] = {})
                const paid = keyed ? (bucket[r.memberKey.trim()] || (bucket[r.memberKey.trim()] = {})) : bucket
                // prose REPLACES, so a second line on one field wins outright; numbers accumulate, because
                // two grants of the same stat in one beat are two grants
                paid[r.field] = text ? r.amount.trim() : ((paid[r.field] || 0) + amount)
            }
            return {
                keySuffix: t.keySuffix, title: t.title, step: t.step, cat: t.cat, series: t.series,
                prereq: t.prereq, whenGroups: t.whenGroups,
                fx: { summary: t.fxSummary, scope: t.fxScope, writes, reward },
                doText: t.doText, fireNote: t.fireNote,
            }
        }),
    }
}

const output = ref('')
const emitError = ref('')
function generate() {
    emitError.value = ''
    if (!card.value) { emitError.value = 'upload a card first — the armed gate is pinned to the armedPath its engine declares'; return }
    const r = emitPack(serializable(), { armedPath: card.value.headers.paths.armedPath, builtWith: BUILT_WITH })
    if (!r.ok) { output.value = ''; emitError.value = r.reason; return }
    output.value = r.text
}
function copyOutput() { navigator.clipboard.writeText(output.value) }

function saveFile(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
}

// The ARTIFACT: pack.json + events/<id>.txt, zipped. What mvu-helper's Packs tab imports and what the
// dev loop watches — the plain text below stays for pasting a finished pack into the Event Packs tab.
const artifactError = ref('')
function downloadArtifact() {
    artifactError.value = ''
    const built = eventPackArtifactMembers({
        text: output.value, packId: idPreview.value, version: pack.version,
        eventName: pack.event, builtWith: BUILT_WITH,
    })
    // Every reason, not the first: the emitter can refuse for two at once (no text AND an id that
    // reduces to nothing), and a fix for one leaves the other waiting. Same shape the shell tab uses.
    if (built.errors.length) { artifactError.value = built.errors.join(' · '); return }
    // Copy into a fresh ArrayBuffer-backed view — TS 5.7's Uint8Array<ArrayBufferLike> is not a
    // BlobPart, and the copy also detaches the blob from the builder's scratch memory.
    const bytes = buildStoredZip(built.members)
    saveFile(built.folder + '.zip', new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }))
}
function downloadOutput() {
    saveFile((idPreview.value || 'event-pack') + '-event-pack.txt', new Blob([output.value], { type: 'text/plain' }))
}

// ---- load an existing pack back into the GUI (round-trip edit) ----
const packInput = ref<HTMLInputElement | null>(null)
const importError = ref('')
const pasteOpen = ref(false)
const pasteText = ref('')
function triggerPackImport() { packInput.value?.click() }
function loadFromText(txt: string) {
    importError.value = ''
    const r = parsePackFile(txt)
    if (!r.ok) { importError.value = r.reason; return }
    importWarnings.value = r.warnings
    if (r.packs.length > 1) importWarnings.value = ['file holds ' + r.packs.length + ' packs — loaded the FIRST; load again to edit another (each pack exports as its own text)', ...r.warnings]
    loadPack(r.packs[0])
    pasteOpen.value = false
    pasteText.value = ''
}
function onPackFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => loadFromText(evt.target?.result as string)
    reader.readAsText(file)
    if (packInput.value) packInput.value.value = ''
}
function loadFromPaste() { loadFromText(pasteText.value) }
function loadPack(p: any) {
    pack.creator = p.creator; pack.event = p.event; pack.version = p.version
    pack.triggers = p.triggers.map((t: any) => {
        const ui = blankTrigger()
        ui.keySuffix = t.keySuffix; ui.title = t.title; ui.step = t.step; ui.cat = t.cat; ui.series = t.series
        ui.prereq = t.prereq; ui.whenGroups = t.whenGroups.length ? t.whenGroups : [[]]
        ui.fxSummary = t.fx.summary; ui.fxScope = t.fx.scope
        if (ui.fxScope && scopeChoices.value.length && !scopeChoices.value.includes(ui.fxScope)) importWarnings.value.push('scope "' + ui.fxScope + '" is not one the uploaded card declares (' + scopeChoices.value.join(', ') + ') — kept as typed; the engine decides what an undeclared scope means')
        for (const w of t.fx.writes || []) {
            const entry = writeEntry(w.path)
            if (!entry) importWarnings.value.push('a write to ' + w.path + ' names a path the uploaded card does not open (it opens: ' + (cardWrites.value.map((x: any) => x.path).join(', ') || 'none') + ') — kept, but this card will refuse it')
            const wu: WriteUi = { path: w.path, recordKey: '', values: {}, modes: {}, extras: [], remove: w.remove === true }
            const key = typeof w.key === 'string' ? w.key : ''
            if (key) {
                wu.recordKey = key
                if (entry && !canOwnRecords(entry)) importWarnings.value.push('this card declares no ownerStamp on ' + w.path + ' and does not share it, so no record there can say which pack made it — the engine refuses every keyed write to ' + w.path + ', whatever the key is called')
            }
            const known = new Set((entry ? entry.fields : []).map((fld: any) => fld.name))
            const shown = (v: any) => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string') ? String(v[0]) : (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v))
            for (const [fld, v] of Object.entries(w.set || {})) {
                if (known.has(fld)) { wu.values[fld] = shown(v); wu.modes[fld] = 'set' } else wu.extras.push({ k: fld, v: shown(v) })
            }
            for (const [fld, v] of Object.entries(w.add || {})) {
                if (known.has(fld)) { wu.values[fld] = String(v); wu.modes[fld] = 'add' } else wu.extras.push({ k: fld, v: String(v) })
            }
            ui.writes.push(wu)
        }
        for (const [kind, body] of Object.entries(t.fx.reward || {})) {
            const declared = rewardKind(kind)
            if (!declared) importWarnings.value.push('a reward of kind "' + kind + '" is not one the uploaded card declares (' + (cardRewards.value.map((k: any) => k.name).join(', ') || 'it declares none') + ') — kept, but this card will refuse it')
            // The nesting is read from the VALUE, not from the card: an amount is a number and a member is
            // an object. A pack authored for another card still loads, with its shape reported rather than
            // reinterpreted — which is what lets the warnings above say something true about it.
            const lines: Array<{ memberKey: string, field: string, amount: any }> = []
            for (const [k, v] of Object.entries(body as Record<string, any>)) {
                if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                    for (const [field, amount] of Object.entries(v as Record<string, any>)) lines.push({ memberKey: k, field, amount })
                } else lines.push({ memberKey: '', field: k, amount: v })
            }
            for (const line of lines) {
                if (declared && declared.keyed === true && !line.memberKey) importWarnings.value.push('reward "' + kind + '" pays one member of ' + declared.path + ' on this card, but this row names none — the engine will refuse it')
                if (declared && declared.keyed !== true && line.memberKey) importWarnings.value.push('reward "' + kind + '" names a member ("' + line.memberKey + '") but this card does not declare that kind keyed — the engine will drop it')
                if (declared && !declared.fields.some((f: any) => f.name === line.field)) importWarnings.value.push('reward "' + kind + '" pays ' + line.field + ', which this card does not list for that kind (it pays: ' + declared.fields.map((f: any) => f.name).join('/') + ') — the engine will drop that field')
                const isText = typeof line.amount === 'string'
                if (declared && declared.text === true && !isText) importWarnings.value.push('reward "' + kind + '" pays a number, but this card writes TEXT for that kind — the engine has nothing to add it to')
                if (declared && declared.text !== true && isText) importWarnings.value.push('reward "' + kind + '" pays text, but this card adds a NUMBER for that kind — the engine has nothing to write it over')
                const limit = Number(declared?.maxLength) || 0
                if (limit > 0 && isText && String(line.amount).length > limit) importWarnings.value.push('reward "' + kind + '.' + line.field + '" is ' + String(line.amount).length + ' characters, over the ' + limit + ' this card lets one event write — the engine will cut it')
                const max = Number(declared?.fields.find((f: any) => f.name === line.field)?.max) || 0
                if (!isText && max > 0 && Math.abs(Number(line.amount)) > max) importWarnings.value.push('reward "' + kind + '.' + line.field + '" is ' + line.amount + ', over the ' + max + ' this card lets one event pay — the engine will pay ' + (Number(line.amount) < 0 ? -max : max))
                ui.rewards.push({ kind, memberKey: line.memberKey, field: line.field, amount: String(line.amount) })
            }
        }
        ui.doText = t.doText; ui.fireNote = t.fireNote
        return ui
    })
}
</script>

<template>
  <div class="ep-root">
    <h3>Event Pack Builder</h3>

    <details class="ep-help">
      <summary><span>How this builder works</span></summary>

      <h4>The flow</h4>
      <p>1 · Upload the game card. The builder reads what the card's engine declares — which condition
      forms exist, which paths a pack may write and under which rules — and the card's own schema
      (which fields exist at those paths), so everything below is filled from the card, never typed. 2 · Name your pack. 3 · Add events.
      4 · Generate, then copy or download the pack text and install it on that card.</p>
      <p>One event has three parts: <b>when it happens</b> (PREREQ + WHEN), <b>what the engine
      commits</b> (EFFECTS), and <b>what the narrator plays</b> (SCENE).</p>

      <h4>Event fields</h4>
      <table>
        <tr><th>Field</th><th>Meaning</th><th>Example</th></tr>
        <tr><td>Key suffix</td><td>the event's id inside your pack — the full key is prefix + suffix</td><td><code>opening</code> → <code>paulk_beach_arc_opening</code></td></tr>
        <tr><td>Title / Step</td><td>the header line of the scene body; Step shows as <code>·1</code></td><td><code>Beach Opening ·1</code></td></tr>
        <tr><td>Kind</td><td><code>TRG</code> = normal event. <code>TIME</code> = a scheduled beat — when two events are ripe in the same moment, TIME wins the slot. Use TRG unless the beat is clock/date-anchored and must not lose to competition</td><td>entrance ceremony at 09:00 → TIME</td></tr>
        <tr><td>Series</td><td>events sharing a Series form one arc (one series per pack, up to 20 beats). Each later beat gates on the previous one having FIRED — an <b>event flag</b> PREREQ, pre-filled when you add a beat to a series. Never on the quest record the previous beat wrote: a completed record is deleted at the day's settle</td><td><code>BeachArc</code></td></tr>
      </table>

      <h4>PREREQ vs WHEN — both must hold, different jobs</h4>
      <p><b>PREREQ</b> asks "is this event on the table at all" — durable story state: the quest
      step, an earlier event having fired. <b>WHEN</b> asks "is THIS the moment" — situational:
      time, place, who is present. The engine reports which single WHEN condition is still missing
      so the story can steer toward it — keep the moment in WHEN, the stage-gating in PREREQ.</p>
      <p>A series step 2: PREREQ <code>event flag · paulk_beach_arc_opening</code> (step 1 has fired —
      the engine's own marker, never deleted) · WHEN <code>compare · T >= 12:00</code>. Step 1 carries no
      PREREQ at all; the marker is what keeps it a one-shot.</p>

      <h4>Condition kinds</h4>
      <table>
        <tr><th>Kind</th><th>Asks</th><th>Example</th></tr>
        <tr><td>compare</td><td>a variable against your value (numbers compare numerically)</td><td><code>T >= 16:00</code> · <code>Mainchar.Money >= 500</code></td></tr>
        <tr><td>in set</td><td>ONE variable equals ANY of your listed values</td><td><code>Mood in {Happy, Excited}</code></td></tr>
        <tr><td>Present(name)</td><td>this character is in the scene right now — by their <b>key</b>, not their display name</td><td><code>Present(Mitsuki)</code></td></tr>
        <tr><td>event flag</td><td>an earlier event already fired — how packs chain without touching game variables</td><td><code>flag: paulk_beach_arc_opening</code></td></tr>
        <tr><td>contains text</td><td>the value contains this text (case-sensitive)</td><td><code>contains(Classmate.*.Mood, "Excited")</code> — any classmate excited</td></tr>
        <tr><td>has element</td><td>the collection holds this entry</td><td><code>has(Classmate, "Mitsuki")</code> — she exists on the roster · <code>has(Mainchar.Inventory, "camera")</code></td></tr>
        <tr><td><code>!</code></td><td>NOT — inverts that one condition</td><td><code>!Present(Mitsuki)</code> — she is NOT here</td></tr>
        <tr><td>OR group</td><td>ANY one group is enough; rows inside a group are AND</td><td>group 1 <code>Aff(Mitsuki) >= 30</code> OR group 2 <code>has(Mainchar.Inventory, "camera") & T >= 10:00</code></td></tr>
      </table>
      <p>A <code>*</code> in a path means "any entry": <code>Classmate.*.Mood</code> is any
      classmate's mood. Zero matching entries = false, never true.
      <i>has vs Present:</i> <code>has(Classmate, "Mitsuki")</code> = she exists at all;
      <code>Present(Mitsuki)</code> = she is in the scene now.</p>
      <p><b>Present() takes the KEY.</b> The engine looks the character up by the key they are
      stored under, so <code>Present(Mitsuki)</code> works and <code>Present(Mitsuki Tachibana)</code>
      never fires — a full name or a display name is prose the engine never reads. Case is fixed for
      you: type <code>MiTSUki</code> and the box snaps to the card's own spelling when it recognises
      the key. If the card seeds no roster yet, nothing is suggested and nothing is corrected — spell
      the key exactly as the game will store it.</p>
      <p><b>The path box suggests, it does not fence.</b> Suggestions with a <code>*</code> are
      templates — replace the <code>*</code> with your value (an engine-declared
      <code>Aff(*)</code> becomes <code>Aff(Mitsuki)</code>). An alias is shown with the path it
      stands for (<code>Aff(*)</code> = <code>Classmate.*.Affection</code>); either spelling works. A typed path the card does not
      declare shows a warning, never a block: heed it for typos (a misspelled path passes every
      later check and the event simply never fires), ignore it when your own pack creates that
      path — a record one of its own writes makes. A chain never needs to: it orders on
      <code>flag:</code>, which is not a path at all.</p>

      <h4>EFFECTS</h4>
      <p><b>Summary</b> — one line naming what this row does, for you and for the pack list. It is a
      LABEL: the engine writes no prose anywhere, so if the beat deserves a line in the game's world log,
      say so in the FIRE half of the body and let the narrator report it. <b>Scope</b>: the values the card
      declares, stored on the done-marker the engine writes when the row fires (School: <code>save</code> =
      fires once, ever; <code>arc</code> = may fire again after the story loops).
      <b>Writes</b> — pick a path the card opens; the fields that appear are the card's own schema,
      typed as it declares them (a number field takes a number, a labeled tuple is written as
      <code>[value, label]</code> for you). Greyed fields are written by the engine; fields the card
      locks are not shown. The <b>Record key</b> is written exactly as you type it: a pack may create any
      key nobody has claimed, the engine stamps your pack's id on it, and only a record carrying that
      stamp can be changed or removed by your pack later. On a <b>shared registry</b> (a path the card
      marks fill-only, like its NPC and location books) type the world's own key — your write can only
      fill blanks in it. <b>Reward</b> — what the row pays when it fires, in a kind the card declares (the
      <i>pays</i> badge lists them). A kind paid per member names who: a key, or a selector such as
      <code>Classmate.*.Is_present</code> (School) for whoever that field marks. Each line shows the
      card's ceiling, and an amount over it is paid at the ceiling.</p>

      <h4>SCENE</h4>
      <p><b>DO</b> — instructions the narrator plays when the event triggers. Prose never changes
      game state: a scene that should raise affection writes a moment that earns it through play.
      <b>FIRE note</b> — a short description of what the fire commits, shown beside the event's
      report signal.</p>
    </details>

    <!-- 1. card -->
    <section class="ep-section">
      <div class="ep-section-head">
        <span>1 · Target card</span>
        <button class="btn-primary" @click="triggerCardUpload">Upload card (.json / .png)</button>
        <input ref="cardInput" type="file" accept=".json,.png" style="display:none" @change="onCardFile" />
      </div>
      <div v-if="cardError" class="ep-error">{{ cardError }}</div>
      <div v-else-if="card" class="ep-cardinfo">
        <span class="ep-badge">{{ card.cardName || 'unnamed card' }}</span>
        <span class="ep-badge">format {{ card.headers.format }}</span>
        <span class="ep-badge">gate: {{ card.headers.paths.armedPath }}</span>
        <span class="ep-badge">writes: {{ card.writes.map((w: any) => w.path).join(' · ') || '(none declared)' }}</span>
        <span class="ep-badge">scopes: {{ card.headers.scopes.join(' · ') || '(none declared)' }}</span>
        <span class="ep-badge">pays: {{ cardRewards.map((k: any) => k.name + (k.keyed ? ' (per ' + k.path.split('.').pop() + ')' : '') + (k.text ? ' ✎ text' : '')).join(' · ') || '(nothing declared)' }}</span>
        <span class="ep-badge">{{ dslPaths.length }} condition paths</span>
      </div>
      <div v-else class="ep-hint">Everything is read from what the card's engine declares — nothing to type. A card whose engine declares no event-pack adapter is refused.</div>
    </section>

    <template v-if="card">
      <!-- 2. meta -->
      <section class="ep-section">
        <div class="ep-section-head">
          <span>2 · Pack identity</span>
          <button class="btn-primary" @click="triggerPackImport">Load event pack (file)…</button>
          <button class="btn-sm" @click="pasteOpen = !pasteOpen">Paste text…</button>
          <input ref="packInput" type="file" style="display:none" @change="onPackFile" />
        </div>
        <div v-if="pasteOpen" class="ep-pastebox">
          <textarea v-model="pasteText" class="ep-ta" rows="6" placeholder="paste the whole pack text — the <mvueventpack> block plus its gated bodies"></textarea>
          <button class="btn-primary" @click="loadFromPaste">Load pasted pack</button>
        </div>
        <div v-if="importError" class="ep-error">{{ importError }}</div>
        <div class="ep-row">
          <label>Creator <input v-model="pack.creator" class="ep-in" placeholder="your name" /></label>
          <label>Event <input v-model="pack.event" class="ep-in" placeholder="Beach Arc" /></label>
          <label>Version <input v-model="pack.version" class="ep-in ep-in-s" placeholder="1.0" /></label>
        </div>
        <div class="ep-hint">pack id: <code>{{ idPreview || '—' }}</code> · trigger key prefix: <code>{{ prefixPreview }}</code> · emitted format: <code>{{ derivedFormat }}</code> (derived from the conditions you use)</div>
        <div v-if="formatExceedsCard" class="ep-error">These conditions need format {{ derivedFormat }} but the card's engine declares {{ card.headers.format }} — this pack cannot run there.</div>
        <ul v-if="importWarnings.length" class="ep-warnlist"><li v-for="(w, i) in importWarnings" :key="i">{{ w }}</li></ul>
      </section>

      <!-- one shared datalist for every condition row's path picker -->
      <datalist id="ep-dsl-paths"><option v-for="p in dslPaths" :key="p" :value="p" :label="aliasOf(p) ? '= ' + aliasOf(p) : undefined" /></datalist>
      <!-- and one for the Present() box: keys, because that is what the engine looks up -->
      <datalist id="ep-roster-keys"><option v-for="k in rosterKeys" :key="k" :value="k" /></datalist>

      <!-- 3. triggers -->
      <section class="ep-section">
        <div class="ep-section-head">
          <span>3 · Events ({{ pack.triggers.length }})</span>
          <button class="btn-primary" @click="addTrigger">+ Add event</button>
        </div>

        <div v-for="(t, ti) in pack.triggers" :key="ti" class="ep-trigger">
          <div class="ep-trigger-head">
            <strong>@{{ prefixPreview }}{{ t.keySuffix || '…' }}</strong>
            <button class="btn-x" @click="removeTrigger(ti)">×</button>
          </div>
          <div class="ep-row">
            <label>Key suffix <input v-model="t.keySuffix" class="ep-in" placeholder="opening" /></label>
            <label>Title <input v-model="t.title" class="ep-in" placeholder="Beach Opening" /></label>
            <label>Step <input v-model="t.step" class="ep-in ep-in-s" placeholder="1" /></label>
            <label>Kind
              <select v-model="t.cat" class="ep-in ep-in-s"><option>TRG</option><option>TIME</option></select>
            </label>
            <label>Series <input v-model="t.series" class="ep-in" placeholder="(one series per pack)" /></label>
          </div>

          <!-- prereq -->
          <div class="ep-condblock">
            <div class="ep-cond-head">PREREQ — all must hold (keeps the event off the table until true)</div>
            <div v-for="(d, di) in t.prereq" :key="di" class="ep-cond">
              <ConditionRowInline :d="d" :paths="dslPaths" :keys="rosterKeys" @remove="removeCondition(t.prereq, di)" />
            </div>
            <button class="btn-sm" @click="addCondition(t.prereq)">+ AND condition</button>
          </div>

          <!-- when groups -->
          <div class="ep-condblock">
            <div class="ep-cond-head">WHEN — the moment it fires<span v-if="t.whenGroups.length > 1"> (any group is enough)</span></div>
            <div v-for="(g, gi) in t.whenGroups" :key="gi" class="ep-orgroup">
              <div v-if="t.whenGroups.length > 1" class="ep-or-label">group {{ gi + 1 }}<button class="btn-x" @click="removeOrGroup(t, gi)">×</button></div>
              <div v-for="(d, di) in g" :key="di" class="ep-cond">
                <ConditionRowInline :d="d" :paths="dslPaths" :keys="rosterKeys" @remove="removeCondition(g, di)" />
              </div>
              <button class="btn-sm" @click="addCondition(g)">+ AND condition</button>
            </div>
            <button class="btn-sm" @click="addOrGroup(t)">+ OR group</button>
          </div>

          <!-- fx -->
          <div class="ep-condblock">
            <div class="ep-cond-head">EFFECTS — what the engine commits when it fires (the card declares where a pack may write)</div>
            <div class="ep-row">
              <label class="ep-wide">Summary <input v-model="t.fxSummary" class="ep-in ep-wide" placeholder="one line naming what this row does" /></label>
              <label>Scope
                <select v-if="scopeChoices.length" v-model="t.fxScope" class="ep-in">
                  <option value="">(card default)</option>
                  <option v-for="s in scopeChoices" :key="s" :value="s">{{ s }}</option>
                </select>
                <input v-else v-model="t.fxScope" class="ep-in ep-in-s" placeholder="card declares none" />
              </label>
            </div>
            <div v-for="(w, wi) in t.writes" :key="wi" class="ep-fxtype">
              <div class="ep-row">
                <label>Write to
                  <select v-model="w.path" class="ep-in">
                    <option v-for="e in cardWrites" :key="e.path" :value="e.path">{{ e.path }}</option>
                  </select>
                </label>
                <label v-if="writeEntry(w.path)?.isRecord">Record key <input v-model="w.recordKey" class="ep-in" :placeholder="isSharedPath(w.path) ? 'the world key the game already uses, e.g. School_Cafeteria' : 'the name the player reads, e.g. Ruinblade'" /></label>
                <label v-if="writeEntry(w.path)?.removable" class="ep-fx-toggle"><input v-model="w.remove" type="checkbox" /> remove this record</label>
                <button class="btn-x" @click="removeWrite(t, wi)">×</button>
              </div>
              <div v-if="writeEntry(w.path) && !writeEntry(w.path).inSchema" class="ep-path-warn">⚠ {{ w.path }} is declared by the engine but not described by the card's schema — fields are free-form here</div>
              <div v-if="!w.remove" class="ep-pairs">
                <div v-for="f in editableFields(w)" :key="f.name" class="ep-pair">
                  <span class="ep-fieldname">{{ f.name }}</span>
                  <input v-if="f.engineOwned" class="ep-in" disabled placeholder="written by the engine" />
                  <template v-else>
                    <select v-if="f.enumValues" v-model="w.values[f.name]" class="ep-in"><option value="">(unset)</option><option v-for="ev in f.enumValues" :key="String(ev)" :value="String(ev)">{{ ev }}</option></select>
                    <select v-else-if="f.type === 'boolean'" v-model="w.values[f.name]" class="ep-in ep-in-s"><option value="">(unset)</option><option value="true">true</option><option value="false">false</option></select>
                    <input v-else v-model="w.values[f.name]" class="ep-in" :type="f.type === 'number' || f.type === 'integer' ? 'number' : 'text'" :placeholder="f.tuple ? f.type + ' · labeled ' + (f.tuple.label || 'tuple') : f.type" />
                    <select v-if="f.addable" v-model="w.modes[f.name]" class="ep-in ep-in-xs"><option value="set">set</option><option value="add">add</option></select>
                  </template>
                </div>
                <template v-if="writeEntry(w.path)?.isOpen || (writeEntry(w.path) && !writeEntry(w.path).inSchema)">
                  <div v-for="(p, pi) in w.extras" :key="'x' + pi" class="ep-pair">
                    <input v-model="p.k" class="ep-in ep-in-s" placeholder="extra field" />
                    <input v-model="p.v" class="ep-in" placeholder="value" />
                    <button class="btn-x" @click="removeExtra(w, pi)">×</button>
                  </div>
                  <button class="btn-sm" @click="addExtra(w)">+ extra field</button>
                </template>
                <span class="ep-hint">fields are the card's own schema — greyed ones the engine writes itself</span>
              </div>
            </div>
            <button class="btn-sm" :disabled="!cardWrites.length" @click="addWrite(t)">+ add write</button>

            <!-- REWARD — what this ONE beat pays. A series is many beats, so each states its own. -->
            <div v-for="(r, ri) in t.rewards" :key="'r' + ri" class="ep-fxtype">
              <div class="ep-row">
                <label>Reward
                  <select v-model="r.kind" class="ep-in ep-in-s" @change="onRewardKind(r)">
                    <option v-for="k in cardRewards" :key="k.name" :value="k.name">{{ k.name }}</option>
                  </select>
                </label>
                <label v-if="isKeyedKind(r.kind)">To
                  <input v-model="r.memberKey" class="ep-in ep-in-s" :list="'rw' + ri" :placeholder="rewardKind(r.kind)?.path.split('.').pop()" />
                  <datalist :id="'rw' + ri">
                    <option v-for="sel in (cardPaysSelector ? selectorsFor(r.kind) : [])" :key="sel" :value="sel" :label="'whoever has ' + selectorFieldName(sel) + ' = true'" />
                    <option v-for="m in rewardMembers(r.kind)" :key="m" :value="m" />
                  </datalist>
                </label>
                <label>Field
                  <select v-model="r.field" class="ep-in ep-in-s">
                    <option v-for="f in rewardFields(r.kind)" :key="f.name" :value="f.name">{{ f.name }}</option>
                  </select>
                </label>
                <label v-if="isTextKind(r.kind)" class="ep-wide">New text <input v-model="r.amount" class="ep-in ep-wide" placeholder="what the beat makes it — written over the old value" /></label>
                <label v-else>Amount <input v-model="r.amount" class="ep-in ep-in-xs" type="number" :placeholder="'±' + rewardMax(r.kind, r.field)" /></label>
                <span class="ep-hint">{{ rewardPathLabel(r) }} ·
                  {{ isTextKind(r.kind) ? 'replaced, up to ' + rewardMaxLength(r.kind) + ' characters' : 'at most ' + rewardMax(r.kind, r.field) + ' per event' }}</span>
                <button class="btn-x" @click="removeReward(t, ri)">×</button>
              </div>
              <div v-if="rewardOver(r)" class="ep-path-warn">⚠ this card pays at most {{ rewardMax(r.kind, r.field) }} of {{ r.field }} in one event — the engine will pay {{ Number(r.amount) < 0 ? -rewardMax(r.kind, r.field) : rewardMax(r.kind, r.field) }} and say so in its log</div>
              <div v-if="rewardTooLong(r)" class="ep-path-warn">⚠ {{ r.amount.trim().length }} characters, over the {{ rewardMaxLength(r.kind) }} this card lets one event write — the engine will cut it there</div>
              <div v-if="isKeyedKind(r.kind) && !r.memberKey.trim()" class="ep-path-warn">⚠ this kind pays ONE member of {{ rewardKind(r.kind)?.path }} — name who, or pick a {{ rewardKind(r.kind)?.path }}.*.‹field› selector to let the engine read it from the scene; otherwise the line is dropped at export</div>
              <div v-if="isKeyedKind(r.kind) && r.memberKey.includes('*') && !isMemberSelector(r.kind, r.memberKey)" class="ep-path-warn">⚠ “{{ r.memberKey }}” names nobody — a selector is the WHOLE path and says which field marks her, like {{ rewardKind(r.kind)?.path }}.*.‹field›. As written the engine looks for a member literally called “{{ r.memberKey }}”, finds none, and pays nothing.</div>
              <div v-if="isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && cardPaysSelector" class="ep-hint">the engine pays the one member of {{ rewardKind(r.kind)?.path }} whose {{ r.memberKey.trim().split('.').pop() }} is true — nobody, or more than one, and it pays no one and says so</div>
              <div v-if="isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && cardPaysSelector && selectorsFor(r.kind).length && !selectorsFor(r.kind).includes(r.memberKey.trim())" class="ep-path-warn">⚠ this card does not seed {{ r.memberKey.trim().split('.').pop() }} as a true/false field — a selector pays the member whose field is <em>true</em>, so a number or a name can never pick anyone and the engine will refuse this at fire</div>
              <div v-if="isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && !cardPaysSelector" class="ep-path-warn">⚠ this card's engine declares format {{ card.headers.format }} and reads no selector — it would refuse this key and fire the beat with no payout. Name a member instead.</div>
              <div v-if="isKeyedKind(r.kind) && r.memberKey.trim() && !isMemberSelector(r.kind, r.memberKey) && rewardMembers(r.kind).length && !rewardMembers(r.kind).includes(r.memberKey.trim())" class="ep-hint">“{{ r.memberKey }}” is not in the card's seed — fine if the save adds them, refused at fire if it does not</div>
              <div v-if="rewardFields(r.kind).some((f: any) => f.name === r.field && !f.inSchema)" class="ep-path-warn">⚠ {{ r.field }} is declared payable but is not in the card's schema — the engine would pay it and the next parse would strip it</div>
            </div>
            <button class="btn-sm" :disabled="!cardRewards.length" @click="addReward(t)">+ add reward</button>
            <div v-if="!cardRewards.length" class="ep-hint">this card's engine declares no payout — a beat here changes state through writes only</div>
          </div>

          <!-- body -->
          <div class="ep-condblock">
            <div class="ep-cond-head">SCENE — DO is what the narrator plays; only EFFECTS above change state</div>
            <textarea v-model="t.doText" class="ep-ta" rows="3" placeholder="DO — narrator instructions for the beat"></textarea>
            <input v-model="t.fireNote" class="ep-in ep-wide" placeholder="FIRE note — what the fire does (shown after the eventFire emit)" />
          </div>
        </div>
        <div v-if="!pack.triggers.length" class="ep-hint">No events yet. One pack = one series of up to 20 beats.</div>
      </section>

      <!-- 4. output -->
      <section class="ep-section">
        <div class="ep-section-head">
          <span>4 · Pack text</span>
          <button class="btn-primary" @click="generate">Generate</button>
          <button class="btn-sm" :disabled="!output" @click="copyOutput">Copy</button>
          <button class="btn-sm" :disabled="!output" @click="downloadOutput">Download .txt</button>
          <button class="btn-sm" :disabled="!output" @click="downloadArtifact">Download artifact .zip</button>
        </div>
        <div v-if="emitError" class="ep-error">{{ emitError }}</div>
        <div v-if="artifactError" class="ep-error">{{ artifactError }}</div>
        <textarea v-if="output" :value="output" readonly class="ep-ta ep-out" rows="16"></textarea>
      </section>
    </template>
  </div>
</template>

<script lang="ts">
// Inline condition-row component — one row = one grammar descriptor, edited directly.
import { defineComponent, h } from 'vue'
import { isCardDeclaredLhs, canonicalRosterKey } from '../utils/event-pack-card-ingest.js'

const ConditionRowInline = defineComponent({
    props: {
        d: { type: Object, required: true }, paths: { type: Array, required: true },
        keys: { type: Array, required: true },
    },
    emits: ['remove'],
    setup(props: any, { emit }: any) {
        // every kind, on every card: the whole grammar is format 1.0 (eventpack_revisit D4)
        const KINDS = [
            { v: 'cmp', label: 'compare' }, { v: 'in', label: 'in set' },
            { v: 'present', label: 'Present(name)' }, { v: 'flag', label: 'event flag' },
            { v: 'contains', label: 'contains text' }, { v: 'has', label: 'has element' },
        ]
        const input = (model: string, placeholder: string, opts: any = {}) => h('input', {
            class: 'ep-in' + (opts.small ? ' ep-in-s' : ''),
            list: opts.list, placeholder,
            value: props.d[model] ?? '',
            onInput: (e: Event) => { props.d[model] = (e.target as HTMLInputElement).value },
            // `commit` normalizes on CHANGE (blur, Enter, datalist pick) — never per keystroke,
            // which would rewrite the word out from under someone still typing it
            onChange: opts.commit
                ? (e: Event) => { props.d[model] = opts.commit((e.target as HTMLInputElement).value) }
                : undefined,
        })
        return () => {
            const d = props.d
            const kinds = KINDS
            const kids = []
            kids.push(h('label', { class: 'ep-neg', title: 'NOT — inverts this condition' }, [
                h('input', { type: 'checkbox', checked: !!d.neg, onChange: (e: Event) => { d.neg = (e.target as HTMLInputElement).checked || undefined } }), '!',
            ]))
            kids.push(h('select', {
                class: 'ep-in ep-in-s', value: d.kind,
                onChange: (e: Event) => {
                    d.kind = (e.target as HTMLSelectElement).value
                    // seed the fields the new kind carries so the inputs bind to something
                    if (d.kind === 'cmp' && !d.op) d.op = '>='
                    if (d.kind === 'in' && !Array.isArray(d.set)) d.set = []
                    if (d.kind === 'flag' && !d.state) d.state = 'done'
                },
            }, kinds.map((k) => h('option', { value: k.v, selected: k.v === d.kind }, k.label))))
            if (d.kind === 'cmp' || d.kind === 'in' || d.kind === 'contains' || d.kind === 'has') {
                kids.push(input('lhs', 'variable path', { list: 'ep-dsl-paths' }))
            }
            if (d.kind === 'cmp') {
                kids.push(h('select', {
                    class: 'ep-in ep-in-xs', value: d.op,
                    onChange: (e: Event) => { d.op = (e.target as HTMLSelectElement).value },
                }, ['>=', '<=', '=', '==', '>', '<'].map((o) => h('option', { value: o, selected: o === d.op }, o))))
                kids.push(input('rhs', 'value'))
            }
            if (d.kind === 'in') kids.push(h('input', {
                class: 'ep-in', placeholder: 'a, b, c',
                value: (d.set || []).join(', '),
                onInput: (e: Event) => { d.set = (e.target as HTMLInputElement).value.split(',').map((x: string) => x.trim()).filter(Boolean) },
            }))
            // Present() resolves by KEY, so the box says key, suggests the card's keys, and snaps
            // what was typed to the card's own spelling — the engine can then stay case-exact
            if (d.kind === 'present') kids.push(input('name', 'roster key', {
                list: 'ep-roster-keys',
                commit: (v: string) => canonicalRosterKey(v, props.keys as string[]),
            }))
            // the FORMAT writes exactly one state, `done`, so there is nothing to choose
            if (d.kind === 'flag') kids.push(input('flag', 'event key'))
            if (d.kind === 'contains' || d.kind === 'has') kids.push(input('arg', d.kind === 'has' ? 'element' : 'substring'))
            kids.push(h('button', { class: 'btn-x', onClick: () => emit('remove') }, '×'))
            const row = h('div', { class: 'ep-cond-row' }, kids)
            // unknown-path WARNING, never a block: the picker list is a suggestion surface, and a
            // pack may gate on a path it itself creates — but a typo here passes every validator
            // (checking genre vocabulary downstream would be the layering violation) and dies as
            // an event that can never fire, so this is the one layer that can say anything
            const usesLhs = d.kind === 'cmp' || d.kind === 'in' || d.kind === 'contains' || d.kind === 'has'
            if (usesLhs && String(d.lhs ?? '').trim() && !isCardDeclaredLhs(d.lhs, props.paths as string[])) {
                return h('div', {}, [row, h('div', { class: 'ep-path-warn' },
                    '⚠ "' + d.lhs + '" is not a path this card declares — check the spelling, or ignore if your pack creates it.')])
            }
            return row
        }
    },
})

export default { components: { ConditionRowInline } }
</script>

<style scoped>
.ep-root { padding: 20px; overflow-y: auto; height: 100%; color: #ddd; }
.ep-root h3 { margin: 0 0 15px; color: #00f2ea; }
.ep-help { border: 1px solid #2a2d35; border-radius: 8px; padding: 10px 14px; margin-bottom: 15px; background: #14161b; font-size: 0.85rem; line-height: 1.5; }
.ep-help summary { cursor: pointer; font-weight: 600; }
.ep-help summary span { background: #ffd54f; color: #000; padding: 2px 8px; border-radius: 4px; }
.ep-help h4 { color: #7a8; margin: 14px 0 6px; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px; }
.ep-help p { margin: 6px 0; color: #bbb; }
.ep-help table { border-collapse: collapse; width: 100%; margin: 6px 0; }
.ep-help th, .ep-help td { border: 1px solid #2a2d35; padding: 5px 8px; text-align: left; vertical-align: top; }
.ep-help th { color: #888; font-size: 0.72rem; text-transform: uppercase; }
.ep-help code { color: #9ad; background: #0f1115; padding: 1px 4px; border-radius: 3px; }
.ep-help b { color: #ddd; }
.ep-section { border: 1px solid #2a2d35; border-radius: 8px; padding: 12px; margin-bottom: 15px; background: #14161b; }
.ep-section-head { display: flex; align-items: center; gap: 10px; font-weight: 600; margin-bottom: 10px; }
.ep-section-head span { flex: 1; }
.ep-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.ep-row label { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: #888; }
.ep-in { background: #0f1115; border: 1px solid #333; color: #ddd; padding: 5px 8px; border-radius: 4px; font-size: 0.85rem; min-width: 140px; }
.ep-in-s { min-width: 60px; width: 90px; }
.ep-in-xs { min-width: 48px; width: 60px; }
.ep-wide { flex: 1; min-width: 260px; }
.ep-badge { background: rgba(0, 242, 234, 0.08); border: 1px solid rgba(0, 242, 234, 0.3); color: #00f2ea; border-radius: 12px; padding: 2px 10px; font-size: 0.75rem; margin-right: 6px; }
.ep-cardinfo { display: flex; flex-wrap: wrap; gap: 4px; }
.ep-error { color: #ff6b6b; background: rgba(255, 107, 107, 0.08); border: 1px solid rgba(255, 107, 107, 0.3); border-radius: 4px; padding: 6px 10px; font-size: 0.85rem; margin-top: 6px; }
.ep-warnlist { color: #ffb74d; font-size: 0.8rem; margin: 6px 0 0; padding-left: 18px; }
.ep-hint { color: #666; font-size: 0.78rem; margin-top: 4px; }
.ep-hint code { color: #9ad; }
.ep-trigger { border: 1px solid #333; border-radius: 6px; padding: 10px; margin-bottom: 12px; background: #101218; }
.ep-trigger-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: #00f2ea; }
.ep-condblock { border-top: 1px dashed #2a2d35; padding-top: 8px; margin-top: 8px; }
.ep-cond-head { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: #7a8; margin-bottom: 6px; }
.ep-cond-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.ep-path-warn { color: #ffb74d; font-size: 0.78rem; margin: -2px 0 6px 2px; }
.ep-neg { display: flex; align-items: center; gap: 2px; color: #f90; font-weight: 700; }
.ep-orgroup { border: 1px dashed #345; border-radius: 6px; padding: 8px; margin-bottom: 8px; }
.ep-or-label { font-size: 0.75rem; color: #58c; display: flex; justify-content: space-between; margin-bottom: 4px; }
.ep-fxtype { margin-bottom: 6px; }
.ep-fx-toggle { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #bbb; cursor: pointer; }
.ep-fieldname { min-width: 120px; font-size: 0.85rem; color: #9ab; font-family: monospace; }
.ep-pairs { margin: 6px 0 4px 22px; }
.ep-pair { display: flex; gap: 6px; margin-bottom: 4px; }
.ep-ta { width: 100%; background: #0f1115; border: 1px solid #333; color: #ddd; border-radius: 4px; padding: 8px; font-size: 0.85rem; font-family: inherit; box-sizing: border-box; margin-bottom: 6px; }
.ep-out { font-family: monospace; font-size: 0.75rem; white-space: pre; }
.btn-sm { background: #333; border: none; color: #fff; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
.btn-sm:disabled { opacity: 0.4; cursor: default; }
.btn-primary { background: #00f2ea; color: #000; border: none; padding: 6px 12px; border-radius: 4px; font-weight: 600; cursor: pointer; }
.btn-x { background: transparent; border: none; color: #855; cursor: pointer; font-size: 1rem; }
.btn-x:hover { color: #f66; }
</style>
