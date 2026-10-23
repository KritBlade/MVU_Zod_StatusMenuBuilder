<script setup lang="ts">
import { computed, watch } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import JsonTreeSelector from './JsonTreeSelector.vue'
import DnaPageHeader from '../shared/gui-dna/DnaPageHeader.vue'
import DnaSplit from '../shared/gui-dna/DnaSplit.vue'
import DnaCard from '../shared/gui-dna/DnaCard.vue'
import DnaSwitchRow from '../shared/gui-dna/DnaSwitchRow.vue'
import DnaNotice from '../shared/gui-dna/DnaNotice.vue'
import CopyTextButton from '../shared/CopyTextButton.vue'
import { askConfirm } from '../shared/gui-dna/confirm-dialog'

const { mvuDataParsed, selectedPaths, collectionPaths, lockedPaths, lockTopLevel } = useBuilderState()

// Roots that belong to a PLATFORM rather than to this card. Locking the top level makes Zod strip every
// root the schema does not name, and the card is not its only writer. mvu-helper keeps three: mvuhelper,
// its own per-reply state (what each character is wearing); EventPack, the installed event packs and which
// have fired; and GameLogicPlugin, where every installed GameLogic Plugin owns one named subtree, chosen at
// install time. So a locked schema that omits one deletes that state on the next write, with nothing in
// any log. Declared open (record<string,any>) because those keys are not ours to enumerate. Emitted ONLY
// when the lock is on — unlocked, the root's .passthrough() already lets them through.
const PLATFORM_ROOTS = [
    { name: 'mvuhelper', schema: 'z.record(z.string(), z.any()).prefault({})' },
    { name: 'EventPack', schema: 'z.record(z.string(), z.any()).prefault({})' },
    { name: 'GameLogicPlugin', schema: 'z.record(z.string(), z.any()).prefault({})' },
]

