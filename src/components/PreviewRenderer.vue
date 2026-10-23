<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBuilderState, isCollection } from '../composables/useBuilderState'
import CardRenderer from './CardRenderer.vue'
import HtmlListRenderer from './HtmlListRenderer.vue'
import { getTemplatesHtml } from '../utils/sharedTemplates'
import { menuLinkImageUrl } from './exporttab-parts/rt_htmlGenerators.js'

const { layout, activeTabId, resolveValue, globalCss } = useBuilderState()

// A web link a cell renders opens its target in a full-window image viewer here, the way the exported
// menu opens it (menuLinkImageUrl decides which clicks) — and the preview is not sandboxed, so without
// this the click would navigate the builder itself away.
const linkedImage = ref<{ url: string, title: string, failed: boolean } | null>(null)
function openLinkedImage(event: MouseEvent) {
    const target = event.target as Element | null
    const link = target && typeof target.closest === 'function' ? target.closest('a[href]') : null
    if (!link) return
    const url = menuLinkImageUrl(link.getAttribute('href'), document.baseURI)
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    linkedImage.value = { url, title: (link.textContent || '').trim() || url, failed: false }
}

// Ref to the root wrapper element for scroll control
const previewRoot = ref<HTMLElement | null>(null)

// Scroll to top when tab changes
watch(activeTabId, () => {
    // Find the scrollable parent (.preview-viewport)
    const viewport = previewRoot.value?.closest('.preview-viewport')
    if (viewport) {
        viewport.scrollTop = 0
    }
})

// ... (getList, pagination helpers unchanged)
function getList(key: string) {
    const res = resolveValue(key).value
    if (Array.isArray(res)) return res
     // Only treat object as list if it PASSES isCollection check
    if (res && typeof res === 'object' && isCollection(res)) {
        return Object.entries(res)
            .filter(([k]) => k !== '$key' && k !== '$meta' && k !== 'template')
            .map(([k, v]) => {
            if (typeof v === 'object' && v !== null) {
                return { $key: k, ...(v as object) }
            }
            return { $key: k, value: v }
        })
    }
    return []
}

// -- Pagination State --
const pageState = ref<Record<string, number>>({})
const ITEMS_PER_PAGE = 5
function getPageSize(block: any) { return block.pageSize || ITEMS_PER_PAGE }
function getPage(blockId: string) { return pageState.value[blockId] || 0 }
function getVisibleItems(blockId: string, fullList: any[], block: any) {
    const page = getPage(blockId)
    const ps = getPageSize(block)
    const start = page * ps
    return fullList.slice(start, start + ps)
}
function nextPage(blockId: string, total: number, block: any) {
    const current = getPage(blockId)
    if ((current + 1) * getPageSize(block) < total) pageState.value[blockId] = current + 1
}
function prevPage(blockId: string) {
    const current = getPage(blockId)
    if (current > 0) pageState.value[blockId] = current - 1
}
function jumpToItem(blockId: string, event: Event, block: any) {
    const idx = parseInt((event.target as HTMLSelectElement).value, 10)
    pageState.value[blockId] = Math.floor(idx / getPageSize(block))
}

function getEffectiveId(block: any) {
    if (block.customId) return block.customId
    if (!block.mappedKey) return undefined
    // Sanitize: "Mainchar.Strength" -> "Mainchar-Strength"
    return block.mappedKey.replace(/\./g, '-')
}

const activeTab = computed(() => layout.value.find(t => t.id === activeTabId.value))
</script>

