// Builds a StatusMenu Pack file (`packType: "statusmenu"`) from a builder project: the declarative
// layout and the StatusMenu Engine that serves it, in ONE file, because the layout names formatters
// that live in the engine.
//
// Pure by construction — no DOM, no Vue, no file I/O — so every decision here is reachable from
// `tools/test-statusmenu-pack.mjs` (L6). Callers do the picking and the downloading.
//
// The two moves that make a pack out of a layout:
//   • every `customLogic` body LEAVES the layout. A body that computes goes into the engine under a
//     formatter name and the cell keeps only that name; a body that is a bare literal was never
//     logic, so it becomes a static label instead.
//   • the pack's CSS is rewritten under `[data-pack="<id>"]` so it cannot restyle the host card.

import { actionNameProblem, actionArgsProblem, rowActionsProblem } from '../components/exporttab-parts/rt_htmlGenerators.js';
import { shellArchiveMember } from './statusmenu-shell-export.js';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The layout declaration this exporter emits, and the version of that declaration's schema. Kind
// and format are DIFFERENT axes: kinds run in parallel (a second renderer coexists with this one
// forever), formats supersede one another.
//
// Both live INSIDE `layout`, with the CSS, locale and collection paths, because none of them is
// addressed to the platform. A top-level key is the HOST's namespace and an unrecognised one there
// warns — correctly, since it would be a typo or a file built for a newer host. Everything a
// downstream RENDERER reads travels inside a section the host carries verbatim, the way `engine`
// and `entries` already do, so the host's vocabulary stays one word and a future kind adds fields
// without asking anyone's permission.
export const LAYOUT_KIND = 'tabbed-grid';
export const LAYOUT_FORMAT = '1.0';
export const PACK_FILE_FORMAT = '1.0';

// Which CELL FIELD a lifted body drives — which element the pack renderer binds the formatter's
// result to. Cell shape decides: a lorebook cell resolves a KEY, an Image cell a src, everything
// else its text.
export function formatterFieldFor(node) {
    if (node.sourceType === 'lorebook') return 'lorebookKey';
    if (node.type === 'Image') return 'image';
    return 'text';
}

// ── identity ─────────────────────────────────────────────────────────────────

