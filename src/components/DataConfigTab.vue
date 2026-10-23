<script setup lang="ts">
import { ref, watch } from 'vue'
import { useBuilderState } from '../composables/useBuilderState'
import JsonVisualEditor from './JsonVisualEditor.vue'

const { mvuDataRaw, setMvuData, mvuDataParsed, activeMenuId } = useBuilderState()

// Local state for raw text to avoid cursor jumping
const rawText = ref(mvuDataRaw.value)
const parseError = ref('')

// Resizer state
const leftPanelWidth = ref(400)
const isResizing = ref(false)

function startResize() {
    isResizing.value = true
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stopResize)
}

function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value) return
    let newWidth = e.clientX
    if (newWidth < 200) newWidth = 200
    if (newWidth > window.innerWidth * 0.7) newWidth = window.innerWidth * 0.7
    leftPanelWidth.value = newWidth
}

function stopResize() {
    isResizing.value = false
    document.body.style.cursor = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopResize)
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

function loadDefaultdata() {
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
    <div class="data-config-container" @click="activeMenuId = null">
        <!-- Toolbar -->
        <div class="data-toolbar">
            <div class="toolbar-title">Data Configuration</div>
            <button class="btn-sm" @click="loadDefaultdata">Load Default Template</button>
        </div>

        <div class="split-view">
            <!-- Left: Visual Editor -->
            <div class="panel visual-panel" :style="{ width: leftPanelWidth + 'px', minWidth: '200px', flex: 'none' }">
                <div class="panel-header">Visual Editor</div>
                <div class="panel-content visual-panel-content">
                    <div v-if="!mvuDataParsed" class="empty-msg">
                        Invalid JSON Data. Fix errors on the right.
                    </div>
                    <div v-else class="visual-scroll-inner">
                        <JsonVisualEditor 
                            :modelValue="mvuDataParsed" 
                            @update:modelValue="onVisualUpdate" 
                        />
                    </div>
                </div>
            </div>

            <!-- RESIZER -->
            <div class="resizer" :class="{ active: isResizing }" @mousedown="startResize"></div>

            <!-- Right: Raw JSON -->
            <div class="panel raw-panel">
                <div class="panel-header">
                    <span>Raw JSON</span>
                    <span v-if="parseError" class="error-badge">Invalid JSON</span>
                    <span v-else class="valid-badge">Valid</span>
                </div>
                <textarea 
                    class="raw-editor" 
                    v-model="rawText"
                    @input="onRawChange"
                    spellcheck="false"
                ></textarea>
                <div v-if="parseError" class="error-detail">{{ parseError }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.data-config-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0f1115;
}

.data-toolbar {
    height: 50px;
    background: #1a1d24;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
}
.toolbar-title { font-weight: bold; color: #00f2ea; }

.split-view {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.visual-panel { border-right: none; background: #14161b; overflow: hidden; }

.resizer {
    width: 6px;
    background: #252830;
    cursor: col-resize;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: background 0.2s;
    z-index: 10;
}
.resizer:hover, .resizer.active {
    background: #0e639c;
}

.raw-panel { background: #050507; }

.panel-header {
    height: 35px;
    background: #1c1f26;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    font-size: 0.85em;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
}

.visual-panel-content {
    overflow-x: auto;
    scrollbar-color: #00bcd4 #11141a;
    scrollbar-width: auto;
}

.visual-scroll-inner {
    min-width: max-content;
}

.visual-panel-content::-webkit-scrollbar {
    height: 14px;
    width: 14px;
}

.visual-panel-content::-webkit-scrollbar-track {
    background: #11141a;
    border: 1px solid #2a2f3a;
    border-radius: 10px;
}

.visual-panel-content::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #00d7e6, #0e8ec2);
    border: 2px solid #11141a;
    border-radius: 10px;
}

.visual-panel-content::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #22e6f2, #12a4db);
}

.raw-editor {
    flex: 1;
    background: transparent;
    border: none;
    resize: none;
    color: #a6accd;
    font-family: 'Fira Code', monospace;
    font-size: 0.9em;
    padding: 15px;
    line-height: 1.5;
    outline: none;
}

.error-badge { color: #ff5252; font-weight: bold; }
.valid-badge { color: #50fa7b; }

.error-detail {
    background: #2a0a0a;
    color: #ff5252;
    padding: 5px 10px;
    font-size: 0.8em;
    border-top: 1px solid #ff5252;
}

.btn-sm {
    background: #333;
    border: 1px solid #444;
    color: #eee;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
}
.btn-sm:hover { background: #444; border-color: #666; }

.empty-msg {
    color: #666;
    text-align: center;
    margin-top: 50px;
}
</style>