<template>
  <div ref="previewRoot" class="status-preview-wrapper" v-if="activeTab" @click.capture="openLinkedImage">
      <!-- A link's target, in the full-window image viewer the exported menu opens (rt_modalUi.js showImagePopup) -->
      <div v-if="linkedImage" class="linked-image-overlay" @click.self="linkedImage = null">
          <button class="linked-image-close" type="button" aria-label="Close image preview" @click="linkedImage = null">&times;</button>
          <img v-if="!linkedImage.failed" :src="linkedImage.url" :alt="linkedImage.title" @error="linkedImage.failed = true" />
          <div v-else class="linked-image-failed">Not an image the menu can show: {{ linkedImage.url }}</div>
      </div>
      <!-- Shared CSS Injection -->
      <component :is="'style'">{{ globalCss }}</component>
      <!-- Shared Templates Injection -->
      <div style="display:none;" v-html="getTemplatesHtml()"></div>
      
      <!-- Status Wrapper (The Phone/Card look) -->
      <div 
        class="status-card"
        :style="{ width: (activeTab.containerWidth || 100) + (activeTab.containerWidthUnit || '%') }"
      >
          <!-- Fake Tabs for Visual -->
          <div class="tab-nav">
              <div 
                v-for="tab in layout" 
                :key="tab.id"
                class="p-tab-btn"
                :class="{ active: tab.id === activeTabId }"
              >
                  {{ tab.name }}
              </div>
          </div>

          <!-- Content Page -->
          <div class="preview-content">
              <!-- Grid Layout for Blocks -->
               <div class="grid-layout">
                   <template v-for="block in activeTab.blocks" :key="block.id">
                       
                       <!-- Case 1: Repater Block (Loop over collection) -->
                       <!-- Case 1: Iterating Block (Map to List -> List items in ONE block) -->
                       <!-- Case 1: Iterating Block (Map to List -> List items in ONE block) -->
                       <template v-if="block.mappedKey && getList(block.mappedKey).length > 0">
                           <div class="block-wrapper" :style="{ width: (block.width || 100) + '%' }">
                                <div 
                                        class="info-card" 
                                        :id="getEffectiveId(block)"
                                        :style="{ fontSize: (block.scale ? block.scale + 'em' : undefined) }"
                                >
                                        <div class="card-header">{{ block.title }}</div>

                                        <!-- Pagination Controls (top) -->
                                        <div class="pagination-controls" v-if="getList(block.mappedKey).length > getPageSize(block) || (block.showQuickJump && getList(block.mappedKey).length > 0)">
                                            <button 
                                                class="pager-btn" 
                                                :disabled="getPage(block.id) === 0"
                                                @click="prevPage(block.id)"
                                            >&lt;</button>

                                            <select 
                                                v-if="block.showQuickJump"
                                                class="block-jump-select"
                                                :value="getPage(block.id) * getPageSize(block)"
                                                @change="jumpToItem(block.id, $event, block)"
                                            >
                                                <option 
                                                    v-for="(item, idx) in getList(block.mappedKey)" 
                                                    :key="idx" 
                                                    :value="idx"
                                                >{{ item.Name ? (Array.isArray(item.Name) ? item.Name[0] : item.Name) : item.$key || ('Item ' + (idx + 1)) }}</option>
                                            </select>
                                            
                                            <span class="page-info">
                                                {{ getPage(block.id) + 1 }} / {{ Math.ceil(getList(block.mappedKey).length / getPageSize(block)) }}
                                            </span>

                                            <button 
                                                class="pager-btn" 
                                                :disabled="(getPage(block.id) + 1) * getPageSize(block) >= getList(block.mappedKey).length"
                                                @click="nextPage(block.id, getList(block.mappedKey).length, block)"
                                            >&gt;</button>
                                        </div>
                                        
                                        <!-- Unified Renderer for Grid Lists (Option A: Builder Modal) -->
                                        <div class="list-wrapper" v-if="block.layoutMode === 'grid'">
                                             <HtmlListRenderer 
                                                :data="getVisibleItems(block.id, getList(block.mappedKey), block)" 
                                                :templateId="'tmpl-grid'" 
                                                :emptyText="'No items'"
                                                :shouldFlatten="true"
                                             />
                                        </div>

                                        <!-- Standard List Renderer (Preserves Card Config) -->
                                        <div class="list-wrapper" v-else>
                                            <div 
                                                v-for="(item, idx) in getVisibleItems(block.id, getList(block.mappedKey), block)" 
                                                :key="idx"
                                                class="repeater-item"
                                            >
                                                <div class="prop-list">
                                                    <div 
                                                        v-for="card in block.cards" 
                                                        :key="card.id" 
                                                        class="prop-row-wrapper"
                                                        :style="{ width: (card.width || (card.type === 'GridContainer' || card.type === 'QuestList' ? 100 : 50)) + '%' }"
                                                    >
                                                        <CardRenderer 
                                                            :card="card"
                                                            :context="item"
                                                            :blockKey="block.mappedKey"
                                                            :index="getPage(block.id) * getPageSize(block) + idx"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                </div>
                           </div>
                       </template>

                       <!-- Case 2: Standard Block / Single Object Mapped -->
                       <template v-else>
                           <div class="block-wrapper" :style="{ width: (block.width || 100) + '%' }">
                                <div 
                                        class="info-card" 
                                        :id="getEffectiveId(block)"
                                        :style="{ fontSize: (block.scale ? block.scale + 'em' : undefined) }"
                                >
                                        <div class="card-header">{{ block.title }}</div>
                                        
                                        <div class="prop-list">
                                            <div 
                                                v-for="card in block.cards" 
                                                :key="card.id" 
                                                class="prop-row-wrapper"
                                                :style="{ width: (card.width || (card.type === 'GridContainer' || card.type === 'QuestList' ? 100 : 50)) + '%' }"
                                            >
                                                <!-- If block is mapped to a Single Object (e.g. Mainchar), pass that as context! -->
                                                <CardRenderer 
                                                    :card="card"
                                                    :context="block.mappedKey ? resolveValue(block.mappedKey).value : null"
                                                    :blockKey="block.mappedKey || ''"
                                                />
                                            </div>
                                        </div>
                                </div>
                           </div>
                       </template>

                   </template>
               </div>
          </div>
      </div>
  </div>
