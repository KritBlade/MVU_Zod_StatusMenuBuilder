// rt_htmlGenerators.js — the layout→HTML generators, ISOMORPHIC (B0).
//
// One copy of these functions serves two callers that used to need two:
//   • the Vue export tab imports them and bakes HTML at build time (unchanged);
//   • B2's rt_packLayout.js will concatenate this file into the exported menu and render a
//     StatusMenu Pack's tabs AT RUNTIME, from layout JSON that did not exist when the card was baked.
// Same input, same bytes out, either side — which is the only reason a pack's layout can be trusted
// to render like a baked one.
//
// WHY THIS FILE HAS `export` WHEN NO OTHER rt_ PART DOES: the exported menu concatenates every part
// into ONE `<script type="module">`, and `export` is legal (and inert) in a module that nothing
// imports. So the declarations stay in the shared scope its siblings call across, AND the Vue app can
// import them by name. Do not "fix" the exports away — that breaks the Vue half.
//
// NOT YET CONCATENATED. B0 makes this SHIPPABLE, it does not ship it: adding it to the export would
// change the baked bytes, and B0's whole verification is that they do not change. B2 wires it in.
//
// THE LOCALE ACCUMULATOR IS THREADED, NOT MODULE STATE. It used to be a module-level Map with a
// "clear it before each build" contract, which held because a build is one shot. Runtime is not: B2
// re-renders on every stat update, in a realm that also holds the card's own baked layout, so a
// shared Map would leak keys between renders and between layouts. The caller now owns one.

/** @typedef {import('../../composables/useBuilderState').CardConfig} CardConfig */
/** @typedef {import('../../composables/useBuilderState').BlockConfig} BlockConfig */
/** @typedef {import('../../composables/useBuilderState').TabConfig} TabConfig */

/**
 * @typedef {object} LocaleAccumulator
 * @property {(prefix: string, id: string, text: string) => string} register registers a label, returns its key
 * @property {() => Map<string, string>} entries the collected keys, in INSERTION order
 */

// ── Locale Accumulator ────────────────────────────────────────────

/**
 * One accumulator per render. Insertion order is load-bearing — the export merges these into a JSON
 * object in the order they were registered.
 * @returns {LocaleAccumulator}
 */
export function createLocaleAccumulator() {
    const collected = new Map()
    return {
        register(prefix, id, text) {
            const key = `${prefix}_${id}`.replace(/-/g, '_')
            collected.set(key, text || '')
            return key
        },
        entries() {
            return collected
        },
    }
}

// ── Utility ───────────────────────────────────────────────────────

/**
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return ''
    // Each entity is written with a \u0026 escape on purpose. This file's TEXT rides into the
    // exported document inside <script>, and TavernHelper hands that document to the iframe as a
    // `srcdoc` ATTRIBUTE, whose value the HTML parser entity-decodes ONCE. A literal ampersand
    // entity therefore reaches the JS parser already decoded — the double-quoted one collapses to
    // three quote characters in a row and kills the whole module, menu included. The escape holds
    // no ampersand for that parser to find and builds the identical string at runtime.
    return str.replace(/&/g, "\u0026amp;")
        .replace(/</g, "\u0026lt;")
        .replace(/>/g, "\u0026gt;")
        .replace(/"/g, "\u0026quot;")
        .replace(/'/g, "\u0026#39;")
}

// ── The "No Image" placeholder ────────────────────────────────────
// What an Image cell shows with no picture: a bound one whose value is empty (rt_bindings.js) and one
// with no source at all (generateCardHtml). A function, not a const, because the bindings call it from
// a part the document concatenates BEFORE this one: a declaration is hoisted, a const is not.
export function noImageSrc() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 200'%3E%3Crect fill='%23e0e0e0' width='300' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='0.3em' fill='%23999' font-size='16' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E"
}

// ── Links — shown as images inside the menu ───────────────────────
// A menu runs in mvu-helper's sandboxed frame, where a link can open no tab (no allow-popups) and
// following it replaces the menu with the page it points at. So a web link a cell renders — typically
// an image URL built from `itemKey` — opens its target in the menu's full-window image viewer instead
// (rt_tabAndModal.js wireMenuLinkClicks → rt_modalUi.js showImagePopup, and the builder preview the
// same way).

/**
 * The absolute URL a link click shows as an image, or '' for a click the browser keeps: an in-page
 * `#anchor`, an href that is not a URL, and every scheme other than http(s).
 * @param {unknown} rawHref the link's href attribute as written
 * @param {string} baseUrl what a relative href resolves against — the document's baseURI
 * @returns {string}
 */
