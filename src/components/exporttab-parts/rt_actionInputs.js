// --- Row actions and the generic args form (B5 · D8) ---
//
// Three layers, each blind to the next's content: the LAYOUT says which verbs sit on a row
// (`rowActions` on a list cell), the ENGINE says what a verb needs (`inputs.<name>(args, root)`,
// evaluated in mvu-helper's Worker and relayed verbatim), and THIS runtime draws both mechanically
// and posts {action, args} through the one door every menu write uses (rt_menuAction.js). Nothing
// here knows what a verb means, which container a wearer keeps things in, or who can carry what —
// a new row verb is one engine action plus one array entry in the layout, and a verb that needs a
// choice declares its inputs instead of getting a hand-written modal in platform code, which is
// how consumer vocabulary reached the runtime once (pack-authoring-plan D8).
//
// Reads dispatchMenuAction / mergeCellArgs (rt_menuAction.js), rowActionsProblem
// (rt_htmlGenerators.js), packScopeOf (rt_packLayout.js) and getModalContext (rt_modalUi.js) from
// the shared module scope. Carries `export` for its pure decisions (tools/test-pack-layout.mjs) —
// inert inside the exported document's single <script type="module">, like rt_menuAction.js.

// The wire to mvu-helper's inputs relay. PUBLISHED in authority §9a; the cross-repo test pins all
// THREE spellings (that doc, mvu-helper's constant, this one) so no two can agree without it.
export const MENU_ACTION_INPUTS_MESSAGE = 'mvu-statusmenu-action-inputs';
export const MENU_ACTION_INPUTS_RESULT_MESSAGE = MENU_ACTION_INPUTS_MESSAGE + '-result';
export const MENU_ACTION_INPUTS_TIMEOUT_MS = 8000;

// The input kinds the form can draw — the same closed list mvu-helper's validateMenuInputs admits,
// so an engine declaring another kind is refused there by name and the form never sees it.
// PUBLISHED in authority §9a, ORDER included; the cross-repo test pins the doc's list against both.
export const MENU_INPUT_KINDS = ['pick', 'number', 'text', 'boolean'];

// ── pure decisions ───────────────────────────────────────────────────────────

// A list cell's data-row-actions attribute → { actions: [{ title, action, args, confirm }], reason }.
// '' or null → none. Not valid JSON, not an array, or one entry that would not post → NONE plus the
// reason: half a row's verbs drawn is worse than none, and the caller can say why. The entry rules
// are the emitter's (rowActionsProblem), checked again here because the attribute is authored text
// riding in from a pack, and the click side is where a refusal can still name the row.
export function parseRowActions(text) {
    if (typeof text !== 'string' || !text.trim()) return { actions: [], reason: '' };
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { actions: [], reason: 'data-row-actions is not valid JSON: ' + e.message }; }
    const problem = rowActionsProblem(parsed);
    if (problem) return { actions: [], reason: 'data-row-actions ' + problem };
    return {
        actions: parsed.map((a) => ({ title: String(a.title), action: String(a.action), args: a.args || {}, confirm: a.confirm })),
        reason: '',
    };
}

// An option is a bare scalar or { value, label }: the label is what the form shows, the value is
// what the action receives, typed exactly as the engine wrote it.
export function optionValue(option) {
    return (option && typeof option === 'object') ? option.value : option;
}
export function optionLabel(option) {
    if (option && typeof option === 'object') return String(option.label === undefined ? option.value : option.label);
    return String(option);
}

// What the engine's declaration still needs from the player. A `pick` with exactly ONE option is
// not a choice and is answered here without asking; everything else is asked. A declared `value` is
// a DEFAULT the form shows, never an answer — the engine asked, so the player is asked.
// Returns { args: the pre-answered {name: value}, ask: the inputs the form must draw }.
export function planInputAnswers(inputs) {
    const args = {};
    const ask = [];
    for (const input of Array.isArray(inputs) ? inputs : []) {
        if (input.kind === 'pick' && Array.isArray(input.options) && input.options.length === 1) {
            args[input.name] = optionValue(input.options[0]);
            continue;
        }
        ask.push(input);
    }
    return { args, ask };
}

