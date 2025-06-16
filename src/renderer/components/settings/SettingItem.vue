<template>
  <div class="setting-item">
    <div class="item-label">
      <span class="label">{{ label }}</span>
      <span v-if="description" class="description">{{ description }}</span>
    </div>
    <div class="item-control">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
}

.item-label {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.label {
  font-size: 14px;
  color: var(--color-text-primary);
}

.description {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.item-control {
  min-width: 200px;
  margin-left: 16px;
}
</style>
