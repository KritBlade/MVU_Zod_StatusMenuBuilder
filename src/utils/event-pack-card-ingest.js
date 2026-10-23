// event-pack-card-ingest.js — read a built game card (json/png) into what the event builder needs.
//
// COMPLETELY MECHANICAL (pack-authoring-plan §A.7, eventpack_revisit §1): this module knows the CARD
// FILE SHAPE, how to RUN the card's engine to read what it declares, and how to ask the card's own
// Zod what exists — nothing else. No installer, no genre. Every refusal names the format fact that
// is missing, never a tool.
//
// What it extracts:
//   headers   — what the engine DECLARES about event packs, read by RUNNING its bundle
//               (readEngineDeclarations). The engine entry is found by its comment marker; every
//               value comes off the engine's own objects:
//                 format    `EVENT_PACK_FORMAT`, else the library's `FORMAT`  (neither ⇒ '1.0')
//                 paths     `EVENT_PACK_ADAPTER.{triggerRoot, armedPath}`  (armedPath is required)
//                 writes    `EVENT_PACK_ADAPTER.writes` — WHERE a pack may write and under which
//                             rules; absent ⇒ the card is refused
//                 sugar     the library's `LIBRARY_SUGAR`, then the adapter's `aliases` (each with
//                             its expansion), then its `sugar` — the WHEN-DSL LHS forms the card
//                             resolves, `*` = free part
//                 scopes    `EVENT_PACK_ADAPTER.scopes`  (absent ⇒ [];
//                             the fired-record scope values the engine's recorder distinguishes)
//                 rewards   `EVENT_PACK_ADAPTER.rewards` — WHAT a row may PAY when it fires, each
//                             {name, path, keyed, fields, clamp, max}; a `text: true` kind pays
//                             PROSE and is bounded by `maxLength` instead. Absent ⇒ [], and the
//                             reward editor says the card pays nothing rather than offering a guess
//   schemaTree — the card's OWN Zod registration, run with zod and exported as JSON Schema
//               (card-zod-schema.js). The authority for which fields a write may set.
//   writes    — the declared entries, each joined to its schema node: is it a record, which fields
//               its members have, which the engine owns (fixed + its stamp field), which are locked.
//   statData  — the card's initial variable JSON (the `[InitVar]` entry), parsed. Feeds the
//               concrete item paths and the Present() roster keys.
//   dslPaths  — the condition-path picker: the declared forms, DaysSince() over the engine's stamp
//               fields, every path the schema declares (`Classmate.*.Mood`), then the seed's items.

import { readCardSchema, schemaPaths, nodeAtPath, isRecordNode, isOpenNode, memberOf, fieldsOf } from './card-zod-schema.js';

// ---- card container ------------------------------------------------------------------------

/** Parse a card FILE (json text or png bytes) into the card JSON object. */
export function parseCardFile(bytesOrText) {
    if (typeof bytesOrText === 'string') {
        try {
            return { ok: true, card: JSON.parse(bytesOrText) };
        } catch (e) {
            return { ok: false, reason: 'not JSON: ' + (e && e.message ? e.message : String(e)) };
        }
    }
    return parseCardPng(bytesOrText);
}

/** Extract the embedded card JSON from a character-card png (tEXt chunk `chara` / `ccv3`, base64). */
function parseCardPng(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
        if (u8[i] !== SIG[i]) return { ok: false, reason: 'not a png file (bad signature)' };
    }
    const texts = {};   // keyword -> raw text
    let pos = 8;
    while (pos + 8 <= u8.length) {
        const len = (u8[pos] << 24) | (u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3];
        const type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
        const dataStart = pos + 8;
        if (len < 0 || dataStart + len > u8.length) break;
        if (type === 'tEXt') {
            let nul = -1;
            for (let i = dataStart; i < dataStart + len; i++) { if (u8[i] === 0) { nul = i; break; } }
            if (nul > 0) {
                let keyword = '', text = '';
                for (let i = dataStart; i < nul; i++) keyword += String.fromCharCode(u8[i]);
                for (let i = nul + 1; i < dataStart + len; i++) text += String.fromCharCode(u8[i]);
                texts[keyword.toLowerCase()] = text;
            }
        }
        if (type === 'IEND') break;
        pos = dataStart + len + 4;   // skip data + crc
    }
    const raw = texts['ccv3'] || texts['chara'];
    if (!raw) return { ok: false, reason: 'png carries no embedded card (no chara/ccv3 text chunk)' };
    try {
        const json = typeof atob === 'function'
            ? atob(raw)
            : Buffer.from(raw, 'base64').toString('binary');
        // the base64 payload is utf-8 bytes; decode them
        const u = new Uint8Array(json.length);
        for (let i = 0; i < json.length; i++) u[i] = json.charCodeAt(i);
        return { ok: true, card: JSON.parse(new TextDecoder('utf-8').decode(u)) };
    } catch (e) {
        return { ok: false, reason: 'embedded card data is not readable: ' + (e && e.message ? e.message : String(e)) };
    }
}

