// A label is plain text, except a RichText block's (lbl_rt_*): that one is HTML wherever it is drawn —
// the builder preview, a formatter's result, the generator's own markup — so its label is too.
function initLabels() {
     for (const [key, val] of Object.entries(LOCALE)) {
         if (key.startsWith('lbl_')) {
             const el = document.getElementById(key);
             if (!el) continue;
             if (key.startsWith('lbl_rt_')) el.innerHTML = val;
             else el.textContent = val;
         }
     }
}

const isTuple = (v) => Array.isArray(v) && v.length >= 2 && typeof v[1] === 'string';
const tupleVal = (v) => isTuple(v) ? v[0] : v;

// --- Helper Functions ---
// Lodash: the frame's OWN first, the parent's only inside a try. In a contained frame (mvu-helper's
// sandboxed mount) the origin is opaque and reading ANY property of window.parent throws; this line
// runs at module top level, so an unguarded parent read here would kill every helper below it and the
// whole menu with them. TavernHelper's frame sets window._ to the parent's lodash itself, so the
// own-window branch is the same lodash there.
const _ = (() => {
    if (typeof window._ !== 'undefined' && window._) return window._;
    try {
        return (window.parent && window.parent !== window && window.parent._) || null;
    } catch (e) {
        console.info('[MZSMB] parent lodash is not reachable (contained frame) - using the built-in path reader:', e && e.message);
        return null;
    }
})();

const getRaw = (obj, path, def) => {
    if (!obj) return def;
    if (!path) return obj;
    
    // Native Lodash support (Robust path handling)
    if (_ && _.get) {
        return _.get(obj, path, def);
    }

    // Fallback
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur === undefined || cur === null) return def;
        cur = cur[p];
    }
    return (cur === undefined || cur === null) ? def : cur;
};

const getV = (obj, path, def) => {
     const val = getRaw(obj, path, def);
     if (isTuple(val)) return val[0];
     return val;
};

const getListData = (obj, path, def) => {
    const raw = getRaw(obj, path, def);
    
    // 1. Explicit Schema Override: If user marked as Collection (Record), force it to be a List.
    // Schema paths start with '.', so we check both 'path' and '.path'
    if (COLLECTION_PATHS.has(path) || COLLECTION_PATHS.has('.' + path)) {
        return raw;
    }

    // 2. Strict Mode: No Heuristics. 
    // If it's a tuple [List, Label], we return it as-is.
    // User must target 'path.0' or use Schema to control structure.
    return raw;
};

const getL = (obj, path, def) => {
    const val = getRaw(obj, path, def);
    if (isTuple(val)) return val[1];
    return def; 
};

const formatValue = (val) => {
    if (val === null || val === undefined) return LOCALE.empty_none;
    if (isTuple(val)) return formatValue(tupleVal(val));
    if (Array.isArray(val)) return JSON.stringify(val);
    if (typeof val === 'object') {
        if (val.Desc !== undefined) return formatValue(val.Desc);
        if (val.description !== undefined) return formatValue(val.description);
        if (val.name !== undefined) return formatValue(val.name);
        return null; 
    }
    return val;
};

const tupleLabel = (v, fallback) => isTuple(v) ? (v[1] || fallback) : fallback;

const setVal = (obj, path, newVal) => {
    const raw = getRaw(obj, path);
    if (isTuple(raw)) {
        if (_ && _.set) _.set(obj, path, [newVal, raw[1]]);
        else {
            const parts = path.split('.');
            let cur = obj;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
            cur[parts[parts.length - 1]] = [newVal, raw[1]];
        }
    } else {
        if (_ && _.set) _.set(obj, path, newVal);
        else {
            const parts = path.split('.');
            let cur = obj;
            for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
            cur[parts[parts.length - 1]] = newVal;
        }
    }
};

// The menu's palette, read from the project's Global CSS (the `:root` variables) at call time. The
// modals mount into the PARENT document, where this frame's stylesheet cannot reach, so their look is
// resolved here and written inline — every colour they carry derives from these five. A variable the
// sheet does not set is the sheet's defect: surfaced once, then left visibly unset (`inherit` /
// `transparent`), never papered over with a palette of the runtime's own.
const _menuThemeWarned = new Set();
function readMenuTheme() {
    const cssv = getComputedStyle(document.documentElement);
    const read = (name, whenMissing) => {
        const value = cssv.getPropertyValue(name).trim();
        if (value) return value;
        if (!_menuThemeWarned.has(name)) {
            _menuThemeWarned.add(name);
            console.warn('[MZSMB][theme] ' + name + ' is not set by the project\'s Global CSS (:root) — the modals render without it');
        }
        return whenMissing;
    };
    const accent = read('--accent-primary', 'inherit');
    return {
        accent,
        background: read('--background-card', 'transparent'),
        text: read('--text-primary', 'inherit'),
        textSecondary: read('--text-secondary', 'inherit'),
        border: read('--border-color', 'currentColor'),
        // the accent at a fraction of its strength: button fills, dividers, hover washes
        tint: (percent) => 'color-mix(in srgb, ' + accent + ' ' + percent + '%, transparent)',
    };
}
