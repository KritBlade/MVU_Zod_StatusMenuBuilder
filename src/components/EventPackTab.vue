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
import DnaPageHeader from '../shared/gui-dna/DnaPageHeader.vue'
import DnaCard from '../shared/gui-dna/DnaCard.vue'
import DnaField from '../shared/gui-dna/DnaField.vue'
import DnaRecord from '../shared/gui-dna/DnaRecord.vue'
import DnaSwitchRow from '../shared/gui-dna/DnaSwitchRow.vue'
import DnaNotice from '../shared/gui-dna/DnaNotice.vue'
import DnaResultList from '../shared/gui-dna/DnaResultList.vue'
import DnaEmpty from '../shared/gui-dna/DnaEmpty.vue'
import type { ResultLine } from '../shared/gui-dna/gene-types'
import { askConfirm } from '../shared/gui-dna/confirm-dialog'
import CopyTextButton from '../shared/CopyTextButton.vue'
import { pickFile, saveFile } from '../shared/browser-file'
import { createModuleLog } from '../shared/log'

const log = createModuleLog('event-pack')

// The Event Pack guide: what each part of this tab means. It lives in devdoc/event_pack_wording.md until the
// published docs exist; pointing the tab somewhere else is this one URL (and the anchors, if the headings change).
const GUIDE_URL = 'https://github.com/KritBlade/MVU_Zod_StatusMenuBuilder/blob/main/devdoc/event_pack_wording.md'
const GUIDE_SECTIONS = {
    flow: 'the-flow',
    fields: 'event-fields',
    prereqWhen: 'prereq-vs-when--both-must-hold-different-jobs',
    conditions: 'condition-kinds',
    effects: 'effects',
    scene: 'scene',
} as const
const guide = (section: keyof typeof GUIDE_SECTIONS) => GUIDE_URL + '#' + GUIDE_SECTIONS[section]

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
const card = ref<any>(null)          // { cardName, headers, statData, dslPaths }
const cardError = ref('')

async function uploadCard() {
    const file = await pickFile('.json,.png')
    if (!file) return
    const isPng = /\.png$/i.test(file.name)
    let raw: string | Uint8Array
    try {
        raw = isPng ? new Uint8Array(await file.arrayBuffer()) : await file.text()
    } catch (error) {
        log.warn('could not read the card file ' + file.name + ':', error)
        card.value = null
        cardError.value = 'Could not read ' + file.name
        return
    }
    const r = ingestCard(raw)
    if (r.ok) { card.value = r; cardError.value = '' }
    else { card.value = null; cardError.value = r.reason }
}

// What the uploaded card declares, one line each in the Target card.
const cardFacts = computed<{ label: string; values: string[] }[]>(() => {
    if (!card.value) return []
    const pays = cardRewards.value.map((k: any) => k.name + (k.keyed ? ' (per ' + k.path.split('.').pop() + ')' : '') + (k.text ? ' (text)' : ''))
    return [
        { label: 'Format', values: [String(card.value.headers.format)] },
        { label: 'Gate', values: [String(card.value.headers.paths.armedPath)] },
        { label: 'Writes', values: cardWrites.value.map((w: any) => w.path) },
        { label: 'Scopes', values: card.value.headers.scopes },
        { label: 'Pays', values: pays },
        { label: 'Condition paths', values: [String(dslPaths.value.length)] },
    ]
})

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
async function removeTrigger(t: TriggerUi) {
    const isConfirmed = await askConfirm({
        question: 'Delete this event?',
        facts: [{ label: 'Event', value: '@' + prefixPreview.value + (t.keySuffix || '…') }],
        answers: ['Its conditions, effects and scene are lost.', 'Delete removes it; Cancel keeps it.'],
        actionText: 'Delete',
        actionIcon: 'fa-trash',
    })
    const at = pack.triggers.indexOf(t)
    if (isConfirmed && at !== -1) pack.triggers.splice(at, 1)
}