export function menuLinkImageUrl(rawHref, baseUrl) {
    const href = typeof rawHref === 'string' ? rawHref.trim() : ''
    if (!href || href.startsWith('#') || !URL.canParse(href, baseUrl)) return ''
    const url = new URL(href, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''
}

// ── ActionButton — the menu's write caller (B5 step 1) ────────────
// A declarative cell: a label, an action NAME the StatusMenu Engine exports, and a static `args`
// object. It computes nothing — a button that built its own arguments would be a customLogic body
// under another name (pack-authoring-plan §B.4). The runtime (rt_menuAction.js) posts {action, args}
// to mvu-helper's dispatcher, which runs the engine action in the Worker and applies its patches.
//
// `args` is authored data travelling from a community pack into a dispatcher, so it is validated on
// THIS side — at bake, at pack export and again at click — never at the far end, which normalises
// args and cannot tell a prototype key from an honest one.

// The dispatcher's own rule for an action name (mvu-helper readMenuActionRequest): ONE plain
// segment, because the engine surface is addressed as actions.<name> and a dot would reach past it.
const ACTION_NAME_RE = /^[A-Za-z0-9_$-]+$/

// Written by the renderer at click time — the dotted path of the block item the button sits in ('' at
// root), the same observation the formatter lane sends. An author's value here would be overwritten.
export const RESERVED_ACTION_ARG_KEYS = ['scopePath']
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype']

/**
 * '' when `name` is a plain action name; otherwise why not.
 * @param {unknown} name
 * @returns {string}
 */
export function actionNameProblem(name) {
    if (typeof name !== 'string' || !name.trim()) return 'names no action'
    if (!ACTION_NAME_RE.test(name)) return 'action name ' + JSON.stringify(name) + ' is not a plain name (letters, digits, _ $ -)'
    return ''
}

/**
 * '' when `args` is a plain JSON object the dispatcher may receive; otherwise why not.
 * @param {unknown} args
 * @returns {string}
 */
export function actionArgsProblem(args) {
    if (args === undefined) return ''
    if (!args || typeof args !== 'object' || Array.isArray(args)) return 'args must be a JSON object'
    for (const key of Object.keys(args)) {
        if (RESERVED_ACTION_ARG_KEYS.includes(key)) return 'args.' + key + ' is reserved — the renderer sets it at click time'
    }
    return jsonValueProblem(args, 'args')
}

function jsonValueProblem(value, at) {
    if (value === null) return ''
    const kind = typeof value
    if (kind === 'string' || kind === 'boolean') return ''
    if (kind === 'number') return Number.isFinite(value) ? '' : at + ' is not a finite number'
    if (kind !== 'object') return at + ' is a ' + kind + ' — args carry plain JSON only'
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const problem = jsonValueProblem(value[i], at + '[' + i + ']')
            if (problem) return problem
        }
        return ''
    }
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return at + ' is not a plain object'
    for (const key of Object.keys(value)) {
        if (PROTOTYPE_KEYS.includes(key)) return at + '.' + key + ' is a prototype key'
        const problem = jsonValueProblem(value[key], at + '.' + key)
        if (problem) return problem
    }
    return ''
}

// ── row actions (D8) — the verbs a list cell puts on every row ────────────────
// Declared, never hardcoded in a template: `[{ title, action, args?, confirm? }]`. `title` is the
// button's label, `action` an engine export under the name rule above, `args` static JSON riding
// under the row's own observations (listPath, itemKey), `confirm` presentation — true for a generic
// "<title> "<key>"?" or the question text with `{itemKey}` substituted. What a verb NEEDS from the
// player is deliberately NOT declared here: the engine answers that at click time (inputs.<name>),
// so the layout says WHICH verbs and never WHAT they take.
const ROW_ACTION_FIELDS = ['title', 'action', 'args', 'confirm']

/**
 * '' when `list` is a row-action declaration the renderer may draw; otherwise why not.
 * @param {unknown} list
 * @returns {string}
 */
