async function updateStatusPanel(gameData) {
    if (!gameData || !gameData.stat_data) return;
    const stat = gameData.stat_data;

    // Phase 0: resolve formatters before anything paints, so the render below reads resolved values
    // synchronously. Two lanes, and they never overlap on a cell: the PACK's cells are answered by
    // mvu-helper's hosted engine in ONE round trip (rt_packLayout), and this file's own baked cells by
    // an engine pasted into it (rt_pastedEngine — the throwaway lane, absent in the normal file).
    // Both cost nothing when their side is not in play.
    if (typeof resolvePackFormatters === 'function') await resolvePackFormatters(stat);
    if (typeof resolveOwnFormatters === 'function') resolveOwnFormatters(stat);

    // Phase 1: Update Unmapped (Global) Bindings
    updateBindingsIn(document.body, stat, stat);
    updateLorebookContent(document.body); // Async

    // Phase 2: Update Mapped Blocks (Collections/Records)
    const containers = document.querySelectorAll('[data-bind-root]');
    for (const container of containers) {
         const rootKey = container.getAttribute('data-bind-root');
         const templateId = container.getAttribute('data-template');
         if (rootKey && templateId) {
              const rootData = getV(stat, rootKey, null);
              // Pass global 'stat' as rootData
              renderBlock(container.id, rootData, templateId, stat);
              updateLorebookContent(container); // Async
         }
    }
}

// --- MVU Event Logic (Native) ---
// The frame's last-read copy of stat_data — read-only here: every write leaves through
// dispatchMenuAction and comes back through a re-read.
let _lastStatData = null;

const parseMessageIdFromName = (name) => {
    if (!name || typeof name !== 'string' || !name.includes('message')) return -1;
    const match = name.match(/message.*?(\d+)/i);
    if (!match) return -1;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
};

const resolveCurrentMessageId = () => {
    // 1. Prefer SillyTavern API over iframe name to avoid stale IDs.
    if (typeof getCurrentMessageId === "function") {
        const apiId = Number(getCurrentMessageId());
        if (Number.isFinite(apiId) && apiId >= 0) return apiId;
    }

    // 2. Iframe name
    const frameId = parseMessageIdFromName(window.name);
    if (frameId >= 0) return frameId;

    // 3. Parent Iframe name
    let parentName = '';
    try {
        parentName = window.parent && window.parent !== window ? window.parent.name : '';
    } catch (e) {
        parentName = '';   // EXPECTED: a contained frame cannot read the parent's name; step 1 answers there
    }
    const parentFrameId = parseMessageIdFromName(parentName);
    if (parentFrameId >= 0) return parentFrameId;

    return -1;
};

const refreshFromMvu = async () => {
     // Polling Enabled (Parallel with Events)
    let latestStatData = null;
    const targetWindow = (typeof window.getVariables === "function" && window) || (window.parent && typeof window.parent.getVariables === "function" && window.parent) || null;

    if (targetWindow) {
        const msgId = resolveCurrentMessageId();
        if (msgId >= 0) {
            const context = { type: 'message', message_id: msgId };
            const vars = targetWindow.getVariables(context);
            if (vars && vars.stat_data) latestStatData = vars.stat_data;
        }
        if (!latestStatData) {
            const globalVars = targetWindow.getVariables();
            if (globalVars && globalVars.stat_data) latestStatData = globalVars.stat_data;
        }
    }
    
    // Fallback
    if (!latestStatData) {
         try {
            const msgId = resolveCurrentMessageId();
            if (msgId >= 0) {
                const messages = await getChatMessages(msgId);
                if (messages?.[0]?.data?.stat_data) latestStatData = messages[0].data.stat_data;
            }
         } catch(e) {}
    }

    if (latestStatData) {
        // Determine if we need to update
        // If we are editing (modal open), pause updates to prevent overwrite
        const modal = document.getElementById("portrait-mode-modal");
        if (modal && modal.style.display === "flex") return;

        const isDifferent = JSON.stringify(latestStatData) !== JSON.stringify(_lastStatData);
        if (isDifferent) {
            await updateStatusPanel({ stat_data: latestStatData });
            _lastStatData = JSON.parse(JSON.stringify(latestStatData));
        }
    }
};

const initMvuConnection = async () => {
    // Find execution context
    let target = null;
    if (typeof window.waitGlobalInitialized === 'function') target = window;
    else if (window.parent && typeof window.parent.waitGlobalInitialized === 'function') target = window.parent;
    
    //console.log("[MZSMB] Context Search:", { found: !!target, isParent: target === window.parent });

    if (!target) {
         return;
    }
    
    // 1. Wait for Initialization
    try {
        await target.waitGlobalInitialized('Mvu');
    } catch (e) { }

    const Mvu = target.Mvu;
    let initialStat = null;

    // 2. Initial Fetch
    // 2. Initial Fetch (Prioritize Global Character Data for Upgrades)
    if (Mvu && Mvu.getMvuData) {
        // Try Global ('chat') first
        const chatData = Mvu.getMvuData({ type: 'chat' });
        if (chatData && chatData.stat_data) {
            initialStat = chatData.stat_data;
        } else {
            // Fallback to current message
            const msgId = resolveCurrentMessageId();
            if (msgId >= 0) {
                const msgData = Mvu.getMvuData({ type: 'message', message_id: msgId });
                if (msgData && msgData.stat_data) {
                    initialStat = msgData.stat_data;
                }
            }
        }
        
        if (initialStat) {
            await updateStatusPanel({ stat_data: initialStat });
            _lastStatData = JSON.parse(JSON.stringify(initialStat));
        }
    }

    // 3. Event Scubscription
    if (target.eventOn && Mvu && Mvu.events && Mvu.events.VARIABLE_UPDATE_ENDED) {
        target.eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, async (data) => {
             // Check if we are editing
             const modal = document.getElementById("portrait-mode-modal");
             if (modal && modal.style.display === "flex") return;

             // Use Lodash to extract data safely
             let stat = null;
             if (_ && _.get) {
                 stat = _.get(data, 'stat_data');
             } else {
                 stat = data?.stat_data;
             }

             // If data came in directly
             if (stat) {
                 await updateStatusPanel({ stat_data: stat });
                 _lastStatData = JSON.parse(JSON.stringify(stat));
             }
        });
    }

    // Polling Fallback (Runs in parallel to catch missed events)
    setInterval(refreshFromMvu, 2000);

    return initialStat;
};
