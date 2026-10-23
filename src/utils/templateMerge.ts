import type { CharacterCard } from '../composables/useMakerState'

const GAME_START_TAG = '<GameStartMenu/>'
const LOREBOOK_MARKER = 'Your lorebook start here'
const GENRE_TAG_RE = /\[(RPG|Love|Share)\]\s*/gi

interface RegexScript {
    id: string
    scriptName: string
    [key: string]: unknown
}

interface TavernHelperScript {
    id: string
    name: string
    type: string
    [key: string]: unknown
}

interface TavernHelper {
    scripts?: TavernHelperScript[]
    variables?: Record<string, unknown>
    [key: string]: unknown
}

interface LorebookEntry {
    id: number
    keys: string[]
    secondary_keys: string[]
    comment: string
    content: string
    enabled: boolean
    insertion_order: number
    position: string
    display_index?: number
    extensions: Record<string, unknown>
    [key: string]: unknown
}

/**
 * Deep-clones the MVU template and merges in the user's character card data.
 * Genre filtering: only template entries tagged with [genre] or [Share] are kept.
 *
 * Merge rules:
 * - Text fields (name, description, scenario, etc.) are overridden by user card
 * - first_mes: user content + <GameStartMenu/> appended at end
 * - regex_scripts: template regex are PRESERVED (genre-filtered), user can only ADD new ones
 * - character_book entries: template entries filtered by genre, user entries injected
 *   AFTER the "Your lorebook start here" marker entry
 */
export function mergeWithTemplate(userCard: CharacterCard, template: CharacterCard, genre: string): CharacterCard {
    // Deep clone template
    const merged = JSON.parse(JSON.stringify(template)) as CharacterCard
    const userData = userCard.data
    if (!userData) return merged

    const mergedData = merged.data

    // --- Override simple text fields ---
    if (userData.name) mergedData.name = userData.name
    if (userData.description) mergedData.description = userData.description
    if (userData.personality) mergedData.personality = userData.personality
    if (userData.scenario) mergedData.scenario = userData.scenario
    if (userData.mes_example) mergedData.mes_example = userData.mes_example
    if (userData.creator_notes) mergedData.creator_notes = userData.creator_notes
    if (userData.system_prompt) mergedData.system_prompt = userData.system_prompt
    if (userData.post_history_instructions) mergedData.post_history_instructions = userData.post_history_instructions
    if (userData.creator) mergedData.creator = userData.creator
    if (userData.character_version) mergedData.character_version = userData.character_version
    if (userData.tags?.length) mergedData.tags = [...userData.tags]
    if (userData.alternate_greetings?.length) mergedData.alternate_greetings = [...userData.alternate_greetings]

    // --- First Message: user content + <GameStartMenu/> at the end ---
    if (userData.first_mes) {
        let firstMes = userData.first_mes.trim()
        // Strip existing GameStartMenu tag if user's card already has it (avoid duplicates)
        firstMes = firstMes.replace(/<GameStartMenu\s*\/?>/g, '').trim()
        const finalFirstMes = firstMes + '\n\n' + GAME_START_TAG
        mergedData.first_mes = finalFirstMes
        // Also set top-level first_mes for V2/V3 compatibility
        merged.first_mes = finalFirstMes
    }

    // --- Top-level fields (V3 compat) ---
    if (userCard.name) merged.name = userCard.name
    if (userData.name) merged.name = userData.name

    // --- Extensions: merge selectively ---
    if (userData.extensions) {
        // Preserve template extensions, override non-protected ones
        const templateExt = mergedData.extensions as Record<string, unknown>
        const userExt = userData.extensions as Record<string, unknown>

        // Override simple extension fields (but NOT regex_scripts, tavern_helper, or world)
        for (const key of Object.keys(userExt)) {
            if (key === 'regex_scripts') continue // handled separately
            if (key === 'tavern_helper') continue // handled separately
            if (key === 'world') continue // keep template's world binding
            templateExt[key] = JSON.parse(JSON.stringify(userExt[key]))
        }

        // --- Regex scripts: template genre-filtered, user adds new ones ---
        filterRegexScriptsByGenre(templateExt, genre)
        mergeRegexScripts(templateExt, userExt, genre)

        // --- Tavern Helper scripts: template genre-filtered, user adds new ones ---
        filterTavernHelperScriptsByGenre(templateExt, genre)
        mergeTavernHelperScripts(templateExt, userExt, genre)
    }

    // --- Character Book: merge lorebook entries (genre-filtered) ---
    mergeCharacterBook(mergedData, userData, genre)

    return merged
}

/**
 * Check if a lorebook entry should be included for the given genre.
 * Includes: entries tagged [Share], entries tagged [{genre}], and marker entries.
 */
