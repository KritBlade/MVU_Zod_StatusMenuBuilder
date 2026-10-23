<script setup lang="ts">
import { useBuilderState } from '../composables/useBuilderState'

const { mvuDataRaw, setMvuData } = useBuilderState()

function onChange(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value
    setMvuData(val)
}
</script>

<template>
  <div class="data-panel">
      <div class="panel-header">
          <span>MVU Data Source (Paste JSON)</span>
      </div>
      <textarea 
        class="json-input" 
        :value="mvuDataRaw"
        @input="onChange"
        placeholder='Paste mvu.json here...'
      ></textarea>
  </div>
</template>

<style scoped>
.data-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #111;
}

.panel-header {
    padding: 8px 15px;
    background: #222;
    font-size: 0.85rem;
    color: #aaa;
}

.json-input {
    flex: 1;
    background: #0f1115;
    border: none;
    color: #00ff9d;
    font-family: monospace;
    font-size: 0.8rem;
    padding: 10px;
    resize: none;
    outline: none;
}
</style>
