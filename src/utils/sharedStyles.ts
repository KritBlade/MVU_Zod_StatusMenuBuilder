export const EXPORT_CSS_CONTENT = `
    :root {
        --text-primary: #e0f7fa;
        --text-secondary: #81d4fa;
        --accent-primary: #00e5ff;
        --border-color: rgba(0, 229, 255, 0.3);
        --background-card: rgba(0, 20, 40, 0.65);
    }
    /* mvu-row-sync-v4 */
    * { box-sizing: border-box; }
    /* Gradient Animation */
    @keyframes gradient-flow {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    body {
        font-family: 'Segoe UI', sans-serif;
        background: transparent;
        color: var(--text-primary);
        margin: 0; padding: 10px;
        font-size: 16px;
    }

    .status-container, .status-card {
        display: flex; flex-direction: column;
        background: linear-gradient(-45deg, #02060e, #032e6a, #0356c5, #032e6a);
        background-size: 400% 400%;
        animation: gradient-flow 30s ease infinite;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        min-height: 500px;
        overflow: hidden;
        max-width: 100%;
        box-sizing: border-box;
        transition: width 0.3s;
        margin: 0 auto;
    }

    /* .tab-nav is the canonical tab container. PreviewRenderer uses it too (was .preview-tabs). */
    .tab-nav {
        display: flex;
        background: rgba(0,0,0,0.3);
        border-bottom: 1px solid var(--border-color);
        overflow-x: auto;
    }
    .tab-btn {
        padding: 12px 20px; color: var(--text-secondary); cursor: pointer;
        border-bottom: 2px solid transparent; user-select: none;
    }
    .tab-btn.active {
        color: var(--accent-primary); border-bottom-color: var(--accent-primary);
    }
    /* Builder Preview tab buttons — display-only (cursor: default, no click handler) */
    .p-tab-btn {
        padding: 12px 20px;
        color: var(--text-secondary);
        cursor: default;
        border-bottom: 2px solid transparent;
        user-select: none;
    }
    .p-tab-btn.active {
        color: var(--accent-primary);
        border-bottom: 2px solid var(--accent-primary);
    }

    /* Pagination — shared flex layout */
    .pagination-controls,
    .pagination-controls-sm {
        display: flex;
        justify-content: center;
        align-items: center;
    }
    /* Large pagination (PreviewRenderer top-level list pager) */
    .pagination-controls {
        gap: 15px;
        margin-top: 15px;
        padding-top: 10px;
        border-top: 1px solid var(--border-color);
    }
    .pager-btn {
        background: transparent;
        border: 1px solid var(--accent-primary);
        color: var(--accent-primary);
        width: 30px;
        height: 30px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .pager-btn:disabled {
        border-color: #555;
        color: #555;
        cursor: not-allowed;
    }
    .pager-btn:hover:not(:disabled) {
        background: rgba(0, 229, 255, 0.2);
    }
    .page-info {
        font-size: 0.9em;
        color: #aaa;
    }
    .tab-content { display: none; padding: 10px; height: 100%; overflow-y: auto; }
    .tab-content.active { display: block; }

    .grid-row { display: flex; flex-wrap: wrap; margin: 0 -5px; align-items: stretch; align-content: flex-start; max-width: 100%; }
    .responsive-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(55px, 1fr));
        gap: 2px;
        width: 100%;
    }
    /* When .grid-row and .responsive-stats-grid are used together, flex wins via specificity (0,2,0 > 0,1,0).
       This replaces the old duplicate .grid-row rule that was previously used as a cascade anchor. */
    .grid-row.responsive-stats-grid { display: flex; flex-wrap: wrap; margin: 0 -5px; align-items: stretch; align-content: flex-start; }
    .grid-full-width {
        grid-column: 1 / -1;
    }
    
    /* Responsive Grid Layout Adjustments */
    .responsive-stats-grid .checkbox-display {
        justify-content: flex-start;
    }
    .col-wrapper { padding: 5px; box-sizing: border-box; min-width: 0; max-width: 100%; overflow: hidden; }
    .info-card {
        background: var(--background-card);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 8px;
        height: 100%;
    }
    .card-header {
        color: var(--accent-primary); font-weight: bold;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 3px; margin-bottom: 4px;
    }

    .prop-list {
        display: flex;
        flex-wrap: wrap;
        margin: 0 -4px;
        width: 100%;
    }
    .prop-row-wrapper { 
        padding: 1px 4px; 
        box-sizing: border-box; 
        min-width: 55px;
        flex: 1 0 auto;
    }
    .prop-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        border-bottom: 1px dashed rgba(255,255,255,0.1);
        padding: 2px 0; margin: 0;
        line-height: 1.2;
        font-size: 0.875em;
        min-width: 0;
        gap: 4px;
    }
    .prop-label {
        color: #81d4fa;
        flex: 0 0 auto;
        max-width: 100%;
        margin-right: 4px;
        margin-bottom: 1px;
        padding-top: 2px;
        white-space: nowrap !important;
        overflow: visible !important;
        text-overflow: clip !important;
    }
    .prop-val-container {
        flex: 1 1 auto;
        width: auto;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        min-width: 0;
    }
    .prop-val {
        font-weight: 400;
        width: auto;
        max-width: 100%;
        min-width: 0;
        overflow-wrap: break-word;
        word-break: normal;
    }
    .checkbox-display {
        width: 100%;
        display: flex;
        justify-content: flex-start;
    }

    /* List content fallback (works even where :has is unsupported) */
    .prop-val ul,
    .prop-val ol {
        margin: 0;
        padding-left: 1.2em;
        text-align: left;
        line-height: 1.35;
        list-style-position: outside;
        list-style-type: disc;
    }
    .prop-val ol { list-style-type: decimal; }
    .prop-val li { margin-bottom: 4px; }
    .prop-val li:last-child { margin-bottom: 0; }
    .hidden { display: none !important; }

    /* Stat Bars */
    .stat-bar-box,
    .stat-bar-card {
        display: flex; flex-direction: column;
        margin-bottom: 4px; padding: 4px;
        background: rgba(0,0,0,0.2); border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.05);
    }
    /* Label and value share one line while both fit. Otherwise the whole value moves below the label. */
    .stat-bar-header {
        display: flex; flex-wrap: wrap; column-gap: 4px; justify-content: space-between; margin-bottom: 4px; font-size: 0.9em;
    }
    .stat-bar-label { font-weight: bold; color: #fff; }
    .stat-bar-val { font-family: monospace; color: #ccc; white-space: nowrap; margin-left: auto; }
    
    /* The track sits at the foot of its box so the bars of one grid row stay level. */
    .stat-bar-track {
        margin-top: auto;
        width: 100%;
        height: 8px;
        background: rgba(0,0,0,0.5);
        border-radius: 4px;
        overflow: hidden;
    }
    .stat-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s ease;
    }
    /* Bar Colors with Gradients */
    .bar-red { background: linear-gradient(90deg, #ff5252, #ff8a80); box-shadow: 0 0 5px rgba(255,82,82,0.5); }
    .bar-green { background: linear-gradient(90deg, #50fa7b, #69f0ae); box-shadow: 0 0 5px rgba(80,250,123,0.5); }
    .bar-darkgreen { background: linear-gradient(90deg, #05870e, #2e7d32); box-shadow: 0 0 5px rgba(5,135,14,0.5); }
    .bar-blue { background: linear-gradient(90deg, #4272f5, #82b1ff); box-shadow: 0 0 5px rgba(66,114,245,0.5); }
    .bar-cyan { background: linear-gradient(90deg, #00e5ff, #84ffff); box-shadow: 0 0 5px rgba(0,229,255,0.5); }
    .bar-orange { background: linear-gradient(90deg, #fab025, #ffe082); box-shadow: 0 0 5px rgba(250,176,37,0.5); }
    .bar-yellow { background: linear-gradient(90deg, #faf325, #ffffb0); box-shadow: 0 0 5px rgba(250,243,37,0.5); }
    .bar-purple { background: linear-gradient(90deg, #8a42f5, #b388ff); box-shadow: 0 0 5px rgba(138,66,245,0.5); }
    .bar-pink { background: linear-gradient(90deg, #fc8bd5, #ff80ab); box-shadow: 0 0 5px rgba(252,139,213,0.5); }
    .bar-brown { background: linear-gradient(90deg, #a15012, #8d6e63); box-shadow: 0 0 5px rgba(161,80,18,0.5); }
    .bar-default { background: linear-gradient(90deg, #ff5252, #ff8a80); }

    /* Grid Layout */
    .list-grid-view {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
        width: 100%;
    }
    .list-inventory-view {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
        width: 100%;
    }
    .grid-tile {
        background: rgba(0, 40, 60, 0.8);
        border: 1px solid var(--border-color);
        padding: 6px 10px;
        border-radius: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #fff;
        font-weight: bold;
        font-size: 0.95em;
    }
    .tile-name { 
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; 
    }
    .tile-qty {
        color: var(--accent-primary);
        font-size: 0.85em;
        margin-left: 8px;
        flex-shrink: 0;
    }
    /* Shared header style — .nested-section-header used in exported HTML; .grid-group-header builder-only */
    .nested-section-header,
    .grid-group-header {
        font-size: 0.9em; font-weight: bold; color: var(--accent-primary);
        border-bottom: 1px solid rgba(0, 229, 255, 0.3);
        text-transform: uppercase; letter-spacing: 0.5px;
    }
    .nested-section-header { padding-bottom: 2px; margin-bottom: 4px; margin-top: 8px; }
    /* .grid-group-header has more vertical breathing room */
    .grid-group-header { padding-bottom: 4px; margin-bottom: 8px; }
    .simple-list { margin-top: 4px; }
    .list-collapse-wrapper { margin-top: 4px; }
    .list-collapse-header { user-select: none; }
    .list-collapse-header:hover { opacity: 0.85; }
    .list-entry { padding: 1px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); }
    .entry-title { color: var(--text-primary); font-weight: bold; font-size: 0.95em; }
    .entry-desc { font-size: 0.85em; color: #ccc; }
    
    /* Checkbox Row */
    .kin-checkbox-row {
        font-size: 0.9em;
        background: rgba(0,0,0,0.2);
        padding: 4px 8px;
        border-radius: 4px;
        width: 100%;
        gap: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
    }
    .kin-checkbox-label {
        display: flex; align-items: center; gap: 6px;
        cursor: pointer; color: var(--text-primary);
        user-select: none;
    }
    .kin-checkbox-text {
        color: #81d4fa;
        display: block;
        flex: 1 1 auto;
        min-width: 0;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
    }
    .kin-checkbox-control {
        flex: 0 0 auto;
        width: auto;
        min-width: 20px;
        margin-left: auto;
        justify-content: flex-end;
    }
    .kin-checkbox-label input { margin: 0; cursor: pointer; }

    /* On narrow layouts, place checkbox on next line so long labels remain fully visible */
    @media (max-width: 560px) {
        .kin-checkbox-text {
            flex: 1 0 100%;
        }
        .kin-checkbox-control {
            flex: 1 0 100%;
            width: 100%;
            margin-left: 0;
            justify-content: flex-end;
        }
    }

    .img-wrapper {
        position: relative;
    }
    .avatar-img {
        max-width: 100%;
        height: auto;
    }
    
    .img-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.85);
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: zoom-out;
        padding: 12px;
        box-sizing: border-box;
    }
    .img-popup-content {
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
        width: auto;
        height: auto;
        display: block;
        border-radius: 4px;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
        object-fit: contain;
    }
    .img-edit-btn {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0,0,0,0.6);
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        border: 1px solid rgba(255,255,255,0.3);
        transition: background 0.2s;
        z-index: 10;
    }
    .img-edit-btn:hover {
        background: rgba(0,0,0,0.9);
        border-color: white;
    }

    .st-checkbox { width: 20px; height: 20px; cursor: pointer; accent-color: #50fa7b; }

    /* ActionButton — the whole look lives here (the runtime stamps only the class); the
       data-action-state rules are the click states rt_menuAction.js sets. */
    .action-row { justify-content: flex-end; }
    .menu-action-btn { background: color-mix(in srgb, var(--accent-primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent); color: var(--accent-primary); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; line-height: 1.2; }
    .menu-action-btn:hover { background: color-mix(in srgb, var(--accent-primary) 30%, transparent); }
    .menu-action-btn[data-action-state="busy"] { opacity: 0.5; cursor: wait; }
    .menu-action-btn[data-action-state="refused"] { border-color: rgba(255,100,100,0.6); color: #ff8a80; }
    .ar-checkbox-input {
        width: 20px;
        height: 20px;
        margin: 0;
        cursor: pointer;
        accent-color: #50fa7b;
        appearance: auto;
        -webkit-appearance: checkbox;
        position: static;
        transform: none;
    }
    .ar-checkbox-input:disabled, .st-checkbox:disabled { cursor: default; }
    .lorebook-placeholder-img { width: 100%; height: 150px; border: 2px dashed #ff5252; background: rgba(255, 82, 82, 0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #ff5252; font-size: 0.9em; padding: 10px; text-align: center; }

    /* Local Pagination (Small) — CardRenderer inline pager; base flex from shared rule above */
    .pagination-controls-sm { gap: 10px; margin-top: 8px; padding-top: 4px; border-top: 1px dashed rgba(0, 229, 255, 0.15); }
    .block-jump-select { background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.3); color: #00e5ff; font-size: 0.85em; padding: 2px 6px; border-radius: 4px; max-width: 180px; cursor: pointer; outline: none; }
    .block-jump-select:focus { border-color: #00e5ff; }
    .block-jump-select option { background: #1a1d24; color: #e0e0e0; }
    .pager-btn-sm { background: transparent; border: 1px solid rgba(0, 229, 255, 0.5); color: #00e5ff; width: 20px; height: 20px; font-size: 0.8em; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .pager-btn-sm:disabled { color: #555; border-color: #555; cursor: not-allowed; }
    .page-info-sm { font-size: 0.75em; color: #888; }

    /* Grid Container & Groups (Builder-side layout wrapper) */
    .grid-group-card { border: 1px solid rgba(0, 229, 255, 0.15); border-radius: 4px; padding: 8px; background: rgba(0,0,0,0.2); margin-top: 5px; }
    .grid-group-content { display: flex; flex-wrap: wrap; margin: 0 -4px; }
    /* A cell is a column its card fills so the cards of one grid row are as tall as the row. */
    .grid-item { box-sizing: border-box; padding: 4px; min-width: 80px; flex: 1 0 auto; display: flex; flex-direction: column; }
    .grid-item > * { flex: 1 1 auto; }
    .grid-item .prop-row { border-bottom: none; background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius: 3px; }

    /* Image Card Layout Wrapper */
    .image-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .p-avatar { width: 100%; border: 1px solid #00e5ff; border-radius: 4px; }
    .p-name { font-family: serif; font-size: 1.2em; color: #00e5ff; }

    /* Quest List Card — canonical class, used by both Builder preview and exported HTML template (tmpl-quest) */
    .quest-card { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 3px solid var(--accent-primary); position: relative; }
    .quest-card-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .quest-card-title { font-weight: bold; color: var(--text-primary); }
    .quest-card-actions { display: flex; gap: 8px; align-items: center; }
    /* row verbs (D8): declared on the list cell, drawn into the template's row-actions slot */
    .row-actions { display: inline-flex; gap: 4px; align-items: center; flex-shrink: 0; }
    .row-action-btn { background: rgba(0,229,255,0.15); border: 1px solid rgba(0,229,255,0.4); color: #00e5ff; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em; line-height: 1.2; white-space: nowrap; }
    .row-action-btn:hover { background: rgba(0,229,255,0.3); }
    .row-action-btn.row-action-delete { background: rgba(255,100,100,0.2); border-color: rgba(255,100,100,0.4); color: #ff6b6b; }
    .row-action-btn[data-action-state="busy"] { opacity: 0.5; cursor: wait; }
    .row-action-btn[data-action-state="refused"] { border-color: rgba(255,100,100,0.6); color: #ff8a80; }
    .quest-difficulty { font-size: 0.8em; background: #333; padding: 2px 6px; border-radius: 4px; }
    .quest-desc { font-size: 0.9em; color: var(--text-secondary); margin-bottom: 4px; }
    .quest-objective { font-size: 0.9em; color: var(--text-primary); margin-bottom: 4px; }
    .quest-next { font-size: 0.8em; color: var(--text-secondary); margin-bottom: 4px; }
    .quest-step { font-size: 0.8em; color: var(--text-secondary); margin-bottom: 4px; }
    .quest-reward { font-size: 0.8em; color: #ffd700; }
    .quest-last-updated { font-size: 0.75em; color: #888; margin-top: 4px; }

    /* Inventory / Equipment Action item controls */

    /* Item Detail Modal — ID-based; used only in exported HTML (detail-modal popup for item inspection) */
    #detail-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; justify-content: center; align-items: center; backdrop-filter: blur(2px); }
    #detail-content { background: #001f3f; border: 1px solid #00e5ff; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; color: #e0f7fa; position: relative; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); }
    #detail-close-btn { position: absolute; top: 10px; right: 15px; background: none; border: none; color: #81d4fa; font-size: 24px; cursor: pointer; }
    #detail-close-btn:hover { color: #fff; }
    #detail-title { margin-top: 0; color: #00e5ff; border-bottom: 1px solid rgba(0,229,255,0.3); padding-bottom: 10px; }
    .detail-row { display: flex; margin-bottom: 5px; font-size: 0.9em; }
    .detail-key { font-weight: bold; color: #81d4fa; min-width: 100px; }
    .detail-val { color: #e0f7fa; white-space: pre-wrap; }
`;

