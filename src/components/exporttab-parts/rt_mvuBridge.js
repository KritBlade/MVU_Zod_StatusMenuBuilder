// rt_mvuBridge.js — MVU variable bridge for exported HTML
// This handles dynamic updates via the MVU variable mechanism (same as MvuStatMenuBuilder)

let _cardData = null;

function loadCardData(data) {
    _cardData = data;
    initCardDisplay(data);
}

// Future: MVU connection for dynamic variable updates
// Will use the same insertOrAssignVariables / updateVariablesWith pattern
// as MvuStatMenuBuilder's rt_mvuConnection.js

function initMvuGameMaker() {
    // Check if card data is embedded in the page
    const dataScript = document.getElementById('embedded-card-data');
    if (dataScript) {
        try {
            const data = JSON.parse(dataScript.textContent);
            loadCardData(data);
        } catch (e) {
            console.error('[MvuGameMaker] Failed to parse embedded card data:', e);
        }
    }
}

// Auto-init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMvuGameMaker);
} else {
    initMvuGameMaker();
}
