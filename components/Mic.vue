<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

const isRecording = ref(false);
const isLoading = ref(false);
const isPreparingImage = ref(false);
const isCameraOpen = ref(false);
const history = ref([]);
const errorMessage = ref('');
const csrfToken = ref('');
const selectedImage = ref(null);
const selectedImagePreview = ref('');
const question = ref('');
const liveTranscript = ref('');
const liveResponse = ref('');
const speechPreviewEnabled = ref(true);
const cameraVideo = ref(null);
const historyPanel = ref(null);

let cameraStream = null;
let querySocket = null;
let pcmCapture = null;
let speechPreview = null;
let pendingVoiceTurn = null;
let completionChime = null;

const playCompletionChime = () => {
  try {
    if (!completionChime) {
      completionChime = new Audio('/bell-chime.mp3');
    }

    completionChime.currentTime = 0;
    void completionChime.play();
  } catch (error) {
    console.warn('Could not play completion chime', error);
  }
};

const stopSpeechPreview = () => {
  if (speechPreview) {
    speechPreview.stop();
    speechPreview = null;
  }
};

const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

const ensureQuerySocket = () => {
  if (querySocket && (querySocket.readyState === WebSocket.OPEN || querySocket.readyState === WebSocket.CONNECTING)) {
    return querySocket;
  }

  querySocket = new WebSocket(getWebSocketUrl());

  querySocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'turn.started') {
      liveTranscript.value = '';
      liveResponse.value = '';
      pendingVoiceTurn?.onStarted?.();
      return;
    }

    if (data.type === 'turn.transcript.delta') {
      if (!isRecording.value) {
        liveTranscript.value = data.transcript ?? '';
        scrollHistoryToBottom();
      }
      return;
    }

    if (data.type === 'turn.transcript.completed') {
      if (!isRecording.value) {
        liveTranscript.value = data.transcript ?? liveTranscript.value;
        scrollHistoryToBottom();
      }
      return;
    }

    if (data.type === 'turn.response.delta') {
      liveResponse.value = data.response ?? '';
      scrollHistoryToBottom();
      return;
    }

    if (data.type === 'turn.complete') {
      liveTranscript.value = '';
      liveResponse.value = '';
      appendTurnToHistory(data);
      question.value = '';
      clearImage();
      isLoading.value = false;
      pendingVoiceTurn = null;
      playCompletionChime();
      return;
    }

    if (data.type === 'turn.error') {
      stopSpeechPreview();
      liveTranscript.value = '';
      liveResponse.value = '';
      history.value.push({
        type: 'error',
        text: data.error ?? 'Failed to process request',
      });
      scrollHistoryToBottom();
      isLoading.value = false;
      isRecording.value = false;
      pendingVoiceTurn = null;
    }
  };

  querySocket.onclose = () => {
    querySocket = null;
    pendingVoiceTurn = null;
  };

  return querySocket;
};

const waitForSocketOpen = (socket) => new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) {
    resolve();
    return;
  }

  const onOpen = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    reject(new Error('WebSocket connection failed'));
  };
  const cleanup = () => {
    socket.removeEventListener('open', onOpen);
    socket.removeEventListener('error', onError);
  };

  socket.addEventListener('open', onOpen);
  socket.addEventListener('error', onError);
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read image'));
  reader.readAsDataURL(file);
});

