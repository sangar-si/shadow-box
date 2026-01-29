
// This service uses the browser-native Web Speech API (speechSynthesis)
// which runs locally on the device for maximum efficiency and privacy.

export const getAvailableVoices = (): SpeechSynthesisVoice[] => {
  return window.speechSynthesis.getVoices();
};

export const findVoiceByName = (name: string): SpeechSynthesisVoice | undefined => {
  return getAvailableVoices().find(v => v.name === name);
};

const findBestDefaultVoice = () => {
  const voices = getAvailableVoices();
  return voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
         voices.find(v => v.lang.startsWith('en')) || 
         voices[0];
};

export const getAudioContext = () => {
  return {
    state: 'running',
    resume: () => Promise.resolve(),
  };
};

export const generateAndPlayCallout = (text: string, preferredVoiceName?: string) => {
  // Cancel any ongoing speech for immediate athletic commands
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  const voices = getAvailableVoices();
  let voice = preferredVoiceName ? voices.find(v => v.name === preferredVoiceName) : findBestDefaultVoice();
  
  if (!voice) {
    voice = findBestDefaultVoice();
  }
  
  utterance.voice = voice || null;
  utterance.rate = 1.25; // Sharp, athletic pace
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
};
