// event-pack-serializer.js — GUI state ⇄ event-pack TEXT. The builder's only output format.
//
// COMPLETELY MECHANICAL (pack-authoring-plan §A.7): emits/reads the event-pack file format and
// nothing else — no installer, no genre, no schema knowledge. A write's values arrive already typed by
// the tab (which read the card's Zod); this file only spells them.
// Conditions ride the vendored grammar (`when-dsl-grammar.js`, three-file sync v1.7.0): the
// serializer emits via formatTokenChain/formatWhenAny, the parser reads via parseToken. Neither
// direction is ever re-implemented here.
//
// PACK TEXT SHAPE (one pack; a file may hold several, each its own block pair):
//   <%_ if (false) { _%>
//   <mvueventpack>
//   { ...meta + triggers JSON... }
//   </mvueventpack>
//   <%_ } _%>
//   <%_ if (getvar('stat_data.<armedPath>[0]') === '@<key>') { _%>
//   <Event_Pack>
//   @<key>  <Title>[ ·<step>]
//     DO  <narrator instructions>
//     FIRE  emit /Intent/eventFire "<key>" -> <what the fire does>
//   </Event_Pack>
//   <%_ } _%>
// The armed gate always carries the `[0]` tuple unwrap (§A.7 #5) and is pinned to the uploaded
// card's declared armedPath.

import { parseToken, formatTokenChain, formatWhenAny } from './when-dsl-grammar.js';

// ---- identity ------------------------------------------------------------------------------

/** slug per the pack format: lowercase, spaces → _, only [a-z0-9_] survives. */
export function slug(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function packId(creator, event) { return slug(creator) + '.' + slug(event); }
export function keyPrefix(creator, event) { return slug(creator) + '_' + slug(event) + '_'; }

// ── the record key a write names ──────────────────────────────────────────────────────────────────
// The author types the key the PLAYER will read — `Ruinblade`, not `paulk_beacharc_ruinblade`. A record
// says who made it in the field the card's path declares as `ownerStamp`, written by the engine at fire,
// and that is what keeps a pack off a record it did not grant: a pack may name any key nobody has
// claimed, and may overwrite or remove only what its own id stamped. So nothing is prepended here and
// nothing is stripped on import — the key round-trips exactly as typed.
// `entry` is the card's declared write entry (null when the path is not one the card declares).
export const isSharedWrite = (entry) => !!entry && entry.fillOnly === true;

// A path that can record no ownership refuses every keyed PACK write on it, whatever the key says — a
// shared (fillOnly) registry excepted, where filling a blank needs no ownership. That is the CARD's gap,
// so the warning has to name the card: renaming the key cannot fix it.
export const canOwnRecords = (entry) => !!entry && (entry.fillOnly === true || (typeof entry.ownerStamp === 'string' && !!entry.ownerStamp));

// what to EMIT for a record write. "" when the path is not a record or the author typed nothing.
export function writeRecordKey(entry, typed) {
    const key = String(typed || '').trim();
    if (!entry || !entry.isRecord || !key) return '';
    return key;
}

// ---- derived format ------------------------------------------------------------------------

// The minimum format the pack's conditions require, derived from the DESCRIPTORS actually used — never
// hand-picked. 1.0 is the whole grammar (eventpack_revisit D4: `!` · contains() · has() · `*` · OR groups ·
// DaysSince() · fx.writes are all 1.0), so the table is EMPTY today; when a later format adds a construct,
// one row names it. Each row says WHERE its construct is visible: a `condition` row is tested against
// every descriptor the trigger uses, a `trigger` row against the trigger itself — a payout lives in fx
// and a row that pays may carry no conditions at all, so a descriptor sweep would never reach it.
// mvu-helper's FEATURE_FORMAT is the install-side twin of this table and must carry the same rows.
const FEATURE_FORMAT = [
    { format: '1.1', scope: 'trigger', name: 'fx.reward',
      test: (t) => !!t && !!t.fx && !!t.fx.reward && typeof t.fx.reward === 'object'
                   && Object.keys(t.fx.reward).length > 0 },
    // A keyed reward whose member is a SELECTOR (`<path>.*.<field>`) rather than a name: the row says which
    // field marks the one it means and the engine reads who that is. An engine older than 1.2 treats the
    // whole thing as an illegal member key, refuses it by name and fires the row without the payout —
    // which is why this is a MINOR bump and not a major one.
    { format: '1.2', scope: 'trigger', name: 'fx.reward member selector',
      test: (t) => !!t && !!t.fx && !!t.fx.reward && typeof t.fx.reward === 'object'
                   && Object.values(t.fx.reward).some((v) => !!v && typeof v === 'object'
                      && Object.keys(v).some((k) => k.includes('.*.'))) },
];
const newer = (a, b) => { const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number); return a1 !== b1 ? a1 > b1 : a2 > b2; };
export function deriveFormat(pack) {
    let out = '1.0';
    for (const t of pack.triggers || []) {
        const all = [...(t.prereq || []), ...(t.whenGroups || []).flat()];
        for (const row of FEATURE_FORMAT) {
            const used = row.scope === 'trigger' ? row.test(t) : all.some((d) => d && row.test(d, t));
            if (used && newer(row.format, out)) out = row.format;
        }
    }
    return out;
}

