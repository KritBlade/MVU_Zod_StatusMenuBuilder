// rt_cardDisplay.js — Runtime rendering for character card fields in exported HTML
// This gets concatenated into the exported single-file HTML

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMarkdownLite(text) {
    if (!text) return '';
    // Basic markdown: bold, italic, newlines
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\r?\n/g, '<br/>');
    return html;
}

function initCardDisplay(cardData) {
    if (!cardData) return;

    const sections = [
        { id: 'sec-description', field: 'description', title: 'Description' },
        { id: 'sec-scenario', field: 'scenario', title: 'Scenario' },
        { id: 'sec-first-mes', field: 'first_mes', title: 'First Message' },
        { id: 'sec-mes-example', field: 'mes_example', title: 'Message Example' },
    ];

    sections.forEach(sec => {
        const el = document.getElementById(sec.id);
        if (el) {
            const content = cardData[sec.field] || '';
            el.innerHTML = content ? renderMarkdownLite(content) : '<span class="empty-text">No content</span>';
        }
    });

    // Alternate Greetings
    const altContainer = document.getElementById('sec-alt-greetings');
    if (altContainer && cardData.alternate_greetings) {
        altContainer.innerHTML = '';
        cardData.alternate_greetings.forEach((greeting, idx) => {
            const div = document.createElement('div');
            div.className = 'alt-greeting-item';
            div.innerHTML = `
                <div class="greeting-label">Greeting #${idx + 1}</div>
                <div class="greeting-content">${renderMarkdownLite(greeting)}</div>
            `;
            altContainer.appendChild(div);
        });
        if (cardData.alternate_greetings.length === 0) {
            altContainer.innerHTML = '<span class="empty-text">No alternate greetings</span>';
        }
    }

    // Character Book
    const bookContainer = document.getElementById('sec-character-book');
    if (bookContainer && cardData.character_book && cardData.character_book.entries) {
        bookContainer.innerHTML = '';
        cardData.character_book.entries.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'book-entry-card' + (entry.enabled ? '' : ' disabled');
            div.innerHTML = `
                <div class="book-entry-header">
                    <span class="book-entry-name">${escapeHtml(entry.comment || entry.name || 'Entry #' + entry.id)}</span>
                    <span class="book-entry-keys">Keys: ${escapeHtml(entry.keys.join(', '))}</span>
                    ${!entry.enabled ? '<span class="disabled-badge">DISABLED</span>' : ''}
                </div>
                <div class="book-entry-content">${renderMarkdownLite(entry.content)}</div>
            `;
            bookContainer.appendChild(div);
        });
        if (cardData.character_book.entries.length === 0) {
            bookContainer.innerHTML = '<span class="empty-text">No lorebook entries</span>';
        }
    }

    // Name
    const nameEl = document.getElementById('card-name');
    if (nameEl) nameEl.textContent = cardData.name || 'Unknown';

    // Tab switching
    document.querySelectorAll('.mgm-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.mgm-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mgm-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById('panel-' + tabId);
            if (panel) panel.classList.add('active');
        });
    });
}