export function rowActionsProblem(list) {
    if (list === undefined) return ''
    if (!Array.isArray(list)) return 'rowActions must be an array'
    for (let i = 0; i < list.length; i++) {
        const at = 'rowActions[' + i + ']'
        const entry = list[i]
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return at + ' is not an object'
        if (typeof entry.title !== 'string' || !entry.title.trim()) return at + ' has no title — the button needs a label'
        const nameProblem = actionNameProblem(entry.action)
        if (nameProblem) return at + ' ' + nameProblem
        const argsProblem = actionArgsProblem(entry.args)
        if (argsProblem) return at + ' ' + argsProblem
        if (entry.confirm !== undefined && typeof entry.confirm !== 'boolean' && typeof entry.confirm !== 'string') {
            return at + ' confirm must be true/false or the question text'
        }
        for (const key of Object.keys(entry)) {
            if (!ROW_ACTION_FIELDS.includes(key)) return at + ' has an unknown field "' + key + '" (' + ROW_ACTION_FIELDS.join(', ') + ')'
        }
    }
    return ''
}

/**
 * A JSON value as it rides in an attribute (a button's args, a list cell's args, its row actions):
 * every character that could close the quote, open a tag or form an entity written as a JSON \u escape. MEASURED 2026-08-28: the exported
 * document is entity-decoded ONCE on its way into the message iframe (the regex's lt-entity `<br>`
 * arrives as a real tag, and not one quot-entity survives), so a double-quoted attribute holding an
 * escaped quote would break at exactly the moment it is read. A \u escape holds no ampersand and
 * survives that decode unchanged.
 * @param {unknown} args
 * @returns {string}
 */
export function encodeJsonAttribute(args) {
    return JSON.stringify(args || {})
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/'/g, '\\u0027')
}

// ── CSS Generator ─────────────────────────────────────────────────

/**
 * @param {string} globalCssContent
 * @returns {string}
 */
export function generateCss(globalCssContent) {
    // detail-modal and all canonical classes are defined in sharedStyles.ts (part of globalCss).
    // No one-off hardcoded CSS needed here — single source of truth.
    return `
<style>
${globalCssContent}
</style>
`
}

// ── Card HTML ─────────────────────────────────────────────────────

/**
 * @param {CardConfig} card
 * @param {string} [blockKey]
 * @param {string} [absolutePrefix]
 * @param {LocaleAccumulator} locale
 * @returns {string}
 */
