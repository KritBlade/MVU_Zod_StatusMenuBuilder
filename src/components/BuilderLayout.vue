<script setup lang="ts">
// BuilderLayout — the app shell (GUI-DNA §4): the top bar, whose nav switches pages, over the main pane that holds
// them. Each page is its own component; every page stays mounted while hidden, so its state survives a switch.
// The confirm dialog every page asks through is mounted here, once.
import { ref } from 'vue'
import { APP_VERSION } from '../utils/app-version'
import DnaConfirmDialog from '../shared/gui-dna/DnaConfirmDialog.vue'
import LayoutBuilderTab from './LayoutBuilderTab.vue'
import DataConfigTab from './DataConfigTab.vue'
import SchemaGeneratorTab from './SchemaGeneratorTab.vue'
import EventPackTab from './EventPackTab.vue'
import HtmlExportTab from './HtmlExportTab.vue'
import StatusMenuPackTab from './StatusMenuPackTab.vue'
import TemplateEditor from './TemplateEditor.vue'

type PageId = 'builder' | 'templates' | 'data' | 'schema' | 'export' | 'pack' | 'events'

const NAV_GROUPS: { name: string; pages: { id: PageId; title: string; icon: string }[] }[] = [
    { name: 'Menu', pages: [
        { id: 'builder', title: 'Builder', icon: 'fa-pen-ruler' },
        { id: 'templates', title: 'Templates', icon: 'fa-file-code' },
    ] },
    { name: 'Data', pages: [
        { id: 'data', title: 'Data Configuration', icon: 'fa-database' },
        { id: 'schema', title: 'Schema Output', icon: 'fa-diagram-project' },
    ] },
    { name: 'Export', pages: [
        { id: 'export', title: 'Export HTML', icon: 'fa-file-export' },
        { id: 'pack', title: 'StatusMenu Pack', icon: 'fa-box' },
    ] },
    { name: 'Events', pages: [
        { id: 'events', title: 'Event Pack', icon: 'fa-calendar-days' },
    ] },
]

const navTab = ref<PageId>('builder')
</script>

<template>
    <div class="smb-ui smb-shell is-topbar">
        <nav class="smb-nav" aria-label="Builder pages">
            <div class="smb-nav-inner">
                <div class="smb-nav-brand" :title="`MVU Zod Status Menu Builder v${APP_VERSION}`"><i class="fa-solid fa-layer-group"></i><span>MVU Zod Status Menu Builder v{{ APP_VERSION }}</span></div>
                <template v-for="group in NAV_GROUPS" :key="group.name">
                    <div class="smb-nav-group">{{ group.name }}</div>
                    <button v-for="page in group.pages" :key="page.id" type="button" class="smb-nav-item"
                        :class="{ 'is-active': navTab === page.id }" :aria-current="navTab === page.id ? 'page' : undefined"
                        @click="navTab = page.id"><i class="fa-solid" :class="page.icon"></i><span>{{ page.title }}</span></button>
                </template>
            </div>
        </nav>

        <main class="smb-main" :class="{ 'is-flush': navTab === 'builder' }">
            <LayoutBuilderTab v-show="navTab === 'builder'" />
            <TemplateEditor v-show="navTab === 'templates'" />
            <DataConfigTab v-show="navTab === 'data'" />
            <SchemaGeneratorTab v-show="navTab === 'schema'" />
            <HtmlExportTab v-show="navTab === 'export'" />
            <StatusMenuPackTab v-show="navTab === 'pack'" />
            <EventPackTab v-show="navTab === 'events'" />
        </main>

        <DnaConfirmDialog />
    </div>
</template>
