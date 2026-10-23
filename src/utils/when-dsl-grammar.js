// when-dsl-grammar.js — the WHEN/PREREQ token grammar (parse + emit). VENDORED COPY.  v1.7.0
//
// ⚠⚠⚠ THREE-FILE GRAMMAR SYNC — MANDATORY ⚠⚠⚠
// This grammar exists in THREE hand-synced files. ANY change to one MUST land in all three in the
// same pass, and all three carry the SAME grammar version — now v1.7.0:
//   1. MvuGameMaker        maker-app/GameLogic/_engine/eventpack.cjs        ← SOURCE OF TRUTH (the engine)
//   2. mvu-helper          src/features/event-pack/when-dsl-grammar.js      (install-side validator/lint)
//   3. MvuStatMenuBuilder  landing-app/src/utils/when-dsl-grammar.js        (event-builder GUI, parse + emit)
// Files 2 and 3 are BYTE-IDENTICAL twins — a plain byte-compare is their drift guard. File 1
// carries the same logic in the engine's CJS/ES5 form; mvu-helper's drift suite EXECUTES the real
// engine against this copy over a token corpus, so a grammar move that skips a copy fails a test by
// name. Do NOT "improve" this file alone: a change not mirrored in the engine puts the
// validator/builder and the runtime into disagreement — the silent-dead-event class this vendoring
// exists to prevent. (Each consumer repo ships standalone and has no runtime access to the others,
// which is why this is a COPY and not an import.)
//
// ⚠ A GRAMMAR CHANGE IS THE EXPENSIVE KIND — the only change to the event library that reaches an
// already-SHIPPED card. A new token kind or LHS form bumps the pack FORMAT, so every card in the wild
// refuses packs using the new form until it re-ships. Ration these, and never let ONE genre's need
// drive one: a runtime capability that needs no new token belongs in the engine file, where it costs
// shipped cards and existing packs nothing (a pack is DATA — it cannot call a function). The three
// stability rules this sits under are in GENRE_FILE_CONVENTION.md §12 and in eventpack.cjs's own
// compatibility promise.
//
// ── WHAT IT IS FOR ───────────────────────────────────────────────────────────
// The engine's `evalOne` answers "is this token TRUE right now" — it needs live `stat_data` plus the
// genre's `cfg` callbacks, so a validator or builder can never call it. They ask only "does this
// token PARSE" (and, for a builder, "how is this descriptor SPELLED"), which is stateless.
// `parseToken` + `formatToken` are that shared pair.
//
// ── GRAMMAR ──────────────────────────────────────────────────────────────────
//   { kind: 'none' }                     '' / '-'  — no constraint
//   { kind: 'in',      lhs, set: [...] } LHS in {a,b,c}
//   { kind: 'present', name }            Present(Name)
//   { kind: 'flag',    flag, state }     flag:key[=state]   (state defaults to 'done')
//   { kind: 'cmp',     lhs, op, rhs }    LHS (>=|<=|==|=|>|<) RHS
//   { kind: 'contains',lhs, arg }        contains(LHS, "substring")   — case-sensitive
//   { kind: 'has',     lhs, arg }        has(LHS, "element")          — keys for a record,
//                                        values for an array; `L.*.M` wildcard = ANY match
//   …any of the above + `neg: true`      a leading `!`
//   null                                 unparseable — the lint warns, the engine evaluates false
//
// Every form above is pack format 1.0, the format's first release; so are `*` paths and `whenAny`.
//
// This is SHAPE, not vocabulary: whether `Aff(Someone)` names anything real is a genre question that
// fails safe at runtime, so an unknown scalar parses fine here on purpose.
//
// BRANCH ORDER IS LOAD-BEARING and mirrors the engine exactly: `in {}` and `flag:` are both tried
// before the comparison branch, or `Mood in {a,b}` would be read as a comparison against `n {a,b}`.

const RE_IN = /^(.+?)\s+in\s+\{([^{}]*)\}$/i;
const RE_PRESENT = /^Present\(([^()]+)\)$/i;
const RE_FLAG = /^flag:([A-Za-z0-9_]+)(?:=(\w+))?$/i;
const RE_CMP = /^(.+?)(>=|<=|==|=|>|<)(.+)$/;
const RE_CALL = /^(contains|has)\(\s*([^,]+?)\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)$/i;

