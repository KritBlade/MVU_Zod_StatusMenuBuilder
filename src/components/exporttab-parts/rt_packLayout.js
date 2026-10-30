// --- StatusMenu Pack layout renderer (Track B / B2, hybrid) ---
//
// The card's own layout stays BAKED. This part adds tabs from an INSTALLED StatusMenu Pack: at menu
// init it reads the pack registry and the pack's layout entry from the lorebook, renders the
// declaration's tabs through the same generators the export was baked with, and appends them to the
// tab nav — a pack tab appears with zero card rebuild, and disappears the render after its entry is
// removed.
//
// Formatter-driven cells resolve through mvu-helper: THIS side owns the request walker (which cells
// exist, and what `stat` means for each — a cell inside a collection resolves per ITEM, the item
// identity riding in its cell id), mvu-helper resolves the declared scope paths and routes ONE
// Worker batch per stat update. Values render synchronously from the returned map; a formatter that
// does not answer leaves its cell showing the raw binding (warn lane, never a refusal).
//
// Carries `export` for its pure decision functions — legal and inert inside the exported document's
// single <script type="module">, and what lets node run them (tools/test-pack-layout.mjs), exactly
// like rt_htmlGenerators.js.

// The wire to mvu-helper's dispatcher. PUBLISHED — the contract is mvu-helper's
// `plans/executed/gamelogic-pack-v2.md` §9a, and this runtime is one client of it, not its owner.
// The cross-repo test pins all THREE spellings (that doc, mvu-helper's constant, this one).
export const PACK_FORMATTER_MESSAGE = 'mvu-helper:statusmenu-formatters';

// The two lorebook entry comments this runtime READS. mvu-helper WRITES them — `menuRegistryComment()`
// and `menuLayoutComment(id)` in its statusmenu-pack-core.js — and neither repo can import the other,
// so the spelling is restated here and pinned byte-identical by the cross-repo test, the same
// discipline the wire constant above gets and for the same reason: a second spelling of a published
// name is a second thing that can drift, and a drifted needle finds no entry, so the menu draws an
// empty frame reporting `packs found=1 rendered=0 skipped=1` rather than failing (live, ArtificKoi,
// 2026-09-04, when the layout needle was renamed on the writer side alone).
//
// Both sides lower-case before matching, so case is not part of the contract — the spelling is. And
// the spelling is frozen by every menu already exported: this file is built INTO the card's regex,
// so a rename needs a builder release AND a re-export of every shell, never a tidiness pass.
export const PACK_REGISTRY_NEEDLE = '[StatusMenuPack:Registry]';
export function packLayoutNeedle(packId) {
    return '[StatusMenuPack:' + packId + '] (Layout)';
}

// The renderer sets this part draws. A declaration naming any other kind renders a FALLBACK tab
// naming the kind (obviously wrong beats silently missing), never breaks the menu.
export const PACK_SUPPORTED_KINDS = ['tabbed-grid'];

// ── pure decisions (node-testable) ───────────────────────────────────────────

// The registry entry's content: '#'-comment lines, then JSON. Returns { activeMenuId } or null.
export function parsePackRegistryContent(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const jsonText = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n').trim();
    try {
        const obj = JSON.parse(jsonText);
        if (obj && typeof obj.activeMenuId === 'string' && obj.activeMenuId) return { activeMenuId: obj.activeMenuId };
        return null;
    } catch (e) {
        console.warn('[MZSMB][pack] the StatusMenu registry entry is not parseable JSON — no pack renders:', e.message);
        return null;
    }
}

// The layout entry's content: the renderer declaration object, installed whole.
export function parsePackLayoutContent(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'the pack layout entry is missing or empty' };
    let declaration;
    try { declaration = JSON.parse(text); }
    catch (e) { return { ok: false, reason: 'the pack layout entry is not parseable JSON: ' + e.message }; }
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
        return { ok: false, reason: 'the pack layout entry must be the renderer declaration object ({ kind, format, tabs, … })' };
    }
    return { ok: true, declaration };
}

