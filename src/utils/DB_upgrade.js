/**
 * DB Upgrade Script: Multi-version Sequencer
 * --------------------------------
 * This script handles sequential database upgrades (e.g., 0.65 -> 0.7 -> 0.75).
 * 
 * To add a new version: 
 * 1. Add a new object to the UPGRADES array below.
 * 2. Implement the migration logic in the 'upgrade' function.
 */
export default async function runDbUpgrade(initialStatData, options = {}) {
    // 1. Context Detection
    let targetWindow = null;
    let updateVariablesWith = null;
    let getCurrentMessageId = null;

    // Try Window (SillyTavern Native)
    if (typeof window !== 'undefined' && typeof window.updateVariablesWith === 'function') {
        targetWindow = window;
        updateVariablesWith = window.updateVariablesWith;
        getCurrentMessageId = window.getCurrentMessageId;
    }
    // Try Parent (SillyTavern Extension)
    else if (typeof window !== 'undefined' && window.parent && typeof window.parent.updateVariablesWith === 'function') {
        targetWindow = window.parent;
        updateVariablesWith = window.parent.updateVariablesWith;
        getCurrentMessageId = window.parent.getCurrentMessageId;
    }
    // Try Global (Node.js context, if applicable, though unlikely for this script)
    else if (typeof global !== 'undefined' && typeof global.updateVariablesWith === 'function') {
        targetWindow = global;
        updateVariablesWith = global.updateVariablesWith;
        getCurrentMessageId = global.getCurrentMessageId; // Assuming global might have it
    }


    if (!updateVariablesWith) {
        console.error("❌ [MZSMB] updateVariablesWith not found. Are you running this in SillyTavern?");
        return { upgraded: false, foundData: false, error: 'missing-updateVariablesWith' };
    }

    const parseMessageIdFromName = (name) => {
        if (!name || typeof name !== 'string' || !name.includes('message')) return -1;
        const match = name.match(/message.*?(\d+)/i);
        if (!match) return -1;
        const parsed = parseInt(match[1], 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
    };
    const resolveMessageId = () => {
        // 1. Prefer SillyTavern native API.
        if (typeof getCurrentMessageId === 'function') {
            const apiId = Number(getCurrentMessageId());
            if (Number.isFinite(apiId) && apiId >= 0) return apiId;
        }

        // 2. Local frame name fallback.
        const frameId = (typeof window !== 'undefined') ? parseMessageIdFromName(window.name) : -1;
        if (frameId >= 0) return frameId;

        // 3. Target window name (legacy fallback)
        const targetNameId = parseMessageIdFromName(targetWindow?.name);
        if (targetNameId >= 0) return targetNameId;

        return -1;
    };

    const explicitMessageId = Number(options && options.targetMessageId);
    const hasExplicitMessageId = Number.isFinite(explicitMessageId) && explicitMessageId >= 0;
    const shouldUpdateChatContext = !(options && options.updateChatContext === false);

    const resolvedMessageId = resolveMessageId();
    const messageId = hasExplicitMessageId ? explicitMessageId : resolvedMessageId;

    // Execution loop to apply upgrades to available contexts
    const contextsToUpdate = [];
    if (messageId >= 0) {
        contextsToUpdate.push({ type: 'message', message_id: messageId });
    }
    if (shouldUpdateChatContext) {
        contextsToUpdate.push({ type: 'chat' });
    }

    if (contextsToUpdate.length === 0) {
        return { upgraded: false, foundData: false, error: 'no-target-context' };
    }

    // --- Delay to avoid save-conflicts during init ---
    await new Promise(r => setTimeout(r, 1500));

    // --- Helper Functions ---

    function isObject(val) {
        return val && typeof val === 'object' && !Array.isArray(val);
    }

    // --- Lodash/Helper Access ---
    const _ = targetWindow._ || (window.parent ? window.parent._ : null) || window._;

    function toDescObj(val, key, extraFields = {}) {
        if (isObject(val) && (val.Desc !== undefined || val.description !== undefined)) return val;
        let desc = Array.isArray(val) ? String(val[0] || '') : (val ? String(val) : (key || ''));
        return { Desc: desc, ...extraFields };
    }

    function toInventoryObj(val, key) {
        if (isObject(val) && val.Type !== undefined) return val;
        let qty = 0, desc = '', type = 'Item';
        const lowerKey = key.toLowerCase();
        if (['copper', 'silver', 'gold', 'money', 'coin', 'coins'].some(k => lowerKey.includes(k))) type = 'Money';

        if (Array.isArray(val)) {
            qty = Number(val[0]) || 0;
            desc = String(val[1] || key);
        } else if (typeof val === 'number') {
            qty = val;
            desc = key;
        } else {
            qty = 1;
            desc = String(val || key);
        }
        return { Type: type, Qty: qty, Desc: desc };
    }

    // --- Upgrade Definitions ---
    const UPGRADES = [
        {
            version: 0.7,
            name: "v0.65 -> v0.7: Data Structure Refactor",
            upgrade: (stat) => {
                let changes = 0;
                const mc = stat.Mainchar;
                if (mc) {
                    // Inventory
                    if (mc.Inventory) {
                        for (const key in mc.Inventory) {
                            mc.Inventory[key] = toInventoryObj(mc.Inventory[key], key);
                            changes++;
                        }
                    }
                    // Quests
                    if (mc.Quests) {
                        for (const key in mc.Quests) {
                            mc.Quests[key] = toDescObj(mc.Quests[key], key, {
                                Reward: '', Difficulty: '', Status: ''
                            });
                            changes++;
                        }
                    }
                    // Simple Collections
                    ['Skills', 'Equipment', 'Talents', 'Buffs', 'Ailments'].forEach(field => {
                        if (mc[field]) {
                            for (const key in mc[field]) {
                                mc[field][key] = toDescObj(mc[field][key], key);
                                changes++;
                            }
                        }
                    });
                    // Real_estate
                    if (mc.Real_estate && !mc.Real_estate.Estates && !mc.Real_estate.Buildings) {
                        const oldItems = { ...mc.Real_estate };
                        for (const k in mc.Real_estate) delete mc.Real_estate[k];
                        mc.Real_estate.Estates = oldItems;
                        mc.Real_estate.Buildings = {};
                        changes++;
                    }
                }
                // Familiar
                if (stat.Familiar) {
                    for (const famKey in stat.Familiar) {
                        const fam = stat.Familiar[famKey];
                        if (fam && fam.Equipment) {
                            for (const eqKey in fam.Equipment) {
                                fam.Equipment[eqKey] = toDescObj(fam.Equipment[eqKey], eqKey);
                                changes++;
                            }
                        }
                    }
                }
                return changes;
            }
        },
        {
            version: 0.9,
            name: "v0.7 -> v0.9: PascalCase Field Rename",
            upgrade: (stat) => {
                let changes = 0;

                // Helper: rename a key inside an object (simple rename, no overwrite)
                function renameKey(obj, oldKey, newKey) {
                    if (obj && oldKey in obj && !(newKey in obj)) {
                        obj[newKey] = obj[oldKey];
                        delete obj[oldKey];
                        return 1;
                    }
                    return 0;
                }

                // Smart equipment field fixer:
                // - Lowercase key is ALWAYS deleted if it exists (cleanup)
                // - Value is promoted to PascalCase only if PascalCase is missing/empty
                // - Defaults applied only when neither form has a value
                function ensureEquipFields(eq) {
                    if (!eq || typeof eq !== 'object') return 0;
                    let c = 0;

                    const validTypes = ["Weapon", "Armor", "Accessory"];
                    const validSlots = ["Hand", "Body", "Finger", "Wrist", "Ankle", "Neck"];

                    // description -> Desc
                    if ('description' in eq) {
                        if (eq['description'] && !eq['Desc']) eq['Desc'] = eq['description'];
                        delete eq['description'];
                        c++;
                    }

                    // type -> Type (always delete lowercase; promote if Type missing; validate if exists)
                    if ('type' in eq) {
                        if (!eq.Type) eq.Type = eq.type;
                        delete eq.type;
                        c++;
                    }
                    if (!eq.Type || !validTypes.includes(eq.Type)) {
                        eq.Type = 'Equipment';
                        c++;
                    }

                    // slot -> Slot (always delete lowercase; promote if Slot missing; validate if exists)
                    if ('slot' in eq) {
                        if (!eq.Slot) eq.Slot = eq.slot;
                        delete eq.slot;
                        c++;
                    }
                    if (!eq.Slot || !validSlots.includes(eq.Slot)) {
                        eq.Slot = 'Misc';
                        c++;
                    }

                    // armorPDefBonus -> ArmorPDefBonus
                    if ('armorPDefBonus' in eq) {
                        if (eq['armorPDefBonus'] && !eq['ArmorPDefBonus']) eq['ArmorPDefBonus'] = eq['armorPDefBonus'];
                        delete eq['armorPDefBonus'];
                        c++;
                    }
                    // armorMDefBonus -> ArmorMDefBonus
                    if ('armorMDefBonus' in eq) {
                        if (eq['armorMDefBonus'] && !eq['ArmorMDefBonus']) eq['ArmorMDefBonus'] = eq['armorMDefBonus'];
                        delete eq['armorMDefBonus'];
                        c++;
                    }

                    // hpBonus -> MaxHPBonus
                    if ('hpBonus' in eq) {
                        if (eq['hpBonus'] && !eq['MaxHPBonus']) eq['MaxHPBonus'] = eq['hpBonus'];
                        delete eq['hpBonus'];
                        c++;
                    }
                    // mpBonus -> MaxMPBonus
                    if ('mpBonus' in eq) {
                        if (eq['mpBonus'] && !eq['MaxMPBonus']) eq['MaxMPBonus'] = eq['mpBonus'];
                        delete eq['mpBonus'];
                        c++;
                    }

                    // rarity -> Rarity (always delete lowercase; promote if Rarity missing; no default)
                    if ('rarity' in eq) {
                        if (!eq.Rarity) eq.Rarity = eq.rarity;
                        delete eq.rarity;
                        c++;
                    }

                    return c;
                }

                const mc = stat.Mainchar;
                if (mc) {
                    // --- Standard Collections: rename description -> Desc ---
                    ['Skills', 'Talents', 'Buffs', 'Ailments'].forEach(field => {
                        if (mc[field]) {
                            for (const key in mc[field]) {
                                const item = mc[field][key];
                                if (item && typeof item === 'object') {
                                    changes += renameKey(item, 'description', 'Desc');
                                }
                            }
                        }
                    });

                    // --- Quests: rename description, reward, difficulty, status ---
                    if (mc.Quests) {
                        for (const key in mc.Quests) {
                            const q = mc.Quests[key];
                            if (q && typeof q === 'object') {
                                changes += renameKey(q, 'description', 'Desc');
                                changes += renameKey(q, 'reward', 'Reward');
                                changes += renameKey(q, 'difficulty', 'Difficulty');
                                changes += renameKey(q, 'status', 'Status');
                            }
                        }
                    }
                    // --- Mainchar.Inventory: migrate equipment in inventory ---
                    if (mc.Inventory) {
                        for (const key in mc.Inventory) {
                            const item = mc.Inventory[key];
                            if (item && typeof item === 'object') {
                                // Only migrate entries explicitly marked as equipment types.
                                // If Type is missing/invalid, do NOT infer equipability.
                                const eqTypes = ["Weapon", "Armor", "Accessory", "Equipment"];
                                if (eqTypes.includes(item.Type)) {
                                    changes += ensureEquipFields(item);
                                }
                            }
                        }
                    }

                    // --- Mainchar.Equipment: smart migrate + ensure Type/Slot ---
                    if (mc.Equipment) {
                        for (const key in mc.Equipment) {
                            changes += ensureEquipFields(mc.Equipment[key]);
                        }
                    }
                }

                // --- Familiar.<name>.Equipment: smart migrate + ensure Type/Slot ---
                if (stat.Familiar) {
                    for (const famKey in stat.Familiar) {
                        const fam = stat.Familiar[famKey];
                        if (fam && fam.Equipment) {
                            for (const eqKey in fam.Equipment) {
                                changes += ensureEquipFields(fam.Equipment[eqKey]);
                            }
                        }
                    }
                }
                return changes;
            }
        }
    ];



    let upgradePerformed = false;
    let foundData = false;

    for (const ctx of contextsToUpdate) {
        try {
            if (typeof updateVariablesWith === 'function') {
                await updateVariablesWith((vars) => {
                    if (!vars) {
                        vars = {};
                    }

                    // Clone to avoid mutations if needed, though ST usually clones for us
                    vars = JSON.parse(JSON.stringify(vars));

                    // Fallback to initialStatData if upgrading the message context and it's empty
                    if (!vars.stat_data && ctx.type === 'message' && initialStatData) {
                        vars.stat_data = JSON.parse(JSON.stringify(initialStatData));
                    }

                    if (!vars.stat_data) {
                        return vars;
                    }

                    foundData = true;

                    const stat = vars.stat_data;
                    let currentVer = parseFloat(stat.MVUStatMenu_DB_Ver) || 0;

                    if (targetWindow.__FORCE_UPGRADE || window.__FORCE_UPGRADE) {
                        currentVer = 0;
                    }

                    for (const step of UPGRADES) {
                        if (currentVer < step.version) {
                            step.upgrade(stat);
                            stat.MVUStatMenu_DB_Ver = String(step.version);
                            upgradePerformed = true;
                        }
                    }

                    return vars;
                }, ctx);
            } else {
                console.error(`[MZSMB] Cannot save ${ctx.type} context: updateVariablesWith missing.`);
            }

            // Small delay between context saves to let SillyTavern's event bus breathe
            await new Promise(r => setTimeout(r, 200));

        } catch (e) {
            console.error(`[MZSMB] Error in execution loop for context ${ctx.type}:`, e);
        }
    }

    return {
        upgraded: upgradePerformed,
        foundData,
        messageId
    };
}