// The form's raw reads — a field's string, a checkbox's boolean, a select's option INDEX — typed by
// the KIND the engine declared. This is the one typing the runtime may do: the engine said "number",
// so a number is what it asked for; the form is not guessing (§B.7e.6). A read that cannot satisfy
// its kind refuses the whole submit naming the field, and nothing is posted.
// Returns { ok, args } or { ok: false, reason }.
export function readInputAnswers(inputs, raw) {
    const args = {};
    const values = raw && typeof raw === 'object' ? raw : {};
    for (const input of Array.isArray(inputs) ? inputs : []) {
        const value = values[input.name];
        const shown = input.label || input.name;
        switch (input.kind) {
            case 'number': {
                const text = value === undefined || value === null ? '' : String(value).trim();
                if (text === '' || Number.isNaN(Number(text))) return { ok: false, reason: '"' + shown + '" must be a number' };
                args[input.name] = Number(text);
                break;
            }
            case 'boolean':
                args[input.name] = value === true || value === 'true';
                break;
            case 'pick': {
                const options = Array.isArray(input.options) ? input.options : [];
                const index = Number(value);
                if (!Number.isInteger(index) || index < 0 || index >= options.length) return { ok: false, reason: '"' + shown + '" needs one of its options' };
                args[input.name] = optionValue(options[index]);
                break;
            }
            default:
                args[input.name] = value === undefined || value === null ? '' : String(value);
        }
    }
    return { ok: true, args };
}

// ── runtime ──────────────────────────────────────────────────────────────────

let _inputsSeq = 0;

// Ask the host what an action needs, handing it the row's observations so the engine can compute
// candidates FOR this row. Resolves the host's { ok, inputs } | { ok: false, reason }, or null when
// nothing answered in time.
function postActionInputsRequest(action, args) {
    return new Promise((resolve) => {
        const requestId = 'mi-' + (++_inputsSeq);
        const onMessage = (event) => {
            const d = event && event.data;
            if (!d || d.type !== MENU_ACTION_INPUTS_RESULT_MESSAGE || d.requestId !== requestId) return;
            cleanup();
            resolve(d);
        };
        const timer = setTimeout(() => { cleanup(); resolve(null); }, MENU_ACTION_INPUTS_TIMEOUT_MS);
        const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); };
        window.addEventListener('message', onMessage);
        try {
            window.top.postMessage({ type: MENU_ACTION_INPUTS_MESSAGE, requestId, action, args }, '*');
        } catch (e) {
            console.warn('[MZSMB][action] could not reach the host page for inputs:', e.message);
            cleanup();
            resolve(null);
        }
    });
}

// One declared row verb, clicked. Confirm (presentation) → ask the engine what it needs → answer
// what is not a choice → draw the rest → post through the one door. `row` is what the click
// observed ({ listPath, itemKey }), `cellArgsText` the list cell's own data-args, `origin`
// { scopePath, button }. Precedence, most specific first: the row's observations, the row action's
// static args, the cell's args — a declared key never overrides what the click saw.
async function runRowAction(rowAction, row, cellArgsText, origin) {
    if (rowAction.confirm) {
        const question = typeof rowAction.confirm === 'string'
            ? rowAction.confirm.split('{itemKey}').join(row.itemKey)
            : rowAction.title + ' "' + row.itemKey + '"?';
        if (!confirm(question)) return { ok: false, reason: 'cancelled', applied: 0, refused: [] };
    }
    const merged = mergeCellArgs(cellArgsText, Object.assign({}, rowAction.args || {}, row));
    if (merged.reason) console.warn('[MZSMB][action] ' + rowAction.action + ': ' + merged.reason + ' — posting without the cell\'s args');
    const scopePath = String((origin && origin.scopePath) || '');
    const button = origin && origin.button;

    const reply = await postActionInputsRequest(rowAction.action, Object.assign({}, merged.args, { scopePath }));
    if (!reply) {
        const reason = 'mvu-helper did not answer the inputs request within ' + MENU_ACTION_INPUTS_TIMEOUT_MS + 'ms — is the extension installed and up to date?';
        console.warn('[MZSMB][action] "' + rowAction.action + '": ' + reason);
        alert(rowAction.title + ' refused: ' + reason);
        return { ok: false, reason, applied: 0, refused: [] };
    }
    if (!reply.ok) {
        console.warn('[MZSMB][action] "' + rowAction.action + '" inputs refused by the host: ' + reply.reason);
        alert(rowAction.title + ' refused: ' + reply.reason);
        return { ok: false, reason: reply.reason || 'refused', applied: 0, refused: [] };
    }
    const plan = planInputAnswers(reply.inputs);
    if (!plan.ask.length) {
        const result = await dispatchMenuAction(rowAction.action, Object.assign({}, merged.args, plan.args), scopePath, { button });
        if (!result.ok && result.reason) alert(rowAction.title + ' refused: ' + result.reason);
        return result;
    }
    return showActionInputsForm(rowAction, plan, merged.args, scopePath, button);
}

