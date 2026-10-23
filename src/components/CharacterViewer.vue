<script setup lang="ts">
import { computed } from 'vue'
import { useMakerState } from '../composables/useMakerState'

const { cardData, cardName, hasCharacterBook, expandedSections, toggleSection } = useMakerState()

function isExpanded(section: string): boolean {
    return expandedSections.value.has(section)
}

interface TavernHelperScript {
    type?: string
    name?: string
    enabled?: boolean
    content?: string
    [key: string]: unknown
}

const tavernHelperScripts = computed((): TavernHelperScript[] => {
    const helper = cardData.value?.extensions?.tavern_helper as { scripts?: TavernHelperScript[] } | undefined
    return helper?.scripts || []
})
</script>

<template>
    <div class="viewer" v-if="cardData">
        <!-- Header -->
        <div class="card-header-bar">
            <h2 class="card-name">{{ cardName }}</h2>
            <div class="card-meta">
                <span v-if="cardData.creator" class="meta-tag">by {{ cardData.creator }}</span>
                <span v-if="cardData.character_version" class="meta-tag">v{{ cardData.character_version }}</span>
                <span v-for="tag in cardData.tags" :key="tag" class="tag-pill">{{ tag }}</span>
            </div>
        </div>

        <!-- Description -->
        <div class="section">
            <div class="section-header" @click="toggleSection('description')">
                <span class="chevron">{{ isExpanded('description') ? '▼' : '▶' }}</span>
                <span class="section-title">Description</span>
                <span class="section-len" v-if="cardData.description">{{ cardData.description.length }} chars</span>
            </div>
            <div v-if="isExpanded('description')" class="section-body">
                <textarea class="content-edit" v-model="cardData.description" placeholder="(empty)" rows="8"></textarea>
            </div>
        </div>

        <!-- Scenario -->
        <div class="section">
            <div class="section-header" @click="toggleSection('scenario')">
                <span class="chevron">{{ isExpanded('scenario') ? '▼' : '▶' }}</span>
                <span class="section-title">Scenario</span>
                <span class="section-len" v-if="cardData.scenario">{{ cardData.scenario.length }} chars</span>
            </div>
            <div v-if="isExpanded('scenario')" class="section-body">
                <textarea class="content-edit" v-model="cardData.scenario" placeholder="(empty)" rows="6"></textarea>
            </div>
        </div>

        <!-- First Message -->
        <div class="section">
            <div class="section-header" @click="toggleSection('first_mes')">
                <span class="chevron">{{ isExpanded('first_mes') ? '▼' : '▶' }}</span>
                <span class="section-title">First Message</span>
                <span class="section-len" v-if="cardData.first_mes">{{ cardData.first_mes.length }} chars</span>
            </div>
            <div v-if="isExpanded('first_mes')" class="section-body">
                <textarea class="content-edit" v-model="cardData.first_mes" placeholder="(empty)" rows="8"></textarea>
            </div>
        </div>

        <!-- Message Example -->
        <div class="section">
            <div class="section-header" @click="toggleSection('mes_example')">
                <span class="chevron">{{ isExpanded('mes_example') ? '▼' : '▶' }}</span>
                <span class="section-title">Message Example</span>
                <span class="section-len" v-if="cardData.mes_example">{{ cardData.mes_example.length }} chars</span>
            </div>
            <div v-if="isExpanded('mes_example')" class="section-body">
                <textarea class="content-edit" v-model="cardData.mes_example" placeholder="(empty)" rows="6"></textarea>
            </div>
        </div>

        <!-- Alternate Greetings -->
        <div class="section" v-if="cardData.alternate_greetings?.length">
            <div class="section-header" @click="toggleSection('alt_greetings')">
                <span class="chevron">{{ isExpanded('alt_greetings') ? '▼' : '▶' }}</span>
                <span class="section-title">Alternate Greetings</span>
                <span class="section-count">{{ cardData.alternate_greetings.length }} greeting(s)</span>
            </div>
            <div v-if="isExpanded('alt_greetings')" class="section-body">
                <div
                    v-for="(_, idx) in cardData.alternate_greetings"
                    :key="idx"
                    class="alt-greeting"
                >
                    <div class="greeting-header">Greeting #{{ idx + 1 }}</div>
                    <textarea class="content-edit greeting-edit" v-model="cardData.alternate_greetings[idx]" rows="4"></textarea>
                </div>
            </div>
        </div>

        <!-- System Prompt -->
        <div class="section">
            <div class="section-header" @click="toggleSection('system_prompt')">
                <span class="chevron">{{ isExpanded('system_prompt') ? '▼' : '▶' }}</span>
                <span class="section-title">System Prompt</span>
                <span class="section-len" v-if="cardData.system_prompt">{{ cardData.system_prompt.length }} chars</span>
            </div>
            <div v-if="isExpanded('system_prompt')" class="section-body">
                <textarea class="content-edit" v-model="cardData.system_prompt" placeholder="(empty)" rows="6"></textarea>
            </div>
        </div>

        <!-- Creator Notes -->
        <div class="section">
            <div class="section-header" @click="toggleSection('creator_notes')">
                <span class="chevron">{{ isExpanded('creator_notes') ? '▼' : '▶' }}</span>
                <span class="section-title">Creator Notes</span>
            </div>
            <div v-if="isExpanded('creator_notes')" class="section-body">
                <textarea class="content-edit" v-model="cardData.creator_notes" placeholder="(empty)" rows="4"></textarea>
            </div>
        </div>

        <!-- Character Book -->
        <div class="section" v-if="hasCharacterBook">
            <div class="section-header" @click="toggleSection('character_book')">
                <span class="chevron">{{ isExpanded('character_book') ? '▼' : '▶' }}</span>
                <span class="section-title">Character Book (Lorebook)</span>
                <span class="section-count">{{ cardData.character_book!.entries.length }} entries</span>
            </div>
            <div v-if="isExpanded('character_book')" class="section-body">
                <div class="book-meta" v-if="cardData.character_book!.name">
                    <strong>Book:</strong> {{ cardData.character_book!.name }}
                    <span v-if="cardData.character_book!.description"> — {{ cardData.character_book!.description }}</span>
                </div>
                <div
                    v-for="entry in cardData.character_book!.entries"
                    :key="entry.id"
                    class="book-entry"
                    :class="{ disabled: !entry.enabled }"
                >
                    <div class="entry-header">
                        <span class="entry-name">{{ entry.comment || entry.name || `Entry #${entry.id}` }}</span>
                        <span class="entry-keys">Keys: {{ entry.keys.join(', ') }}</span>
                        <span v-if="!entry.enabled" class="entry-disabled-badge">DISABLED</span>
                    </div>
                    <textarea class="content-edit entry-edit" v-model="entry.content" rows="4"></textarea>
                </div>
            </div>
        </div>

        <!-- Regex Scripts (V3 extension) -->
        <div class="section" v-if="cardData.extensions?.regex_scripts">
            <div class="section-header" @click="toggleSection('regex_scripts')">
                <span class="chevron">{{ isExpanded('regex_scripts') ? '▼' : '▶' }}</span>
                <span class="section-title">Regex Scripts</span>
                <span class="section-count">{{ (cardData.extensions.regex_scripts as Array<unknown>).length }} script(s)</span>
            </div>
            <div v-if="isExpanded('regex_scripts')" class="section-body">
                <div
                    v-for="(script, idx) in (cardData.extensions.regex_scripts as Array<Record<string, unknown>>)"
                    :key="idx"
                    class="book-entry"
                    :class="{ disabled: script.disabled }"
                >
                    <div class="entry-header">
                        <span class="entry-name">{{ script.scriptName }}</span>
                        <span v-if="script.disabled" class="entry-disabled-badge">DISABLED</span>
                    </div>
                    <div class="entry-keys">Find: <code>{{ script.findRegex }}</code></div>
                </div>
            </div>
        </div>

        <!-- Tavern Helper Scripts -->
        <div class="section" v-if="tavernHelperScripts.length">
            <div class="section-header" @click="toggleSection('tavern_helper')">
                <span class="chevron">{{ isExpanded('tavern_helper') ? '▼' : '▶' }}</span>
                <span class="section-title">Tavern Helper Scripts</span>
                <span class="section-count">{{ tavernHelperScripts.length }} script(s)</span>
            </div>
            <div v-if="isExpanded('tavern_helper')" class="section-body">
                <div
                    v-for="(script, idx) in tavernHelperScripts"
                    :key="idx"
                    class="book-entry"
                    :class="{ disabled: !script.enabled }"
                >
                    <div class="entry-header">
                        <span class="entry-name">{{ script.name || `Script #${idx + 1}` }}</span>
                        <span class="entry-keys">Type: {{ script.type || 'unknown' }}</span>
                        <span v-if="!script.enabled" class="entry-disabled-badge">DISABLED</span>
                    </div>
                    <textarea class="content-edit entry-edit" v-model="script.content" placeholder="(no content)" rows="4"></textarea>
                </div>
            </div>
        </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
        <div class="empty-icon">📜</div>
        <p>Load a SillyTavern character card (.json or .png) to view its contents.</p>
    </div>