export function generateCardHtml(card, blockKey = '', absolutePrefix = '', locale) {
    const localeKey = locale.register('lbl_' + card.type.toLowerCase(), card.id, card.title || '')

    // Helper to get relative path for binding (may be relative inside blocks)
    const getBindPath = (key) => {
        if (!key) return ''
        if (!blockKey) return key
        // If key already starts with blockKey, OR contains a dot (absolute path), use it as is
        if (key.startsWith(blockKey) || key.includes('.')) return key
        return `${blockKey}.${key}`
    }

    // Helper to get ABSOLUTE full path for mutations (delete, edit)
    // Uses originalMappedKey preserved by makeRelative, or builds from absolutePrefix
    const getFullPath = (key) => {
        // First check if card has originalMappedKey (preserved before makeRelative stripped prefix)
        const originalKey = card.originalMappedKey;
        if (originalKey) return originalKey;
        // Otherwise, use absolutePrefix if available
        if (!key) return '';
        if (absolutePrefix && key && !key.includes('.')) {
            return `${absolutePrefix}.${key}`;
        }
        return key;
    }

    // Pack layouts name formatters per cell (B1's lift); the attribute is how the runtime finds the
    // element to fill from the resolved map. Field follows the cell shape, same rule as the exporter.
    const getFmtAttr = () => {
        const map = card.formatters
        if (!map || typeof map !== 'object' || Array.isArray(map)) return ''
        const field = card.sourceType === 'lorebook' ? 'lorebookKey' : (card.type === 'Image' ? 'image' : 'text')
        const name = map[field]
        if (typeof name !== 'string' || !name.trim()) return ''
        const attr = field === 'lorebookKey' ? 'data-fmt-lb' : (field === 'image' ? 'data-fmt-img' : 'data-fmt-text')
        return ` ${attr}="${escapeHtml(name.trim())}"`
    }

    // Advanced Logic's FIXED value. The export turns a body that only assigns a literal into
    // `staticValue` (statusmenu-pack-export.js liftCustomLogic). It is the cell's _output, so it owns
    // the cell exactly as a computed body's formatter result does, and the mapped variable never
    // overwrites it: an Image shows it as its src, a lorebook cell looks it up as the key, and a
    // StatRow or RichText draws it as HTML.
    const hasFixedValue = typeof card.staticValue === 'string'
    // No source at all. A cell mapped to its block itself also arrives with mappedKey '' (makeRelative's
    // "bind to self"), and only its original key tells the two apart. Binding an empty path reads the
    // whole scope object, which a cell draws as "[object Object]".
    const isUnmapped = !card.mappedKey && !card.originalMappedKey

    let innerFn = ''
    switch (card.type) {
        case 'StatRow':
            if (card.sourceType === 'lorebook') {
                innerFn = `
                <div class="prop-row">
                    <span class="prop-label" id="${localeKey}">${escapeHtml(card.title)}</span>
                    <div class="prop-val-container">
                        <span class="prop-val" ${getFmtAttr()} data-lb-key="${escapeHtml(hasFixedValue ? card.staticValue : (card.lorebookKey || ''))}">Loading...</span>
                    </div>
                </div>`
            } else {
                const valueHtml = hasFixedValue
                    ? `<span class="prop-val" ${getFmtAttr()}>${card.staticValue}</span>`
                    : (isUnmapped
                        ? `<span class="prop-val" ${getFmtAttr()}>???</span>`
                        : `<span class="prop-val" ${getFmtAttr()} data-bind-val="${getBindPath(card.mappedKey)}">???</span>`)
                innerFn = `
                <div class="prop-row" data-bind-fullpath="${getFullPath(card.mappedKey)}">
                    <span class="prop-label" id="${localeKey}" ${!card.title ? `data-bind-label="${getBindPath(card.mappedKey)}"` : ''}>${escapeHtml(card.title)}</span>
                    <div class="prop-val-container">
                        ${valueHtml}
                    </div>
                </div>`
            }
            break
        case 'StatBar':
            innerFn = `
                <div class="stat-bar-box" data-bind-fullpath="${getFullPath(card.mappedKey)}">
                    <div class="stat-bar-header">
                        <span class="stat-bar-label" id="${localeKey}" ${!card.title ? `data-bind-label="${getBindPath(card.mappedKey)}"` : ''}>${escapeHtml(card.title)}</span>
                        <span class="stat-bar-val"><span data-bind-curr="${getBindPath(card.mappedKey)}">?</span> / <span data-bind-max="${getBindPath(card.maxMappedKey)}">?</span></span>
                    </div>
                    <div class="stat-bar-track">
                        <div class="stat-bar-fill bar-${card.barColor || 'default'}" style="width:50%;" data-bind-bar="${getBindPath(card.mappedKey)}"${card.maxMappedKey ? ` data-bind-bar-max="${getBindPath(card.maxMappedKey)}"` : ''}></div>
                    </div>
                </div>`
            break
        case 'Image':
              const imgTitle = card.title || 'Avatar'
              const imgLocaleKey = locale.register('lbl_img', card.id, imgTitle)

              if (card.sourceType === 'lorebook') {
                  // Lorebook Logic
                  const lbKey = hasFixedValue ? card.staticValue : (card.lorebookKey || '')
                  innerFn = `
                    <div class="img-wrapper" style="text-align:center;">
                        <img 
                            src="" 
                            alt="${escapeHtml(imgTitle)}" 
                            id="${imgLocaleKey}"
                            class="avatar-img" 
                            style="width:${card.imageScale || 100}%; max-width:100%; border-radius:4px; border:1px solid var(--accent-primary); cursor:pointer; min-height:50px;" 
                            ${getFmtAttr()}
                            data-lb-key="${escapeHtml(lbKey)}"
                            onclick="showImagePopup(this.src)"
                        />
                         <!-- No Edit Button for Lorebook Images (Managed in Builder) -->
                    </div>`
              } else if (hasFixedValue || isUnmapped) {
                  // A fixed image, or none at all: nothing to bind, and nothing for ✎ to save to.
                  const fixedSrc = hasFixedValue && card.staticValue ? escapeHtml(card.staticValue) : noImageSrc()
                  innerFn = `
                    <div style="text-align:center;">
                        <div class="img-wrapper" style="text-align:center; position:relative; display:inline-block; width:${card.imageScale || 100}%; max-width:100%;">
                            <img
                                src="${fixedSrc}"
                                alt="${escapeHtml(imgTitle)}"
                                id="${imgLocaleKey}"
                                class="avatar-img"
                                style="width:100%; border-radius:4px; border:1px solid var(--accent-primary); cursor:pointer; display:block;"${getFmtAttr()}
                                onclick="showImagePopup(this.src)"
                            />
                        </div>
                    </div>`
              } else {
                  // Variable Logic (Default)
                  const relImgPath = getBindPath(card.mappedKey);
                  const fullImgPath = getFullPath(card.mappedKey);
                  innerFn = `
                    <div class="img-wrapper" style="text-align:center; position:relative; display:inline-block; width:${card.imageScale || 100}%; max-width:100%;" data-bind-fullpath="${fullImgPath}">
                        <img 
                            src="" 
                            alt="${escapeHtml(imgTitle)}" 
                            id="${imgLocaleKey}"
                            class="avatar-img" 
                            style="width:100%; border-radius:4px; border:1px solid var(--accent-primary); cursor:pointer; display:block;"${getFmtAttr()} 
                            data-bind-img="${relImgPath}" 
                            onclick="showImagePopup(this.src)"
                        />
                        <!-- Edit Button -->
                        <div class="img-edit-btn" 
                            data-save-root="${absolutePrefix}" 
                            data-save-leaf="${relImgPath}"
                            onclick="handleEditClick(event, this)"
                        >
                            ✎
                        </div>
                    </div>`
                  // Wrap in center alignment for column
                  innerFn = `<div style="text-align:center;">${innerFn}</div>`;
              }
              break
        case 'QuestList':
             // Generic List Container - uses mappedKey from builder config
             const listKey = getBindPath(card.mappedKey)
             // Use originalMappedKey (preserved before makeRelative stripped it) or fall back to building the full path
             const fullListPath = card.originalMappedKey || (absolutePrefix && card.mappedKey ? `${absolutePrefix}.${card.mappedKey}` : listKey);
             let listType = card.listType || card.layoutMode || '';

             if (!listType) {
                 listType = 'simple';
             }

             // Normalize 'list' to 'simple'
             if (listType === 'list') listType = 'simple';

             // Handle custom templates: emit custom-{name} as list type
             if (listType === 'custom' && card.customTemplateName) {
                 listType = `custom-${card.customTemplateName.trim()}`;
             } else if (listType === 'custom') {
                 listType = 'simple'; // Fallback if no name provided
             }

             const listId = `list-${card.id}`
             const allowEditAttr = card.allowEdit ? ' data-allow-edit="1"' : ''
             const allowDeleteAttr = card.allowDelete ? ' data-allow-delete="1"' : ''
             // A list cell's `args` ride every action its rows post (delete, edit, equip, unequip),
             // under the click's own keys — the layout's way to name a relation only it knows, such as
             // the inventory an equipment list returns items to. Same rules as a button's args.
             const listArgsAttr = (card.args !== undefined && !actionArgsProblem(card.args)) ? ` data-args='${encodeJsonAttribute(card.args)}'` : ''
             // The verbs every row offers (D8). A bad declaration bakes nothing: the export refuses it
             // by cell path, and a half-drawn row would only hide that.
             const rowActionsAttr = (Array.isArray(card.rowActions) && card.rowActions.length && !rowActionsProblem(card.rowActions)) ? ` data-row-actions='${encodeJsonAttribute(card.rowActions)}'` : ''
             const listDiv = `<div id="${listId}" class="simple-list" data-bind-list="${listKey}" data-bind-list-fullpath="${fullListPath}" data-list-type="${listType}"${allowEditAttr}${allowDeleteAttr}${listArgsAttr}${rowActionsAttr}></div>`

             const startCollapsed = card.collapsed
             innerFn = `
                <div class="list-collapse-wrapper">
                    <div class="nested-section-header list-collapse-header" data-target="${listId}" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                        <span>${escapeHtml(card.title || '')}</span><span class="list-collapse-arrow" style="font-size:0.8em; opacity:0.6;">${startCollapsed ? '▶' : '▼'}</span>
                    </div>
                    <div class="list-collapse-body"${startCollapsed ? ' style="display:none;"' : ''}>
                        ${listDiv}
                    </div>
                </div>`
             break
        case 'RichText':
             // .nested-section-header, as the preview draws it. Its text is HTML there (v-html), so it
             // is HTML here too — the title, or Advanced Logic's fixed value.
             if (card.sourceType === 'lorebook') {
                 const rtKey = locale.register('lbl_rt', card.id, 'Loading...')
                 const rtLoreKey = hasFixedValue ? card.staticValue : (card.lorebookKey || '')
                 innerFn = `<div class="nested-section-header" id="${rtKey}" ${getFmtAttr()} data-lb-key="${escapeHtml(rtLoreKey)}">Loading...</div>`
             } else {
                 const rtText = hasFixedValue ? card.staticValue : (card.title || 'RichText')
                 const rtKey = locale.register('lbl_rt', card.id, rtText)
                 const rtBind = hasFixedValue ? '' : getBindPath(card.mappedKey)
                 const rtFullPath = getFullPath(card.mappedKey)
                 innerFn = `<div class="nested-section-header" id="${rtKey}" ${getFmtAttr()} ${rtBind ? `data-bind-val="${rtBind}" data-bind-fullpath="${rtFullPath}"` : ''}>${rtText}</div>`
             }
             break
        case 'GridContainer':
             const subCards = card.cards?.map(c => {
                 const cw = c.width || (c.type === 'GridContainer' || c.type === 'QuestList' ? 100 : 50)
                 return `<div class="prop-row-wrapper" style="width:${cw}%">${generateCardHtml(c, blockKey, absolutePrefix, locale)}</div>`
             }).join('') || ''
             const gcKey = locale.register('lbl_gc', card.id, card.title || '')
             innerFn = `
                <div class="grid-group-card">
                    ${card.title ? `<div class="grid-group-header" id="${gcKey}">${escapeHtml(card.title)}</div>` : ''}
                    <div class="grid-group-content">${subCards}</div>
                </div>`
             break
        case 'Checkbox':
             // For Checkboxes, we need to defer path construction to runtime (renderBlock)
             // because we need the Item Key (e.g. "Dog") which is only present during iteration.
             const relativeBindPath = getBindPath(card.mappedKey);
             const checkboxFullPath = getFullPath(card.mappedKey);
             // A read-only box shows the value and cannot be toggled: `disabled`, and no save attributes, so
             // the runtime wires no write for it (rt_bindings attaches its setValue click only to a box that
             // names where it saves).
             const checkboxWrite = card.isReadOnly
                 ? 'disabled'
                 : `data-save-root="${absolutePrefix}" data-save-leaf="${relativeBindPath}"`;
             // Keep checkbox layout aligned with the standard row contract used by other fields:
             // left label + right control, with wrap support so long labels remain visible.
             innerFn = `
                <div class="prop-row kin-checkbox-row" data-bind-fullpath="${checkboxFullPath}">
                    <span class="kin-checkbox-text" id="${localeKey}">${escapeHtml(card.title)}</span>
                    <div class="prop-val-container kin-checkbox-control">
                        <input 
                            type="checkbox"
                            class="ar-checkbox-input"
                            style="margin:0; flex-shrink:0;"
                            data-bind-checked="${relativeBindPath}" 
                            ${checkboxWrite}
                        />
                    </div>
                </div>`
            break
        case 'ActionButton': {
            const problem = actionNameProblem(card.action) || actionArgsProblem(card.args)
            if (problem) {
                // Obviously wrong beats silently missing (§B.6): the pack lane REFUSES at export, and
                // the throwaway HTML lane shows the reason where the button would have been.
                innerFn = `<div class="unknown-card">[ActionButton: ${escapeHtml(problem)}]</div>`
                break
            }
            // The look is the sheet's (`.menu-action-btn` in the project's Global CSS); the runtime stamps
            // the class and the action contract only.
            const actionLocaleKey = locale.register('lbl_actionbutton', card.id, card.title || card.action)
            innerFn = `
                <div class="prop-row action-row">
                    <button type="button" class="menu-action-btn" id="${actionLocaleKey}" data-action="${card.action}" data-args='${encodeJsonAttribute(card.args)}'>${escapeHtml(card.title || card.action)}</button>
                </div>`
            break
        }
        default:
            innerFn = `<div class="unknown-card">[${card.type}]</div>`
    }

    return innerFn
}