const startVoiceTurn = async () => {
  if (!csrfToken.value) {
    errorMessage.value = 'Security token missing. Reload the app.';
    return;
  }

  const socket = ensureQuerySocket();
  await waitForSocketOpen(socket);

  let imageDataUrl;
  if (selectedImage.value) {
    imageDataUrl = await fileToDataUrl(selectedImage.value);
  }

  const outgoingQuestion = question.value.trim();

  pendingVoiceTurn = {
    onStarted: async () => {
      try {
        if (speechPreviewEnabled.value && window.SpeechPreview) {
          speechPreview = new window.SpeechPreview({
            lang: 'es-ES',
            onTranscript: (text) => {
              if (isRecording.value && text) {
                liveTranscript.value = text;
                scrollHistoryToBottom();
              }
            },
          });
          await speechPreview.start();
        }

        pcmCapture = new window.PcmCapture((arrayBuffer) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(arrayBuffer);
          }
        });
        await pcmCapture.start();
      } catch (error) {
        console.error(error);
        stopSpeechPreview();
        socket.send(JSON.stringify({ type: 'turn.cancel' }));
        errorMessage.value = 'Microphone access failed';
        isRecording.value = false;
        isLoading.value = false;
        pendingVoiceTurn = null;
      }
    },
  };

  socket.send(JSON.stringify({
    type: 'turn.start',
    csrfToken: csrfToken.value,
    question: outgoingQuestion || undefined,
    image: imageDataUrl,
    hasAudio: true,
  }));
};

const scrollHistoryToBottom = async () => {
  await nextTick();
  const panel = historyPanel.value;
  if (panel) {
    panel.scrollTop = panel.scrollHeight;
  }
};

const appendTurnToHistory = (turn) => {
  if (turn.userPrompt) {
    history.value.push({ type: 'user', text: turn.userPrompt });
  }

  for (const action of turn.actions ?? []) {
    history.value.push({ type: 'action', text: action });
  }

  if (turn.response) {
    history.value.push({ type: 'assistant', text: turn.response });
  }

  scrollHistoryToBottom();
};

const setSelectedImage = (file) => {
  if (selectedImagePreview.value) {
    URL.revokeObjectURL(selectedImagePreview.value);
  }

  selectedImage.value = file;
  selectedImagePreview.value = URL.createObjectURL(file);
};

const prepareAndSelectImage = async (source, filename) => {
  isPreparingImage.value = true;
  errorMessage.value = '';

  try {
    const prepared = await window.prepareImageForUpload(source, filename);
    setSelectedImage(prepared);
  } catch (error) {
    console.error(error);
    errorMessage.value = error instanceof Error ? error.message : 'Could not process image';
  } finally {
    isPreparingImage.value = false;
  }
};

const loadCsrfToken = async () => {
  const response = await fetch('/csrf-token', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error('Failed to load CSRF token');
  }

  const data = await response.json();
  csrfToken.value = data.csrfToken ?? '';
};

const loadAppConfig = async () => {
  const response = await fetch('/config', { credentials: 'same-origin' });
  if (!response.ok) {
    return;
  }

  const data = await response.json();
  speechPreviewEnabled.value = data.speechPreview !== false;
};

const sendQuery = ({ imageFile, questionText }) => {
  if (!csrfToken.value) {
    errorMessage.value = 'Security token missing. Reload the app.';
    return;
  }

  const outgoingQuestion = questionText?.trim() ?? '';
  const formData = new FormData();

  if (imageFile) {
    formData.append('image', imageFile);
  }
  if (outgoingQuestion) {
    formData.append('question', outgoingQuestion);
  }

  isLoading.value = true;
  errorMessage.value = '';

  fetch('/turn', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': csrfToken.value,
    },
    body: formData,
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to process request');
      }

      appendTurnToHistory(data);
      question.value = '';
      clearImage();
      playCompletionChime();
    })
    .catch((error) => {
      history.value.push({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to process request',
      });
      scrollHistoryToBottom();
    })
    .finally(() => {
      isLoading.value = false;
    });
};

const sendTextQuery = () => {
  if (isLoading.value || isPreparingImage.value || !question.value.trim()) {
    return;
  }

  sendQuery({
    imageFile: selectedImage.value,
    questionText: question.value,
  });
};

const clearImage = () => {
  selectedImage.value = null;
  if (selectedImagePreview.value) {
    URL.revokeObjectURL(selectedImagePreview.value);
  }
  selectedImagePreview.value = '';
};

const stopCameraStream = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (cameraVideo.value) {
    cameraVideo.value.srcObject = null;
  }
};