/** The card's lorebook entries, wherever the spec version put them. */
function bookEntries(card) {
    const data = (card && card.data) || card || {};
    const book = data.character_book;
    if (!book) return [];
    const entries = book.entries;
    if (Array.isArray(entries)) return entries;
    if (entries && typeof entries === 'object') return Object.values(entries);
    return [];
}

// ---- what the engine declares ----------------------------------------------------------------

// The card's engine entry, found by its COMMENT MARKER — the same one mvu-helper uses
// (`ENGINE_ENTRY_MATCH`, logic-engine-store.js). The marker is the LOCATOR only: whether this card
// can host packs is answered by what the engine declares, so "no engine entry here" and "this
// engine declares no adapter" stay two different refusals with two different fixes.
const ENGINE_ENTRY_MATCH = '[mvu_logicengine]';

function readCardEngineDeclarations(card) {
    const entries = bookEntries(card);
    if (!entries.length) return { ok: false, reason: 'card carries no lorebook entries' };
    const entry = entries.find((e) => String(e.comment || '').toLowerCase().includes(ENGINE_ENTRY_MATCH));
    if (!entry) {
        return { ok: false, reason: 'this card carries no engine entry (no `' + ENGINE_ENTRY_MATCH + '` in any entry comment) — packs cannot be authored for it' };
    }
    const read = readEngineDeclarations(String(entry.content || ''));
    if (!read.ok) return read;
    return { ok: true, headers: read.headers, entryComment: String(entry.comment || '') };
}

// Read what the engine DECLARES, by RUNNING it.
//
// WHY EXECUTE. Every fact below lives on the engine's own objects, so reading them from the objects
// is the only way to be sure they are what the engine will actually use — any text describing them
// is a copy, and a copy drifts. mvu-helper reads the adapter off the loaded module for this reason.
// This tool cannot load an engine the way a card does — it has no Worker and no chat — but it can
// evaluate the bundle, which is the same source of truth one step earlier. Executing card JS is
// already how this app reads the card's Zod (card-zod-schema.js) and its menu formatters
// (statusmenu-pack-export.js); nothing new is opened here.
//
// It is also the only way to get `sugar` whole: the forms come from the LIBRARY and the genre's
// aliases both, and nothing but the running bundle holds the two together.
//
// The engine is a CJS-ish bundle: preludes attach to `root`, globalLogic assigns `module.exports`.
// Same four parameters mvu-helper's executeEngineText passes, so both repos run it identically.
function runEngineBundle(code) {
    const root = {};
    const module_ = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'window', 'globalThis', code)(module_, module_.exports, root, root);
    const api = (module_.exports && typeof module_.exports === 'object') ? module_.exports : {};
    return { api, root };
}