// ── Block HTML ────────────────────────────────────────────────────

/**
 * @param {BlockConfig} block
 * @param {LocaleAccumulator} locale
 * @returns {string}
 */
export function generateBlockHtml(block, locale) {
    const width = block.width || 100
    const blockKey = block.mappedKey || ''
    // Register Block Title
    const blkKey = locale.register('lbl_blk', block.id, block.title)

    // If mappedKey is present, we generate a TEMPLATE for client-side rendering
    if (blockKey) {
        // IMPORTANT: Inside the template, bindings must be relative to the Item.

        // Helper to clone and strip prefixes (preserves original path for fullpath attributes)
        const makeRelative = (c) => {
            const copy = { ...c };

            // Preserve the ORIGINAL full path for ALL cards before stripping (used for data-bind-fullpath)
            if (c.mappedKey) {
                copy.originalMappedKey = c.mappedKey;
            }
            if (c.maxMappedKey) {
                copy.originalMaxMappedKey = c.maxMappedKey;
            }

            if (copy.mappedKey && copy.mappedKey.startsWith(blockKey + '.')) {
                copy.mappedKey = copy.mappedKey.substring(blockKey.length + 1);
            } else if (copy.mappedKey === blockKey) {
                copy.mappedKey = ''; // Bind to self
            }

            if (copy.maxMappedKey && copy.maxMappedKey.startsWith(blockKey + '.')) {
                 copy.maxMappedKey = copy.maxMappedKey.substring(blockKey.length + 1);
            }

            if (copy.cards) {
                copy.cards = copy.cards.map(makeRelative);
            }
            return copy;
        };

        const cardHtml = block.cards.map(c => {
            const relCard = makeRelative(c);
            const cWidth = c.width || (c.type === 'GridContainer' || c.type === 'QuestList' ? 100 : 50)
            // Pass '' as blockKeyContext so bindings remain relative
            // Pass blockKey as absolutePrefix so onclick handlers can construct full path
            return `
            <div class="prop-row-wrapper" style="width:${cWidth}%">
                ${generateCardHtml(relCard, '', blockKey, locale)} 
            </div>`
        }).join('')

        const templateId = `tpl-blk-${block.id}`
        const containerId = `blk-${block.id}`

        return `
        <div class="col-wrapper" style="width:${width}%">
            <div class="info-card" style="${block.scale ? `font-size:${block.scale}em;` : ''}">
                <div class="card-header" id="${blkKey}">${escapeHtml(block.title)}</div>
                
                <!-- Container for Dynamic Content -->
                <div id="${containerId}" class="prop-list" data-bind-root="${blockKey}" data-template="${templateId}" data-page-size="${block.pageSize || 5}"${block.showQuickJump ? ' data-quick-jump="1"' : ''}>
                    <!-- Content will be injected here -->
                </div>

                <!-- Template -->
                <template id="${templateId}">
                    ${cardHtml}
                </template>
            </div>
        </div>`
    }

    const cardHtml = block.cards.map(c => {
        const cWidth = c.width || (c.type === 'GridContainer' || c.type === 'QuestList' ? 100 : 50)
        return `
        <div class="prop-row-wrapper" style="width:${cWidth}%">
            ${generateCardHtml(c, blockKey, '', locale)}
        </div>`
    }).join('')

    // If Unmapped (No List), render cards DIRECTLY.
    if (!block.mappedKey) {
        return `
        <div class="col-wrapper" style="width:${width}%">
            <div class="info-card" style="${block.scale ? `font-size:${block.scale}em;` : ''}">
                <div class="card-header" id="${blkKey}">${escapeHtml(block.title)}</div>
                <div class="prop-list">
                    ${cardHtml}
                </div>
            </div>
        </div>`
    }

    const templateId = `tpl-blk-${block.id}`
    const containerId = `blk-${block.id}`

    return `
    <div class="col-wrapper" style="width:${width}%">
        <div class="info-card" style="${block.scale ? `font-size:${block.scale}em;` : ''}">
            <div class="card-header" id="${blkKey}">${escapeHtml(block.title)}</div>
            
            <!-- Container for Dynamic Content -->
            <div id="${containerId}" class="prop-list" data-bind-root="${blockKey}" data-template="${templateId}" data-page-size="${block.pageSize || 5}"${block.showQuickJump ? ' data-quick-jump="1"' : ''}>
                <!-- Content will be injected here -->
            </div>

            <!-- Template -->
            <template id="${templateId}">
                ${cardHtml}
            </template>
        </div>
    </div>`
}