const closeCamera = () => {
  stopCameraStream();
  isCameraOpen.value = false;
};

const openCamera = async () => {
  if (isLoading.value || isPreparingImage.value || isCameraOpen.value) {
    return;
  }

  errorMessage.value = '';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });
    isCameraOpen.value = true;
    await nextTick();

    if (cameraVideo.value) {
      cameraVideo.value.srcObject = cameraStream;
    }
  } catch (error) {
    console.error('Error accessing camera:', error);
    errorMessage.value = 'Camera access failed';
    closeCamera();
  }
};

const capturePhoto = async () => {
  const video = cameraVideo.value;
  if (!video?.videoWidth || !video?.videoHeight) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    errorMessage.value = 'Could not capture photo';
    closeCamera();
    return;
  }

  context.drawImage(video, 0, 0);
  closeCamera();

  const captureBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not capture photo'));
    }, 'image/jpeg', 0.92);
  });

  await prepareAndSelectImage(captureBlob, `camera-${Date.now()}.jpg`);
};

const startRecording = () => {
  if (isLoading.value || isPreparingImage.value || isCameraOpen.value) {
    return;
  }

  isRecording.value = true;
  errorMessage.value = '';
  liveTranscript.value = '';
  liveResponse.value = '';

  startVoiceTurn().catch((error) => {
    console.error(error);
    stopSpeechPreview();
    errorMessage.value = error instanceof Error ? error.message : 'Voice connection failed';
    isRecording.value = false;
    liveTranscript.value = '';
    liveResponse.value = '';
    pendingVoiceTurn = null;
  });
};

const stopRecording = () => {
  if (!isRecording.value) {
    return;
  }

  isRecording.value = false;
  isLoading.value = true;
  stopSpeechPreview();

  if (pcmCapture) {
    pcmCapture.stop();
    pcmCapture = null;
  }

  if (querySocket?.readyState === WebSocket.OPEN) {
    querySocket.send(JSON.stringify({ type: 'turn.commit' }));
  }
};

onMounted(() => {
  loadCsrfToken().catch((error) => {
    console.error(error);
    errorMessage.value = 'Failed to initialize security token';
  });
  loadAppConfig().catch((error) => {
    console.error(error);
  });
  document.addEventListener('touchend', stopRecording, false);
  document.addEventListener('mouseup', stopRecording, false);
});

onUnmounted(() => {
  document.removeEventListener('touchend', stopRecording, false);
  document.removeEventListener('mouseup', stopRecording, false);
  if (pcmCapture) {
    pcmCapture.stop();
    pcmCapture = null;
  }
  if (querySocket?.readyState === WebSocket.OPEN) {
    querySocket.send(JSON.stringify({ type: 'turn.cancel' }));
    querySocket.close();
  }
  stopSpeechPreview();
  closeCamera();
  clearImage();
});
</script>