</template>

<style scoped>
.viewer {
    padding: 15px;
    overflow-y: auto;
    height: 100%;
}

.card-header-bar {
    margin-bottom: 15px;
    padding-bottom: 12px;
    border-bottom: 1px solid #333;
}
.card-name {
    margin: 0 0 6px 0;
    color: #00e5ff;
    font-size: 1.4em;
}
.card-meta {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}
.meta-tag { color: #888; font-size: 0.85rem; }
.tag-pill {
    background: rgba(0, 229, 255, 0.1);
    border: 1px solid rgba(0, 229, 255, 0.3);
    color: #81d4fa;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
}

.section {
    margin-bottom: 2px;
    border: 1px solid #2a2d35;
    border-radius: 4px;
    overflow: hidden;
}
.section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #1a1d24;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
}
.section-header:hover { background: #22252e; }
.chevron { color: #00e5ff; font-size: 0.7em; width: 14px; }
.section-title { font-weight: bold; color: #e0f7fa; flex: 1; }
.section-len, .section-count { color: #666; font-size: 0.8rem; }

.section-body {
    padding: 10px 12px;
    background: #13151a;
}

.content-block {
    background: #0d0f14;
    border: 1px solid #2a2d35;
    border-radius: 4px;
    padding: 10px;
    color: #ccc;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 400px;
    overflow-y: auto;
}

/* Alternate Greetings */
.alt-greeting { margin-bottom: 10px; }
.greeting-header {
    color: #00e5ff;
    font-size: 0.85rem;
    font-weight: bold;
    margin-bottom: 4px;
}
.greeting-block { max-height: 300px; }

/* Character Book */
.book-meta {
    color: #888;
    font-size: 0.85rem;
    margin-bottom: 10px;
    padding: 6px 8px;
    background: rgba(0, 229, 255, 0.05);
    border-radius: 4px;
}
.book-entry {
    margin-bottom: 8px;
    border: 1px solid #2a2d35;
    border-radius: 4px;
    overflow: hidden;
}
.book-entry.disabled { opacity: 0.5; }
.entry-header {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 10px;
    background: #1a1d24;
}
.entry-name { color: #00e5ff; font-weight: bold; }
.entry-keys { color: #888; font-size: 0.8rem; }
.entry-disabled-badge {
    background: #ff5252;
    color: white;
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: bold;
}
.entry-content {
    margin: 0;
    border: none;
    border-radius: 0;
    max-height: 200px;
}

/* Empty State */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
    gap: 10px;
}
.empty-icon { font-size: 3em; opacity: 0.5; }
.empty-state p { font-size: 1rem; text-align: center; max-width: 400px; }

/* Editable textareas */
.content-edit {
    background: #0d0f14;
    border: 1px solid #2a2d35;
    border-radius: 4px;
    padding: 10px;
    color: #ccc;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 0.85rem;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    margin: 0;
    min-height: 60px;
    max-height: 600px;
    outline: none;
    transition: border-color 0.15s;
}
.content-edit:focus {
    border-color: #00e5ff;
}
.greeting-edit { max-height: 300px; }
.entry-edit {
    border: none;
    border-radius: 0;
    max-height: 200px;
}
</style>