// ---- emit ----------------------------------------------------------------------------------

function emitFxValue(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    // nested payload values (objects/arrays) pass through VERBATIM — stringifying them here is how
    // an imported pack's payload silently became "[object Object]"
    if (v !== null && typeof v === 'object') return v;
    const s = String(v);
    // a field edited as JSON text (the GUI shows nested values that way) parses back to structure
    if (/^[[{]/.test(s.trim())) {
        try { return JSON.parse(s); } catch { /* EXPECTED: not JSON — an ordinary string that happens to start with { or [ */ }
    }
    // strict numeric strings become numbers (a quest `step` must compare numerically);
    // anything with a leading zero or stray character stays text
    if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s.trim()) && s.trim() === s) return Number(s);
    return s;
}

/** One trigger row → the JSON row object, fields in canonical order. */
function emitRow(t, pack) {
    const row = { cat: t.cat === 'TIME' ? 'TIME' : 'TRG' };
    if (t.series) row.series = t.series;

    const prereq = formatTokenChain(t.prereq || []);
    if (prereq === null) return { error: 'a prereq condition cannot be spelled (grammar refused it)' };
    if (prereq) row.prereq = prereq;

    const groups = (t.whenGroups || []).filter((g) => (g || []).some((d) => d && d.kind !== 'none'));
    if (groups.length > 1) {
        const whenAny = formatWhenAny(groups);
        if (whenAny === null) return { error: 'a when condition cannot be spelled (grammar refused it)' };
        row.whenAny = whenAny;
    } else {
        const when = formatTokenChain(groups[0] || []);
        if (when === null) return { error: 'a when condition cannot be spelled (grammar refused it)' };
        if (when) row.when = when;
    }

    const fx = {};
    if (t.fx && t.fx.summary) fx.summary = String(t.fx.summary);
    // blank ⇒ the key is OMITTED and the card's engine applies its own default — emitting "" would
    // be this tool asserting a value it never chose
    if (t.fx && t.fx.scope) fx.scope = String(t.fx.scope);
    // writes: { path, key?, set?, add?, remove? } each — a write that names nothing to do is dropped
    const writes = [];
    for (const w of (t.fx && Array.isArray(t.fx.writes)) ? t.fx.writes : []) {
        if (!w || typeof w !== 'object' || typeof w.path !== 'string' || !w.path.trim()) continue;
        const out = { path: w.path.trim() };
        if (typeof w.key === 'string' && w.key.trim()) out.key = w.key.trim();
        if (w.remove === true) { out.remove = true; writes.push(out); continue; }
        for (const bucket of ['set', 'add']) {
            const src = w[bucket];
            if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
            const fields = {};
            for (const f of Object.keys(src)) {
                if (src[f] === '' || src[f] === null || src[f] === undefined) continue;
                fields[f] = bucket === 'add' ? Number(src[f]) : emitFxValue(src[f]);
            }
            if (Object.keys(fields).length) out[bucket] = fields;
        }
        if (out.set || out.add) writes.push(out);
    }
    if (writes.length) fx.writes = writes;
    // reward: { <kind>: { <field>: <amount> } }, or for a KEYED kind { <kind>: { <memberKey>: { <field>:
    // <amount> } } } — a kind with no paid field is dropped, the way a write that names nothing to do is.
    // Amounts are numbers; the card's engine holds them to its own ceiling. The nesting is read from the
    // VALUE's own shape, not from a flag: an amount is a number and a member is an object, so the two
    // cannot be confused, and the serializer never has to be told which kinds are keyed.
    // An amount is a NUMBER on an ordinary kind and TEXT on a prose one. The value's own type says which,
    // so the serializer never has to be told which kinds are textual: a non-numeric string is prose, and a
    // zero or a blank is nothing either way.
    const paidFields = (src) => {
        const paid = {};
        for (const f of Object.keys(src)) {
            const raw = src[f];
            if (typeof raw === 'string' && raw.trim() && !Number.isFinite(Number(raw))) { paid[f] = raw.trim(); continue; }
            const amount = Number(raw);
            if (!Number.isFinite(amount) || amount === 0) continue;
            paid[f] = amount;
        }
        return paid;
    };
    const reward = {};
    const askedReward = (t.fx && t.fx.reward && typeof t.fx.reward === 'object') ? t.fx.reward : {};
    for (const kind of Object.keys(askedReward)) {
        const src = askedReward[kind];
        if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
        const out = {};
        for (const k of Object.keys(src)) {
            const v = src[k];
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                const paid = paidFields(v);                       // a member: one more level
                if (Object.keys(paid).length) out[k] = paid;
            } else {
                const one = paidFields({ [k]: v });
                if (Object.prototype.hasOwnProperty.call(one, k)) out[k] = one[k];
            }
        }
        if (Object.keys(out).length) reward[kind] = out;
    }
    if (Object.keys(reward).length) fx.reward = reward;
    row.fx = fx;
    return { row };

}

