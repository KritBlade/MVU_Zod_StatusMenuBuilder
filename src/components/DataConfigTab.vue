<script setup lang="ts">
// DataConfigTab — the MVU data the menu reads (a visual tree beside its raw JSON), and the config file that saves and
// loads the whole builder project.
import { ref, watch } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import JsonVisualEditor from './JsonVisualEditor.vue'
import DnaPageHeader from '../shared/gui-dna/DnaPageHeader.vue'
import DnaCard from '../shared/gui-dna/DnaCard.vue'
import DnaSplit from '../shared/gui-dna/DnaSplit.vue'
import DnaNotice from '../shared/gui-dna/DnaNotice.vue'
import DnaResultList from '../shared/gui-dna/DnaResultList.vue'
import DnaEmpty from '../shared/gui-dna/DnaEmpty.vue'
import type { ResultLine } from '../shared/gui-dna/gene-types'
import { askConfirm } from '../shared/gui-dna/confirm-dialog'
import { pickFile, saveFile } from '../shared/browser-file'
import { createModuleLog } from '../shared/log'

const log = createModuleLog('data-config')
const { mvuDataRaw, setMvuData, mvuDataParsed, exportConfig, importConfig } = useBuilderState()

// Local state for raw text to avoid cursor jumping
const rawText = ref(mvuDataRaw.value)
const parseError = ref('')

// ---- config file: the whole builder project in one layout.json ----
const CONFIG_FILE_NAME = 'layout.json'
const configResult = ref<ResultLine | null>(null)

function exportConfigFile() {
    saveFile(CONFIG_FILE_NAME, new Blob([exportConfig()], { type: 'application/json' }))
    configResult.value = { status: 'success', text: 'Exported ' + CONFIG_FILE_NAME }
}

async function importConfigFile() {
    const file = await pickFile('.json')
    if (!file) return
    const isConfirmed = await askConfirm({
        question: 'Import this config file?',
        facts: [{ label: 'File', value: file.name }],
        answers: ['It replaces the layout, data, schema picks, templates, Global CSS and locale now in the builder.', 'Import config replaces them; Cancel keeps yours.'],
        actionText: 'Import config',
        actionIcon: 'fa-file-import',
    })
    if (!isConfirmed) return
    let text = ''
    try {
        text = await file.text()
    } catch (error) {
        log.warn('could not read the config file ' + file.name + ':', error)
        configResult.value = { status: 'danger', text: 'Could not read ' + file.name }
        return
    }
    configResult.value = importConfig(text)
        ? { status: 'success', text: 'Loaded ' + file.name }
        : { status: 'danger', text: file.name + ' is not a builder config file' }
}

// Sync external changes to local text (only if valid)
watch(mvuDataRaw, (newVal) => {
    if (newVal !== rawText.value) {
        rawText.value = newVal
    }
})

function onRawChange(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value
    rawText.value = val
    try {
        JSON.parse(val)
        parseError.value = ''
        setMvuData(val)
    } catch (err: any) {
        parseError.value = err.message
    }
}

function onVisualUpdate(newData: any) {
    // When visual editor updates, we stringify and update raw
    const json = JSON.stringify(newData, null, 2)
    rawText.value = json
    setMvuData(json)
}