// -- Local Helper: Heuristic for default Collection status --
function isMvuEntity(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false
    const vals = Object.values(obj)
    if (vals.length === 0) return true 
    
    if (vals.some(v => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string')) return true
    if (vals.some(v => v !== null && typeof v !== 'object')) return true
    
    return false
}

function looksLikeCollection(obj: any): boolean {
    if (Array.isArray(obj)) return false
    if (!obj || typeof obj !== 'object') return false
    
    const vals = Object.values(obj)
    if (vals.length === 0) return false // Empty object default struct
    
    const first = vals[0]
    if (first !== null && typeof first !== 'object') return false 
    if (Array.isArray(first) && first.length === 2 && typeof first[1] === 'string') return false

    if (isMvuEntity(first)) return true
    if (looksLikeCollection(first)) return false

    return true
}

// -- Selection & Collection State --
// Using global state now

function initSelection() {
    const selSet = new Set<string>()
    const collSet = new Set<string>()
    const lockSet = new Set<string>()

    if (!mvuDataParsed.value) { 
        selectedPaths.value = selSet
        collectionPaths.value = collSet
        lockedPaths.value = lockSet
        return 
    }

    function walk(data: any, path: string, depth: number) {
        selSet.add(path)
        
        // Auto-detect collection
        if (looksLikeCollection(data)) {
            collSet.add(path)
        }

        if (depth >= 2) return 

        if (data && typeof data === 'object') {
            // Default lock objects that have properties
            if (!Array.isArray(data) && Object.keys(data).length > 0) {
                 lockSet.add(path)
            }

            if (Array.isArray(data)) {
                 if (data.length > 0) walk(data[0], path + '.0', depth + 1)
            } else {
                 if (looksLikeCollection(data)) {
                     // If collection, traverse first child to learn structure
                     const firstKey = Object.keys(data)[0]
                     if (firstKey) {
                         walk(data[firstKey], path + '.' + firstKey, depth + 1)
                     }
                 } else {
                     // Struct
                     for (const k of Object.keys(data)) {
                         walk(data[k], path + '.' + k, depth + 1)
                     }
                 }
            }
        }
    }
    
    const root = mvuDataParsed.value
    for (const k of Object.keys(root)) {
        walk(root[k], '.' + k, 0)
    }
    
    selectedPaths.value = selSet
    collectionPaths.value = collSet
    lockedPaths.value = lockSet
}

watch(mvuDataParsed, (val) => {
    // If selected paths OR locked paths are empty when data loads, we re-run init.
    // This handles the case where the user loaded an old config that lacks LockedPaths data.
    if (val && (selectedPaths.value.size === 0 || lockedPaths.value.size === 0)) {
        initSelection()
    }
}, { immediate: true })

function onToggle(path: string, checked: boolean) {
    if (checked) selectedPaths.value.add(path)
    else selectedPaths.value.delete(path)
}

function onToggleCollection(path: string, checked: boolean) {
    if (checked) collectionPaths.value.add(path)
    else collectionPaths.value.delete(path)
}

function onToggleLock(path: string, checked: boolean) {
    if (checked) lockedPaths.value.add(path)
    else lockedPaths.value.delete(path)
}

// -- Generators --
function getType(val: any): string {
    if (val === null) return 'null'
    if (Array.isArray(val)) return 'array'
    return typeof val
}

function isLabeledTuple(val: any): boolean {
    if (Array.isArray(val) && val.length === 2 && typeof val[1] === 'string') {
        return true
    }
    return false
}

function getLabeledType(val: any[]): string {
    const v = val[0]
    const type = getType(v)
    if (type === 'string') return 'labeledStr'
    if (type === 'number') return 'labeledNum'
    if (type === 'boolean') return 'labeledBool'
    return 'labeledValue'
}


function generateFieldSchema(val: any, indent: string, path: string): string {
    if (!selectedPaths.value.has(path)) {
        return `z.any().prefault('')`
    }

    // Explicit check against collectionPaths. A collection is "many entries of ONE shape", and the
    // shape that carries them differs by value: a record for an object, an array for an array.
    if (collectionPaths.value.has(path)) {
        // An ARRAY collection must emit z.array. z.record cannot parse an array AT ALL, so marking one
        // as a collection used to emit a schema that rejected the very data it was generated from, and
        // Zod's failure names a path deep inside the save rather than the tick that caused it. The
        // collection flag also settles the labeled-tuple question below: the author has said this is a
        // LIST, so a two-element array is not guessed as [value, label] here.
        if (Array.isArray(val)) {
            const childPath = path + '.0'
            const itemSchema = val.length > 0 && selectedPaths.value.has(childPath)
                ? generateFieldSchema(val[0], indent, childPath)
                : 'z.any()'
            return `z.array(${itemSchema}).prefault([])`
        }
        // Try to infer MemberSchema from a selected child
        if (val && typeof val === 'object') {
             // Find first child that is SELECTED to use as template
             // If no child selected, we can't infer schema, so z.any() is correct
             let sampleKey = ''
             let sampleVal = null
             
             for (const k of Object.keys(val)) {
                 if (selectedPaths.value.has(path + '.' + k)) {
                     sampleKey = k
                     sampleVal = val[k]
                     break
                 }
             }

             if (sampleKey && sampleVal) {
                  // Recurse to generate the Member Schema
                  // We use the path of the sample item
                  const memberSchema = generateFieldSchema(sampleVal, indent, path + '.' + sampleKey)
                  return `z.record(z.string(), ${memberSchema}).prefault({})`
             }
        }
        return `z.record(z.string(), z.any()).prefault({})`
    }

    const type = getType(val)

    if (type === 'string') return `z.string().prefault('')`
    if (type === 'number') return `z.coerce.number().prefault(0)`
    if (type === 'boolean') return `z.coerce.boolean().prefault(false)`

    if (type === 'array') {
        if (isLabeledTuple(val)) return getLabeledType(val)
        
        const childPath = path + '.0'
        if (val.length > 0 && selectedPaths.value.has(childPath)) {
            const itemSchema = generateFieldSchema(val[0], indent, childPath)
            return `z.array(${itemSchema}).prefault([])`
        }
        return `z.array(z.any()).prefault([])`
    }

    if (type === 'object') {
        const lines: string[] = []
        lines.push(`z`)
        lines.push(`${indent}.object({`)
        
        let hasKeys = false
        for (const [k, v] of Object.entries(val)) {
             const subPath = path + '.' + k
             if (selectedPaths.value.has(subPath)) {
                 const keyStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : `'${k}'`
                 lines.push(`${indent}    ${keyStr}: ${generateFieldSchema(v, indent + '    ', subPath)},`)
                 hasKeys = true
             }
        }
        
        lines.push(`${indent}})`)
        // Add passthrough if the object is NOT locked
        if (!lockedPaths.value.has(path)) {
            lines.push(`${indent}.passthrough()`)
        }
        lines.push(`${indent}.prefault({})`)
        
        if (!hasKeys && lockedPaths.value.has(path)) return `z.object({}).prefault({})`
        if (!hasKeys) return `z.object({}).passthrough().prefault({})`
        return lines.join('\n')
    }

    return `z.any().prefault('')`
}


const generatedCode = computed(() => {
    const root = mvuDataParsed.value || {}
    const topKeys = Object.keys(root).filter(k => selectedPaths.value.has('.' + k))
    
    let out = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
// zod and lodash are available globally as \`z\` and \`_\`

/**
 * IMPORTANT:
 * Your MVU variable name is \`stat_data\`.
 * Therefore the schema MUST describe the VALUE of that variable directly:
 * { ${topKeys.join(', ')} ... }
 */

// -------------------------
// Base atoms
// -------------------------
const strEmpty = z.string().prefault('');
const num0 = z.coerce.number().prefault(0);
const boolFalse = z.coerce.boolean().prefault(false);

// -------------------------
// "Labeled" field helper: [value, label]
// -------------------------
const labeledValue = z
  .tuple([
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.any()),
      z.object({}).passthrough(),
    ]).prefault(''),
    strEmpty,
  ])
  .prefault(['', '']);

// Convenience typed variants
const labeledStr = z.tuple([strEmpty, strEmpty]).prefault(['', '']);
const labeledNum = z.tuple([num0, strEmpty]).prefault([0, '']);
const labeledBool = z.tuple([boolFalse, strEmpty]).prefault([false, '']);

// A generic "world record entry"
const worldRecordEntrySchema = z.object({}).passthrough().prefault({});
`

    const subSchemas: string[] = []
    
    for (const [key, val] of Object.entries(root)) {
        const path = '.' + key
        if (!selectedPaths.value.has(path)) continue;

        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            
            // Check manual collection status
            if (collectionPaths.value.has(path)) {
                
                const memberSchemaName = key.charAt(0).toLowerCase() + key.slice(1) + 'MemberSchema'
                const schemaName = key.charAt(0).toLowerCase() + key.slice(1) + 'Schema'

                const sampleKey = Object.keys(val)[0]
                const sampleVal = sampleKey ? (val as any)[sampleKey] : {}

                let memberBody = ''
                memberBody += `const ${memberSchemaName} = z\n`
                memberBody += `  .object({\n`
                
                if (sampleKey && typeof sampleVal === 'object') {
                    for (const [subKey, subVal] of Object.entries(sampleVal)) {
                         const subPath = path + '.' + sampleKey + '.' + subKey
                         if (selectedPaths.value.has(subPath)) {
                             const kStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(subKey) ? subKey : `'${subKey}'`
                             memberBody += `    ${kStr}: ${generateFieldSchema(subVal, '    ', subPath)},\n`
                         }
                    }
                }
                
                memberBody += `  })\n`
                // Add catchall if the object is NOT locked
                if (!lockedPaths.value.has(path)) {
                    memberBody += `  .catchall(labeledValue)\n`
                }
                memberBody += `  .prefault({});\n`
                
                const collBody = `const ${schemaName} = z.record(z.string(), ${memberSchemaName}).prefault({});`

                subSchemas.push(`// -------------------------\n// ${key} (Collection)\n// -------------------------`)
                subSchemas.push(memberBody)
                subSchemas.push(collBody)

            } else {
                // Standard Object
                const varName = key.charAt(0).toLowerCase() + key.slice(1) + 'Schema'
                
                let schemaBody = ''
                schemaBody += `const ${varName} = z\n`
                schemaBody += `  .object({\n`
                
                for (const [subKey, subVal] of Object.entries(val)) {
                    const subPath = path + '.' + subKey
                    if (selectedPaths.value.has(subPath)) {
                        const kStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(subKey) ? subKey : `'${subKey}'`
                        schemaBody += `    ${kStr}: ${generateFieldSchema(subVal, '    ', subPath)},\n`
                    }
                }
                
                schemaBody += `  })\n`
                // Add passthrough if the object is NOT locked
                if (!lockedPaths.value.has(path)) {
                    schemaBody += `  .passthrough()\n`
                }
                schemaBody += `  .prefault({});\n`
                
                subSchemas.push(`// -------------------------\n// ${key}\n// -------------------------`)
                subSchemas.push(schemaBody)
            }
        }
    }

    out += '\n' + subSchemas.join('\n\n') + '\n\n'

    out += `// -------------------------
// StatData root (THIS is the value of MVU variable \`stat_data\`)
// -------------------------
export const StatDataSchema = z
  .object({
`
    const declaredRoots = new Set<string>()
    for (const [key, val] of Object.entries(root)) {
        const path = '.' + key
        if (!selectedPaths.value.has(path)) continue;
        declaredRoots.add(key)

        const kStr = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `'${key}'`

        if (key === 'GameStarted') {
            out += `    ${kStr}: z.coerce.boolean().prefault(false),\n`
            continue
        }
        
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
             const varName = key.charAt(0).toLowerCase() + key.slice(1) + 'Schema'
             out += `    ${kStr}: ${varName},\n`
        } else {
             out += `    ${kStr}: ${generateFieldSchema(val, '    ', path)},\n`
        }
    }

    // The lock stops the model inventing stat_data.<key> at will, which is what it is for. It cannot
    // tell an invented root from a platform-owned one, so those are named here instead.
    if (lockTopLevel.value) {
        for (const platformRoot of PLATFORM_ROOTS) {
            if (declaredRoots.has(platformRoot.name)) continue
            out += `    ${platformRoot.name}: ${platformRoot.schema},   // platform-owned: the lock would strip it\n`
        }
    }

    out += `  })`
    if (!lockTopLevel.value) {
        out += `\n  .passthrough()`
    }
    out += `\n  .prefault({});\n\n`

    out += `// -------------------------
// Register
// -------------------------
$(() => {
  registerMvuSchema(StatDataSchema);
});
`
    return out
})

