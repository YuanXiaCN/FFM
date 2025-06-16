<template>
  <div class="setting-group">
    <div class="group-title">{{ title }}</div>
    <div class="group-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  }
})
</script>

<style scoped>
.setting-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--color-text-primary);
  padding-left: 8px;
  border-left: 3px solid var(--color-primary);
}

.group-content {
  background: var(--color-bg-secondary);
  border-radius: 8px;
  padding: 16px;
}
</style>
