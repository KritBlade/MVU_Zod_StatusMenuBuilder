// rt_pastedEngine.js — the THROWAWAY lane's own formatter resolver (B5 step 4).
//
// The Export HTML tab hands a developer a single file with two uses and no others: open it to look
// at the layout, or paste `statusMenuLogic.cjs` into it and run it as a regex in SillyTavern for a
// quick check. The dev loop is the production path. This file is what makes the second use work.
//
// WHY THE FILE RESOLVES ITS OWN CELLS instead of asking the host. mvu-helper's formatter batch
// answers from the ONE engine hosted in its Worker, for the pack that is INSTALLED — and installing
// nothing is what makes this lane throwaway. So a pasted engine is called right here, and its values
// go into the SAME map the pack lane fills (`_packFormatterValues`), so one apply pass paints both
// and no second renderer is born. Baked cells only: a cell inside a rendered pack tab belongs to the
// host's lane and is left alone even when an engine is pasted.
//
// ⚠ THE PASTE REGION IS A BLOCK, AND THAT IS LOAD-BEARING. `statusMenuLogic.cjs` declares
// `isTuple`, `getRaw`, `getV` and `getL` at its top level — every one of which rt_dataHelpers.js
// already declares in this document's module scope. Pasted flat, the file would not merely misbehave:
// `SyntaxError: Identifier 'isTuple' has already been declared` kills the whole script and the menu
// never renders. Inside a block those consts are scoped to it, and `module` resolves to the object
// declared beside it, so the .cjs goes in VERBATIM — nothing edited on the way.

// The engine's own contract, mirrored: formatters are (stat, root, scopePath) and `stat` is the RAW
// subtree at the scope path, tuples intact — the formatter's own getV unwraps, and its itemKeyOf reads
// the collection item's key off scopePath. This is a copy of the platform's readScopeValue on purpose;
// it is the shape the pasted file was written against, and this lane must not invent a second one.
// Empty path = the whole snapshot.
function readOwnScopeValue(statData, path) {
    let cur = statData;
    for (const seg of String(path || '').split('.')) {
        if (!seg) return cur;
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[seg];
    }
    return cur;
}

// The cells this lane answers for, read off the DOM: every formatter-named cell that is NOT inside a
// pack tab. Returns one entry per element; the caller dedupes, because two rows of one collection
// asking the same formatter for the same item is one call.
function planOwnFormatterCells(root) {
    const out = [];
    if (!root || typeof root.querySelectorAll !== 'function') return out;
    const fields = [['data-fmt-text', 'text'], ['data-fmt-img', 'image'], ['data-fmt-lb', 'lorebookKey']];
    for (const [attr, field] of fields) {
        root.querySelectorAll('[' + attr + ']').forEach((el) => {
            if (el.closest && el.closest('[data-pack]')) return;   // the host's lane owns that cell
            const name = el.getAttribute(attr);
            if (!name) return;
            out.push({ name, field, scopePath: packScopeOf(el) });
        });
    }
    return out;
}

// One call per (formatter, scope) pair, in first-seen order.
function planOwnFormatterCalls(cells) {
    const seen = new Set();
    const calls = [];
    for (const cell of (Array.isArray(cells) ? cells : [])) {
        const key = packFormatterValueKey(cell.name, cell.scopePath);
        if (seen.has(key)) continue;
        seen.add(key);
        calls.push({ name: cell.name, scopePath: cell.scopePath, key });
    }
    return calls;
}

// Run the calls against a pasted engine. A formatter that is absent or throws is REPORTED, never
// substituted: its cell keeps the raw binding, which is §B.6's rule for an unresolvable cell and the
// only honest answer when the pasted file and the layout disagree.
function runOwnFormatters(statData, exportsObject, calls) {
    const values = new Map();
    const missing = [];
    const errors = [];
    const formatters = (exportsObject && exportsObject.formatters) || null;
    if (!formatters) return { values, missing, errors, hasEngine: false };
    for (const call of (Array.isArray(calls) ? calls : [])) {
        const fn = formatters[call.name];
        if (typeof fn !== 'function') { missing.push(call.name); continue; }
        try {
            values.set(call.key, String(fn(readOwnScopeValue(statData, call.scopePath), statData, call.scopePath)));
        } catch (e) {
            errors.push({ name: call.name, scopePath: call.scopePath, error: String((e && e.message) || e) });
        }
    }
    return { values, missing, errors, hasEngine: true };
}

// ── the render hook ──────────────────────────────────────────────────────────

let _ownEngineWarnedFor = null;

// Called from updateStatusPanel's phase 0, beside the pack lane's resolve. Does nothing at all when
// no engine has been pasted, which is the file's normal state.
function resolveOwnFormatters(statData) {
    const exportsObject = typeof PASTED_ENGINE !== 'undefined' ? PASTED_ENGINE.exports : null;
    if (!exportsObject || !exportsObject.formatters) return;
    const cells = planOwnFormatterCells(document);
    if (!cells.length) return;
    const calls = planOwnFormatterCalls(cells);
    const run = runOwnFormatters(statData, exportsObject, calls);
    run.values.forEach((value, key) => _packFormatterValues.set(key, value));
    run.errors.forEach((e) => console.warn('[MZSMB][own-engine] formatter "' + e.name + '" threw for scope "'
        + e.scopePath + '" — that cell renders raw: ' + e.error));
    const missingKey = run.missing.slice().sort().join(',');
    if (missingKey && missingKey !== _ownEngineWarnedFor) {
        _ownEngineWarnedFor = missingKey;
        console.warn('[MZSMB][own-engine] the pasted engine exports no formatter named: '
            + [...new Set(run.missing)].join(', ') + ' — those cells render raw. Names come from the layout;'
            + ' the pack lane may have named the same body differently, and reconciling them is the paste\'s job.');
    }
}
