<script setup lang="ts">
import { useMakerState } from '../composables/useMakerState'
import CharacterLoader from './CharacterLoader.vue'
import CharacterViewer from './CharacterViewer.vue'
import HtmlExportTab from './HtmlExportTab.vue'
import { APP_NAME, APP_VERSION } from '../version'

const { activeTab, characterCard } = useMakerState()
</script>

<template>
    <div class="maker-layout">
        <!-- Top Bar -->
        <div class="top-bar">
            <h1 class="app-title">🎮 {{ APP_NAME }} v{{ APP_VERSION }}</h1>
            <div class="top-tabs">
                <div
                    class="top-tab"
                    :class="{ active: activeTab === 'viewer' }"
                    @click="activeTab = 'viewer'"
                >
                    Card Viewer
                </div>
                <div
                    class="top-tab"
                    :class="{ active: activeTab === 'export' }"
                    @click="activeTab = 'export'"
                >
                    JSON Export
                </div>
            </div>
        </div>

        <!-- Loader Bar -->
        <CharacterLoader />

        <!-- Main Content -->
        <div class="main-content">
            <CharacterViewer v-if="activeTab === 'viewer'" />
            <HtmlExportTab v-else-if="activeTab === 'export'" />
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <span v-if="characterCard">
                Loaded: {{ characterCard.data?.name || 'Unknown' }}
                | Spec: {{ characterCard.spec }} v{{ characterCard.spec_version }}
                <span v-if="characterCard.data?.character_book?.entries?.length">
                    | Lorebook: {{ characterCard.data.character_book.entries.length }} entries
                </span>
            </span>
            <span v-else>No character card loaded</span>
        </div>
    </div>
</template>

<style scoped>
.maker-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0f1115;
    color: #e0f7fa;
}

.top-bar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 20px;
    height: 48px;
    background: #13151a;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
}

.app-title {
    margin: 0;
    font-size: 1.1rem;
    color: #00e5ff;
    white-space: nowrap;
}

.top-tabs {
    display: flex;
    gap: 2px;
    margin-left: auto;
}

.top-tab {
    padding: 8px 16px;
    cursor: pointer;
    color: #888;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    font-size: 0.9rem;
    user-select: none;
}
.top-tab:hover { color: #ccc; }
.top-tab.active {
    color: #00e5ff;
    border-bottom-color: #00e5ff;
}

.main-content {
    flex: 1;
    overflow: hidden;
}

.status-bar {
    height: 24px;
    background: #1a1d24;
    border-top: 1px solid #333;
    display: flex;
    align-items: center;
    padding: 0 15px;
    color: #666;
    font-size: 0.75rem;
    flex-shrink: 0;
}
</style>