/** What the card's engine declares about event packs, read from the running bundle. */
export function readEngineDeclarations(code) {
    if (!String(code || '').trim()) return { ok: false, reason: 'the engine entry is empty' };
    let api, root;
    try { ({ api, root } = runEngineBundle(code)); }
    catch (e) {
        return { ok: false, reason: 'the engine text did not run (' + (e && e.message ? e.message : String(e)) + ') — this card cannot be read for event authoring until it does' };
    }

    const adapter = api.EVENT_PACK_ADAPTER;
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
        return { ok: false, reason: 'this card\'s engine exports no `EVENT_PACK_ADAPTER` — it declares no event contract, so packs cannot be authored for it' };
    }

    const lib = root.__EVENTPACK__ && typeof root.__EVENTPACK__ === 'object' ? root.__EVENTPACK__ : {};
    const format = typeof api.EVENT_PACK_FORMAT === 'string' ? api.EVENT_PACK_FORMAT
        : (typeof lib.FORMAT === 'string' ? lib.FORMAT : '1.0');

    // WHERE this engine keeps event state. armedPath is what pins the body gate, so its absence is
    // the one fatal miss.
    const paths = {};
    for (const field of ['triggerRoot', 'armedPath']) {
        if (typeof adapter[field] === 'string' && adapter[field]) paths[field] = adapter[field];
    }
    if (!paths.armedPath) {
        return { ok: false, reason: 'the engine\'s EVENT_PACK_ADAPTER declares no `armedPath` — the body gate cannot be pinned' };
    }

    const writes = Array.isArray(adapter.writes) ? adapter.writes : null;
    const rewards = Array.isArray(adapter.rewards) ? adapter.rewards : [];

    // The scope VALUES the engine's recorder distinguishes — words only; what each means is the
    // genre doc's business. None declared ⇒ [] and the Scope field stays free text.
    const scopes = Array.isArray(adapter.scopes) ? adapter.scopes.filter((w) => typeof w === 'string' && w) : [];

    // The WHEN-DSL forms a condition may use: the LIBRARY's own (DaysSince(*) — every genre resolves
    // them), then the genre's ALIASES with their expansions, then any COMPUTED forms it claims.
    // Three sources, joined here from the things themselves.
    const sugar = [];
    const aliases = {};
    const addForm = (form, expansion) => {
        if (typeof form !== 'string' || !form) return;
        if (!sugar.includes(form)) sugar.push(form);
        if (typeof expansion === 'string' && expansion) aliases[form] = expansion;
    };
    for (const form of (Array.isArray(lib.LIBRARY_SUGAR) ? lib.LIBRARY_SUGAR : [])) addForm(form);
    if (adapter.aliases && typeof adapter.aliases === 'object' && !Array.isArray(adapter.aliases)) {
        for (const [form, expansion] of Object.entries(adapter.aliases)) addForm(form, expansion);
    }
    for (const form of (Array.isArray(adapter.sugar) ? adapter.sugar : [])) addForm(form);

    return validateDeclarations({ format, paths, writes, sugar, aliases, scopes, rewards });
}

// The EDITOR's contract: what the write editor and the reward editor need in order to hold an author
// to something. It is independent of where the values come from — these are the shapes the editors
// index into, and a missing one is a broken editor, not a lenient one. Every refusal names the
// engine's own declaration, because that is the file an author has to go and fix.
function validateDeclarations(headers) {
    const { writes, rewards } = headers;

    // WHERE a pack may write. Absent ⇒ null and the caller refuses: a card that opens no path can
    // take no effect, and guessing one would be this tool inventing the card's schema.
    if (writes !== null) {
        for (let i = 0; i < writes.length; i++) {
            const e = writes[i];
            if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.path !== 'string' || !DOTTED_PATH.test(e.path)) {
                return { ok: false, reason: 'the engine\'s `writes` entry #' + (i + 1) + ' has no dotted `path` (' + JSON.stringify(e) + ')' };
            }
        }
    }

    // WHAT a row may PAY. None declared ⇒ [] rather than a refusal: a card may legitimately pay
    // nothing through events, and that is a different fact from "opens no path at all" (which IS
    // refused — a pack with no possible effect cannot be authored).
    for (let i = 0; i < rewards.length; i++) {
        const k = rewards[i];
        if (!k || typeof k !== 'object' || Array.isArray(k) || typeof k.name !== 'string' || !k.name) {
            return { ok: false, reason: 'the engine\'s `rewards` kind #' + (i + 1) + ' has no `name` — a row asks for a reward BY NAME (' + JSON.stringify(k) + ')' };
        }
        if (typeof k.path !== 'string' || !DOTTED_PATH.test(k.path)) {
            return { ok: false, reason: 'the engine\'s `rewards` kind "' + k.name + '" has no dotted `path`' };
        }
        if (!Array.isArray(k.fields) || !k.fields.length) {
            return { ok: false, reason: 'the engine\'s `rewards` kind "' + k.name + '" declares no `fields` — a kind that pays nothing is not a kind' };
        }
        if (k.text !== undefined && typeof k.text !== 'boolean') {
            return { ok: false, reason: 'the engine\'s `rewards` kind "' + k.name + '" has a non-boolean `text` — it says whether the kind pays PROSE instead of a number' };
        }
        if (k.text === true) {
            // A prose payout is bounded by LENGTH; a ceiling would mean nothing on a string.
            if (!(Number(k.maxLength) > 0)) {
                return { ok: false, reason: 'the engine\'s text `rewards` kind "' + k.name + '" declares no positive `maxLength` — without it the editor has no limit to hold an author to' };
            }
        } else {
            // `max` is a number for the whole kind or a { field: n } map — either way EVERY field it
            // pays needs a positive one, or the editor has no limit to hold an author to on that field.
            const perField = k.max !== null && typeof k.max === 'object' && !Array.isArray(k.max);
            for (const field of k.fields) {
                const cap = perField ? Number(k.max[field]) : Number(k.max);
                if (!(cap > 0)) {
                    return { ok: false, reason: 'the engine\'s `rewards` kind "' + k.name + '" declares no positive `max` for "' + field + '" — without a ceiling the editor has no limit to hold an author to' };
                }
            }
        }
        if (k.keyed !== undefined && typeof k.keyed !== 'boolean') {
            return { ok: false, reason: 'the engine\'s `rewards` kind "' + k.name + '" has a non-boolean `keyed` — it says whether `path` is a collection whose member a row names' };
        }
    }

    return { ok: true, headers };
}