// Every node of the declaration's tabs that carries executable text. The layout is 100% declarative,
// and a body in it means the lift was bypassed — the body belongs in the StatusMenu Engine as a named
// formatter, so a layout still carrying one would render a cell that silently answers nothing. The
// layout entry is hand-editable, so finding one refuses the whole pack: the render half of the
// customLogic fence.
export function findPackCustomLogic(tabs) {
    const sites = [];
    const walkCards = (cards, path) => {
        (cards || []).forEach((card, i) => {
            const here = path + '/cards/' + i;
            if (typeof card.customLogic === 'string' && card.customLogic.trim()) sites.push(here);
            if (Array.isArray(card.cards)) walkCards(card.cards, here);
        });
    };
    (tabs || []).forEach((tab, ti) => {
        (tab.blocks || []).forEach((block, bi) => {
            const here = '/tabs/' + ti + '/blocks/' + bi;
            if (typeof block.customLogic === 'string' && block.customLogic.trim()) sites.push(here);
            walkCards(block.cards, here);
        });
    });
    return sites;
}

// The one verdict: render, raw (unknown kind — fallback tab), or refuse (executable text found).
export function packRenderDecision(declaration, supportedKinds) {
    const kind = declaration && declaration.kind;
    if (typeof kind !== 'string' || !kind) {
        return { mode: 'raw', reason: 'the declaration names no "kind" — nothing says which renderer draws it' };
    }
    if (!(supportedKinds || []).includes(kind)) {
        return { mode: 'raw', reason: 'unknown layout kind "' + kind + '" — this menu renders ' + (supportedKinds || []).join('/') + ' only' };
    }
    if (!Array.isArray(declaration.tabs) || !declaration.tabs.length) {
        return { mode: 'raw', reason: 'the declaration carries no tabs' };
    }
    const logicSites = findPackCustomLogic(declaration.tabs);
    if (logicSites.length) {
        return { mode: 'refuse', reason: 'the layout carries customLogic at ' + logicSites.join(', ') + ' — a pack layout is 100% declarative, and a body here would execute' };
    }
    return { mode: 'render', reason: '' };
}

// Prefix every id in the pack's tabs so nothing collides with the card's own DOM: the card and the
// pack both legitimately own a "tab-1", and tab/block/card ids ride element ids, template ids and
// the block pager's state keys.
export function namespacePackTabs(tabs, packId) {
    const prefix = 'pk-' + String(packId || 'pack') + '-';
    const nsCards = (cards) => (cards || []).map((c) => {
        const copy = { ...c, id: prefix + String(c.id || '') };
        if (Array.isArray(c.cards)) copy.cards = nsCards(c.cards);
        return copy;
    });
    return (tabs || []).map((t) => ({
        ...t,
        id: prefix + String(t.id || ''),
        blocks: (t.blocks || []).map((b) => ({ ...b, id: prefix + String(b.id || ''), cards: nsCards(b.cards) })),
    }));
}

// Which tab to activate once the pack's tabs are appended: the first pack tab, but ONLY when the
// document has no active tab. The production regex is a SHELL — runtime + nav, zero baked tabs
// (pack-authoring-plan §B.7d) — and without this it would sit blank until a click. A baked first tab,
// where one exists, stays the active one.
export function packTabToActivate(hasActiveTab, tabs) {
    if (hasActiveTab || !Array.isArray(tabs) || !tabs.length) return '';
    return 'tab-' + String(tabs[0].id);
}

// renderBlock's own item rule, restated: which children of a collection value are ITEMS.
export function packEnumerateItems(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.entries(value)
        .filter(([k, v]) => k !== '$meta' && k !== '$key' && k !== 'template' && v && typeof v === 'object' && !Array.isArray(v))
        .map(([k]) => k);
}

// U+0001 joins every composite key — no path, name or field can contain it, so no two keys can
// forge each other. The HOST joins its reply-map keys with the same character.
export const PACK_KEY_SEP = String.fromCharCode(1);

export function packFormatterValueKey(formatterName, scopePath) {
    return String(formatterName) + PACK_KEY_SEP + String(scopePath || '');
}