// ---- condition rows ----
function blankDescriptor(): Descriptor { return { kind: 'cmp', lhs: '', op: '>=', rhs: '' } }
function addCondition(list: Descriptor[]) { list.push(blankDescriptor()) }
function removeCondition(list: Descriptor[], i: number) { list.splice(i, 1) }
function addOrGroup(t: TriggerUi) { t.whenGroups.push([]) }
async function removeOrGroup(t: TriggerUi, group: Descriptor[]) {
    if (t.whenGroups.length < 2) return
    if (group.length) {
        const isConfirmed = await askConfirm({
            question: 'Delete this OR group?',
            answers: ['Its ' + group.length + ' condition' + (group.length === 1 ? ' is' : 's are') + ' lost.', 'Delete removes it; Cancel keeps it.'],
            actionText: 'Delete',
            actionIcon: 'fa-trash',
        })
        if (!isConfirmed) return
    }
    const at = t.whenGroups.indexOf(group)
    if (at !== -1) t.whenGroups.splice(at, 1)
}
// ---- writes ----
function addWrite(t: TriggerUi) {
    const first = cardWrites.value[0]
    t.writes.push({ path: first ? first.path : '', recordKey: '', values: {}, modes: {}, extras: [], remove: false })
}
async function removeWrite(t: TriggerUi, w: WriteUi) {
    const isConfirmed = await askConfirm({
        question: 'Remove this write?',
        facts: [{ label: 'Path', value: w.path }],
        answers: ['The fields typed into it are lost.', 'Remove deletes it; Cancel keeps it.'],
        actionText: 'Remove',
        actionIcon: 'fa-trash',
    })
    const at = t.writes.indexOf(w)
    if (isConfirmed && at !== -1) t.writes.splice(at, 1)
}
// ---- rewards ----
function addReward(t: TriggerUi) {
    const first = cardRewards.value[0]
    const field = first && first.fields.length ? first.fields[0].name : ''
    t.rewards.push({ kind: first ? first.name : '', memberKey: '', field, amount: '' })
}
async function removeReward(t: TriggerUi, r: RewardUi) {
    const isConfirmed = await askConfirm({
        question: 'Remove this reward?',
        facts: [{ label: 'Reward', value: r.kind + (r.field ? ' · ' + r.field : '') }],
        answers: ['Remove deletes it; Cancel keeps it.'],
        actionText: 'Remove',
        actionIcon: 'fa-trash',
    })
    const at = t.rewards.indexOf(r)
    if (isConfirmed && at !== -1) t.rewards.splice(at, 1)
}