<template>
  <div class="appShell">
    <section ref="historyPanel" class="historyPanel" aria-live="polite">
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

    <section class="inputBar">
      <div v-if="selectedImagePreview" class="imagePreview">
        <img :src="selectedImagePreview" alt="Selected image preview" class="imagePreview__thumb" />
        <span class="imagePreview__name">{{ selectedImage?.name }}</span>
        <button type="button" class="imagePreview__clear" aria-label="Remove image" @click="clearImage">×</button>
      </div>

      <div class="inputRow">
        <button
          type="button"
          class="attachButton"
          :disabled="isLoading || isPreparingImage || isCameraOpen"
          aria-label="Take photo with camera"
          @click="openCamera"
        >
          Camera
        </button>
        <input
          v-model="question"
          type="text"
          class="questionInput"
          placeholder="Ask..."
          :disabled="isLoading || isPreparingImage || isCameraOpen"
          @keydown.enter.prevent="sendTextQuery"
        />
        <button
          type="button"
          class="sendButton"
          :disabled="isLoading || isPreparingImage || isCameraOpen || !question.trim()"
          @click="sendTextQuery"
        >
          Send
        </button>
      </div>
    </section>

    <div class="micContainer">
      <button
        type="button"
        class="micButton"
        :class="{ isRecording: isRecording, isDisabled: isLoading || isPreparingImage || isCameraOpen }"
        :disabled="isLoading || isPreparingImage || isCameraOpen"
        @mousedown.prevent="startRecording"
        @touchstart.prevent="startRecording"
      >
        <svg width="36" height="36" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M13.9997 18.0833C16.578 18.0833 18.6663 15.9949 18.6663 13.4166V6.99992C18.6663 4.42159 16.578 2.33325 13.9997 2.33325C11.4213 2.33325 9.33301 4.42159 9.33301 6.99992V13.4166C9.33301 15.9949 11.4213 18.0833 13.9997 18.0833Z"
            stroke-width="1.41231"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M5.0752 11.2585V13.2419C5.0752 18.1652 9.07686 22.1669 14.0002 22.1669C18.9235 22.1669 22.9252 18.1652 22.9252 13.2419V11.2585"
            stroke-width="1.41231"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M12.3784 7.50188C13.4284 7.11688 14.5718 7.11688 15.6218 7.50188"
            stroke-width="1.41231"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M13.0669 9.97504C13.6852 9.81171 14.3269 9.81171 14.9452 9.97504"
            stroke-width="1.41231"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M14 22.1667V25.6667"
            stroke-width="1.41231"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div v-if="isCameraOpen" class="cameraOverlay">
      <video ref="cameraVideo" class="cameraPreview" autoplay playsinline muted />
      <div class="cameraActions">
        <button type="button" class="cameraButton" @click="closeCamera">Cancel</button>
        <button type="button" class="cameraButton cameraButton--primary" @click="capturePhoto">Capture</button>
      </div>
    </div>
  </div>
</template>

<style>
.appShell {
  background: #f4f4f5;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;
}

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

.inputBar {
  border-top: 1px solid #d4d4d8;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 8px;
  padding: 10px 12px;
}

.imagePreview {
  align-items: center;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
}

.imagePreview__thumb {
  border-radius: 4px;
  flex-shrink: 0;
  height: 36px;
  object-fit: cover;
  width: 36px;
}

.imagePreview__name {
  color: #52525b;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.imagePreview__clear {
  background: transparent;
  border: 0;
  color: #71717a;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.inputRow {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.attachButton,
.sendButton {
  background: #e4e4e7;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  color: #3f3f46;
  cursor: pointer;
  flex-shrink: 0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 8px;
}

.attachButton:disabled,
.sendButton:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.questionInput {
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-sizing: border-box;
  color: #18181b;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  min-width: 0;
  padding: 7px 10px;
}

.questionInput:disabled {
  opacity: 0.6;
}

.micContainer {
  align-items: center;
  border-top: 1px solid #d4d4d8;
  box-sizing: border-box;
  display: flex;
  flex: 0 0 72px;
  justify-content: center;
  width: 100%;
}

.micButton {
  align-items: center;
  background-color: transparent;
  border: 0;
  border-radius: 50%;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  height: 56px;
  justify-content: center;
  padding: 0;
  width: 56px;
}

.micButton.isDisabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.micButton.isRecording {
  background-color: #999;
}

.micButton svg {
  display: block;
}

.micButton svg path {
  stroke: #1a3c34;
}

.micButton.isRecording svg path {
  stroke: #fff;
}

.cameraOverlay {
  background: #18181b;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  inset: 0;
  padding: 12px;
  position: absolute;
  z-index: 10;
}

.cameraPreview {
  background: #000;
  border-radius: 8px;
  flex: 1;
  min-height: 0;
  object-fit: cover;
  width: 100%;
}

.cameraActions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 10px;
}

.cameraButton {
  background: #3f3f46;
  border: 0;
  border-radius: 6px;
  color: #fafafa;
  cursor: pointer;
  flex: 1;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 12px;
}

.cameraButton--primary {
  background: #1a3c34;
}
</style>