// The quoted-argument codec. `\"` and `\` only — every escape is a spelling the builder, the
// validator and the engine must all agree on forever, so the set stays deliberately tiny.
const unescapeArg = (v) => String(v).replace(/\\(["\\])/g, '$1');
const escapeArg = (v) => String(v).replace(/([\\"])/g, '\\$1');

export function parseToken(tok) {
    const t = String(tok == null ? '' : tok).trim();
    if (t === '' || t === '-') return { kind: 'none' };
    // `!` NEGATION. Negates only a SUCCESSFULLY parsed inner token: a parse failure stays null
    // (⇒ the engine evaluates false) and must NEVER flip to true, or a typo silently UN-GATES an event.
    if (t.charAt(0) === '!') {
        const inner = parseToken(t.slice(1).trim());
        if (!inner) return null;                    // unparseable inner ⇒ still unparseable
        if (inner.kind === 'none') return null;     // "not no-constraint" is meaningless
        if (inner.neg) return null;                 // `!!x` — no canonical spelling, so no round-trip
        inner.neg = true;
        return inner;
    }
    let m;
    // contains() / has(). The argument is ALWAYS double-quoted, with `\"` and `\` escapes, so a
    // value holding a quote, comma or paren is expressible. LHS carries no commas — that is what makes
    // the split unambiguous without a real parser.
    if ((m = t.match(RE_CALL))) {
        return { kind: m[1].toLowerCase(), lhs: m[2].trim(), arg: unescapeArg(m[3]) };
    }
    if ((m = t.match(RE_IN))) {
        return { kind: 'in', lhs: m[1].trim(), set: m[2].split(',').map((x) => x.trim()) };
    }
    if ((m = t.match(RE_PRESENT))) return { kind: 'present', name: m[1].trim() };
    if ((m = t.match(RE_FLAG))) return { kind: 'flag', flag: m[1], state: m[2] || 'done' };
    if ((m = t.match(RE_CMP))) {
        const lhs = m[1].trim(), rhs = m[3].trim();
        // An operator character on EITHER side means the token is malformed, not a comparison.
        // LHS (`>=40`) never had a left side. RHS (`Loc=Home=School`) would compare against the
        // literal "Home=School" — harmlessly false bare, always TRUE under `!` (a typo silently
        // UN-GATING an event). formatToken refuses to emit it; the parser must refuse to read it.
        if (lhs && rhs && !/[<>=]/.test(lhs) && !/[<>=]/.test(rhs)) return { kind: 'cmp', lhs, op: m[2], rhs };
    }
    return null;
}

// The validator's question, phrased as the validator asks it. Kept here rather than at the call site
// so "what counts as a legal token" is answerable from ONE file.
export function isTokenShapeOk(tok) {
    return parseToken(tok) !== null;
}

// ── the EMIT direction ───────────────────────────────────────────────────────
// A visual builder holds descriptors (LHS dropdown · operator dropdown · RHS field) and must turn
// them into the string a pack stores, without the author typing syntax.
//
// CONTRACT: whenever it returns a string, `parseToken` reads back EXACTLY the descriptor it was given;
// when the descriptor cannot be expressed it returns `null` and emits nothing. `null` means "the GUI
// must reject this input" — mirroring parseToken's null, one convention in both directions.
//
// CANONICAL SPELLING is from shipped content, not taste: `gf>=0 & Loc=X & T>=16:00` — no spaces around
// operators, spaces around '&', and `flag:x` omits the default `=done`.
//
// ONE-DIRECTION PROPERTY: parseToken(formatToken(d)) === d holds. formatToken(parseToken(s)) === s
// does NOT and must not be attempted — 'A>=1', 'A >= 1' and '  A >= 1 ' all parse to the same
// descriptor, so emitting can only produce one spelling.

const RE_FLAG_KEY = /^[A-Za-z0-9_]+$/;
const RE_FLAG_STATE = /^\w+$/;
const CMP_OPS = ['>=', '<=', '==', '=', '>', '<'];

// Rejects anything that would not survive the round trip: non-strings · values parseToken would TRIM
// (silently trimming would emit a token meaning something other than what the caller passed) · empty ·
// newlines · a leading '!' · and '&', which SPLITS the token once it is joined into a chain — a break
// no token-level round-trip test can see.
function emittable(v) {
    if (typeof v !== 'string') return false;
    if (v !== v.trim() || v === '') return false;
    if (/[\r\n]/.test(v)) return false;
    if (v.charAt(0) === '!') return false;
    return !v.includes('&');
}

// An LHS additionally may not carry an operator character, the ' in ' keyword, or braces — each would
// re-parse as a different token shape.
function emittableLhs(v) {
    if (!emittable(v)) return false;
    if (/[<>=]/.test(v)) return false;
    if (/\s+in\s+/i.test(v)) return false;
    return !/[{}]/.test(v);
}

export function formatToken(d) {
    if (!d || typeof d !== 'object') return null;
    // NEGATION: emit the inner token and prefix '!'. Refused on `none` and on an already-negated
    // descriptor, mirroring parseToken exactly — the two halves must agree on what is unspellable, or
    // the round-trip stops being a proof of anything.
    if (d.neg) {
        if (d.kind === 'none') return null;
        const bare = { ...d };
        delete bare.neg;
        const inner = formatToken(bare);
        return (inner === null || inner === '') ? null : '!' + inner;
    }
    switch (d.kind) {
        case 'none': return '';
        // contains()/has(). The arg is ESCAPED rather than screened: quotes, commas and parens
        // are all legal inside it, which is the whole reason the quoted form was chosen.
        case 'contains':
        case 'has': {
            if (!emittableLhs(d.lhs) || typeof d.arg !== 'string') return null;
            if (/,/.test(d.lhs)) return null;           // a comma in the LHS would re-split the call
            return `${d.kind}(${d.lhs}, "${escapeArg(d.arg)}")`;
        }
        case 'cmp': {
            if (!emittableLhs(d.lhs) || !emittable(d.rhs)) return null;
            if (!CMP_OPS.includes(d.op)) return null;
            if (/[<>=]/.test(d.rhs)) return null;       // a second operator would re-split the token
            if (/[{}()]/.test(d.rhs)) return null;
            return d.lhs + d.op + d.rhs;
        }
        case 'in': {
            if (!emittableLhs(d.lhs) || !Array.isArray(d.set) || d.set.length === 0) return null;
            // An EMPTY array is refused deliberately: `X in {}` parses back as a ONE-element set [''].
            for (const el of d.set) {
                if (!emittable(el) || /[,{}]/.test(el)) return null;
            }
            return `${d.lhs} in {${d.set.join(',')}}`;
        }
        case 'present':
            if (!emittable(d.name) || /[()]/.test(d.name)) return null;
            return `Present(${d.name})`;
        case 'flag':
            if (typeof d.flag !== 'string' || !RE_FLAG_KEY.test(d.flag)) return null;
            if (typeof d.state !== 'string' || !RE_FLAG_STATE.test(d.state)) return null;
            return d.state === 'done' ? `flag:${d.flag}` : `flag:${d.flag}=${d.state}`;
        default: return null;
    }
}

// Descriptors → one &-joined predicate string, the form `when`/`prereq` store. 'none' descriptors are
// DROPPED (a stray ' & ' would leave a blank token). Returns null if ANY token is unemittable: a
// partial chain is a DIFFERENT predicate, and silently dropping one condition is how an event fires
// when it should not.
export function formatTokenChain(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const d of list) {
        if (d && d.kind === 'none') continue;
        const t = formatToken(d);
        if (t === null) return null;
        out.push(t);
    }
    return out.join(' & ');
}

// The ROW-level writer for the OR (`whenAny`): descriptor-lists → the `whenAny` array. One alternative per
// inner list, each an AND-chain via formatTokenChain. ALL-OR-NOTHING, like formatTokenChain: if any
// alternative is unemittable the whole row is refused, because emitting only the survivors would
// silently WIDEN the gate — fewer alternatives to fail means an event that fires when it should not.
// An empty list is refused too: `whenAny: []` reads as "no alternative can hold", i.e. never.
export function formatWhenAny(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const out = [];
    for (const g of groups) {
        const chain = formatTokenChain(g);
        if (chain === null) return null;
        out.push(chain);
    }
    return out;
}
