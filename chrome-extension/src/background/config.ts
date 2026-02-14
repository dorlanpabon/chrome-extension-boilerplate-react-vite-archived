// Configuration for Google Meet Recorder Extension

export interface RecorderConfig {
  // API endpoint to send recordings
  apiEndpoint: string;

  // Enable debug logging
  debug: boolean;

  // Enable MP4 conversion with ffmpeg.wasm
  enableMp4Conversion: boolean;

  // Recording options
  recording: {
    // Video codec: vp9 or vp8
    videoCodec: 'vp9' | 'vp8';

    // Audio codec
    audioCodec: 'opus';

    // MediaRecorder timeslice (ms)
    timeslice: number;
  };
}

// Default configuration
export const defaultConfig: RecorderConfig = {
  apiEndpoint: 'https://your-api-endpoint.com/recordings',
  debug: false,
  enableMp4Conversion: false,
  recording: {
    videoCodec: 'vp9',
    audioCodec: 'opus',
    timeslice: 1000, // 1 second chunks
  },
};

// Load config from storage or use default
export const getConfig = async (): Promise<RecorderConfig> => {
  try {
    const stored = await chrome.storage.local.get('recorderConfig');
    return stored.recorderConfig || defaultConfig;
  } catch (error) {
    console.error('Error loading config:', error);
    return defaultConfig;
  }
};

// Save config to storage
export const saveConfig = async (config: RecorderConfig): Promise<void> => {
  try {
    await chrome.storage.local.set({ recorderConfig: config });
  } catch (error) {
    console.error('Error saving config:', error);
  }
};