// Re-running the auto-detection replaces the author's picks, collections and locks, so it asks first.
async function resetSelection() {
    const isConfirmed = await askConfirm({
        question: 'Reset the schema selection?',
        answers: ['Picked paths, collections and locks go back to what the data suggests.', 'Reset replaces them; Cancel keeps your picks.'],
        actionText: 'Reset',
        actionIcon: 'fa-rotate-left',
        isDanger: true,
    })
    if (isConfirmed) initSelection()
}
</script>

<template>
    <div class="smb-page is-workbench">
        <DnaPageHeader icon="fa-diagram-project" eyebrow="Data / Schema Output" title="Schema Output"
            subtitle="The card's Zod schema, generated from the data paths you pick.">
            <template #status><span class="smb-pill is-accent">{{ selectedPaths.size }} paths</span></template>
        </DnaPageHeader>
        <DnaSplit :initial-start-width="420">
            <template #start>
                <DnaCard title="Schema structure" is-pane body-class="smb-stack">
                    <template #actions>
                        <button type="button" class="smb-btn" @click="resetSelection"><i class="fa-solid fa-rotate-left"></i>Reset selection</button>
                    </template>
                    <div>
                        <DnaSwitchRow v-model="lockTopLevel" title="Lock top-level schema"
                            description="The model cannot add top-level categories; unselected ones are stripped." />
                        <p class="smb-hint">mvuhelper, EventPack and GameLogicPlugin stay declared and open, so their data survives.</p>
                    </div>
                    <div v-if="mvuDataParsed" class="smb-tree">
                        <JsonTreeSelector
                            v-for="(val, key) in mvuDataParsed"
                            :key="key"
                            :data="val"
                            :path="String(key)"
                            :fullPath="'.' + key"
                            :depth="0"
                            :selectedPaths="selectedPaths"
                            :collectionPaths="collectionPaths"
                            :lockedPaths="lockedPaths"
                            @toggle="onToggle"
                            @toggle-collection="onToggleCollection"
                            @toggle-lock="onToggleLock"
                        />
                    </div>
                    <DnaNotice v-else status="warning" text="The data is not valid JSON; fix it under Data Configuration." />
                </DnaCard>
            </template>
            <template #end>
                <DnaCard title="Generated schema" is-pane body-class="is-fill">
                    <template #actions><CopyTextButton :text="generatedCode" label="Copy code" is-primary /></template>
                    <textarea readonly :value="generatedCode" class="smb-textarea is-code" aria-label="Generated schema" spellcheck="false"></textarea>
                </DnaCard>
            </template>
        </DnaSplit>
    </div>
</template>