/** The prose body for one trigger. */
function emitBody(t, key, armedPath) {
    const title = String(t.title || key).trim();
    const step = String(t.step || '').trim();
    const head = '@' + key + '  ' + title + (step ? ' ·' + step : '');
    const doText = String(t.doText || '').trim().split(/\r?\n/).join('\n      ');
    const fireNote = String(t.fireNote || '').trim();
    return [
        "<%_ if (getvar('stat_data." + armedPath + "[0]') === '@" + key + "') { _%>",
        '<Event_Pack>',
        head,
        '  DO  ' + doText,
        '  FIRE  emit /Intent/eventFire "' + key + '"' + (fireNote ? ' -> ' + fireNote : ''),
        '</Event_Pack>',
        '<%_ } _%>',
    ].join('\n');
}

/**
 * Emit ONE pack as installable text.
 * pack: { creator, event, version, triggers: [ { keySuffix, title, step, cat, series,
 *         prereq: [descriptor], whenGroups: [[descriptor]],
 *         fx: { summary, scope, writes: [{ path, key?, set?, add?, remove? }],
 *               reward: { <kind>: { <field>: <amount> } | { <memberKey>: { <field>: <amount> } } } },
 *         doText, fireNote } ] }
 * opts: { armedPath (REQUIRED — what the uploaded card's engine declares), builtWith }
 * Returns { ok, text } or { ok:false, reason } — all-or-nothing, a partial pack is never emitted.
 */
