<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  history: {
    type: Array,
    default: () => [],
  },
  isRecording: Boolean,
  liveTranscript: String,
  liveResponse: String,
  isPreparingImage: Boolean,
  isLoading: Boolean,
  errorMessage: String,
});

const panel = ref(null);

const scrollToBottom = async () => {
  await nextTick();
  if (panel.value) {
    panel.value.scrollTop = panel.value.scrollHeight;
  }
};

watch(
  () => [
    props.history,
    props.liveTranscript,
    props.liveResponse,
    props.errorMessage,
    props.isRecording,
    props.isLoading,
    props.isPreparingImage,
  ],
  scrollToBottom,
  { deep: true },
);
</script>

<template>
  <section ref="panel" class="historyPanel" aria-live="polite">
    <p
      v-for="(entry, index) in history"
      :key="index"
      class="historyEntry"
      :class="`historyEntry--${entry.type}`"
    >
      {{ entry.text }}
    </p>
    <p v-if="isRecording && !liveTranscript" class="historyEntry historyEntry--status">Listening...</p>
    <p
      v-if="liveTranscript"
      class="historyEntry historyEntry--user historyEntry--live"
      :class="{ 'historyEntry--preview': isRecording }"
    >{{ liveTranscript }}</p>
    <p v-if="liveResponse" class="historyEntry historyEntry--assistant historyEntry--live">{{ liveResponse }}</p>
    <p v-if="isPreparingImage" class="historyEntry historyEntry--status">Preparing image...</p>
    <p v-if="isLoading && !liveResponse" class="historyEntry historyEntry--status">Thinking...</p>
    <p v-if="errorMessage" class="historyEntry historyEntry--error">{{ errorMessage }}</p>
  </section>
</template>

<style>
.historyPanel {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.historyEntry {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.historyEntry--user {
  color: #1a3c34;
  font-weight: 600;
}

.historyEntry--assistant {
  color: #3f3f46;
}

.historyEntry--action {
  color: #7c6f2a;
  font-size: 12px;
  font-style: italic;
}

.historyEntry--live {
  opacity: 0.85;
}

.historyEntry--preview {
  font-style: italic;
  opacity: 0.7;
}

.historyEntry--status {
  color: #71717a;
}

.historyEntry--error {
  color: #b91c1c;
}
</style>
