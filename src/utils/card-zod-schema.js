// card-zod-schema.js — the uploaded card's OWN Zod registration, read with zod itself into standard
// JSON Schema (eventpack_revisit §1). The event builder's authority for WHICH FIELDS exist at a path,
// their types, whether a shape is open or closed, and which fields are labeled tuples.
//
// NO PARSER OF OUR OWN. Every MVU card ships its schema as a tavern_helper script that calls
// `registerMvuSchema(SomeZod)`; the same zod that runs it in the game runs it here, and zod 4's
// `z.toJSONSchema` exports what it built. Fidelity is by construction — same zod, same script, the
// same root rewrap mvu_zod applies at runtime — and a dialect change in the card's script is zod's
// problem, never this file's. Precedent for evaluating card-supplied text: mvu-helper runs the whole
// engine bundle through `new Function`; here the text is the author's own upload, in the author's
// own browser.
//
// What the export looks like (zod 4, io: 'input'):
//   a plain object      { type: 'object', properties: {…} }                         closed: no additionalProperties
//   a passthrough one   { type: 'object', properties: {…}, additionalProperties: {} } open
//   a record            { type: 'object', propertyNames: {type:'string'}, additionalProperties: <member schema> }
//   a labeled tuple     { type: 'array', prefixItems: [<value>, {type:'string'}], maxItems: 2, default: [v, label] }
//   a scalar            { type: 'number' | 'string' | 'boolean', default }
// Nothing here knows a genre's roots or fields: every path is looked up, never named.

import { z } from 'zod';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const message = (e) => (e && e.message ? e.message : String(e));

// The script's globals, as the card's runtime provides them: `z`, lodash as `_`, jQuery's ready
// wrapper `$(fn)`, and `registerMvuSchema`. Lodash is NOT provided — a schema is declarative, and a
// script that reaches for `_` at registration time is refused with the property it reached for, so the
// author sees exactly what this reader lacks instead of a bare TypeError.
const lodashRefusal = new Proxy({}, {
    get(_t, prop) { throw new Error('the schema script uses lodash (`_.' + String(prop) + '`), which the schema reader does not provide'); },
});

// ---- finding and running the script ---------------------------------------------------------

/** The tavern_helper script that registers the card's schema — found by what it CALLS, never by name. */
function findSchemeScript(card) {
    const data = (card && card.data) || card || {};
    const helper = data.extensions && data.extensions.tavern_helper;
    const scripts = helper && Array.isArray(helper.scripts) ? helper.scripts : [];
    const hit = scripts.find((s) => s && typeof s.content === 'string' && s.content.includes('registerMvuSchema('));
    if (!hit) {
        return { ok: false, reason: 'this card carries no Zod schema script (no tavern_helper script calls registerMvuSchema) — without it the builder cannot know which fields a write may set' };
    }
    return { ok: true, source: hit.content, name: String(hit.name || '') };
}

/** Evaluate a Scheme script with the real zod and export the registered schema as JSON Schema. */
export function schemaTreeFromScript(source) {
    const src = String(source || '').replace(/^import .*$/gm, '').replace(/^export\s+/gm, '');
    let captured = null;
    let registrations = 0;
    const register = (s) => { registrations++; captured = typeof s === 'function' ? s() : s; };
    try {
        new Function('z', '_', '$', 'registerMvuSchema', src)(z, lodashRefusal, (fn) => (typeof fn === 'function' ? fn() : undefined), register);
    } catch (e) {
        return { ok: false, reason: 'the card\'s Zod schema script could not be evaluated: ' + message(e) };
    }
    if (!registrations) return { ok: false, reason: 'the card\'s Zod schema script never called registerMvuSchema — nothing was registered' };
    if (!captured || typeof captured !== 'object') return { ok: false, reason: 'the card\'s Zod schema script registered ' + typeof captured + ', not a schema' };
    // the same rewrap the runtime bridge (mvu_zod) applies: a top-level z.object becomes loose, so
    // roots the script never names pass through — a prefault-wrapped root is left as registered
    const schema = captured instanceof z.ZodObject ? z.looseObject(captured.shape) : captured;
    let tree;
    try {
        tree = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    } catch (e) {
        return { ok: false, reason: 'the card\'s Zod schema cannot be exported as JSON Schema: ' + message(e) };
    }
    if (!isPlainObject(tree) || !isPlainObject(tree.properties)) {
        return { ok: false, reason: 'the card\'s Zod root is not an object schema (got ' + (tree && tree.type) + ') — stat_data must be described as an object' };
    }
    return { ok: true, tree };
}

