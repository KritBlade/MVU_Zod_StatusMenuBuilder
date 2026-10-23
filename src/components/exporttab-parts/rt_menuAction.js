// --- StatusMenu action caller (B5 step 1 · step 2) ---
//
// The menu's WRITE lane, from the menu's side. Every write a player can make — a button, a checkbox,
// a row's delete, the detail form's save, a portrait change, equip/unequip — posts ONE {action, args}
// to mvu-helper's dispatcher on the main page; the dispatcher verifies the name against the installed
// StatusMenu Engine, runs the action in the Worker, applies the returned patches through the MVU rail
// and replies to THIS frame. Nothing here reads or writes stat_data: the HOST resolves which message
// carries the live state, which is what retires the stale-iframe hazard an in-frame write carries
// (pack-authoring-plan §B.7d). This runtime is CHROME: it observes where a click sat and
// what the player typed, and posts exactly that; every judgment about what the write MEANS lives in
// the pack's own engine (§B.7e).
//
// Every action has exactly ONE producer — a human clicking — so a single in-flight gate is the whole
// concurrency answer: refuse while one action is outstanding and a menu-versus-menu lost update
// cannot happen. The gate lives here because "this button is busy" is presentation, not a judgment.
//
// Carries `export` for its pure decisions (node-testable, tools/test-pack-layout.mjs) — legal and
// inert inside the exported document's single <script type="module">, like rt_packLayout.js.
// Reads actionNameProblem / actionArgsProblem (rt_htmlGenerators.js), packScopeOf (rt_packLayout.js)
// and refreshFromMvu (rt_mvuConnection.js) from the shared module scope.

// The wire to mvu-helper's dispatcher. PUBLISHED in authority §9a; the cross-repo test pins all
// THREE spellings (that doc, mvu-helper's constant, this one) so no two can agree without it.
export const MENU_ACTION_MESSAGE = 'mvu-statusmenu-action';
export const MENU_ACTION_RESULT_MESSAGE = MENU_ACTION_MESSAGE + '-result';
export const MENU_ACTION_TIMEOUT_MS = 8000;

// ── pure decisions ───────────────────────────────────────────────────────────

// What a call will post, validated BEFORE posting: a plain name, plain JSON args, plus the renderer's
// own observation of where the click sat (`scopePath`, '' at root). Chrome sites build `args` in code
// and come through here; a baked button's data-args string is parsed first (planMenuActionRequest).
// { ok, action, args } or { ok:false, reason }. The refusal here IS the guard — the host's reader
// normalises args and would accept a prototype key as an honest one.
export function planMenuActionCall(action, args, scopePath) {
    const nameProblem = actionNameProblem(action);
    if (nameProblem) return { ok: false, reason: nameProblem };
    const argsProblem = actionArgsProblem(args === undefined ? {} : args);
    if (argsProblem) return { ok: false, reason: argsProblem };
    return { ok: true, action, args: Object.assign({}, args || {}, { scopePath: String(scopePath || '') }) };
}

// A data-args attribute → { ok, args } ('' or null → {}), or { ok:false, reason }.
export function parseDataArgs(argsText) {
    if (typeof argsText !== 'string' || !argsText.trim()) return { ok: true, args: {} };
    try { return { ok: true, args: JSON.parse(argsText) }; }
    catch (e) { return { ok: false, reason: 'data-args is not valid JSON: ' + e.message }; }
}

// A baked button's request: data-action + data-args (a JSON string, '' or null for none).
export function planMenuActionRequest(action, argsText, scopePath) {
    const parsed = parseDataArgs(argsText);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    return planMenuActionCall(action, parsed.args, scopePath);
}

// The args a list cell declared for the rows it renders (its container's data-args), merged UNDER the
// click's own observations so a declared key never overrides listPath/itemKey. '' or null → {}.
// Not valid JSON → {} plus the reason, so the caller can say so instead of posting half a call.
export function mergeCellArgs(cellArgsText, clickArgs) {
    let declared = {};
    let reason = '';
    if (typeof cellArgsText === 'string' && cellArgsText.trim()) {
        try {
            const parsed = JSON.parse(cellArgsText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) declared = parsed;
            else reason = 'the cell\'s data-args is not a JSON object';
        } catch (e) { reason = 'the cell\'s data-args is not valid JSON: ' + e.message; }
    }
    return { args: Object.assign({}, declared, clickArgs || {}), reason };
}

// The in-flight gate. ONE outstanding action at a time; nothing queues, nothing re-snapshots.
export function menuActionGateDecision(inFlight) {
    if (!inFlight) return { allow: true, reason: '' };
    return { allow: false, reason: 'action "' + inFlight.action + '" is still in flight — one at a time' };
}