function shouldIncludeEntry(entry: LorebookEntry, genre: string): boolean {
    const comment = (entry.comment || '').toLowerCase()
    // Always include marker entries
    if (comment.includes('your lorebook')) return true
    // Include [Share] entries
    if (comment.includes('[share]')) return true
    // Include entries matching the selected genre
    if (comment.includes(`[${genre.toLowerCase()}]`)) return true
    return false
}

/**
 * Strip genre bracket tags from an entry's comment field.
 * e.g. "[Love] Output_Syntax" → "Output_Syntax"
 */
function stripGenreTags(comment: string): string {
    return comment.replace(GENRE_TAG_RE, '').trim()
}

/**
 * Filter template regex scripts by genre.
 * Scripts whose scriptName contains [RPG] or [Love] are kept only if they match the genre.
 * Scripts without a genre tag are always kept.
 * After filtering, genre tags are stripped from scriptName for clean display.
 */
function filterRegexScriptsByGenre(
    templateExt: Record<string, unknown>,
    genre: string
) {
    const scripts = (templateExt.regex_scripts || []) as RegexScript[]
    const genreLower = genre.toLowerCase()

    const filtered = scripts.filter(s => {
        const name = (s.scriptName || '').toLowerCase()
        // If the script has a genre tag, only keep if it matches
        if (name.includes('[rpg]') || name.includes('[love]')) {
            return name.includes(`[${genreLower}]`)
        }
        // No genre tag — always keep
        return true
    })

    // Strip genre tags from scriptName after filtering
    for (const script of filtered) {
        if (script.scriptName) {
            script.scriptName = stripGenreTags(script.scriptName)
        }
    }

    templateExt.regex_scripts = filtered
}

/**
 * Merge regex scripts: keep all template regex, add user regex that don't
 * conflict (by scriptName match).
 * User scripts are also filtered by genre and have tags stripped.
 */
function mergeRegexScripts(
    templateExt: Record<string, unknown>,
    userExt: Record<string, unknown>,
    genre: string
) {
    const templateScripts = (templateExt.regex_scripts || []) as RegexScript[]
    const userScripts = (userExt.regex_scripts || []) as RegexScript[]

    if (!userScripts.length) return

    const genreLower = genre.toLowerCase()

    // Build a set of template script names for conflict detection
    const templateNames = new Set(
        templateScripts.map(s => s.scriptName?.toLowerCase()).filter(Boolean)
    )

    // Add user scripts that don't clash with template scripts
    // Also filter by genre and strip tags
    for (const userScript of userScripts) {
        const name = userScript.scriptName?.toLowerCase() || ''
        
        // Skip if this would override a template script
        if (templateNames.has(name) || templateNames.has(stripGenreTags(name).toLowerCase())) {
            continue
        }

        // Filter by genre if the script has a genre tag
        if (name.includes('[rpg]') || name.includes('[love]')) {
            if (!name.includes(`[${genreLower}]`)) {
                continue // Skip scripts that don't match the selected genre
            }
        }

        // Clone and strip genre tags
        const cloned = JSON.parse(JSON.stringify(userScript)) as RegexScript
        if (cloned.scriptName) {
            cloned.scriptName = stripGenreTags(cloned.scriptName)
        }
        
        templateScripts.push(cloned)
    }

    templateExt.regex_scripts = templateScripts
}

/**
 * Filter template tavern_helper scripts by genre.
 * Scripts whose name contains [RPG] or [Love] are kept only if they match the genre.
 * Scripts without a genre tag are always kept.
 * After filtering, genre tags are stripped from name for clean display.
 */
function filterTavernHelperScriptsByGenre(
    templateExt: Record<string, unknown>,
    genre: string
) {
    const templateHelper = (templateExt.tavern_helper || { scripts: [] }) as TavernHelper
    const scripts = templateHelper.scripts || []
    const genreLower = genre.toLowerCase()

    const filtered = scripts.filter(s => {
        const name = (s.name || '').toLowerCase()
        // If the script has a genre tag, only keep if it matches
        if (name.includes('[rpg]') || name.includes('[love]')) {
            return name.includes(`[${genreLower}]`)
        }
        // No genre tag — always keep
        return true
    })

    // Strip genre tags from name after filtering
    for (const script of filtered) {
        if (script.name) {
            script.name = stripGenreTags(script.name)
        }
    }

    templateHelper.scripts = filtered
    templateExt.tavern_helper = templateHelper
}

/**
 * Merge tavern_helper scripts: keep all template scripts, add user scripts that
 * don't conflict (by name match).
 * User scripts are also filtered by genre and have tags stripped.
 */
