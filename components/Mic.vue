<script setup>
import { onMounted, ref } from 'vue';

const emit = defineEmits([
  'endRecorded',
  'response',
]);

const isRecording = ref(false);

const sendAudioToServer = (audioBlob) => {
  const formData = new FormData();
  formData.append('audio', audioBlob);

  fetch('/audio', {
    method: 'POST',
    body: formData
  })
    .then(async (response) => response.json())
    .then((data) => {
      emit('response', data.response);
    })
    .catch((error) => {
      console.error(error);
    });
};

let mediaRecorder;
const startRecording = () => {
  isRecording.value = true;

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      const audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        emit('endRecorded', audioBlob);
        sendAudioToServer(audioBlob);
      };

      mediaRecorder.start();
    })
    .catch((error) => {
      console.error('Error accessing microphone:', error);
    });
};

const stopRecording = () => {
  if (isRecording.value)
    mediaRecorder.stop();
  isRecording.value = false;
};

onMounted(() => {
  document.addEventListener('touchend', stopRecording, false);
  document.addEventListener('mouseup', stopRecording, false);
});
</script>

<template>
  <div class="micContainer">
    <button
      type="button"
      class="micButton"
      :class="{ isRecording: isRecording }"
      @mousedown.prevent="startRecording"
      @touchstart.prevent="startRecording"
    >
      <svg width="36" height="36" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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
</template>

<style>
.micContainer {
  align-items: center;
  background: transparent;
  box-sizing: border-box;
  display: flex;
  height: 100%;
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
</style>