// What a reward line's state means at fire time: the warnings (it will be capped, cut, dropped or refused) and the
// notes (who it pays). Each sentence names its own consequence.
function rewardWarnings(r: RewardUi): ResultLine[] {
    const lines: string[] = []
    const path = rewardKind(r.kind)?.path
    const key = r.memberKey.trim()
    if (rewardOver(r)) lines.push('this card pays at most ' + rewardMax(r.kind, r.field) + ' of ' + r.field + ' in one event — the engine will pay ' + (Number(r.amount) < 0 ? -rewardMax(r.kind, r.field) : rewardMax(r.kind, r.field)) + ' and say so in its log')
    if (rewardTooLong(r)) lines.push(r.amount.trim().length + ' characters, over the ' + rewardMaxLength(r.kind) + ' this card lets one event write — the engine will cut it there')
    if (isKeyedKind(r.kind) && !key) lines.push('this kind pays ONE member of ' + path + ' — name who, or pick a ' + path + '.*.‹field› selector to let the engine read it from the scene; otherwise the line is dropped at export')
    if (isKeyedKind(r.kind) && r.memberKey.includes('*') && !isMemberSelector(r.kind, r.memberKey)) lines.push('“' + r.memberKey + '” names nobody — a selector is the WHOLE path and says which field marks her, like ' + path + '.*.‹field›. As written the engine looks for a member literally called “' + r.memberKey + '”, finds none, and pays nothing.')
    if (isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && cardPaysSelector.value && selectorsFor(r.kind).length && !selectorsFor(r.kind).includes(key)) lines.push('this card does not seed ' + key.split('.').pop() + ' as a true/false field — a selector pays the member whose field is true, so a number or a name can never pick anyone and the engine will refuse this at fire')
    if (isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && !cardPaysSelector.value) lines.push("this card's engine declares format " + card.value.headers.format + ' and reads no selector — it would refuse this key and fire the beat with no payout. Name a member instead.')
    if (rewardFields(r.kind).some((f: any) => f.name === r.field && !f.inSchema)) lines.push(r.field + " is declared payable but is not in the card's schema — the engine would pay it and the next parse would strip it")
    return lines.map((text) => ({ status: 'warning', text }))
}
function rewardNotes(r: RewardUi): string[] {
    const notes: string[] = []
    const path = rewardKind(r.kind)?.path
    const key = r.memberKey.trim()
    if (isKeyedKind(r.kind) && isMemberSelector(r.kind, r.memberKey) && cardPaysSelector.value) notes.push('the engine pays the one member of ' + path + ' whose ' + key.split('.').pop() + ' is true — nobody, or more than one, and it pays no one and says so')
    if (isKeyedKind(r.kind) && key && !isMemberSelector(r.kind, r.memberKey) && rewardMembers(r.kind).length && !rewardMembers(r.kind).includes(key)) notes.push('“' + r.memberKey + "” is not in the card's seed — fine if the save adds them, refused at fire if it does not")
    return notes
}
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
const importError = ref('')
const pasteOpen = ref(false)
const pasteText = ref('')
async function loadFromText(txt: string) {
    importError.value = ''
    const r = parsePackFile(txt)
    if (!r.ok) { importError.value = r.reason; return }
    if (pack.triggers.length) {
        const count = pack.triggers.length
        const isConfirmed = await askConfirm({
            question: 'Load this pack into the editor?',
            facts: [{ label: 'Pack', value: (r.packs[0].creator || '?') + ' · ' + (r.packs[0].event || '?') }],
            answers: ['It replaces the ' + count + ' event' + (count === 1 ? '' : 's') + ' now in the editor.', 'Load replaces them; Cancel keeps yours.'],
            actionText: 'Load',
            actionIcon: 'fa-file-import',
        })
        if (!isConfirmed) return
    }
    importWarnings.value = r.warnings
    if (r.packs.length > 1) importWarnings.value = ['file holds ' + r.packs.length + ' packs — loaded the FIRST; load again to edit another (each pack exports as its own text)', ...r.warnings]
    loadPack(r.packs[0])
    pasteOpen.value = false
    pasteText.value = ''
}
async function loadPackFile() {
    const file = await pickFile('')
    if (!file) return
    let text = ''
    try {
        text = await file.text()
    } catch (error) {
        log.warn('could not read the pack file ' + file.name + ':', error)
        importError.value = 'Could not read ' + file.name
        return
    }
    await loadFromText(text)
}
const importWarningLines = computed<ResultLine[]>(() => importWarnings.value.map((text) => ({ status: 'warning', text })))
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
  <div class="smb-page">
    <DnaPageHeader icon="fa-calendar-days" eyebrow="Events / Event Pack" title="Event Pack"
      subtitle="Events for a card's engine: upload the card, name the pack, add events, generate.">
      <template #status>
        <span v-if="card" class="smb-pill is-success">{{ card.cardName || 'unnamed card' }}</span>
        <span v-else class="smb-pill is-neutral">No card</span>
      </template>
    </DnaPageHeader>

    <!-- 1. card -->
    <DnaCard title="Target card" badge-text="1" body-class="smb-stack" :guide-href="guide('flow')"
      description="Everything below is read from what the card's engine declares.">
      <template #actions>
        <button type="button" class="smb-btn smb-btn-primary" @click="uploadCard"><i class="fa-solid fa-upload"></i>Upload card</button>
      </template>
      <DnaNotice v-if="cardError" status="danger" :text="cardError" />
      <div v-else-if="card" class="smb-grid">
        <p v-for="fact in cardFacts" :key="fact.label" class="smb-hint">
          <span>{{ fact.label }}:</span>
          <template v-if="fact.values.length">
            <template v-for="value in fact.values" :key="value"> <code class="smb-code">{{ value }}</code></template>
          </template>
          <span v-else> none declared</span>
        </p>
      </div>
      <p v-else class="smb-hint">Upload the game card (.json or .png); one with no event-pack adapter is refused.</p>
    </DnaCard>

    <template v-if="card">
      <!-- 2. meta -->
      <DnaCard title="Pack identity" badge-text="2" body-class="smb-grid" :guide-href="guide('flow')"
        description="Who made the pack and the event it holds; together they make its id.">
        <template #actions>
          <button type="button" class="smb-btn" @click="loadPackFile"><i class="fa-solid fa-file-import"></i>Load pack file</button>
          <button type="button" class="smb-btn" :aria-pressed="pasteOpen ? 'true' : 'false'" @click="pasteOpen = !pasteOpen"><i class="fa-solid fa-paste"></i>Paste text</button>
        </template>
        <DnaField v-if="pasteOpen" label="Pack text" for-id="event_pack_paste" is-span>
          <textarea id="event_pack_paste" v-model="pasteText" class="smb-textarea is-code" rows="6"
            placeholder="paste the whole pack text: the <mvueventpack> block plus its gated bodies"></textarea>
          <div class="smb-control-row">
            <button type="button" class="smb-btn smb-btn-primary" @click="loadFromPaste"><i class="fa-solid fa-file-import"></i>Load pasted pack</button>
          </div>
        </DnaField>
        <DnaNotice v-if="importError" status="danger" :text="importError" is-span />
        <DnaField label="Creator" for-id="event_pack_creator">
          <input id="event_pack_creator" v-model="pack.creator" class="smb-input" placeholder="your name" />
        </DnaField>
        <DnaField label="Event" for-id="event_pack_event">
          <input id="event_pack_event" v-model="pack.event" class="smb-input" placeholder="Beach Arc" />
        </DnaField>
        <DnaField label="Version" for-id="event_pack_version">
          <input id="event_pack_version" v-model="pack.version" class="smb-input" placeholder="1.0" />
        </DnaField>
        <p class="smb-hint smb-span">
          <span>Pack id</span> <code class="smb-code">{{ idPreview || '—' }}</code>
          <span>· key prefix</span> <code class="smb-code">{{ prefixPreview }}</code>
          <span>· emitted format</span> <code class="smb-code">{{ derivedFormat }}</code>
          <span>(from the conditions you use)</span>
        </p>
        <DnaNotice v-if="formatExceedsCard" status="danger" is-span
          :text="'These conditions need format ' + derivedFormat + ' but the card\'s engine declares ' + card.headers.format + ' — this pack cannot run there.'" />
        <DnaResultList v-if="importWarningLines.length" heading="Loaded with warnings" :lines="importWarningLines" is-span />
      </DnaCard>

      <!-- one shared datalist for every condition row's path picker -->
      <datalist id="ep-dsl-paths"><option v-for="p in dslPaths" :key="p" :value="p" :label="aliasOf(p) ? '= ' + aliasOf(p) : undefined" /></datalist>
      <!-- and one for the Present() box: keys, because that is what the engine looks up -->
      <datalist id="ep-roster-keys"><option v-for="k in rosterKeys" :key="k" :value="k" /></datalist>

      <!-- 3. triggers -->
      <DnaCard :title="'Events (' + pack.triggers.length + ')'" badge-text="3" body-class="smb-stack" :guide-href="guide('fields')"
        description="One pack is one series of up to 20 beats.">
        <template #actions>
          <button type="button" class="smb-btn smb-btn-primary" @click="addTrigger"><i class="fa-solid fa-plus"></i>Add event</button>
        </template>

        <div v-if="pack.triggers.length" class="smb-list">
          <DnaRecord v-for="(t, ti) in pack.triggers" :key="ti" :name="'@' + prefixPreview + (t.keySuffix || '…')" icon="fa-bolt" body-class="smb-stack">
            <template #pills>
              <span class="smb-pill is-accent">{{ t.cat }}</span>
              <span v-if="t.series" class="smb-pill is-neutral">{{ t.series }}</span>
            </template>
            <template #actions>
              <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Delete event" @click="removeTrigger(t)"><i class="fa-solid fa-trash"></i></button>
            </template>

            <div class="smb-grid">
              <DnaField label="Key suffix" :for-id="'event_key_' + ti" :more-href="guide('fields')"
                detail="The event's id inside your pack; the full key is the prefix plus this suffix.">
                <input :id="'event_key_' + ti" v-model="t.keySuffix" class="smb-input is-code" placeholder="opening" />
              </DnaField>
              <DnaField label="Title" :for-id="'event_title_' + ti" :more-href="guide('fields')"
                detail="The header line of the scene body.">
                <input :id="'event_title_' + ti" v-model="t.title" class="smb-input" placeholder="Beach Opening" />
              </DnaField>
              <DnaField label="Step" :for-id="'event_step_' + ti" :more-href="guide('fields')"
                detail="Shows as ·1 after the title.">
                <input :id="'event_step_' + ti" v-model="t.step" class="smb-input" placeholder="1" />
              </DnaField>
              <DnaField label="Kind" :for-id="'event_kind_' + ti" :more-href="guide('fields')"
                detail="TRG is a normal event. TIME is a scheduled beat: when two events are ripe in the same moment, TIME wins the slot. Use TRG unless the beat is clock or date anchored and must not lose to competition.">
                <select :id="'event_kind_' + ti" v-model="t.cat" class="smb-select"><option>TRG</option><option>TIME</option></select>
              </DnaField>
              <DnaField label="Series" :for-id="'event_series_' + ti" is-span :more-href="guide('fields')"
                detail="Events sharing a Series form one arc: one series per pack, up to 20 beats. Each later beat gates on the previous one having fired, through an event flag PREREQ filled in when you add the beat.">
                <input :id="'event_series_' + ti" v-model="t.series" class="smb-input" placeholder="(one series per pack)" />
              </DnaField>
            </div>

            <div class="smb-divider"></div>

            <!-- prereq -->
            <DnaField label="PREREQ" hint="All must hold; it keeps the event off the table until true." :more-href="guide('prereqWhen')"
              detail="PREREQ asks whether this event is on the table at all: durable story state, such as the quest step or an earlier event having fired. A series' first beat carries none; the engine's fired marker keeps it a one-shot.">
              <ConditionRowInline v-for="(d, di) in t.prereq" :key="di" :d="d" :paths="dslPaths" :keys="rosterKeys" @remove="removeCondition(t.prereq, di)" />
              <div class="smb-control-row">
                <button type="button" class="smb-btn" @click="addCondition(t.prereq)"><i class="fa-solid fa-plus"></i>AND condition</button>
              </div>
            </DnaField>

            <!-- when groups -->
            <DnaField label="WHEN" :hint="t.whenGroups.length > 1 ? 'The moment it fires; any one group is enough.' : 'The moment it fires.'"
              :more-href="guide('conditions')"
              detail="Rows in a group must all hold, and any one OR group is enough. A * in a path means any entry, and zero matching entries is false.">
              <template v-for="(g, gi) in t.whenGroups" :key="gi">
                <div v-if="t.whenGroups.length > 1" class="smb-group-title">
                  <span>Group {{ gi + 1 }}</span>
                  <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Delete this OR group" @click="removeOrGroup(t, g)"><i class="fa-solid fa-trash"></i></button>
                </div>
                <ConditionRowInline v-for="(d, di) in g" :key="di" :d="d" :paths="dslPaths" :keys="rosterKeys" @remove="removeCondition(g, di)" />
                <div class="smb-control-row">
                  <button type="button" class="smb-btn" @click="addCondition(g)"><i class="fa-solid fa-plus"></i>AND condition</button>
                </div>
              </template>
              <div class="smb-control-row">
                <button type="button" class="smb-btn" @click="addOrGroup(t)"><i class="fa-solid fa-plus"></i>OR group</button>
              </div>
            </DnaField>

            <!-- fx -->
            <DnaField label="EFFECTS" hint="What the engine commits when it fires; the card declares where a pack may write."
              :more-href="guide('effects')"
              detail="Pick a path the card opens; the fields that appear are the card's own schema, typed as it declares them. Greyed fields are written by the engine; fields the card locks are not shown.">
              <div class="smb-grid">
                <DnaField label="Summary" :for-id="'event_summary_' + ti" is-span :more-href="guide('effects')"
                  detail="One line naming what this row does, for you and for the pack list. It is a label: the engine writes no prose anywhere, so a beat that deserves a world-log line says so in its FIRE note.">
                  <input :id="'event_summary_' + ti" v-model="t.fxSummary" class="smb-input" placeholder="one line naming what this row does" />
                </DnaField>
                <DnaField label="Scope" :for-id="'event_scope_' + ti" :more-href="guide('effects')"
                  detail="The values the card declares, stored on the done-marker the engine writes when the row fires.">
                  <select v-if="scopeChoices.length" :id="'event_scope_' + ti" v-model="t.fxScope" class="smb-select">
                    <option value="">(card default)</option>
                    <option v-for="s in scopeChoices" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <input v-else :id="'event_scope_' + ti" v-model="t.fxScope" class="smb-input" placeholder="card declares none" />
                </DnaField>
              </div>

              <DnaRecord v-for="(w, wi) in t.writes" :key="'w' + wi" :name="'Write to ' + (w.path || '…')" icon="fa-pen-to-square" body-class="smb-stack">
                <template #actions>
                  <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Remove this write" @click="removeWrite(t, w)"><i class="fa-solid fa-trash"></i></button>
                </template>
                <div class="smb-grid">
                  <DnaField label="Write to" :for-id="'event_write_path_' + ti + '_' + wi">
                    <select :id="'event_write_path_' + ti + '_' + wi" v-model="w.path" class="smb-select">
                      <option v-for="e in cardWrites" :key="e.path" :value="e.path">{{ e.path }}</option>
                    </select>
                  </DnaField>
                  <DnaField v-if="writeEntry(w.path)?.isRecord" label="Record key" :for-id="'event_write_key_' + ti + '_' + wi" :more-href="guide('effects')"
                    :detail="isSharedPath(w.path)
                      ? 'This path is a shared registry: type the world\'s own key, and your write can only fill blanks in it.'
                      : 'Written exactly as you type it. A pack may create any key nobody has claimed; the engine stamps your pack\'s id on it, and only a record carrying that stamp can be changed or removed by your pack later.'">
                    <input :id="'event_write_key_' + ti + '_' + wi" v-model="w.recordKey" class="smb-input"
                      :placeholder="isSharedPath(w.path) ? 'the world key the game already uses, e.g. School_Cafeteria' : 'the name the player reads, e.g. Ruinblade'" />
                  </DnaField>
                </div>
                <DnaSwitchRow v-if="writeEntry(w.path)?.removable" v-model="w.remove" title="Remove this record"
                  description="Deletes the record instead of writing fields to it." />
                <DnaNotice v-if="writeEntry(w.path) && !writeEntry(w.path).inSchema" status="warning"
                  :text="w.path + ' is declared by the engine but not described by the card\'s schema — fields are free-form here'" />
                <template v-if="!w.remove">
                  <div class="smb-grid">
                    <DnaField v-for="f in editableFields(w)" :key="f.name" :label="f.name" :for-id="'event_write_' + ti + '_' + wi + '_' + f.name">
                      <div class="smb-control-row">
                        <input v-if="f.engineOwned" :id="'event_write_' + ti + '_' + wi + '_' + f.name" class="smb-input" disabled placeholder="written by the engine" />
                        <template v-else>
                          <select v-if="f.enumValues" :id="'event_write_' + ti + '_' + wi + '_' + f.name" v-model="w.values[f.name]" class="smb-select">
                            <option value="">(unset)</option>
                            <option v-for="ev in f.enumValues" :key="String(ev)" :value="String(ev)">{{ ev }}</option>
                          </select>
                          <select v-else-if="f.type === 'boolean'" :id="'event_write_' + ti + '_' + wi + '_' + f.name" v-model="w.values[f.name]" class="smb-select">
                            <option value="">(unset)</option><option value="true">true</option><option value="false">false</option>
                          </select>
                          <input v-else :id="'event_write_' + ti + '_' + wi + '_' + f.name" v-model="w.values[f.name]" class="smb-input"
                            :type="f.type === 'number' || f.type === 'integer' ? 'number' : 'text'"
                            :placeholder="f.tuple ? f.type + ' · labeled ' + (f.tuple.label || 'tuple') : f.type" />
                          <select v-if="f.addable" v-model="w.modes[f.name]" class="smb-select" :title="'Set or add ' + f.name">
                            <option value="set">set</option><option value="add">add</option>
                          </select>
                        </template>
                      </div>
                    </DnaField>
                    <DnaField v-if="writeEntry(w.path)?.isOpen || (writeEntry(w.path) && !writeEntry(w.path).inSchema)" label="Extra fields" is-span>
                      <div v-for="(extra, pi) in w.extras" :key="'x' + pi" class="smb-control-row">
                        <input v-model="extra.k" class="smb-input is-code" placeholder="extra field" title="Field name" />
                        <input v-model="extra.v" class="smb-input" placeholder="value" title="Value" />
                        <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Remove this field" @click="removeExtra(w, pi)"><i class="fa-solid fa-trash"></i></button>
                      </div>
                      <div class="smb-control-row">
                        <button type="button" class="smb-btn" @click="addExtra(w)"><i class="fa-solid fa-plus"></i>Extra field</button>
                      </div>
                    </DnaField>
                  </div>
                  <p class="smb-hint">The fields are the card's own schema; greyed ones the engine writes itself.</p>
                </template>
              </DnaRecord>
              <div class="smb-control-row">
                <button type="button" class="smb-btn" :disabled="!cardWrites.length" @click="addWrite(t)"><i class="fa-solid fa-plus"></i>Add write</button>
              </div>

              <!-- REWARD — what this ONE beat pays. A series is many beats, so each states its own. -->
              <DnaRecord v-for="(r, ri) in t.rewards" :key="'r' + ri" :name="'Reward: ' + (r.kind || '…')" icon="fa-gift" body-class="smb-stack">
                <template #actions>
                  <button type="button" class="smb-btn smb-btn-icon smb-btn-danger" title="Remove this reward" @click="removeReward(t, r)"><i class="fa-solid fa-trash"></i></button>
                </template>
                <div class="smb-grid">
                  <DnaField label="Reward" :for-id="'event_reward_kind_' + ti + '_' + ri" :more-href="guide('effects')"
                    detail="What the row pays when it fires, in a kind the card declares. Each line shows the card's ceiling, and an amount over it is paid at the ceiling.">
                    <select :id="'event_reward_kind_' + ti + '_' + ri" v-model="r.kind" class="smb-select" @change="onRewardKind(r)">
                      <option v-for="k in cardRewards" :key="k.name" :value="k.name">{{ k.name }}</option>
                    </select>
                  </DnaField>
                  <DnaField v-if="isKeyedKind(r.kind)" label="To" :for-id="'event_reward_to_' + ti + '_' + ri" :more-href="guide('effects')"
                    :detail="'Who it pays: a member\'s key, or a selector ' + rewardKind(r.kind)?.path + '.*.‹field› for whoever that field marks.'">
                    <input :id="'event_reward_to_' + ti + '_' + ri" v-model="r.memberKey" class="smb-input" :list="'rw' + ti + '_' + ri"
                      :placeholder="rewardKind(r.kind)?.path.split('.').pop()" />
                    <datalist :id="'rw' + ti + '_' + ri">
                      <option v-for="sel in (cardPaysSelector ? selectorsFor(r.kind) : [])" :key="sel" :value="sel" :label="'whoever has ' + selectorFieldName(sel) + ' = true'" />
                      <option v-for="m in rewardMembers(r.kind)" :key="m" :value="m" />
                    </datalist>
                  </DnaField>
                  <DnaField label="Field" :for-id="'event_reward_field_' + ti + '_' + ri">
                    <select :id="'event_reward_field_' + ti + '_' + ri" v-model="r.field" class="smb-select">
                      <option v-for="f in rewardFields(r.kind)" :key="f.name" :value="f.name">{{ f.name }}</option>
                    </select>
                  </DnaField>
                  <DnaField v-if="isTextKind(r.kind)" label="New text" :for-id="'event_reward_amount_' + ti + '_' + ri" is-span>
                    <input :id="'event_reward_amount_' + ti + '_' + ri" v-model="r.amount" class="smb-input" placeholder="what the beat makes it — written over the old value" />
                  </DnaField>
                  <DnaField v-else label="Amount" :for-id="'event_reward_amount_' + ti + '_' + ri">
                    <input :id="'event_reward_amount_' + ti + '_' + ri" v-model="r.amount" class="smb-input" type="number" :placeholder="'±' + rewardMax(r.kind, r.field)" />
                  </DnaField>
                </div>
                <p class="smb-hint">{{ rewardPathLabel(r) }} · {{ isTextKind(r.kind) ? 'replaced, up to ' + rewardMaxLength(r.kind) + ' characters' : 'at most ' + rewardMax(r.kind, r.field) + ' per event' }}</p>
                <p v-for="note in rewardNotes(r)" :key="note" class="smb-hint">{{ note }}</p>
                <DnaResultList v-if="rewardWarnings(r).length" :lines="rewardWarnings(r)" />
              </DnaRecord>
              <div class="smb-control-row">
                <button type="button" class="smb-btn" :disabled="!cardRewards.length" @click="addReward(t)"><i class="fa-solid fa-plus"></i>Add reward</button>
              </div>
              <p v-if="!cardRewards.length" class="smb-hint">This card's engine declares no payout; a beat here changes state through writes only.</p>
            </DnaField>

            <!-- body -->
            <DnaField label="SCENE" hint="DO is what the narrator plays; only EFFECTS above change state." :more-href="guide('scene')"
              detail="DO is the instruction the narrator plays when the event triggers; prose never changes game state. The FIRE note is a short description of what the fire commits, shown beside the event's report signal.">
              <textarea v-model="t.doText" class="smb-textarea" rows="3" title="DO" placeholder="DO — narrator instructions for the beat"></textarea>
              <input v-model="t.fireNote" class="smb-input" title="FIRE note" placeholder="FIRE note — what the fire does (shown after the eventFire emit)" />
            </DnaField>
          </DnaRecord>
        </div>
        <DnaEmpty v-else icon="fa-calendar-plus" text="No events yet. One pack is one series of up to 20 beats." />
      </DnaCard>

      <!-- 4. output -->
      <DnaCard title="Pack text" badge-text="4" body-class="smb-stack" :guide-href="guide('flow')"
        description="Generate, then copy or download the pack and install it on that card.">
        <template #actions>
          <button type="button" class="smb-btn smb-btn-primary" @click="generate"><i class="fa-solid fa-gears"></i>Generate</button>
          <CopyTextButton :text="output" label="Copy" :is-disabled="!output" />
          <button type="button" class="smb-btn" :disabled="!output" @click="downloadOutput"><i class="fa-solid fa-download"></i>Download .txt</button>
          <button type="button" class="smb-btn" :disabled="!output" @click="downloadArtifact"><i class="fa-solid fa-file-zipper"></i>Download artifact .zip</button>
        </template>
        <DnaNotice v-if="emitError" status="danger" :text="emitError" />
        <DnaNotice v-if="artifactError" status="danger" :text="artifactError" />
        <textarea v-if="output" :value="output" readonly class="smb-textarea is-code" rows="16" title="Pack text"></textarea>
      </DnaCard>
    </template>
  </div>