// ── runtime ──────────────────────────────────────────────────────────────────

let _menuActionInFlight = null;   // { action, startedAt } until the host replies or the wait times out
let _menuActionSeq = 0;

function postMenuAction(action, args) {
    return new Promise((resolve) => {
        const requestId = 'ma-' + (++_menuActionSeq);
        const onMessage = (event) => {
            const d = event && event.data;
            if (!d || d.type !== MENU_ACTION_RESULT_MESSAGE || d.requestId !== requestId) return;
            cleanup();
            resolve(d);
        };
        const timer = setTimeout(() => { cleanup(); resolve(null); }, MENU_ACTION_TIMEOUT_MS);
        const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); };
        window.addEventListener('message', onMessage);
        try {
            window.top.postMessage({ type: MENU_ACTION_MESSAGE, requestId, action, args }, '*');
        } catch (e) {
            console.warn('[MZSMB][action] could not reach the host page:', e.message);
            cleanup();
            resolve(null);
        }
    });
}

// The button's state, readable by CSS ([data-action-state]) and by a hover (title = the reason).
function markMenuActionState(button, state, reason) {
    if (!button || typeof button.setAttribute !== 'function') return;
    button.setAttribute('data-action-state', state);
    if (reason) button.title = reason;
    else button.removeAttribute('title');
}

// THE ONE DOOR every menu write goes through. Gate → validate → post → report → re-read.
// Returns { ok, reason, applied, refused } so chrome can react (revert a checkbox, keep a form open,
// close a modal) — it never throws, and it never touches state itself.
// `ui.button` (optional) gets the busy/done/refused marks a baked button shows.
async function dispatchMenuAction(action, args, scopePath, ui) {
    const button = ui && ui.button;
    const gate = menuActionGateDecision(_menuActionInFlight);
    if (!gate.allow) {
        console.warn('[MZSMB][action] refused: ' + gate.reason);
        return { ok: false, reason: gate.reason, applied: 0, refused: [] };
    }
    const plan = planMenuActionCall(action, args, scopePath);
    if (!plan.ok) {
        console.warn('[MZSMB][action] not posted — ' + plan.reason);
        markMenuActionState(button, 'refused', plan.reason);
        return { ok: false, reason: plan.reason, applied: 0, refused: [] };
    }
    _menuActionInFlight = { action: plan.action, startedAt: Date.now() };
    markMenuActionState(button, 'busy', '');
    try {
        const reply = await postMenuAction(plan.action, plan.args);
        if (!reply) {
            const reason = 'mvu-helper did not answer within ' + MENU_ACTION_TIMEOUT_MS + 'ms — is the extension installed and up to date?';
            console.warn('[MZSMB][action] "' + plan.action + '": ' + reason);
            markMenuActionState(button, 'refused', 'no answer from mvu-helper');
            return { ok: false, reason, applied: 0, refused: [] };
        }
        if (!reply.ok) {
            console.warn('[MZSMB][action] "' + plan.action + '" refused by the host: ' + reply.reason);
            markMenuActionState(button, 'refused', reply.reason || 'refused');
            return { ok: false, reason: reply.reason || 'refused', applied: 0, refused: [] };
        }
        const refused = Array.isArray(reply.refused) ? reply.refused : [];
        console.log('[MZSMB][action] "' + plan.action + '" applied ' + reply.applied + ' op(s)'
            + (refused.length ? ' — REFUSED by the card schema: ' + refused.join(', ') : ''));
        markMenuActionState(button, 'done', '');
        // The host wrote to the live message, and its persist emits no event this frame hears — so
        // re-read now instead of waiting for the 2 s poll.
        if (typeof refreshFromMvu === 'function') await refreshFromMvu();
        return { ok: true, reason: '', applied: reply.applied, refused };
    } finally {
        _menuActionInFlight = null;
    }
}

async function runMenuActionFromButton(button) {
    const scopePath = typeof packScopeOf === 'function' ? packScopeOf(button) : '';
    const parsed = parseDataArgs(button.getAttribute('data-args'));
    if (!parsed.ok) {
        console.warn('[MZSMB][action] not posted — ' + parsed.reason);
        markMenuActionState(button, 'refused', parsed.reason);
        return;
    }
    await dispatchMenuAction(button.getAttribute('data-action'), parsed.args, scopePath, { button });
}

// ONE delegated listener for the document — pack tabs and the card's own tabs alike, rows cloned
// later included. Called from the export's init chain, never at load: the pure half above must import
// into node (tools/test-pack-layout.mjs) without a document.
function wireMenuActionClicks() {
    document.addEventListener('click', (event) => {
        const target = event.target;
        const button = target && typeof target.closest === 'function' ? target.closest('[data-action]') : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        void runMenuActionFromButton(button);
    });
}