export function emitPack(pack, opts) {
    const armedPath = opts && opts.armedPath;
    if (!armedPath) return { ok: false, reason: 'no armedPath — upload a card whose engine declares one on its EVENT_PACK_ADAPTER' };
    if (!slug(pack.creator)) return { ok: false, reason: 'creator is empty (or survives slugging as nothing)' };
    if (!slug(pack.event)) return { ok: false, reason: 'event name is empty (or survives slugging as nothing)' };
    // "official" is the CARD's word, and mvu-helper refuses a pack carrying it at install. Caught here
    // too so the author learns it while the name is still free to change, not after publishing.
    if (/official/i.test(String(pack.creator))) return { ok: false, reason: 'creator may not contain "official" — that word names the events the card itself seeds, and a pack wearing it reads to a player as the game speaking' };
    if (!/^\d+\.\d+(\.\d+)?$/.test(String(pack.version || ''))) return { ok: false, reason: 'version must be M.m or M.m.p (e.g. "1.0")' };
    if (!(pack.triggers || []).length) return { ok: false, reason: 'pack has no triggers' };

    const prefix = keyPrefix(pack.creator, pack.event);
    const seen = new Set();
    const triggers = {};
    const bodies = [];
    for (const t of pack.triggers) {
        const suffix = slug(t.keySuffix);
        if (!suffix) return { ok: false, reason: 'a trigger has an empty key suffix' };
        const key = prefix + suffix;
        if (seen.has(key)) return { ok: false, reason: 'duplicate trigger key: ' + key };
        seen.add(key);
        const { row, error } = emitRow(t, pack);
        if (error) return { ok: false, reason: 'trigger "' + key + '": ' + error };
        triggers[key] = row;
        bodies.push(emitBody(t, key, armedPath));
    }

    const meta = {
        format: deriveFormat(pack),
        creator: String(pack.creator),
        event: String(pack.event),
        version: String(pack.version),
        builtWith: (opts && opts.builtWith) || 'MvuStatMenuBuilder',
        triggers,
    };

    const text = [
        '<%_ if (false) { _%>',
        '<mvueventpack>',
        JSON.stringify(meta, null, 2),
        '</mvueventpack>',
        '<%_ } _%>',
        ...bodies,
    ].join('\n') + '\n';

    return { ok: true, text, format: meta.format };
}

// ---- parse (round-trip import) -------------------------------------------------------------