// ONE generic form for every verb that needs input. Draws what the engine declared — a pick as a
// select, number and text as inputs, a boolean as a checkbox — reads it back typed by the declared
// kind, and posts through the one door. A refused write keeps the form open showing the reason,
// exactly as the detail form does. The form interprets nothing of the declaration beyond the four
// kinds it can draw.
function showActionInputsForm(rowAction, plan, baseArgs, scopePath, button) {
    return new Promise((resolve) => {
        const { context, targetBody } = getModalContext();
        const doc = context.document;
        const theme = readMenuTheme();
        const accent = theme.accent;
        const bg = theme.background;
        const text = theme.text;
        const border = theme.border;

        const stale = doc.getElementById('action-inputs-overlay');
        if (stale) stale.remove();
        const overlay = doc.createElement('div');
        overlay.id = 'action-inputs-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; width:100vw; height:100dvh; min-height:100dvh; background:rgba(0,0,0,0.85); z-index:50000; display:flex; justify-content:center; align-items:center; overflow:auto; padding:12px; box-sizing:border-box; backdrop-filter:blur(2px);';
        const content = doc.createElement('div');
        content.style.cssText = 'background:' + bg + '; border:1px solid ' + accent + '; padding:20px; border-radius:8px; width:90%; max-width:min(400px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; color:' + text + '; box-shadow:0 0 20px ' + border + '; box-sizing:border-box;';
        const header = doc.createElement('h3');
        header.textContent = rowAction.title;
        header.style.cssText = 'margin-top:0; color:' + accent + '; margin-bottom:15px; border-bottom:1px solid ' + border + '; padding-bottom:10px;';
        content.appendChild(header);

        const fields = doc.createElement('div');
        fields.style.cssText = 'display:flex; flex-direction:column; gap:10px; margin-bottom:15px;';
        const controls = new Map();
        for (const input of plan.ask) {
            const row = doc.createElement('label');
            row.style.cssText = 'display:flex; flex-direction:column; gap:4px; font-size:0.9em;';
            const caption = doc.createElement('span');
            caption.textContent = input.label || input.name;
            caption.style.cssText = 'color:' + accent + '; font-weight:bold;';
            row.appendChild(caption);
            let control;
            if (input.kind === 'pick') {
                control = doc.createElement('select');
                (input.options || []).forEach((option, i) => {
                    const opt = doc.createElement('option');
                    opt.value = String(i);
                    opt.textContent = optionLabel(option);
                    if (input.value !== undefined && optionValue(option) === input.value) opt.selected = true;
                    control.appendChild(opt);
                });
            } else if (input.kind === 'boolean') {
                control = doc.createElement('input');
                control.type = 'checkbox';
                control.checked = input.value === true;
            } else {
                control = doc.createElement('input');
                control.type = input.kind === 'number' ? 'number' : 'text';
                if (input.value !== undefined && input.value !== null) control.value = String(input.value);
            }
            if (control.type !== 'checkbox') {
                control.style.cssText = 'padding:8px; background:' + theme.tint(8) + '; border:1px solid ' + border + '; color:' + text + '; border-radius:4px; outline:none;';
            }
            controls.set(input.name, control);
            row.appendChild(control);
            fields.appendChild(row);
        }
        content.appendChild(fields);

        const problem = doc.createElement('div');
        problem.style.cssText = 'color:#ff8a80; font-size:0.85em; min-height:1.2em; margin-bottom:10px;';
        content.appendChild(problem);

        const buttons = doc.createElement('div');
        buttons.style.cssText = 'display:flex; gap:8px;';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.style.cssText = 'flex:1; padding:10px; background:rgba(255,100,100,0.1); border:1px solid rgba(255,100,100,0.4); color:#ff6b6b; border-radius:4px; cursor:pointer;';
        const submit = doc.createElement('button');
        submit.type = 'button';
        submit.textContent = rowAction.title;
        submit.style.cssText = 'flex:1; padding:10px; background:' + theme.tint(15) + '; border:1px solid ' + accent + '; color:' + accent + '; border-radius:4px; cursor:pointer; font-weight:bold;';
        buttons.appendChild(cancel);
        buttons.appendChild(submit);
        content.appendChild(buttons);
        overlay.appendChild(content);
        targetBody.appendChild(overlay);

        const close = (result) => { overlay.remove(); resolve(result); };
        cancel.onclick = () => close({ ok: false, reason: 'cancelled', applied: 0, refused: [] });
        overlay.onclick = (e) => { if (e.target === overlay) cancel.onclick(); };
        submit.onclick = async () => {
            const raw = {};
            for (const [name, control] of controls) raw[name] = control.type === 'checkbox' ? control.checked : control.value;
            const read = readInputAnswers(plan.ask, raw);
            if (!read.ok) { problem.textContent = read.reason; return; }
            submit.disabled = true;
            const result = await dispatchMenuAction(rowAction.action, Object.assign({}, baseArgs, plan.args, read.args), scopePath, { button });
            submit.disabled = false;
            if (!result.ok) { problem.textContent = result.reason || 'refused'; return; }
            close(result);
        };
    });
}