const DOTTED_PATH = /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/;

// ---- the card's initial variables (the condition-path source) ------------------------------

/** The `[InitVar]` entry's JSON — the stat tree the picker offers paths from. */
function findInitVarData(card) {
    const entries = bookEntries(card);
    const init = entries.find((e) => String(e.comment || '').includes('[InitVar]'));
    if (!init) return { ok: false, reason: 'card has no `[InitVar]` entry — no variable tree to offer condition paths from' };
    try {
        const parsed = JSON.parse(String(init.content || ''));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, reason: '`[InitVar]` entry is not a JSON object' };
        }
        return { ok: true, statData: parsed };
    } catch (e) {
        return { ok: false, reason: '`[InitVar]` entry is not valid JSON: ' + (e && e.message ? e.message : String(e)) };
    }
}

// ---- DSL path derivation -------------------------------------------------------------------

function isTuple(v) { return Array.isArray(v) && v.length === 2 && typeof v[1] === 'string'; }

/** An MVU entity: an object carrying leaf values directly (labeled tuples or primitives) —
 *  mirrors the menu builder's isMvuEntity, minus its empty-object case (an empty child says
 *  nothing about the parent's shape). */
function isEntity(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const vals = Object.values(obj);
    if (!vals.length) return false;
    if (vals.some(isTuple)) return true;
    return vals.some((v) => v !== null && typeof v !== 'object');
}

/** A record of same-shaped items (roster, inventory…) — the shape the grammar's `*` fans over.
 *  A SINGLE entity child already counts (a roster seeded with one classmate is still a roster);
 *  the two-children-share-keys fallback catches entity-less item shapes. Tuple- or
 *  primitive-valued records are themselves entities, never collections. */
function isCollection(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const values = Object.values(obj);
    if (!values.length) return false;
    if (values.some((v) => !v || typeof v !== 'object' || Array.isArray(v))) return false;
    if (isEntity(values[0])) return true;
    if (values.length >= 2) {
        const keys0 = Object.keys(values[0]);
        const keys1 = Object.keys(values[1]);
        return keys0.length > 0 && keys0.some((k) => keys1.includes(k));
    }
    return false;
}

/** Flatten statData into WHEN-DSL LHS paths. Collections contribute `<prefix>.*.<field>` (ANY-match)
 *  plus the bare `<prefix>` itself (a has() target); labeled tuples are leaves. Unlike the menu's
 *  flatKeys, a root-level record CAN be a collection here (Classmate.*.Aff is a legal LHS). */
