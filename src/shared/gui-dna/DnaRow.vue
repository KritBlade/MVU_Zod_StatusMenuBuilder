<script setup lang="ts">
// The list row gene (GUI-DNA §5): a leading icon, a name (the `name` slot when it holds markup) over its sub-lines,
// status pills and trailing actions (danger last). The name and its pills share `smb-row-info`, so the pills can wrap
// under the name while the actions stay beside it.
withDefaults(defineProps<{ icon: string; name?: string; sub?: string[] }>(), { name: '', sub: () => [] })
</script>

<template>
    <div class="smb-row">
        <i class="fa-solid smb-row-icon" :class="icon"></i>
        <div class="smb-row-info">
            <div class="smb-row-main">
                <div class="smb-row-name"><slot name="name">{{ name }}</slot></div>
                <div v-for="(line, index) in sub" :key="index" class="smb-row-sub">{{ line }}</div>
            </div>
            <div class="smb-row-pills"><slot name="pills" /></div>
        </div>
        <div class="smb-row-actions"><slot name="actions" /></div>
    </div>
</template>
