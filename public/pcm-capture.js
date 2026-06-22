const TARGET_SAMPLE_RATE = 24000;

function resampleToPcm16(float32Samples, sourceSampleRate) {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    const pcm16 = new Int16Array(float32Samples.length);
    for (let i = 0; i < float32Samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, float32Samples[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm16;
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(float32Samples.length / ratio));
  const pcm16 = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = Math.min(float32Samples.length - 1, Math.floor(i * ratio));
    const sample = Math.max(-1, Math.min(1, float32Samples[sourceIndex]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcm16;
}

class PcmCapture {
  constructor(onChunk) {
    this.onChunk = onChunk;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
    this.stream = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = resampleToPcm16(input, this.audioContext.sampleRate);
      this.onChunk(pcm16.buffer);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

window.PcmCapture = PcmCapture;