// A kebab id from a display name. A CJK name slugifies to nothing, which is exactly why the export
// UI shows the id as an editable field instead of deriving it silently.
export function derivePackId(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

// ── literal bodies ───────────────────────────────────────────────────────────

function stripComments(code) {
    let out = '';
    let i = 0;
    while (i < code.length) {
        const two = code.slice(i, i + 2);
        if (two === '//') {
            const nl = code.indexOf('\n', i);
            i = nl === -1 ? code.length : nl;
        } else if (two === '/*') {
            const end = code.indexOf('*/', i + 2);
            i = end === -1 ? code.length : end + 2;
        } else {
            const ch = code[i];
            if (ch === '"' || ch === "'" || ch === '`') {
                const start = i;
                i++;
                while (i < code.length && code[i] !== ch) i += code[i] === '\\' ? 2 : 1;
                i++;
                out += code.slice(start, i);
                continue;
            }
            out += ch;
            i++;
        }
    }
    return out;
}

// `_output = 'Belongings';` is a LABEL wearing a code editor's clothes — no state read, no branch.
// A template literal counts only when it interpolates nothing.
export function readLiteralBody(body) {
    const code = stripComments(String(body || '')).trim();
    const m = /^_output\s*=\s*(['"`])([\s\S]*)\1\s*;?$/.exec(code);
    if (!m) return null;
    const quote = m[1];
    const raw = m[2];
    if (raw.includes(quote)) return null;                       // a second statement, not one literal
    if (quote === '`' && /\$\{/.test(raw)) return null;          // interpolation is logic
    return raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

// ── formatter names ──────────────────────────────────────────────────────────

function camel(parts) {
    const words = parts.join(' ').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    return words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
}

// Named for what the cell SHOWS, so a reader of the engine text can find the cell it serves.
export function suggestFormatterName(node, taken) {
    const base = camel([node.mappedKey || node.title || node.type || 'cell']) || 'formatter';
    const field = formatterFieldFor(node);
    let name = field === 'text' ? base : base + field[0].toUpperCase() + field.slice(1);
    if (!/^[A-Za-z_$]/.test(name)) name = 'f' + name;
    let candidate = name;
    let n = 2;
    while (taken.has(candidate)) candidate = name + n++;
    return candidate;
}

// ── the lift ─────────────────────────────────────────────────────────────────

function walkCards(cards, visit, path) {
    (cards || []).forEach((card, i) => {
        const here = path + '/cards/' + i;
        visit(card, here);
        if (Array.isArray(card.cards)) walkCards(card.cards, visit, here);
    });
}

// Visits every node of a layout that can carry `customLogic`, deepest last, with the JSON-pointer
// path the errors quote and the mappedKey of the block it sits in — a cell's scope follows its
// block, so nothing downstream can judge a body without knowing that.
export function walkLayoutNodes(tabs, visit) {
    (tabs || []).forEach((tab, ti) => {
        const tabPath = '/layout/' + ti;
        (tab.blocks || []).forEach((block, bi) => {
            const blockPath = tabPath + '/blocks/' + bi;
            const scope = String(block.mappedKey || '');
            visit(block, blockPath, '');
            walkCards(block.cards, (node, path) => visit(node, path, scope), blockPath);
        });
    });
}

// Moves every body out of the layout. Returns the REWRITTEN layout plus what came out of it, so the
// caller can build the engine text and report what changed.
export function liftCustomLogic(tabs, nameOverrides) {
    const layout = JSON.parse(JSON.stringify(tabs || []));
    const overrides = nameOverrides || {};
    const formatters = [];   // { name, body, path, field, blockMappedKey, mappedKey }
    const labels = [];       // { path, value }
    const warnings = [];
    const taken = new Set();

    walkLayoutNodes(layout, (node, path, blockMappedKey) => {
        const body = typeof node.customLogic === 'string' ? node.customLogic : '';
        if (!body.trim()) {
            if ('customLogic' in node) delete node.customLogic;
            return;
        }

        const literal = readLiteralBody(body);
        if (literal !== null) {
            if (node.staticValue !== undefined && node.staticValue !== literal) {
                warnings.push(path + ': the literal body ("' + literal + '") replaces a different staticValue ("'
                    + node.staticValue + '") — the body is what rendered, so it wins');
            }
            node.staticValue = literal;
            delete node.customLogic;
            labels.push({ path, value: literal });
            return;
        }

        const name = String(overrides[path] || '').trim() || suggestFormatterName(node, taken);
        if (taken.has(name)) {
            warnings.push(path + ': formatter name "' + name + '" is already taken by another cell — renamed');
        }
        taken.add(name);
        const field = formatterFieldFor(node);
        node.formatters = Object.assign({}, node.formatters, { [field]: name });
        delete node.customLogic;
        formatters.push({ name, body, path, field, blockMappedKey, mappedKey: String(node.mappedKey || '') });
    });

    return { layout, formatters, labels, warnings };
}

// ── the sample-data check ────────────────────────────────────────────────────

// The helpers a body calls, in the same shapes the exported runtime and the emitted engine use.
const sampleRaw = (obj, path, def) => {
    if (!obj) return def;
    if (!path) return obj;
    let cur = obj;
    for (const seg of String(path).split('.')) {
        if (cur === undefined || cur === null) return def;
        cur = cur[seg];
    }
    return (cur === undefined || cur === null) ? def : cur;
};
const sampleTuple = (v) => Array.isArray(v) && v.length >= 2 && typeof v[1] === 'string';
const sampleV = (obj, path, def) => { const v = sampleRaw(obj, path, def); return sampleTuple(v) ? v[0] : v; };
const sampleL = (obj, path, def) => { const v = sampleRaw(obj, path, def); return sampleTuple(v) ? v[1] : def; };

function isItemMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const values = Object.values(value);
    return values.length > 0 && values.every((v) => v && typeof v === 'object' && !Array.isArray(v));
}

// What `stat` will BE for this cell: the enclosing block's item when the block loops a collection,
// that block's own object when it does not, and the whole state when the cell sits outside one.
// Mirrors what the exported runtime passes, which is the only definition that matters.
export function sampleScopeFor(blockMappedKey, root) {
    if (!blockMappedKey) return { scope: root, perItem: false };
    const value = sampleRaw(root, blockMappedKey, undefined);
    if (value === undefined) return { scope: undefined, perItem: false, missing: blockMappedKey };
    if (isItemMap(value)) {
        const [key, item] = Object.entries(value)[0];
        return { scope: item, perItem: true, itemKey: key };
    }
    return { scope: value, perItem: false };
}

const BODY_NL = String.fromCharCode(10);

function runBody(body, scope, root, itemKey) {
    try {
        const fn = new Function('stat', 'getV', 'getL', 'getRaw', '_', 'el', 'root', 'itemKey',
            'let _output = undefined;' + BODY_NL + body + BODY_NL + ';' + BODY_NL + 'return _output;');
        return { ok: true, value: fn(scope, sampleV, sampleL, sampleRaw, null, null, root, itemKey) };
    } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
    }
}

// RUNS every lifted body against the project's own sample state instead of guessing from card
// types: a body is only reported when it actually fails to make sense there. Three findings, and
// nothing else is worth a line:
//   • it throws;
//   • it answers with nothing, so the cell would render empty;
//   • it never ran in the baked card AND now answers something different from the value that cell
//     used to show — the one case where lifting it visibly changes the menu.
export function checkFormattersAgainstSample(formatters, root) {
    const warnings = [];
    if (!root || typeof root !== 'object') return warnings;

    for (const f of formatters) {
        const { scope, missing, itemKey } = sampleScopeFor(f.blockMappedKey, root);
        if (missing) {
            warnings.push(f.path + ' (' + f.name + '): its block is mapped to "' + missing
                + '", which the sample data does not contain — the body could not be checked');
            continue;
        }
        const run = runBody(f.body, scope, root, itemKey);
        if (!run.ok) {
            warnings.push(f.path + ' (' + f.name + '): the body THREW against your sample data — ' + run.error);
            continue;
        }
        if (run.value === undefined || run.value === null) {
            warnings.push(f.path + ' (' + f.name + '): the body answers nothing against your sample data, so the cell '
                + 'renders empty. Check the path it reads and the scope it reads from (`stat` is '
                + (f.blockMappedKey ? 'the "' + f.blockMappedKey + '" item' : 'the whole state') + ' here)');
            continue;
        }
    }
    return warnings;
}

// ── the engine text ──────────────────────────────────────────────────────────
// A workspace's engine is TWO files, joined in pack.json's engineOrder into the one engine the host
// runs (mvu-helper's artifact-source-assembler.js joins them in that order). The first is this app's:
// every formatter lifted from the layout's cell logic, rewritten by every export. The second is the
// developer's: a starter written once at bootstrap and never emitted again. They meet at ONE name,
// LAYOUT_FORMATTERS, so a layout change never touches the developer's file.
export const LAYOUT_FORMATTERS_FILE = 'layoutFormatters.cjs';
export const ENGINE_FILE = 'statusMenuLogic.cjs';

// The helpers a lifted body expects. Deliberately the Worker-safe halves of the baked runtime's
// own: no lodash, no `window`, same tuple unwrapping, so a body ports by moving, not by editing.
const READ_HELPERS = `const isTuple = (v) => Array.isArray(v) && v.length >= 2 && typeof v[1] === 'string';

const getRaw = (obj, path, def) => {
    if (!obj) return def;
    if (!path) return obj;
    let cur = obj;
    for (const seg of String(path).split('.')) {
        if (cur === undefined || cur === null) return def;
        cur = cur[seg];
    }
    return (cur === undefined || cur === null) ? def : cur;
};

const getV = (obj, path, def) => {
    const val = getRaw(obj, path, def);
    return isTuple(val) ? val[0] : val;
};

const getL = (obj, path, def) => {
    const val = getRaw(obj, path, def);
    return isTuple(val) ? val[1] : def;
};

// The key of the collection item a formatter is drawing. \`scopePath\` is the path \`stat\` was read
// from; in a block mapped to a collection that is the block's path plus the item's key
// (\`Classmate.Airi\`), so the key is whatever follows the block's path. undefined in a block mapped to
// one object, and outside every block.
const itemKeyOf = (scopePath, blockPath) => {
    const prefix = String(blockPath || '') + '.';
    const path = String(scopePath || '');
    return blockPath && path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
};`;

// The one write helper, for the engine's actions. The formatters file never carries it: a formatter
// never writes.
const SET_PATCH_HELPER = `// A \`set\` patch for ONE member, given its bare value. A patch replaces the WHOLE member, so a
// [value, label] pair keeps its label here — a bare value written over a labelled member is a shape
// change the card's schema refuses while the old value stays. Use it for every set.
const setPatch = (root, path, value) => {
    const label = getL(root, path, null);
    return { op: 'set', path, value: label === null ? value : [value, label] };
};`;

const indentLines = (text, pad) => text.split('\n').map((l) => (l ? pad + l : l)).join('\n');

// layoutFormatters.cjs — one formatter per lifted body, each keeping the `_output` contract its body
// was written against and handed `itemKey`, as the builder's preview and the export's sample check
// hand it too. Everything sits inside one function so its helpers stay private: the engine that
// follows declares its own getV, and two top-level declarations of one name in the joined text are a
// SyntaxError that kills the whole engine.
export function buildLayoutFormattersText(formatters) {
    const bodies = (formatters || []).map((f) => {
        const indented = f.body.replace(/\r\n/g, '\n').split('\n').map((l) => (l ? '            ' + l : l)).join('\n');
        return '        ' + JSON.stringify(f.name) + '(stat, root, scopePath) {\n'
            + '            // ' + f.path + ' — drives the cell\'s "' + f.field + '"\n'
            + '            const itemKey = itemKeyOf(scopePath, ' + JSON.stringify(f.blockMappedKey || '') + ');\n'
            + '            let _output = undefined;\n'
            + indented + '\n'
            + '            ;\n'
            + '            return _output;\n'
            + '        },';
    });

    return '// ' + LAYOUT_FORMATTERS_FILE + ' — GENERATED by MvuStatMenuBuilder from the layout\'s cell logic.\n'
        + '// Do not edit it: every layout export rewrites this file, so an edit here is gone on the next\n'
        + '// one. Change the cell\'s formula in the builder and export again.\n'
        + '//\n'
        + '// It defines ONE name, LAYOUT_FORMATTERS, and loads before ' + ENGINE_FILE + ' (pack.json\n'
        + '// engineOrder), which exports these formatters beside its own. The helpers the formulas call\n'
        + '// live inside, so they never collide with the engine\'s.\n'
        + '//\n'
        + '// Formatters are (stat, root, scopePath) => value and PURE: `stat` is the raw subtree at\n'
        + '// `scopePath` — the cell\'s collection item, its block\'s object, or the whole state outside a\n'
        + '// block — and `root` the whole stat_data. `itemKey` is the key of the collection item a cell\n'
        + '// draws (`Classmate.Airi` → "Airi"). They never write.\n'
        + 'const LAYOUT_FORMATTERS = (() => {\n'
        + indentLines(READ_HELPERS, '    ') + '\n\n'
        + '    return {\n'
        + (bodies.length ? bodies.join('\n') + '\n' : '')
        + '    };\n'
        + '})();\n';
}

// statusMenuLogic.cjs — the STARTER, written once into the bootstrap archive and the developer's file
// from then on. It takes the layout's formatters as LAYOUT_FORMATTERS, adds any written by hand, and
// carries the empty actions object with the §9 contract where the author reads it.
export function buildEngineText(packId, version) {
    return '// ' + packId + ' StatusMenu Engine\n'
        + '// Written ONCE by MvuStatMenuBuilder as a starter; from here on this file is yours. The formatters\n'
        + '// the layout\'s cells compute live in ' + LAYOUT_FORMATTERS_FILE + ', which the builder rewrites on\n'
        + '// every export and which loads before this file (pack.json engineOrder): they reach this file as\n'
        + '// LAYOUT_FORMATTERS. Actions, their inputs, and any formatter you write by hand live here.\n'
        + '//\n'
        + '// The engine DECLARES its version and exports it. mvu-helper reads it off the running module,\n'
        + '// and off this same line when checking a pack that is not loaded yet, so it must stay a STRING\n'
        + '// LITERAL. Bump it on every change; it is reported and logged, never compared.\n'
        + 'const ENGINE_VERSION = ' + JSON.stringify('v' + String(version).replace(/^v/i, '')) + ';\n'
        + '//\n'
        + '// Formatters are (stat, root, scopePath) => value and PURE: `stat` is the raw subtree at\n'
        + '// `scopePath` — the cell\'s collection item, its block\'s object, or the whole state outside a\n'
        + '// block — and `root` the whole stat_data. `itemKey` is the key of the collection item a cell\n'
        + '// draws (`Classmate.Airi` → "Airi"). They never write — a menu write is an action returning\n'
        + '// patches.\n'
        + READ_HELPERS + '\n\n'
        + SET_PATCH_HELPER + '\n\n'
        // The pairing check (authority §B.7e.7). It lives in the STARTER because this is the only
        // document a menu author is guaranteed to read, and because the check itself can only ever be
        // theirs: the host installs whatever pair the user picked and judges nothing.
        + '// -- DOES THIS MENU FIT THE GAME IT WAS DROPPED ON? --------------------------------\n'
        + '// mvu-helper never checks. It installs whatever pair the user chose and runs both, so the\n'
        + '// pairing is the USER\'S and judging the fit is YOURS, here, in this file. `targetsPackId`\n'
        + '// in pack.json is a label shown while picking; nothing matches on it.\n'
        + '//\n'
        + '// MvuHelper.engineInfo() answers { name, type, version, packId, exposes } for the hosted\n'
        + '// GameLogic Engine: WHICH GAME (name), WHICH FAMILY (type), and WHICH stat_data contracts\n'
        + '// it publishes (exposes). Two engines can both be the same family and still keep equipment\n'
        + '// in different places, so the family word alone is never the check — `exposes` is what a\n'
        + '// question about PATHS gets asked against.\n'
        + '//\n'
        + '// A card may host NO GameLogic Engine at all (a card of standalone plugins is a real card),\n'
        + '// and a game that declares no type reads the same way. Both arrive as null, and null is\n'
        + '// UNKNOWN — never a match, and never a refusal on its own.\n'
        + '//\n'
        + '// WARN, DO NOT REFUSE. A menu that switches itself off leaves the player a blank panel and\n'
        + '// no reason; a menu that renders with a warning can be debugged.\n'
        + '//\n'
        + '//     const BUILT_FOR = \'RPG\';               // the family this menu was written against\n'
        + '//     const info = (typeof MvuHelper !== \'undefined\' && MvuHelper.engineInfo)\n'
        + '//         ? MvuHelper.engineInfo() : null;   // no host read = no engine = UNKNOWN\n'
        + '//     const type = info && info.type;\n'
        + '//     if (type === null || type === undefined) {\n'
        + '//         warnOnce(\'no engine type declared (\' + ((info && info.name) || \'no game engine\')\n'
        + '//             + \') — rendering anyway, paths unverified\');\n'
        + '//     } else if (type !== BUILT_FOR) {\n'
        + '//         warnOnce(\'built for \' + BUILT_FOR + \'; hosted: \' + type + \' (\' + info.name + \')\');\n'
        + '//     }\n'
        + '//     const exposes = (info && info.exposes) || {};\n'
        + '//     if (!exposes[\'equipment@1\']) warnOnce(\'equipment@1 not exposed — Items stays raw\');\n'
        + '//\n'
        + '// warnOnce is yours to write (a Set of messages already logged) — one line per problem,\n'
        + '// not one per render.\n\n'
        + '// Formatters written by hand, beside the layout\'s. A name the layout also computes is refused\n'
        + '// when the engine loads: two definitions of one cell\'s formatter would leave one of them\n'
        + '// silently dead.\n'
        + 'const HAND_FORMATTERS = {\n'
        + '};\n'
        + 'for (const name of Object.keys(HAND_FORMATTERS)) {\n'
        + '    if (Object.prototype.hasOwnProperty.call(LAYOUT_FORMATTERS, name)) {\n'
        + "        throw new Error('formatter \"' + name + '\" is written by hand in " + ENGINE_FILE + " AND computed by the layout (" + LAYOUT_FORMATTERS_FILE + ") — rename the hand-written one');\n"
        + '    }\n'
        + '}\n\n'
        + 'module.exports = {\n'
        + '    ENGINE_VERSION,\n'
        + '    formatters: { ...LAYOUT_FORMATTERS, ...HAND_FORMATTERS },\n'
        + '    // Actions are the WRITE half (authority §9.4): named entries a menu button invokes\n'
        + '    // through the host dispatcher. Each is (args, root) => patches — `args` is what the\n'
        + '    // button posted (its static args plus `scopePath`, the block item it sits in, \'\' at\n'
        + '    // root) and `root` the whole stat_data snapshot. Return an ARRAY of\n'
        + '    // { op: \'set\' | \'delete\', path: \'A.B.C\', value? }: the host applies it through the MVU\n'
        + '    // rail, and one malformed patch refuses the whole action. Actions never write directly.\n'
        + '    // Formatters read; actions write; nothing else.\n'
        + '    //\n'
        + '    // ▲ A PATCH REPLACES THE WHOLE MEMBER, so a LABELLED value keeps its label or the write\n'
        + '    // is refused. Many state members are [value, label] pairs; setting a bare value there is\n'
        + '    // a SHAPE change, the card\'s schema turns it down, and the old value stays — while the\n'
        + '    // host still logs the op it sent. setPatch (above) reads the label back and carries it,\n'
        + '    // so pass it the BARE value and use it for every set:\n'
        + '    //     exampleAction(args, root) {\n'
        + '    //         const path = \'Mainchar.Money\';\n'
        + '    //         return [setPatch(root, path, Number(getV(root, path, 0)) + (Number(args.amount) || 1))];\n'
        + '    //     },\n'
        + '    actions: {\n'
        + '    },\n'
        + '};\n';
}

// What an engine text actually exports: it is RUN, the way the host loads it, so a hand-edited engine
// is measured as it reads and a formatter that reaches the exports through a spread counts. A throw
// while loading is returned, never raised — the caller names it as the engine's error.
export function readEngineExports(engineText) {
    const box = { exports: {} };
    try { new Function('module', 'exports', String(engineText || ''))(box, box.exports); }
    catch (e) { return { ok: false, error: String((e && e.message) || e), formatters: [], actions: [] }; }
    const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : []);
    return { ok: true, error: '', formatters: keys(box.exports.formatters), actions: keys(box.exports.actions) };
}

// ── CSS scoping ──────────────────────────────────────────────────────────────

function splitTopLevel(css) {
    const rules = [];
    let depth = 0;
    let start = 0;
    let i = 0;
    while (i < css.length) {
        const ch = css[i];
        if (ch === '/' && css[i + 1] === '*') {
            const end = css.indexOf('*/', i + 2);
            i = end === -1 ? css.length : end + 2;
            continue;
        }
        if (ch === '"' || ch === "'") {
            i++;
            while (i < css.length && css[i] !== ch) i += css[i] === '\\' ? 2 : 1;
            i++;
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) {
                rules.push(css.slice(start, i + 1));
                start = i + 1;
            }
        }
        if (ch === ';' && depth === 0) {
            rules.push(css.slice(start, i + 1));
            start = i + 1;
        }
        i++;
    }
    if (css.slice(start).trim()) rules.push(css.slice(start));
    return rules;
}

function prefixSelector(selector, scope) {
    return selector.split(',').map((raw) => {
        const sel = raw.trim();
        if (!sel) return sel;
        if (/^(:root|html|body)$/i.test(sel)) return scope;
        if (/^(html|body)\b/i.test(sel)) return scope + sel.replace(/^(html|body)/i, '');
        return scope + ' ' + sel;
    }).join(', ');
}

// Mechanical, dumb and predictable: every selector gains the pack's scope, `:root` BECOMES it, and a
// construct that cannot carry a scope refuses the export rather than shipping a rule that restyles
// the host card.
export function scopePackCss(css, packId) {
    const scope = '[data-pack="' + packId + '"]';
    const errors = [];
    const warnings = [];
    const out = [];

    for (const rule of splitTopLevel(String(css || ''))) {
        const text = rule.trim();
        if (!text) continue;
        const brace = text.indexOf('{');
        const head = (brace === -1 ? text : text.slice(0, brace)).trim();
        // WHAT THIS RULE IS, decided on the head with its comments removed. A rule carries whatever
        // comment preceded it — splitTopLevel skips comments when counting braces but keeps them in
        // the text — so a head can begin `/* Gradient Animation */ @keyframes …`, and every at-rule
        // test below anchors on `@`. Measured 2026-09-06 on a live card: the keyframes and media
        // blocks were prefixed as if they were selectors, which is invalid, and the browser dropped
        // 7 of 128 rules; the @import REFUSAL was bypassed the same way, by a comment above the line.
        // Comments stay in the emitted text — they are legal there and a reader of the installed
        // entry deserves them — this decides only which branch the rule takes.
        const bareHead = head.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();

        if (/^@import\b/i.test(bareHead)) {
            errors.push('globalCss: "@import" cannot be scoped to a pack — it loads a whole stylesheet at the '
                + 'host card\'s level. Inline what it pulls in, then export again');
            continue;
        }
        if (brace === -1) { out.push(text); continue; }

        const body = text.slice(brace + 1, text.lastIndexOf('}'));
        if (/^@(media|supports|container|layer)\b/i.test(bareHead)) {
            const inner = scopePackCss(body, packId);
            inner.errors.forEach((e) => errors.push(e));
            inner.warnings.forEach((w) => warnings.push(w));
            out.push(head + ' {\n' + inner.css + '\n}');
            continue;
        }
        if (/^@(keyframes|font-face|counter-style|property)\b/i.test(bareHead)) {
            warnings.push('globalCss: "' + bareHead + '" is global by construction — its NAME is shared with the host '
                + 'card, so pick one that cannot collide');
            out.push(text);
            continue;
        }
        out.push(prefixSelector(head, scope) + ' {' + body + '}');
    }

    return { css: out.join('\n'), errors, warnings };
}

// ── locale ───────────────────────────────────────────────────────────────────

// `pack.<id>.` in front of every key: the pack's locale lands beside the host card's own, and the
// two must not be able to overwrite each other.
export function scopeLocaleKeys(staticLocale, packId) {
    const prefix = 'pack.' + packId + '.';
    const out = {};
    for (const [key, value] of Object.entries(staticLocale || {})) {
        out[key.startsWith(prefix) ? key : prefix + key] = value;
    }
    return out;
}

// ── validation ───────────────────────────────────────────────────────────────

// The version shape mvu-helper accepts for every artifact: two or three dot-separated whole numbers ("1.2",
// "5.116.3"). mvu-helper orders versions number by number and refuses any other shape at import, so the
// export refuses it first, where the author can still fix it.
const VERSION_SHAPE = /^\d+\.\d+(\.\d+)?$/;

// Reads the ASSEMBLED pack the way the installer will, so a hand-edited file is judged on what it
// says rather than on what the builder meant.
export function validatePackDraft(pack) {
    const errors = [];
    const warnings = [];

    if (pack.format !== PACK_FILE_FORMAT) errors.push('"format" must be "' + PACK_FILE_FORMAT + '"');
    if (pack.packType !== 'statusmenu') errors.push('"packType" must be "statusmenu"');
    if (!pack.name || !String(pack.name).trim()) errors.push('"name" is required — it is the display name in the library list');
    if (!pack.description || !String(pack.description).trim()) errors.push('"description" is required — one line, shown while picking');
    if (typeof pack.version !== 'string' || !VERSION_SHAPE.test(pack.version)) {
        errors.push('"version" must be M.m or M.m.r — numbers only, e.g. "1.2" or "1.2.0" (got ' + JSON.stringify(pack.version)
            + '). mvu-helper compares versions number by number, so it refuses a version like "v1.2" or "1.2-beta"');
    }
    const declaration = (pack.layout && typeof pack.layout === 'object' && !Array.isArray(pack.layout)) ? pack.layout : null;
    if (!declaration) errors.push('"layout" must be the renderer declaration object — { kind, format, tabs, … }');
    if (declaration && !declaration.kind) errors.push('layout.kind is required — it names the renderer that draws this layout');
    if (declaration && !declaration.format) errors.push('layout.format is required — it versions that renderer schema');

    const id = String(pack.id || '');
    if (!id) errors.push('"id" is required — it rides lorebook needles, the CSS scope and locale keys');
    else if (!KEBAB.test(id)) errors.push('"id" must be kebab-case (lowercase letters, digits, single hyphens) — got "' + id + '"');
    else if (id === 'registry') errors.push('the id "registry" is reserved — it collides with the pack registry entry');

    const tabs = declaration && Array.isArray(declaration.tabs) ? declaration.tabs : null;
    if (!tabs || !tabs.length) errors.push('layout.tabs must carry at least one tab');

    const engine = readEngineExports(pack.engine);
    if (!engine.ok) errors.push('the engine threw while loading: ' + engine.error + ' — no formatter can answer until it loads');
    const exported = new Set(engine.formatters);
    const referenced = new Map();
    walkLayoutNodes(tabs || [], (node, path) => {
        if (typeof node.customLogic === 'string' && node.customLogic.trim()) {
            errors.push(path + ': "customLogic" is forbidden in a pack layout — that code belongs in the '
                + 'StatusMenu Engine, reached by a formatter name');
        }
        const map = node.formatters;
        if (!map || typeof map !== 'object' || Array.isArray(map)) return;
        for (const [field, name] of Object.entries(map)) {
            if (typeof name !== 'string' || !name.trim()) {
                errors.push(path + ': formatters.' + field + ' must be an export NAME');
                continue;
            }
            referenced.set(name.trim(), path + ' (' + field + ')');
            if (!exported.has(name.trim())) {
                errors.push(path + ': formatters.' + field + ' names "' + name.trim()
                    + '", which the engine does not export — that cell would render raw forever');
            }
        }
    });

    for (const name of exported) {
        if (!referenced.has(name)) warnings.push('the engine exports formatter "' + name + '" that no cell uses');
    }

    return { errors, warnings };
}

// ── assembly ─────────────────────────────────────────────────────────────────

// The builder holds its sample state parsed, its saved project file holds the same thing as text.
function readSampleState(project) {
    if (project.mvuDataParsed && typeof project.mvuDataParsed === 'object') return project.mvuDataParsed;
    if (typeof project.mvuData === 'string' && project.mvuData.trim()) {
        try { return JSON.parse(project.mvuData); }
        catch (e) { return null; }   // EXPECTED: a project saved with unparseable sample text; the caller is told below
    }
    if (project.mvuData && typeof project.mvuData === 'object') return project.mvuData;
    return null;
}

// ── the artifact archives (B6) ───────────────────────────────────────────────
// Both archives are RE-SLICINGS of buildStatusMenuPack's own result — the pack is assembled once,
// and the archive only decides which piece lands in which file of the §28 source folder. That is
// what keeps this lane and the single-file emit incapable of disagreeing. The archives slice the
// pack's CONTENT; the file adds the shell on top of exactly that content (packFileWithShell below).
//
// `engineFiles` is buildStatusMenuPack's list, in load order: the generated layoutFormatters.cjs, then
// the starter statusMenuLogic.cjs. Joined, they are exactly `pack.engine`.
//
// BOOTSTRAP — the first export, into an EMPTY statusmenu/ only: the folder's other possible origin
// is mvu-helper's blank-pack skeleton, and neither is a version of the other (workflow plan §2.7).
// pack.json is the pack MINUS the two sections that become files, PLUS engineOrder naming the engine
// files in load order — a keys-based slice, so a future identity field flows through untouched.
//
// The LAST member is the pack-host SHELL (statusmenu-shell-export.js): the regex that draws the
// menu at all. A workspace without it assembles into a pack whose layout and engine are perfect and
// which renders NOTHING on the card, because mvu-helper hosts the engine and resolves formatters but
// never draws — so the shell is required here rather than optional. It is the only member carrying no
// project data, and the same file for every pack.
export function bootstrapArchiveMembers(pack, shellRegexScript, engineFiles) {
    if (!shellRegexScript || typeof shellRegexScript !== 'object') {
        throw new Error('bootstrapArchiveMembers needs the pack-host shell regex script — a workspace with no regex/StatusMenu.json renders nothing on the card (statusmenu-shell-export.js)');
    }
    if (!Array.isArray(engineFiles) || !engineFiles.length) {
        throw new Error('bootstrapArchiveMembers needs the engine files buildStatusMenuPack returned — a workspace with no engine/ has no formatters for its layout');
    }
    const { engine, layout, ...identity } = pack;
    return [
        { path: 'pack.json', text: JSON.stringify({ ...identity, engineOrder: engineFiles.map((f) => f.name) }, null, 2) + '\n' },
        { path: 'layout/layout.json', text: JSON.stringify(layout, null, 2) + '\n' },
        ...engineFiles.map((f) => ({ path: 'engine/' + f.name, text: f.text })),
        shellArchiveMember(shellRegexScript),
    ];
}

// REFRESH — every export after: the three files this app generates (§3.3), and so always safe to
// extract over a live workspace. The layout, and layoutFormatters.cjs beside it, because a layout names
// its formatters and the generated file is where they live — the two change together or not at all.
// And the pack-host SHELL, the regex that draws the menu: it is built from this app's runtime and the
// project's Global CSS, so a renderer change or a CSS edit reaches the workspace with the next refresh
// instead of only with a bootstrap. No pack.json (identity now lives in the workspace and may have been
// edited there); above all NO statusMenuLogic.cjs — by then it has been the developer's hand-written
// file for weeks, and an archive carrying a regenerated one would eat it on extract. BV15 pins this
// member list.
export function refreshArchiveMembers(pack, shellRegexScript, engineFiles) {
    if (!shellRegexScript || typeof shellRegexScript !== 'object') {
        throw new Error('refreshArchiveMembers needs the pack-host shell regex script — a refresh without it leaves the workspace drawing the menu with an older runtime (statusmenu-shell-export.js)');
    }
    const generated = (Array.isArray(engineFiles) ? engineFiles : []).find((f) => f.name === LAYOUT_FORMATTERS_FILE);
    if (!generated) {
        throw new Error('refreshArchiveMembers needs the generated ' + LAYOUT_FORMATTERS_FILE + ' — a layout refreshed without it names formatters the workspace does not have');
    }
    return [
        { path: 'layout/layout.json', text: JSON.stringify(pack.layout, null, 2) + '\n' },
        { path: 'engine/' + LAYOUT_FORMATTERS_FILE, text: generated.text },
        shellArchiveMember(shellRegexScript),
    ];
}

// ── the single-file pack, as it SHIPS (D7) ───────────────────────────────────
// The same pack the archives slice, plus the one thing a file has to carry that a WORKSPACE keeps in
// a folder: the pack-host shell, the regex whose replaceString IS the menu. `regex` on a statusmenu
// pack has always been part of the file format — "the regexes that ARE the menu" — and this emit
// simply never filled it, so a downloaded pack validated clean, installed clean, and drew mvu-helper's
// placeholder instead of the author's menu ("this pack ships no menu; build one with MVU Status Menu
// Builder"). Perfect layout, perfect engine, nothing on screen.
//
// Same throw as bootstrapArchiveMembers and for the same reason: a caller that has no shell has no
// pack file to write, and returning one anyway would ship that silence again. The engine here is the
// generated formatters plus the STARTER — this app never reads an authored engine back (§B.7b), so a
// file emitted from the browser computes every cell the layout's formulas describe and has no actions;
// the workspace lane is where the developer's engine joins it.
export function packFileWithShell(pack, shellRegexScript) {
    if (!pack || typeof pack !== 'object') throw new Error('packFileWithShell needs a built pack');
    if (!shellRegexScript || typeof shellRegexScript !== 'object') {
        throw new Error('packFileWithShell needs the pack-host shell regex script — a pack file without it installs a menu that renders NOTHING on the card (statusmenu-shell-export.js)');
    }
    return { ...pack, regex: [shellRegexScript] };
}

// Builds the file. `project` is the builder's own state (layout, templates, CSS, locale, collection
// paths); `meta` is what the export UI collected. Returns the pack plus every reason it would be
// refused — the caller shows them and does NOT get a half-built file to ship.
export function buildStatusMenuPack(project, meta) {
    const errors = [];
    const warnings = [];

    const wanted = meta.tabIds && meta.tabIds.length
        ? (project.layout || []).filter((t) => meta.tabIds.includes(t.id))
        : (project.layout || []);
    if (meta.tabIds && meta.tabIds.length && wanted.length !== meta.tabIds.length) {
        errors.push('some picked tabs are not in the layout any more — reopen the tab picker');
    }
    if (!wanted.length) errors.push('pick at least one tab to export');

    const id = String(meta.id || derivePackId(meta.name)).trim();
    const version = String(meta.version || '1.0').trim();

    const lifted = liftCustomLogic(wanted, meta.formatterNames);
    lifted.warnings.forEach((w) => warnings.push(w));

    // What a click will POST to the host is refused HERE by cell path — the dispatcher normalises args
    // and would accept them. An ActionButton posts its name and args (B5 step 1); a list cell's args
    // ride every action its rows post (B5 step 2), under the same rules.
    walkLayoutNodes(lifted.layout, (node, path) => {
        if (node.type === 'ActionButton') {
            const problem = actionNameProblem(node.action) || actionArgsProblem(node.args);
            if (problem) errors.push(path + ': ActionButton ' + problem);
        } else if (node.args !== undefined) {
            const problem = actionArgsProblem(node.args);
            if (problem) errors.push(path + ': ' + (node.type || 'cell') + ' ' + problem);
        }
        // The verbs a list cell puts on every row (D8) — the same refusal-by-path, so an author
        // sees the cell, not a runtime that quietly drew nothing.
        if (node.rowActions !== undefined) {
            const problem = rowActionsProblem(node.rowActions);
            if (problem) errors.push(path + ': ' + (node.type || 'cell') + ' ' + problem);
        }
    });

    // Judge each body by RUNNING it, not by its card type. The project's own sample state is the
    // only honest way to say whether a lifted body still makes sense in its new scope.
    const sample = readSampleState(project);
    if (sample) checkFormattersAgainstSample(lifted.formatters, sample).forEach((w) => warnings.push(w));
    else if (lifted.formatters.length) {
        warnings.push('this project carries no sample state, so the ' + lifted.formatters.length
            + ' lifted formatter(s) could not be run against anything — load your MVU data in the Data tab to have them checked');
    }

    const styles = scopePackCss(project.globalCss, id || 'pack');
    styles.errors.forEach((e) => errors.push(e));
    styles.warnings.forEach((w) => warnings.push(w));

    const usedTemplates = new Set();
    walkLayoutNodes(lifted.layout, (node) => {
        if (node.customTemplateName) usedTemplates.add(node.customTemplateName);
    });
    const templates = (project.customTemplates || []).filter((t) => usedTemplates.has(t.name));

    const lorebookKeys = new Set();
    walkLayoutNodes(lifted.layout, (node) => {
        if (node.sourceType === 'lorebook' && node.lorebookKey) lorebookKeys.add(node.lorebookKey);
    });
    if (lorebookKeys.size) {
        warnings.push('this layout reads ' + lorebookKeys.size + ' lorebook entr(ies) — ' + [...lorebookKeys].join(', ')
            + '. The builder cannot read the card\'s book, so the pack ships none of them: add them to "entries" '
            + 'before publishing, or those cells resolve to nothing on someone else\'s card');
    }

    // The two engine files, in load order; joined they are the one engine the pack ships.
    const engineFiles = [
        { name: LAYOUT_FORMATTERS_FILE, text: buildLayoutFormattersText(lifted.formatters) },
        { name: ENGINE_FILE, text: buildEngineText(id || 'pack', version) },
    ];

    const pack = {
        format: PACK_FILE_FORMAT,
        packType: 'statusmenu',
        id,
        name: String(meta.name || '').trim(),
        description: String(meta.description || '').trim(),
        version,
        builtWith: String(meta.builtWith || 'MvuStatMenuBuilder').trim(),
        engine: engineFiles.map((f) => f.text).join(''),
        layout: {
            kind: LAYOUT_KIND,
            format: LAYOUT_FORMAT,
            tabs: lifted.layout,
            globalCss: styles.css,
            staticLocale: scopeLocaleKeys(project.staticLocale, id || 'pack'),
            collectionPaths: Array.from(project.collectionPaths || []),
        },
    };
    if (meta.targetsPackId && String(meta.targetsPackId).trim()) pack.targetsPackId = String(meta.targetsPackId).trim();
    if (templates.length) pack.layout.customTemplates = templates;

    const verdict = validatePackDraft(pack);
    verdict.errors.forEach((e) => errors.push(e));
    verdict.warnings.forEach((w) => warnings.push(w));

    return {
        ok: errors.length === 0,
        pack: errors.length === 0 ? pack : null,
        errors,
        warnings,
        lifted: { formatters: lifted.formatters.map((f) => ({ name: f.name, path: f.path, field: f.field })), labels: lifted.labels },
        engineFiles,
    };
}