// THE WALKER — B2's half of the pre-pass seam. Walks the pack's tabs against the CURRENT state and
// plans one request per formatter per scope:
//   • cell in an unmapped block            → scopePath ''            (stat = the whole state)
//   • cell in a mapped, non-collection block → scopePath = blockKey  (stat = that object)
//   • cell in a mapped COLLECTION block    → one request PER ITEM, scopePath = blockKey.itemKey
// Identical (formatter, scope) pairs dedupe to one request. The host resolves the paths and routes
// the calls; it reads no layout structure — this list is the only thing that crosses.
export function planPackFormatterRequests(tabs, statData, collectionPaths) {
    const has = (k) => !!collectionPaths && (collectionPaths.has(k) || collectionPaths.has('.' + k));
    const seen = new Set();
    const requests = [];
    const add = (formatterName, field, scopePath) => {
        const key = packFormatterValueKey(formatterName, scopePath) + PACK_KEY_SEP + field;
        if (seen.has(key)) return;
        seen.add(key);
        requests.push({ cellId: 'f:' + formatterName + '@' + (scopePath || 'root'), field, formatterName, scopePath });
    };
    const readPath = (obj, path) => {
        let cur = obj;
        for (const seg of String(path || '').split('.')) {
            if (!seg) return cur;
            if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
            cur = cur[seg];
        }
        return cur;
    };
    const walkCards = (cards, scopes) => {
        (cards || []).forEach((card) => {
            const map = card.formatters;
            if (map && typeof map === 'object' && !Array.isArray(map)) {
                for (const [field, name] of Object.entries(map)) {
                    if (typeof name !== 'string' || !name.trim()) continue;
                    for (const scopePath of scopes) add(name.trim(), field, scopePath);
                }
            }
            if (Array.isArray(card.cards)) walkCards(card.cards, scopes);
        });
    };
    (tabs || []).forEach((tab) => {
        (tab.blocks || []).forEach((block) => {
            const blockKey = String(block.mappedKey || '');
            let scopes;
            if (!blockKey) scopes = [''];
            else if (has(blockKey)) {
                scopes = packEnumerateItems(readPath(statData, blockKey)).map((k) => blockKey + '.' + k);
                if (!scopes.length) return;               // no items — nothing to resolve for this block
            } else scopes = [blockKey];
            walkCards(block.cards, scopes);
        });
    });
    return requests;
}

// ── runtime state ────────────────────────────────────────────────────────────

const _packState = { rendered: false, id: '', tabs: null };
const _packFormatterValues = new Map();   // packFormatterValueKey(name, scope) → rendered string
let _packRpcSeq = 0;
let _packRpcWarned = false;

// ── the wire (one message per stat update) ───────────────────────────────────

function postPackFormatterBatch(requests) {
    return new Promise((resolve) => {
        const requestId = 'pf-' + (++_packRpcSeq);
        const onMessage = (event) => {
            const d = event && event.data;
            if (!d || d.type !== PACK_FORMATTER_MESSAGE + '-result' || d.requestId !== requestId) return;
            cleanup();
            resolve(d);
        };
        const timer = setTimeout(() => { cleanup(); resolve(null); }, 4000);
        const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); };
        window.addEventListener('message', onMessage);
        try {
            window.top.postMessage({ type: PACK_FORMATTER_MESSAGE, requestId, requests }, '*');
        } catch (e) {
            console.warn('[MZSMB][pack] could not reach the host page for the formatter batch:', e.message);
            cleanup();
            resolve(null);
        }
    });
}

// Called by updateStatusPanel BEFORE the render pass (§9.5 ordering: collect, ONE call, then render
// synchronously from resolved values). No pack, or a pack with no formatter cells, costs nothing.
async function resolvePackFormatters(statData) {
    if (!_packState.rendered || !_packState.tabs) return;
    const requests = planPackFormatterRequests(_packState.tabs, statData, COLLECTION_PATHS);
    if (!requests.length) return;
    const reply = await postPackFormatterBatch(requests);
    // No reply in time means the extension is missing or out of date. A reply without a map is
    // mvu-helper answering that it cannot format yet, with its reason — expected right after a page
    // load, when the menu asks before MVU has loaded; the next update asks again.
    if (!reply || !reply.map) {
        if (!_packRpcWarned) {
            _packRpcWarned = true;
            if (!reply) {
                console.warn('[MZSMB][pack] mvu-helper did not answer the formatter batch (' + requests.length
                    + ' request(s)) — formatter cells keep their raw values. Is the extension installed and up to date?');
            } else {
                console.info('[MZSMB][pack] mvu-helper could not format this update: ' + (reply.reason || 'it gave no reason')
                    + ' — formatter cells keep their raw values until the next update.');
            }
        }
        return;
    }
    _packRpcWarned = false;
    for (const r of requests) {
        const value = reply.map[r.cellId + PACK_KEY_SEP + r.field];
        if (value !== undefined) _packFormatterValues.set(packFormatterValueKey(r.formatterName, r.scopePath), String(value));
    }
    // A formatter that did not answer keeps its old value out of the map, so its cell falls back to
    // the raw binding — the host already warned once per name.
}