async function loadDefaultData() {
    const isConfirmed = await askConfirm({
        question: 'Load the default data?',
        answers: ['It replaces the MVU data now in the builder.', 'Load default data replaces it; Cancel keeps yours.'],
        actionText: 'Load default data',
        actionIcon: 'fa-rotate-left',
    })
    if (!isConfirmed) return
    // Basic MVU structure
    const def = {
      "World": {
        "Date": [
          "July 7, 1577",
          "Date"
        ],
        "Time": [
          "8:00",
          "Time"
        ],
        "Location": [
          "Abandoned Shack Outside Bluewatch Village",
          "Location"
        ],
        "Weather": [
          "Clear",
          "Weather"
        ]
      },
      "Mainchar": {
        "Name": [
          "{{user}}",
          "Name"
        ],
        "Image": [
          "https://raw.githubusercontent.com/KritBlade/ArtificRealm/refs/heads/main/Image/Yusha.jpg",
          "Portrait"
        ],
        "Race": [
          "Human",
          "Race"
        ],
        "Occupation": [
          "Spellsword",
          "Occupation"
        ],
        "Level": [
          1,
          "Level"
        ],
        "Exp": [
          0,
          "Experience"
        ],
        "Strength": [
          15,
          "Strength"
        ],
        "Agility": [
          10,
          "Agility"
        ],
        "Constitution": [
          15,
          "Constitution"
        ],
        "Intelligence": [
          10,
          "Intelligence"
        ],
        "Wisdom": [
          10,
          "Wisdom"
        ],
        "Charisma": [
          80,
          "Charisma"
        ],
        "Hp_curr": [
          135,
          "Current HP"
        ],
        "Hp_max": [
          135,
          "Max HP"
        ],
        "Mp_curr": [
          38,
          "Current MP"
        ],
        "Mp_max": [
          38,
          "Max MP"
        ],
        "Quests": {
          "MQ_2_Reach_the_Village_Safety": {
            "Desc": "the desc of the quest",
            "Difficulty": "F",
            "Reward": "Information about the world",
            "Status": "active"
          }
        },
        "Equipment": {
          "Beginner Sword": {
            "Type": "Weapon",
            "Qty": 1,
            "Desc": "Lv 1. Common. +5 Physical Damage. Beginner Sword",
            "Rarity": "Common",
            "Slot": "Hand",
            "EquipmentLevel": 1,
            "Appearance": "Beginner look"
          }
        },
        "Inventory": {
          "Copper": {
            "Type": "Money",
            "Qty": 30,
            "Desc": "Basic Healing Potion"
          },
          "Healing Potion": {
            "Type": "Potion",
            "Qty": 3,
            "Desc": "Heal small amount of HP"
          }
        }
      },
      "Familiar": {
        "Engni": {
          "Name": [
            "Engni Visetta",
            "Name"
          ],
          "Race": [
            "Elf",
            "Race"
          ],
          "Identity": [
            "Exiled Nun / Former Cardinal",
            "Identity"
          ],
          "Occupation": [
            "Cleric",
            "Occupation"
          ],
          "Level": [
            1,
            "Level"
          ],
          "Exp": [
            0,
            "Experience"
          ],
          "Height": [
            "160cm",
            "Height"
          ],
          "Physical_Features": [
            "Heart-shaped pupils that appear when aroused",
            "Physical Traits"
          ],
          "Personality": [
            "Appears fragile and pitiful, but inwardly extremely self-serving and driven by desire",
            "Personality"
          ],
          "Image": [
            "https://raw.githubusercontent.com/KritBlade/ArtificRealm/refs/heads/main/Image/Engni.jpg",
            "Avatar"
          ],
          "Hp_curr": [
            85,
            "Current HP"
          ],
          "Hp_max": [
            85,
            "Max HP"
          ],
          "Mp_curr": [
            56,
            "Current MP"
          ],
          "Mp_max": [
            56,
            "Max MP"
          ],
          "Strength": [
            5,
            "Strength"
          ],
          "Agility": [
            8,
            "Agility"
          ],
          "Constitution": [
            7,
            "Constitution"
          ],
          "Intelligence": [
            15,
            "Intelligence"
          ],
          "Wisdom": [
            20,
            "Wisdom"
          ],
          "Charisma": [
            85,
            "Charisma"
          ],
          "Affection": [
            10,
            "Affection"
          ],
          "Familiar_Status": [
            "Not a Familiar",
            "Familiar Status"
          ],
          "Biography": [
            "A former cardinal of the Goddess Flatu, disguising herself as an exiled nun. A reincarnator. Outwardly, she appears as a pitiful nun clad in revealing latex garments; in truth, she is profoundly self-serving and deeply calculating. She seeks to bind herself tightly to {{user}} through beauty and acting in order to escape the coming apocalypse, unaware that she has always been nothing more than a chess piece of the goddess.",
            "Profile"
          ],
          "Equipment": {
            "Basic Staff": {
              "Type": "Weapon",
              "Qty": 1,
              "Desc": "Lv 1. Common. +5 Magic Damage. Beginner Staff",
              "Rarity": "Common",
              "Slot": "Hand",
              "EquipmentLevel": 1,
              "Appearance": "Beginner look"
            }
          }
        }
      }
    }
    onVisualUpdate(def)
}
</script>

<template>
    <div class="smb-page is-workbench">
        <DnaPageHeader icon="fa-database" eyebrow="Data / Data Configuration" title="Data Configuration"
            subtitle="The MVU data the menu reads, edited as a tree or as raw JSON.">
            <template #status>
                <span v-if="parseError" class="smb-pill is-danger">Invalid JSON</span>
                <span v-else-if="!rawText.trim()" class="smb-pill is-neutral">No data</span>
                <span v-else class="smb-pill is-success">Valid JSON</span>
            </template>
        </DnaPageHeader>

        <DnaCard title="Config file" badge-icon="fa-floppy-disk" body-class="smb-stack"
            description="Layout, data, schema picks, templates, Global CSS and locale, in one layout.json.">
            <div class="smb-control-row">
                <button type="button" class="smb-btn smb-btn-primary" @click="exportConfigFile"><i class="fa-solid fa-file-export"></i>Export config</button>
                <button type="button" class="smb-btn" @click="importConfigFile"><i class="fa-solid fa-file-import"></i>Import config</button>
                <button type="button" class="smb-btn" @click="loadDefaultData"><i class="fa-solid fa-rotate-left"></i>Load default data</button>
            </div>
            <DnaResultList v-if="configResult" :lines="[configResult]" />
        </DnaCard>

        <DnaSplit :initial-start-width="440">
            <template #start>
                <DnaCard title="Visual editor" is-pane>
                    <div v-if="mvuDataParsed" class="smb-tree">
                        <JsonVisualEditor :modelValue="mvuDataParsed" @update:modelValue="onVisualUpdate" />
                    </div>
                    <DnaEmpty v-else-if="!rawText.trim()" icon="fa-database" text="No data yet: paste JSON into Raw JSON, or load the default data." />
                    <DnaNotice v-else status="warning" text="The raw JSON does not parse; fix it in Raw JSON to edit it here." />
                </DnaCard>
            </template>
            <template #end>
                <DnaCard title="Raw JSON" is-pane body-class="is-fill">
                    <textarea class="smb-textarea is-code" :class="{ 'is-missing': parseError }" v-model="rawText"
                        @input="onRawChange" spellcheck="false" aria-label="Raw JSON"></textarea>
                    <DnaNotice v-if="parseError" status="danger" :text="'The JSON does not parse: ' + parseError" />
                </DnaCard>
            </template>
        </DnaSplit>
    </div>
</template>