const RE_JSON_BLOCK = /<mvueventpack>\s*([\s\S]*?)\s*<\/mvueventpack>/g;
const RE_BODY = /<%_\s*if\s*\(getvar\('stat_data\.([^'[]+?)(\[0\])?'\)\s*===\s*'@([A-Za-z0-9_]+)'\)\s*\{\s*_%>\r?\n?([\s\S]*?)<%_\s*\}\s*_%>/g;

function parseChain(str) {
    const out = [];
    const s = String(str || '').trim();
    if (!s || s === '-') return out;
    for (const raw of s.split('&')) {
        const d = parseToken(raw.trim());
        if (d === null) return null;
        if (d.kind === 'none') continue;
        out.push(d);
    }
    return out;
}

function parseBodyText(inner) {
    // strip the <Event_Pack> wrapper when present
    let s = inner.replace(/^\s*<Event_Pack>\s*\r?\n/, '').replace(/\r?\n\s*<\/Event_Pack>\s*$/, '');
    const lines = s.split(/\r?\n/);
    const out = { title: '', step: '', doText: '', fireNote: '' };
    let mode = '';
    const doLines = [];
    for (const line of lines) {
        let m;
        if ((m = line.match(/^@[A-Za-z0-9_]+\s+(.*?)(?:\s+·(\S+))?\s*$/))) {
            out.title = m[1].trim();
            out.step = m[2] || '';
            mode = '';
        } else if ((m = line.match(/^\s*DO\s\s(.*)$/))) {
            doLines.push(m[1]);
            mode = 'do';
        } else if ((m = line.match(/^\s*FIRE\s\s(.*)$/))) {
            mode = 'fire';
            const fire = m[1];
            const note = fire.match(/->\s*(.*)$/);
            out.fireNote = note ? note[1].trim() : '';
        } else if (mode === 'do') {
            doLines.push(line.replace(/^\s+/, ''));
        }
    }
    out.doText = doLines.join('\n').trim();
    return out;
}

/**
 * Parse a pack FILE (may hold several `<mvueventpack>` blocks) back into builder state.
 * Returns { ok, packs: [...], armedPath, warnings: [...] } or { ok:false, reason }.
 * A condition token the grammar cannot read is a WARNING naming the row (the row still loads,
 * with the raw string preserved in `rawWhen`/`rawPrereq` so nothing is silently dropped).
 */
export function parsePackFile(text) {
    const src = String(text || '');
    const warnings = [];

    // bodies first — keyed by trigger key, shared across all blocks in the file
    const bodies = {};
    let armedPath = '';
    let bm;
    RE_BODY.lastIndex = 0;
    while ((bm = RE_BODY.exec(src))) {
        armedPath = bm[1];
        bodies[bm[3]] = parseBodyText(bm[4]);
    }

    const packs = [];
    let jm;
    RE_JSON_BLOCK.lastIndex = 0;
    while ((jm = RE_JSON_BLOCK.exec(src))) {
        let meta;
        try {
            meta = JSON.parse(jm[1]);
        } catch (e) {
            return { ok: false, reason: 'a <mvueventpack> block is not valid JSON: ' + (e && e.message ? e.message : String(e)) };
        }
        if (!meta || typeof meta !== 'object' || !meta.triggers || typeof meta.triggers !== 'object') {
            return { ok: false, reason: 'a <mvueventpack> block has no `triggers` object' };
        }
        const prefix = keyPrefix(meta.creator, meta.event);
        const triggers = [];
        for (const key of Object.keys(meta.triggers)) {
            const row = meta.triggers[key] || {};
            const t = {
                keySuffix: key.startsWith(prefix) ? key.slice(prefix.length) : key,
                title: '', step: '', doText: '', fireNote: '',
                cat: row.cat === 'TIME' ? 'TIME' : 'TRG',
                series: row.series || '',
                prereq: [], whenGroups: [[]],
                fx: { summary: '', scope: '', writes: [], reward: {} },
            };
            if (!key.startsWith(prefix)) warnings.push('trigger "' + key + '" does not carry the pack prefix "' + prefix + '"');

            const prereq = parseChain(row.prereq);
            if (prereq === null) { warnings.push('trigger "' + key + '": prereq did not parse — kept raw'); t.rawPrereq = row.prereq; }
            else t.prereq = prereq;

            if (Array.isArray(row.whenAny) && row.whenAny.length) {
                const groups = [];
                let bad = false;
                for (const alt of row.whenAny) {
                    const g = parseChain(alt);
                    if (g === null) { bad = true; break; }
                    groups.push(g);
                }
                if (bad) { warnings.push('trigger "' + key + '": whenAny did not parse — kept raw'); t.rawWhen = JSON.stringify(row.whenAny); }
                else t.whenGroups = groups;
            } else {
                const when = parseChain(row.when);
                if (when === null) { warnings.push('trigger "' + key + '": when did not parse — kept raw'); t.rawWhen = row.when; }
                else t.whenGroups = [when];
            }

            const fx = row.fx || {};
            for (const f of Object.keys(fx)) {
                if (f === 'summary') t.fx.summary = String(fx.summary || '');
                else if (f === 'scope') t.fx.scope = String(fx.scope || '');
                else if (f === 'writes') {
                    if (!Array.isArray(fx.writes)) { warnings.push('trigger "' + key + '": fx.writes is not an array — dropped'); continue; }
                    fx.writes.forEach((w, i) => {
                        if (!w || typeof w !== 'object' || Array.isArray(w) || typeof w.path !== 'string') { warnings.push('trigger "' + key + '": fx.writes[' + i + '] is not a { path, … } write — dropped'); return; }
                        t.fx.writes.push(JSON.parse(JSON.stringify(w)));
                    });
                } else if (f === 'reward') {
                    if (!fx.reward || typeof fx.reward !== 'object' || Array.isArray(fx.reward)) { warnings.push('trigger "' + key + '": fx.reward is not a { kind: { field: amount } } object — dropped'); continue; }
                    for (const kind of Object.keys(fx.reward)) {
                        const src = fx.reward[kind];
                        if (!src || typeof src !== 'object' || Array.isArray(src)) { warnings.push('trigger "' + key + '": fx.reward.' + kind + ' is not a { field: amount } object — dropped'); continue; }
                        t.fx.reward[kind] = JSON.parse(JSON.stringify(src));
                    }
                } else warnings.push('trigger "' + key + '": fx.' + f + ' is not a field of format 1.1 (summary, scope, writes, reward) — dropped');
            }


            const body = bodies[key];
            if (body) Object.assign(t, body);
            else warnings.push('trigger "' + key + '" has no prose body in the file');

            triggers.push(t);
        }
        packs.push({
            creator: String(meta.creator || ''),
            event: String(meta.event || ''),
            version: String(meta.version || ''),
            declaredFormat: String(meta.format || ''),
            builtWith: String(meta.builtWith || ''),
            triggers,
        });
    }

    if (!packs.length) return { ok: false, reason: 'no <mvueventpack> block found in the file' };
    return { ok: true, packs, armedPath, warnings };
}