export function deriveDslPaths(statData) {
    const out = [];
    const walk = (obj, prefix) => {
        for (const k of Object.keys(obj)) {
            const path = prefix ? prefix + '.' + k : k;
            const v = obj[k];
            if (isTuple(v) || !v || typeof v !== 'object' || Array.isArray(v)) {
                out.push(path);
                continue;
            }
            if (isCollection(v)) {
                out.push(path);   // the collection itself — has(path, "key")
                // `*` paths first — "any item's field" (ANY-match)…
                const merged = new Set();
                for (const item of Object.values(v)) {
                    if (item && typeof item === 'object') Object.keys(item).forEach((f) => merged.add(f));
                }
                for (const f of merged) {
                    const sample = Object.values(v).map((it) => it && it[f]).find((x) => x !== undefined);
                    if (sample && typeof sample === 'object' && !isTuple(sample) && !Array.isArray(sample)) {
                        walk({ [f]: sample }, path + '.*');
                    } else {
                        out.push(path + '.*.' + f);
                    }
                }
                // …then the concrete per-item paths — "THIS item's field" is just as legal an LHS
                walk(v, path);
                continue;
            }
            out.push(path);   // an object node is itself a legal has() target
            walk(v, path);
        }
    };
    walk(statData || {}, '');
    return out;
}

// ---- declared-path check (the unknown-path warning surface) --------------------------------

/** One declared entry vs one typed LHS: `*` is the free part (one path segment or one paren
 *  argument), everything else literal. `Aff(*)` matches `Aff(Mitsuki)`; `Classmate.*.Mood`
 *  matches `Classmate.Nana.Mood`; `MC.*` does NOT match `MC.Gold.Total` (one segment only). */
function templateMatches(template, lhs) {
    if (!template.includes('*')) return template === lhs;
    // A `*` OUTSIDE parentheses is ONE path segment (`MC.*` never spans `Gold.Total`); INSIDE them it is
    // the whole argument, dots included (`DaysSince(*)` takes `Mainchar.Quests.Leila.LastUpdated`).
    const parts = template.split('*');
    let pattern = '^';
    let depth = 0;
    for (let i = 0; i < parts.length; i++) {
        pattern += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        depth += (parts[i].match(/\(/g) || []).length - (parts[i].match(/\)/g) || []).length;
        if (i < parts.length - 1) pattern += depth > 0 ? '[^()]+' : '[^.]+';
    }
    return new RegExp(pattern + '$').test(lhs);
}

/** Is this LHS one the card declares — an exact suggestion, or an instance of a declared `*`
 *  template? A miss is a WARNING surface, never a block: a pack may legitimately gate on a path
 *  it itself creates, which no card-derived list can contain. */
export function isCardDeclaredLhs(lhs, declaredPaths) {
    const typed = String(lhs || '').trim();
    if (!typed) return true;   // nothing typed yet — nothing to warn about
    return (declaredPaths || []).some((p) => templateMatches(p, typed));
}

// ---- roster keys (the Present() name surface) -----------------------------------------------

/** The item keys of every collection the card declares — `Classmate.Mitsuki.Aff` contributes
 *  `Mitsuki`. Present(name) is a KEY LOOKUP in the engine (`roster[name]`), so the key spelled
 *  exactly is the only thing that makes it fire; a display name or a full name never matches and
 *  never errors. Which collection holds presence is declared nowhere (the engine's sugar covers
 *  LHS forms, not the Present() argument), so every collection's keys are offered together. A
 *  SUGGESTION surface, deliberately not a fence: a roster can be empty at authoring time and
 *  filled at runtime, so an unlisted name stays legal. */
/** The `<collection>.*.<field>` forms that can actually SELECT a member: a reward selector pays the one
 *  whose field is `true`, so only a field the seed holds as a BOOLEAN is a candidate. A number or a
 *  string can never be true, and offering one produces a line that refuses at fire and looks correct
 *  until then. A field counts when at least one seeded member carries it and every member that carries
 *  it holds a boolean — a field that is a flag on one member and a score on another is not a selector. */