// ── Tab HTML ──────────────────────────────────────────────────────

/**
 * @param {TabConfig} tab
 * @param {number} index
 * @param {LocaleAccumulator} locale
 * @returns {string}
 */
export function generateTabHtml(tab, index, locale) {
    const activeClass = index === 0 ? 'active' : ''
    const blocksHtml = tab.blocks.map(b => generateBlockHtml(b, locale)).join('')

    return `
    <div id="tab-${tab.id}" class="tab-content ${activeClass}">
        <div class="grid-row">
            ${blocksHtml}
        </div>
    </div>`
}

// ── Templates HTML ────────────────────────────────────────────────

/**
 * @param {{ name: string, html: string }[]} customTemplatesList
 * @returns {string}
 */
export function generateTemplates(customTemplatesList) {
    return `
    <!-- Every built-in template carries ONE slot for row verbs and no verb of its own (D8): the
         renderer fills it from the list cell's declared rowActions plus its allowDelete flag. -->

    <!-- Simple List Template -->
    <template id="tmpl-simple">
        <div class="list-entry" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div class="entry-title" data-slot="title"></div>
                <div class="entry-desc" data-slot="desc"></div>
            </div>
            <span class="row-actions" data-slot="row-actions"></span>
        </div>
    </template>

    <!-- Grid List Template -->
    <template id="tmpl-grid">
        <div class="grid-tile" style="position:relative;">
            <span class="tile-name" data-slot="name"></span>
            <span class="tile-qty" data-slot="qty"></span>
            <span class="row-actions" data-slot="row-actions" style="position:absolute; top:2px; right:2px;"></span>
        </div>
    </template>

    <!-- Inventory List Template -->
    <template id="tmpl-inventory">
        <div class="grid-tile" style="cursor:pointer; position:relative; display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:6px 10px; height:100%; min-height:40px; text-align:left; border: 1px solid var(--border-color); border-radius:4px; gap: 8px;">
            <span class="tile-name" style="font-weight:bold; pointer-events:none; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" data-slot="name" title=""></span>
            <span class="tile-qty" style="pointer-events:none; flex-shrink: 0;" data-slot="qty"></span>
            <span class="row-actions" data-slot="row-actions"></span>
            <div style="display:none" data-slot="desc"></div>
        </div>
    </template>

    <!-- Equipment List Template -->
    <template id="tmpl-equipment-action">
        <div class="list-entry" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div class="entry-title" data-slot="title"></div>
                <div class="entry-desc" data-slot="desc"></div>
            </div>
            <span class="row-actions" data-slot="row-actions"></span>
        </div>
    </template>

    <!-- Quest List Template -->
    <template id="tmpl-quest">
        <div class="quest-card">
            <div class="quest-card-header">
                <span class="quest-card-title" data-slot="title"></span>
                <div class="quest-card-actions">
                    <span class="quest-difficulty" style="display:none" data-slot="difficulty"></span>
                    <span class="row-actions" data-slot="row-actions"></span>
                </div>
            </div>
            <div class="quest-desc" style="display:none" data-slot="desc"></div>
            <div class="quest-objective" data-slot="objective-row" style="display:none">Objective: <span data-slot="objective"></span></div>
            <div class="quest-next" data-slot="next-unlock-row" style="display:none">⏳ Next: <span data-slot="next-unlock"></span></div>
            <div class="quest-step" data-slot="step-row" style="display:none">Step: <span data-slot="step"></span></div>
            <div class="quest-reward" data-slot="reward" style="display:none">🏆 <span data-slot="reward-text"></span></div>
            <div class="quest-status" data-slot="status-row" style="display:none">Status: <span data-slot="status"></span></div>
            <div class="quest-last-updated" data-slot="last-updated-row" style="display:none">Last Updated: <span data-slot="LastUpdated"></span></div>
        </div>
    </template>

    ${customTemplatesList.map(t => `
    <!-- Custom Template: ${t.name} -->
    <template id="tmpl-custom-${t.name}">
        ${t.html}
    </template>`).join('\n')}

    <!-- Item Detail Modal -->
    <div id="detail-modal">
        <div id="detail-content">
            <button id="detail-close-btn" onclick="document.getElementById('detail-modal').style.display='none'">&times;</button>
            <h3 id="detail-title">Item Details</h3>
            <div id="detail-body"></div>
        </div>
    </div>
    `
}
