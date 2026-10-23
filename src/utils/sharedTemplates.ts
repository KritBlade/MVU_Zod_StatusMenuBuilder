export const getTemplatesHtml = () => `
    <!-- Every built-in template carries ONE slot for row verbs and no verb of its own (D8): the
         renderer fills it from the list cell's declared rowActions plus its allowDelete flag. -->

    <!-- Grid List Template (Simple) -->
    <template id="tmpl-grid">
        <div class="grid-tile" style="cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px; height:100%; min-height:80px; text-align:center; position:relative;">
            <span class="tile-name" data-slot="name" style="pointer-events:none;"></span>
            <span class="tile-qty" data-slot="qty" style="pointer-events:none;"></span>
            <span class="row-actions" data-slot="row-actions" style="position:absolute; top:2px; right:2px;"></span>

            <!-- Hidden Data Slots for Modal -->
            <div style="display:none" data-slot="desc"></div>
            <div style="display:none" data-slot="difficulty"></div>
            <div style="display:none" data-slot="reward-text"></div>
        </div>
    </template>

    <!-- Quest List Template -->
    <template id="tmpl-quest">
        <div class="quest-card" style="cursor:pointer;">
            <div class="quest-card-header" style="pointer-events:none;">
                <span class="quest-card-title" data-slot="title"></span>
                <div class="quest-card-actions" style="pointer-events:auto;">
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

    <!-- Inventory List Template -->
    <template id="tmpl-inventory">
        <div class="grid-tile" style="cursor:pointer; position:relative; display:flex; flex-direction:row; align-items:center; justify-content:space-between; padding:6px 10px; height:100%; min-height:40px; text-align:left; gap: 8px;">
            <span class="tile-name" data-slot="name" style="pointer-events:none;" title=""></span>
            <span class="tile-qty" data-slot="qty" style="pointer-events:none;"></span>
            <span class="row-actions" data-slot="row-actions"></span>
            <div style="display:none" data-slot="desc"></div>
        </div>
    </template>

    <!-- Equipment List Template -->
    <template id="tmpl-equipment-action">
        <div class="list-entry" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:8px;">
            <div style="pointer-events:none;">
                <div class="entry-title" data-slot="title"></div>
                <div class="entry-desc" data-slot="desc"></div>
            </div>
            <span class="row-actions" data-slot="row-actions"></span>
        </div>
    </template>

    <!-- Simple List Template -->
    <template id="tmpl-simple">
        <div class="simple-item" style="padding: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
            <div>
                <span data-slot="name"></span> <span style="opacity:0.7" data-slot="qty"></span>
            </div>
            <span class="row-actions" data-slot="row-actions"></span>
        </div>
    </template>
`

/*
 * CUSTOM TEMPLATE EXAMPLE
 * =======================
 * Custom templates use data-bind="fieldName" (NOT data-slot).
 * They are created and edited in the builder's "Templates" tab.
 * 
 * When you select "Custom" layout on a QuestList card and type a name
 * (e.g., "test"), the template ID will be: tmpl-custom-test
 * 
 * Available bindings:
 *   data-bind="$key"          → The item's key (e.g., quest name)
 *   data-bind="fieldName"     → Any field from the item's data
 * 
 * Example custom template HTML:
 * 
 * <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:4px; margin-bottom:8px; border-left:3px solid var(--accent-primary); cursor:pointer;">
 *     <div style="font-weight:bold; color:var(--text-primary);">
 *         <span data-bind="$key"></span>
 *     </div>
 *     <div style="font-size:0.85em; color:var(--text-secondary);">
 *         <span data-bind="Desc"></span>
 *     </div>
 *     <div style="font-size:0.85em;">
 *         <span data-bind="reward"></span>
 *     </div>
 * </div>
 */