/** One call: card → { ok, tree } | { ok: false, reason }. */
export function readCardSchema(card) {
    const found = findSchemeScript(card);
    if (!found.ok) return found;
    return schemaTreeFromScript(found.source);
}

// ---- reading the tree ------------------------------------------------------------------------

/** A record (z.record): a member schema under additionalProperties and no fixed properties. */
export function isRecordNode(node) {
    return isPlainObject(node) && node.type === 'object' && !isPlainObject(node.properties)
        && isPlainObject(node.additionalProperties) && (isPlainObject(node.propertyNames) || Object.keys(node.additionalProperties).length > 0);
}
/** An object with fixed properties that ALSO accepts unknown keys (passthrough / loose). */
export function isOpenNode(node) {
    return isPlainObject(node) && node.type === 'object' && isPlainObject(node.properties) && isPlainObject(node.additionalProperties);
}
/** A labeled MVU tuple `[value, "Label"]`, or null. */
export function tupleOf(node) {
    if (!isPlainObject(node) || node.type !== 'array' || !Array.isArray(node.prefixItems) || node.prefixItems.length !== 2) return null;
    const [value, label] = node.prefixItems;
    if (!isPlainObject(label) || label.type !== 'string') return null;
    return {
        valueType: isPlainObject(value) ? String(value.type || 'string') : 'string',
        label: Array.isArray(node.default) && node.default.length === 2 ? String(node.default[1] ?? '') : '',
    };
}
/** The member schema a path's records share: the record's member, or the node itself for a plain object. */
export function memberOf(node) {
    return isRecordNode(node) ? node.additionalProperties : node;
}

/** Walk a dotted path. A `*` segment, or any segment under a record, steps into the record's member. */
export function nodeAtPath(tree, dotted) {
    let node = tree;
    for (const seg of String(dotted || '').split('.').filter(Boolean)) {
        if (!isPlainObject(node)) return null;
        if (seg !== '*' && isPlainObject(node.properties) && isPlainObject(node.properties[seg])) { node = node.properties[seg]; continue; }
        if (isRecordNode(node)) { node = node.additionalProperties; continue; }       // a record KEY (or `*`) — one member deep
        return null;
    }
    return isPlainObject(node) ? node : null;
}

/** The fields of an object node: name, type, tuple shape, enum values, default. */
export function fieldsOf(objectNode) {
    if (!isPlainObject(objectNode) || !isPlainObject(objectNode.properties)) return [];
    return Object.keys(objectNode.properties).map((name) => {
        const prop = objectNode.properties[name];
        const tuple = tupleOf(prop);
        return {
            name,
            type: tuple ? tuple.valueType : String((isPlainObject(prop) && prop.type) || 'string'),
            tuple,
            enumValues: isPlainObject(prop) && Array.isArray(prop.enum) ? prop.enum.slice() : null,
            defaultValue: isPlainObject(prop) ? prop.default : undefined,
        };
    });
}

/** Every WHEN-DSL LHS path the schema declares: leaves, objects (has() targets), and for a record
 *  the `<path>.*.<field>` forms its members share. Declared, not seeded — a record the seed leaves
 *  empty still offers its member fields, which is what a stamp field like `LastUpdated` needs. */
export function schemaPaths(tree, maxDepth = 8) {
    const out = [];
    const walk = (node, prefix, depth) => {
        if (depth > maxDepth || !isPlainObject(node)) return;
        if (isRecordNode(node)) {
            walk(node.additionalProperties, prefix + '.*', depth + 1);
            return;
        }
        if (!isPlainObject(node.properties)) return;
        for (const name of Object.keys(node.properties)) {
            const path = prefix ? prefix + '.' + name : name;
            const prop = node.properties[name];
            out.push(path);
            if (tupleOf(prop)) continue;                                   // a leaf
            if (isRecordNode(prop) || (isPlainObject(prop) && isPlainObject(prop.properties))) walk(prop, path, depth + 1);
        }
    };
    walk(tree, '', 0);
    return out;
}