function mergeTavernHelperScripts(
    templateExt: Record<string, unknown>,
    userExt: Record<string, unknown>,
    genre: string
) {
    const templateHelper = (templateExt.tavern_helper || { scripts: [] }) as TavernHelper
    const userHelper = (userExt.tavern_helper || { scripts: [] }) as TavernHelper

    const templateScripts = templateHelper.scripts || []
    const userScripts = userHelper.scripts || []

    if (!userScripts.length) return

    const genreLower = genre.toLowerCase()

    // Build a set of template script names for conflict detection
    const templateNames = new Set(
        templateScripts.map(s => s.name?.toLowerCase()).filter(Boolean)
    )

    // Add user scripts that don't clash with template scripts
    // Also filter by genre and strip tags
    for (const userScript of userScripts) {
        const name = (userScript.name || '').toLowerCase()
        
        // Skip if this would override a template script
        if (templateNames.has(name) || templateNames.has(stripGenreTags(name).toLowerCase())) {
            continue
        }

        // Filter by genre if the script has a genre tag
        if (name.includes('[rpg]') || name.includes('[love]')) {
            if (!name.includes(`[${genreLower}]`)) {
                continue // Skip scripts that don't match the selected genre
            }
        }

        // Clone and strip genre tags
        const cloned = JSON.parse(JSON.stringify(userScript)) as TavernHelperScript
        if (cloned.name) {
            cloned.name = stripGenreTags(cloned.name)
        }
        
        templateScripts.push(cloned)
    }

    templateHelper.scripts = templateScripts
    templateExt.tavern_helper = templateHelper
}

/**
 * Merge character book entries: keep all template entries, insert user entries
 * AFTER the "Your lorebook start here" marker entry.
 */
function mergeCharacterBook(
    mergedData: CharacterCard['data'],
    userData: CharacterCard['data'],
    genre: string
) {
    const userBook = userData.character_book

    // Ensure template has a character_book
    if (!mergedData.character_book) {
        mergedData.character_book = {
            name: '',
            description: '',
            scan_depth: 2,
            token_budget: 2048,
            recursive_scanning: false,
            extensions: {},
            entries: []
        }
    }

    // Filter template entries by genre and strip tags from comments
    const allEntries = mergedData.character_book.entries as unknown as LorebookEntry[]
    const templateEntries = allEntries.filter(e => shouldIncludeEntry(e, genre))
    for (const entry of templateEntries) {
        entry.comment = stripGenreTags(entry.comment)
    }
    mergedData.character_book.entries = templateEntries as unknown as typeof mergedData.character_book.entries

    // Set character_book name and world: use the card's name with "-MVU" suffix
    // This must run BEFORE the early return check below
    const cardName = userData.name || mergedData.name || ''
    if (cardName) {
        const mvuName = cardName + '-MVU'
        mergedData.character_book.name = mvuName
        if (mergedData.extensions && typeof mergedData.extensions === 'object') {
            const ext = mergedData.extensions as Record<string, unknown>
            ext.world = mvuName
            ext.name = mvuName
        }
    }

    if (!userBook?.entries?.length) return

    // Find the marker entry by searching for the "Your lorebook start here" string
    const markerIndex = templateEntries.findIndex(
        e => e.comment && e.comment.includes(LOREBOOK_MARKER)
    )

    // Determine insertion position and display_index start
    let insertAfterIdx: number
    let startDisplayIndex: number

    if (markerIndex >= 0) {
        insertAfterIdx = markerIndex
        const markerEntry = templateEntries[markerIndex]
        // Use the marker's display_index value (could be 97 or any number)
        const markerDisplayIndex = (markerEntry.extensions as Record<string, unknown>)?.display_index as number
            ?? (markerEntry as LorebookEntry).display_index
            ?? 97
        startDisplayIndex = markerDisplayIndex + 1
    } else {
        // Fallback: append at end
        insertAfterIdx = templateEntries.length - 1
        startDisplayIndex = 100
    }

    // Find max existing ID to avoid conflicts
    let maxId = 0
    for (const entry of templateEntries) {
        if (entry.id > maxId) maxId = entry.id
    }

    // Prepare user entries with updated IDs and display_index
    const userEntries: LorebookEntry[] = userBook.entries.map((entry, idx) => {
        const cloned = JSON.parse(JSON.stringify(entry)) as LorebookEntry
        cloned.id = maxId + 1 + idx

        // Set display_index in the extensions object (SillyTavern stores it there)
        if (cloned.extensions && typeof cloned.extensions === 'object') {
            (cloned.extensions as Record<string, unknown>).display_index = startDisplayIndex + idx
        }

        return cloned
    })

    // Splice user entries right after the marker entry
    templateEntries.splice(insertAfterIdx + 1, 0, ...userEntries)
}

/**
 * Returns a fresh deep-clone of the given template (no merge).
 */
export function getCleanTemplate(template: CharacterCard): CharacterCard {
    return JSON.parse(JSON.stringify(template)) as CharacterCard
}