</template>

<script lang="ts">
// Inline condition-row component — one row = one grammar descriptor, edited directly.
import { defineComponent, h } from 'vue'
import { isCardDeclaredLhs, canonicalRosterKey } from '../utils/event-pack-card-ingest.js'
// DnaResultList comes from the <script setup> block's imports: both blocks share this module's scope.

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
            class: 'smb-input' + (opts.isCode ? ' is-code' : ''),
            list: opts.list, placeholder, title: placeholder,
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
            const kids = []
            // NOT is a per-row on/off: an icon toggle
            kids.push(h('button', {
                type: 'button', class: 'smb-btn smb-btn-icon' + (d.neg ? ' is-on' : ''),
                'aria-pressed': d.neg ? 'true' : 'false', title: 'NOT: inverts this condition',
                onClick: () => { d.neg = d.neg ? undefined : true },
            }, [h('i', { class: 'fa-solid fa-exclamation' })]))
            kids.push(h('select', {
                class: 'smb-select', value: d.kind, title: 'Condition kind',
                onChange: (e: Event) => {
                    d.kind = (e.target as HTMLSelectElement).value
                    // seed the fields the new kind carries so the inputs bind to something
                    if (d.kind === 'cmp' && !d.op) d.op = '>='
                    if (d.kind === 'in' && !Array.isArray(d.set)) d.set = []
                    if (d.kind === 'flag' && !d.state) d.state = 'done'
                },
            }, KINDS.map((k) => h('option', { value: k.v, selected: k.v === d.kind }, k.label))))
            if (d.kind === 'cmp' || d.kind === 'in' || d.kind === 'contains' || d.kind === 'has') {
                kids.push(input('lhs', 'variable path', { list: 'ep-dsl-paths', isCode: true }))
            }
            if (d.kind === 'cmp') {
                kids.push(h('select', {
                    class: 'smb-select', value: d.op, title: 'Comparison',
                    onChange: (e: Event) => { d.op = (e.target as HTMLSelectElement).value },
                }, ['>=', '<=', '=', '==', '>', '<'].map((o) => h('option', { value: o, selected: o === d.op }, o))))
                kids.push(input('rhs', 'value'))
            }
            if (d.kind === 'in') kids.push(h('input', {
                class: 'smb-input', placeholder: 'a, b, c', title: 'Values, comma separated',
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
            if (d.kind === 'flag') kids.push(input('flag', 'event key', { isCode: true }))
            if (d.kind === 'contains' || d.kind === 'has') kids.push(input('arg', d.kind === 'has' ? 'element' : 'substring'))
            // one line of the editor: removed at once, retyped in a moment (GUI-DNA §7)
            kids.push(h('button', {
                type: 'button', class: 'smb-btn smb-btn-icon smb-btn-danger', title: 'Remove this condition',
                onClick: () => emit('remove'),
            }, [h('i', { class: 'fa-solid fa-trash' })]))
            const row = h('div', { class: 'smb-control-row' }, kids)
            // unknown-path WARNING, never a block: the picker list is a suggestion surface, and a
            // pack may gate on a path it itself creates — but a typo here passes every validator
            // (checking genre vocabulary downstream would be the layering violation) and dies as
            // an event that can never fire, so this is the one layer that can say anything
            const usesLhs = d.kind === 'cmp' || d.kind === 'in' || d.kind === 'contains' || d.kind === 'has'
            if (usesLhs && String(d.lhs ?? '').trim() && !isCardDeclaredLhs(d.lhs, props.paths as string[])) {
                return h('div', {}, [row, h(DnaResultList, { lines: [{ status: 'warning',
                    text: '"' + d.lhs + '" is not a path this card declares — check the spelling, or ignore if your pack creates it.' }] })])
            }
            return row
        }
    },
})

export default { components: { ConditionRowInline } }
</script>