// The scope an element sits in, read off the DOM: the enclosing data-bind-root container plus the
// per-item data-item-key stamp, so a cloned collection row resolves to ITS item; '' outside a block.
// ONE observation shared by the formatter fill below and the action caller (rt_menuAction.js).
export function packScopeOf(el) {
    const container = el && el.closest ? el.closest('[data-bind-root]') : null;
    const rootKey = container ? (container.getAttribute('data-bind-root') || '') : '';
    if (!rootKey) return '';
    const itemWrap = el.closest ? el.closest('[data-item-key]') : null;
    const itemKey = itemWrap ? itemWrap.getAttribute('data-item-key') : null;
    return itemKey ? rootKey + '.' + itemKey : rootKey;
}

// Called at the tail of updateBindingsIn for EVERY render pass, card and pack alike. A key with no
// value leaves the cell alone (raw).
function applyPackFormatterValues(root) {
    if (!_packFormatterValues.size || !root || typeof root.querySelectorAll !== 'function') return;
    const scopeOf = packScopeOf;
    root.querySelectorAll('[data-fmt-text]').forEach((el) => {
        const value = _packFormatterValues.get(packFormatterValueKey(el.getAttribute('data-fmt-text'), scopeOf(el)));
        if (value !== undefined && el.innerHTML !== value) el.innerHTML = value;
    });
    root.querySelectorAll('[data-fmt-img]').forEach((el) => {
        const value = _packFormatterValues.get(packFormatterValueKey(el.getAttribute('data-fmt-img'), scopeOf(el)));
        if (value !== undefined && el.src !== value) el.src = value;
    });
    root.querySelectorAll('[data-fmt-lb]').forEach((el) => {
        const value = _packFormatterValues.get(packFormatterValueKey(el.getAttribute('data-fmt-lb'), scopeOf(el)));
        if (value !== undefined && el.getAttribute('data-lb-key') !== value) el.setAttribute('data-lb-key', value);
    });
}

// ── init ─────────────────────────────────────────────────────────────────────

function appendPackFallbackTab(packId, reason) {
    const nav = document.querySelector('.tab-nav');
    const container = document.querySelector('.status-container');
    if (!nav || !container) return;
    const tabId = 'tab-pk-' + packId + '-fallback';
    const btn = document.createElement('div');
    btn.className = 'tab-btn';
    btn.setAttribute('data-pack', packId);
    btn.setAttribute('onclick', "selectTab('" + tabId + "', this)");
    btn.textContent = packId;
    nav.appendChild(btn);
    const tab = document.createElement('div');
    tab.id = tabId;
    tab.className = 'tab-content';
    tab.setAttribute('data-pack', packId);
    tab.innerHTML = '<div style="padding:20px; color:#c96;">StatusMenu Pack "' + packId
        + '" cannot be drawn by this menu: ' + reason + '</div>';
    container.appendChild(tab);
}

