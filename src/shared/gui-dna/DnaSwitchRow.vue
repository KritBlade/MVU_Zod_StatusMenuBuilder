<script setup lang="ts">
// The switch row gene (GUI-DNA §5): an on/off setting as a switch, with its title and a one-line description.
withDefaults(defineProps<{ modelValue: boolean; title: string; description: string; isDisabled?: boolean }>(), { isDisabled: false })
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()
</script>

<template>
    <label class="smb-switch-row">
        <input type="checkbox" role="switch" class="smb-switch" :checked="modelValue" :disabled="isDisabled"
            @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)">
        <span class="smb-switch-title">{{ title }}</span>
        <span class="smb-switch-desc">{{ description }}</span>
    </label>
</template>
