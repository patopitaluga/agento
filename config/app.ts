export function isSpeechPreviewEnabled(): boolean {
  const value = process.env.SPEECH_PREVIEW?.trim().toLowerCase();

  if (value === 'false' || value === '0' || value === 'no') {
    return false;
  }

  return true;
}