export function booleanMemberSelectors(statData, collectionPath) {
    const holder = getAtPath(statData, collectionPath);
    if (!holder || typeof holder !== 'object' || Array.isArray(holder)) return [];
    const seen = new Map();                       // field -> still a boolean everywhere we have looked
    for (const member of Object.values(holder)) {
        if (!member || typeof member !== 'object' || Array.isArray(member) || isTuple(member)) continue;
        for (const [field, raw] of Object.entries(member)) {
            const value = isTuple(raw) ? raw[0] : raw;
            const ok = typeof value === 'boolean';
            seen.set(field, seen.has(field) ? (seen.get(field) && ok) : ok);
        }
    }
    return [...seen.entries()].filter(([, ok]) => ok).map(([f]) => collectionPath + '.*.' + f).sort();
}

function getAtPath(root, dotted) {
    let node = root;
    for (const seg of String(dotted).split('.')) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[seg];
    }
    return node;
}

export function collectionItemKeys(declaredPaths) {
    const paths = Array.isArray(declaredPaths) ? declaredPaths : [];
    // a prefix is a collection exactly when deriveDslPaths emitted `<prefix>.*.<field>` for it
    const collections = new Set();
    for (const path of paths) {
        const at = String(path).indexOf('.*.');
        if (at > 0) collections.add(String(path).slice(0, at));
    }
    const keys = new Set();
    for (const prefix of collections) {
        for (const path of paths) {
            const p = String(path);
            if (!p.startsWith(prefix + '.')) continue;
            const segment = p.slice(prefix.length + 1).split('.')[0];
            if (segment && segment !== '*') keys.add(segment);
        }
    }
    return [...keys].sort();
}

/** Snap a typed name to the card's OWN spelling: trim, then match case-insensitively against the
 *  keys the card declares, returning the card's exact key on a unique hit and the trimmed input
 *  otherwise. Normalizing HERE, at authoring time, is what lets the engine's lookup stay exactly
 *  strict — the pack ships the real key, so no downstream layer has to be lenient about case, and
 *  a match that works in the builder cannot fail in the game. Two candidate keys differing only in
 *  case are ambiguous and snap to neither. */
export function canonicalRosterKey(typed, candidateKeys) {
    const trimmed = String(typed ?? '').trim();
    if (!trimmed) return trimmed;
    const wanted = trimmed.toLowerCase();
    const hits = (Array.isArray(candidateKeys) ? candidateKeys : [])
        .filter((k) => String(k).toLowerCase() === wanted);
    return hits.length === 1 ? String(hits[0]) : trimmed;
}

// ---- the one-call ingest -------------------------------------------------------------------

/** Walk a dotted path in the seed — the member keys a keyed reward kind can actually name. */
function getByPath(root, dotted) {
    let node = root;
    for (const seg of String(dotted).split('.')) {
        if (!node || typeof node !== 'object') return undefined;
        node = node[seg];
    }
    return node;
}

