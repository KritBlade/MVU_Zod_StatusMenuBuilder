// The default "Advanced Logic" body the card editor writes for a cell, and the one question asked
// before that body is ever rewritten.
//
// Pure so both are reachable from node (L6): the regeneration rule used to live inside CardEditor.vue,
// where nothing could test it and it silently destroyed hand-written bodies.

// A body's scope follows the BLOCK. Inside a block mapped to a collection the renderer hands each
// item to its own cells, so the default reads `stat` with an item-relative path; everywhere else it
// reads `root` with the absolute one. This mirrors what the exported runtime actually passes.
export function defaultLogicBody(card, blockMappedKey) {
    const type = card.type;

    if (card.sourceType === 'lorebook') {
        const lbKey = String(card.lorebookKey || 'Lorebook Entry').replace(/'/g, "\\'");
        return "_output = '" + lbKey + "';";
    }

    let key = String(card.mappedKey || '');
    let rootVar = 'root';
    if (blockMappedKey && key.startsWith(blockMappedKey + '.')) {
        const parts = key.split('.');
        const blockParts = String(blockMappedKey).split('.');
        if (parts.length > blockParts.length + 1) {
            key = parts.slice(blockParts.length + 1).join('.');
            rootVar = 'stat';
        } else if (parts.length > blockParts.length) {
            key = parts.slice(blockParts.length).join('.');
            rootVar = 'stat';
        }
    }

    if (type === 'StatRow') return "_output = getV(" + rootVar + ", '" + key + "', 'Default');";
    if (type === 'Image') {
        return "_output = getV(" + rootVar + ", '" + key + "');\n"
            + "// Example: _output = getV(" + rootVar + ", 'level') > 10 ? 'high.png' : 'low.png';";
    }
    if (type === 'RichText') return "_output = '" + String(card.title || 'Static Content').replace(/'/g, "\\'") + "';";
    return '';
}

// A body the author WROTE is theirs. Editing a title, a mapped key or a source type may only
// replace a body that still reads exactly as the default generated for the PREVIOUS values —
// anything else is the author's code, and overwriting it loses work with no undo.
export function isUntouched(current, previousDefault) {
    if (!current || !String(current).trim()) return true;
    return String(current).trim() === String(previousDefault || '').trim();
}