async function initPackLayout() {
    const registryText = await fetchLorebookContent(PACK_REGISTRY_NEEDLE);
    const registry = parsePackRegistryContent(registryText);
    if (!registry) {
        console.log('[MZSMB][pack] packs found=0 rendered=0 — no StatusMenu Pack is installed on this card');
        return;
    }
    const packId = registry.activeMenuId;
    const layoutText = await fetchLorebookContent(packLayoutNeedle(packId));
    const parsed = parsePackLayoutContent(layoutText);
    if (!parsed.ok) {
        console.warn('[MZSMB][pack] packs found=1 (' + packId + ') rendered=0 skipped=1 — ' + parsed.reason);
        return;
    }
    const declaration = parsed.declaration;
    const decision = packRenderDecision(declaration, PACK_SUPPORTED_KINDS);
    if (decision.mode === 'refuse') {
        console.warn('[MZSMB][pack] pack "' + packId + '" REFUSED, nothing rendered — ' + decision.reason);
        return;
    }
    if (decision.mode === 'raw') {
        console.warn('[MZSMB][pack] pack "' + packId + '" renders as a fallback tab — ' + decision.reason);
        appendPackFallbackTab(packId, decision.reason);
        return;
    }

    const nav = document.querySelector('.tab-nav');
    const container = document.querySelector('.status-container');
    if (!nav || !container) {
        console.warn('[MZSMB][pack] pack "' + packId + '" found but this document has no tab nav to extend');
        return;
    }

    const tabs = namespacePackTabs(declaration.tabs, packId);

    // The pack's collection declarations must land BEFORE the first render — renderBlock's strict
    // mode reads this set to know a record map is a list.
    (declaration.collectionPaths || []).forEach((p) => COLLECTION_PATHS.add(String(p)));

    // Locale: the generation pass registers the pack DOM's own label keys (namespaced ids — no
    // collision with the card's). The pack's shipped statics are pack.<id>.-prefixed; they FILL
    // absent base keys and never overwrite the card's own.
    const locale = createLocaleAccumulator();
    const tabsHtml = tabs.map((t, i) => generateTabHtml(t, i + 1000, locale)).join('\n');
    locale.entries().forEach((val, key) => { if (LOCALE[key] === undefined) LOCALE[key] = val; });
    const foreignScopes = new Set();
    for (const [key, val] of Object.entries(declaration.staticLocale || {})) {
        const own = 'pack.' + packId + '.';
        const scoped = /^pack\.([^.]+)\./.exec(key);
        if (scoped && scoped[1] !== packId) foreignScopes.add(scoped[1]);
        const base = key.startsWith(own) ? key.slice(own.length) : key;
        if (LOCALE[base] === undefined) LOCALE[base] = val;
    }
    // A layout exported under another id: its locale keys never reach their base names (every
    // empty-list text reads "undefined") and its scoped CSS matches no element here. The export
    // tab's id has to be THIS pack's id; nothing on this side can repair that, so it is named.
    if (foreignScopes.size) {
        console.warn('[MZSMB][pack] ' + packId + ': the layout\'s locale is scoped to pack "' + [...foreignScopes].join('", "')
            + '" — it was exported under a different id; re-export it with id "' + packId + '"');
    }

    // CSS: the export lane scoped every rule under [data-pack="<id>"]; this side just carries it in.
    if (declaration.globalCss) {
        const style = document.createElement('style');
        style.id = 'pack-css-' + packId;
        style.textContent = declaration.globalCss;
        document.head.appendChild(style);
    }

    // The pack's own custom templates — skipped when the card already owns the name, and said so.
    for (const t of declaration.customTemplates || []) {
        const templateId = 'tmpl-custom-' + t.name;
        if (document.getElementById(templateId)) {
            console.warn('[MZSMB][pack] template "' + t.name + '" already exists in this card — the card\'s copy wins');
            continue;
        }
        const template = document.createElement('template');
        template.id = templateId;
        template.innerHTML = t.html || '';
        document.body.appendChild(template);
    }

    // The DOM: nav buttons + tab contents, each stamped data-pack so the scoped CSS reaches them.
    for (const t of tabs) {
        const btn = document.createElement('div');
        btn.className = 'tab-btn';
        btn.setAttribute('data-pack', packId);
        btn.setAttribute('onclick', "selectTab('tab-" + t.id + "', this)");
        btn.textContent = t.name || packId;
        nav.appendChild(btn);
    }
    const holder = document.createElement('div');
    holder.innerHTML = tabsHtml;
    Array.from(holder.children).forEach((el) => {
        el.setAttribute('data-pack', packId);
        el.classList.remove('active');                    // a baked first tab, where one exists, stays active
        container.appendChild(el);
    });
    const activateId = packTabToActivate(!!document.querySelector('.tab-content.active'), tabs);
    if (activateId) {
        const firstBtn = nav.querySelector('.tab-btn[data-pack="' + packId + '"]');
        if (firstBtn) selectTab(activateId, firstBtn);
    }

    _packState.rendered = true;
    _packState.id = packId;
    _packState.tabs = tabs;
    console.log('[MZSMB][pack] packs found=1 rendered=1 — "' + packId + '" (' + declaration.kind + '): '
        + tabs.length + ' tab(s), ' + (declaration.collectionPaths || []).length + ' collection path(s), css='
        + (declaration.globalCss ? declaration.globalCss.length + 'B' : 'none'));

    // The card rendered once before this ran — render again so pack cells populate now instead of
    // on the next stat event.
    if (_lastStatData) await updateStatusPanel({ stat_data: _lastStatData });
}