</template>

<style scoped>
/* The link-image viewer: the exported menu's full-window image viewer (rt_modalUi.js showImagePopup) */
.linked-image-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999;
    padding: 12px; box-sizing: border-box; cursor: zoom-out;
}
.linked-image-close {
    position: fixed; top: 12px; right: 12px; width: 42px; height: 42px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.5); background: rgba(0,0,0,0.65); color: #fff;
    font-size: 28px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
}
.linked-image-overlay img {
    display: block; width: auto; height: auto;
    max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px);
    object-fit: contain; border-radius: 4px; box-shadow: 0 0 20px rgba(0,0,0,0.5);
}
.linked-image-failed { max-width: calc(100vw - 48px); color: #ddd; text-align: center; word-break: break-all; }

/* Mocking the statusmenu.html CSS roughly */
.status-preview-wrapper {
    width: 100%;
    /* max-width removed to allow user control */
    height: 100%;
    display: flex; /* Center it */
    display: flex; /* Center it */
    justify-content: center;
}
.status-card {
    /* Background is now in shared css, but we keep this container sizing */
    /* background: linear-gradient(-45deg, #001f3f, #003366, #006064, #013243); */
    /* border-radius: 8px; */
    /* border: 1px solid rgba(0, 229, 255, 0.3); */
    min-height: 500px;
    /* width is now bound via inline style */
    transition: width 0.3s ease;
    display: flex;
    flex-direction: column;
}

.preview-content {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
}

.grid-layout {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch; /* Ensure cards in a row stretch to match tallest one */
    margin: 0 -5px; /* Negative margin to match block-wrapper padding */
}

/* Reduced Spacing for Tighter Layout */
.block-wrapper {
    box-sizing: border-box;
    padding: 5px; /* Reduced from 7.5px */
}

/* 
   Critical layout rules that MUST be scoped here (not just in globalCss)
   since the user's saved project may have older CSS without these.
*/
.prop-list {
    display: flex;
    flex-wrap: wrap;
    margin: 0 -4px;
}

.prop-row-wrapper {
    padding: 1px 4px;
    box-sizing: border-box;
    min-width: 55px;
    flex: 1 0 auto !important;
}

.responsive-stats-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(55px, 1fr));
    gap: 2px;
    width: 100%;
}

.grid-full-width {
    grid-column: 1 / -1;
}

.checkbox-display {
    justify-content: flex-end !important;
}

</style>