/** Full ingest: file → { headers, schemaTree, writes, statData, dslPaths, cardName }. Refuses with a named reason. */
export function ingestCard(bytesOrText) {
    const parsed = parseCardFile(bytesOrText);
    if (!parsed.ok) return parsed;
    const card = parsed.card;

    const headers = readCardEngineDeclarations(card);
    if (!headers.ok) return headers;
    if (!Array.isArray(headers.headers.writes)) {
        return { ok: false, reason: 'this card\'s engine declares no `writes` on its EVENT_PACK_ADAPTER — it opens no path a pack may write, so no effect can be authored for it' };
    }

    const init = findInitVarData(card);
    if (!init.ok) return init;

    const schema = readCardSchema(card);
    if (!schema.ok) return schema;

    const data = (card && card.data) || card || {};
    // The engine's own bookkeeping is not a condition surface. Which paths those are comes from
    // the card's OWN declaration (triggerRoot = the trigger table, armedPath = the armed pointer) —
    // a mechanical exclusion, no vocabulary involved. Event history is gated via the `flag:`
    // kind, not by raw paths into these roots.
    const p = headers.headers.paths;
    // The library's own stores sit beside the declared trigger table by format design: `.installed`
    // (the installer's watermark) and `.fired` (the done-marker a fire writes). Neither is a place a
    // pack reads or writes — `flag:<key>` is the spelling for the marker — so both stay out of the
    // picker with the declared paths.
    const sibling = (name) => (p.triggerRoot && p.triggerRoot.includes('.')
        ? p.triggerRoot.replace(/\.[^.]+$/, '.' + name) : '');
    const reserved = [p.triggerRoot, p.armedPath, sibling('installed'), sibling('fired')].filter(Boolean);
    const isReserved = (path) => reserved.some((r) => path === r || path.startsWith(r + '.') || r.startsWith(path + '.'));

    // each declared write entry joined to its schema node — the EFFECTS editor is shaped from this
    const writes = headers.headers.writes.map((entry) => {
        const node = nodeAtPath(schema.tree, entry.path);
        const member = node ? memberOf(node) : null;
        const engineOwned = [...Object.keys(entry.fixed && typeof entry.fixed === 'object' ? entry.fixed : {}), ...(typeof entry.stamp === 'string' && entry.stamp ? [entry.stamp] : []),
            ...(typeof entry.ownerStamp === 'string' && entry.ownerStamp ? [entry.ownerStamp] : [])];   // ownerStamp: the engine names the pack, a row never names itself
        const locked = Array.isArray(entry.locked) ? entry.locked : [];
        return {
            ...entry,
            inSchema: !!node,
            isRecord: !!node && isRecordNode(node),
            isOpen: !!member && isOpenNode(member),
            engineOwned,
            locked,
            fields: fieldsOf(member).map((fld) => ({ ...fld, engineOwned: engineOwned.includes(fld.name), locked: locked.includes(fld.name), addable: Array.isArray(entry.add) && entry.add.includes(fld.name) })),
        };
    });

    // each declared reward kind joined to its schema node — the REWARD editor is shaped from this. The
    // join exists to catch one thing: a field the engine declares but the card's Zod does not. The engine
    // would pay it and the next parse would strip it, so the editor says so instead of offering it.
    const rewards = (headers.headers.rewards || []).map((kind) => {
        const node = nodeAtPath(schema.tree, kind.path);
        // A keyed kind pays fields on the collection's MEMBER, so that is the shape to check them against;
        // an unkeyed one pays the object at the path itself.
        const target = kind.keyed === true ? (node ? memberOf(node) : null) : node;
        const known = new Set(fieldsOf(target).map((f) => f.name));
        const capOf = (name) => ((kind.max !== null && typeof kind.max === 'object' && !Array.isArray(kind.max))
            ? Number(kind.max[name]) || 0 : Number(kind.max) || 0);
        return {
            ...kind,
            inSchema: !!node,
            memberKeys: kind.keyed === true && node ? Object.keys(getByPath(init.statData, kind.path) || {}) : [],
            fields: kind.fields.map((name) => ({ name, max: capOf(name), inSchema: !target || known.has(name) })),
        };
    });

    // the picker, in the order an author wants: the forms the engine declares first, then DaysSince()
    // over the fields it STAMPS (the only datetime signal a card gives — its Zod types every stamp as
    // a string), then every path the schema declares, then the seed's items (Classmate.Mitsuki.Mood)
    const declaredForms = (headers.headers.sugar || []).filter((x) => !isReserved(x));
    // the concrete DaysSince() suggestions sit where the template is, AHEAD of it: an author reaching for
    // a cooldown wants the field the engine stamps, and the bare template stays for any other path
    const at = declaredForms.indexOf('DaysSince(*)');
    const daysSince = at >= 0
        ? writes.filter((w) => typeof w.stamp === 'string' && w.stamp).map((w) => 'DaysSince(' + w.path + (w.isRecord ? '.*.' : '.') + w.stamp + ')')
        : [];
    const forms = at >= 0 ? [...declaredForms.slice(0, at), ...daysSince, ...declaredForms.slice(at)] : declaredForms;
    const declared = schemaPaths(schema.tree).filter((path) => !isReserved(path));
    const seen = new Set([...forms, ...declared]);
    const derived = deriveDslPaths(init.statData).filter((path) => !isReserved(path) && !seen.has(path));
    return {
        ok: true,
        cardName: String(data.name || ''),
        headers: headers.headers,
        schemaTree: schema.tree,
        writes,
        rewards,
        statData: init.statData,
        dslPaths: [...forms, ...declared, ...derived],
    };

}
