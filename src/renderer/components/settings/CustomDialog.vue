<template>
  <transition name="fade-scale">
    <div v-if="visible" class="custom-dialog-overlay" @click.self="onCancel">
      <div class="custom-dialog">
        <div class="custom-dialog-title">
          <slot name="title">提示</slot>
        </div>
        <div class="custom-dialog-content">
          <slot>内容</slot>
        </div>
        <div class="custom-dialog-actions">
          <button class="btn cancel" @click="onCancel">取消</button>
          <button class="btn confirm" @click="onConfirm">确认</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
const props = defineProps({
  visible: Boolean
});
const emits = defineEmits(['confirm', 'cancel']);
const onConfirm = () => emits('confirm');
const onCancel = () => emits('cancel');
</script>

<style scoped>
.custom-dialog-overlay {
  position: fixed;
  z-index: 9999;
  left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeInBg 0.3s;
}
@keyframes fadeInBg {
  from { opacity: 0; }
  to { opacity: 1; }
}
.fade-scale-enter-active, .fade-scale-leave-active {
  transition: all 0.3s cubic-bezier(.4,2,.6,1);
}
.fade-scale-enter-from, .fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.custom-dialog {
  background: linear-gradient(135deg, #fff 80%, #e3eaff 100%);
  border-radius: 18px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  min-width: 340px;
  max-width: 90vw;
  padding: 28px 28px 18px 28px;
  animation: popIn 0.3s;
}
@keyframes popIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}
.custom-dialog-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin-bottom: 12px;
  color: #3a3a3a;
  text-align: center;
}
.custom-dialog-content {
  font-size: 1rem;
  color: #444;
  margin-bottom: 18px;
  text-align: center;
  line-height: 1.7;
}
.custom-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.btn {
  min-width: 72px;
  padding: 7px 0;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
.btn.cancel {
  background: #e0e0e0;
  color: #555;
}
.btn.cancel:hover {
  background: #d1d1d1;
}
.btn.confirm {
  background: linear-gradient(90deg, #4f8cff 60%, #6ad1ff 100%);
  color: #fff;
  font-weight: bold;
}
.btn.confirm:hover {
  background: linear-gradient(90deg, #3576e0 60%, #4fc3f7 100%);
}
</style>
