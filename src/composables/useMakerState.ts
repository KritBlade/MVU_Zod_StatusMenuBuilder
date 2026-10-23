import { ref, computed } from 'vue'

// -- Types (SillyTavern Character Card V2/V3) --
export interface CharacterBookEntry {
    name: string
    keys: string[]
    secondary_keys: string[]
    content: string
    enabled: boolean
    insertion_order: number
    case_sensitive: boolean
    priority: number
    id: number
    comment: string
    selective: boolean
    constant: boolean
    position: string
    extensions: Record<string, unknown>
    probability?: number
    selectiveLogic?: number
}

export interface CharacterBook {
    name: string
    description: string
    scan_depth: number
    token_budget: number
    recursive_scanning: boolean
    extensions: Record<string, unknown>
    entries: CharacterBookEntry[]
}

export interface CharacterCardData {
    name: string
    description: string
    personality: string
    scenario: string
    first_mes: string
    mes_example: string
    creator_notes: string
    system_prompt: string
    post_history_instructions: string
    alternate_greetings: string[]
    tags: string[]
    creator: string
    character_version: string
    extensions: Record<string, unknown>
    character_book?: CharacterBook
}

export interface CharacterCard {
    spec: string
    spec_version: string
    data: CharacterCardData
    // V3 top-level fields (duplicated from data)
    name?: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    avatar?: string
}

// -- State --
const characterCard = ref<CharacterCard | null>(null)
const fileName = ref<string>('')
const originalPngBlob = ref<Blob | null>(null)
const activeTab = ref<string>('viewer') // 'viewer' | 'export'
const selectedTemplateId = ref<string>('')
const expandedSections = ref<Set<string>>(new Set(['description', 'scenario', 'first_mes']))

// -- Getters --
const cardData = computed((): CharacterCardData | null => {
    if (!characterCard.value) return null
    return characterCard.value.data
})

const cardName = computed(() => cardData.value?.name || characterCard.value?.name || 'Unknown')

const hasCharacterBook = computed(() => {
    return !!(cardData.value?.character_book?.entries?.length)
})

// -- Actions --
function setCharacterCard(card: CharacterCard, file: string, pngBlob?: Blob | null) {
    characterCard.value = card
    fileName.value = file
    originalPngBlob.value = pngBlob ?? null
}

function clearCharacterCard() {
    characterCard.value = null
    fileName.value = ''
    originalPngBlob.value = null
}

function toggleSection(section: string) {
    if (expandedSections.value.has(section)) {
        expandedSections.value.delete(section)
    } else {
        expandedSections.value.add(section)
    }
    // Trigger reactivity
    expandedSections.value = new Set(expandedSections.value)
}

export function useMakerState() {
    return {
        characterCard,
        fileName,
        originalPngBlob,
        activeTab,
        selectedTemplateId,
        expandedSections,
        cardData,
        cardName,
        hasCharacterBook,
        setCharacterCard,
        clearCharacterCard,
        toggleSection,
    }
}
