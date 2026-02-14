import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");

// Recording state management
interface RecordingState {
  isRecording: boolean;
  tabId: number | null;
  streamId: string | null;
  mediaRecorder: MediaRecorder | null;
  chunks: Blob[];
  startTime: number | null;
  captions: CaptionData[];
  participants: Map<string, string>;
}

interface CaptionData {
  text: string;
  timestamp: number;
  participantId?: string;
  participantName?: string;
}

const recordingState: RecordingState = {
  isRecording: false,
  tabId: null,
  streamId: null,
  mediaRecorder: null,
  chunks: [],
  startTime: null,
  captions: [],
  participants: new Map(),
};

// API endpoint configuration (should be configurable)
const API_ENDPOINT = 'https://your-api-endpoint.com/recordings';

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'START_RECORDING':
      handleStartRecording(message.data, sender.tab?.id)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'STOP_RECORDING':
      handleStopRecording()
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_RECORDING_STATE':
      sendResponse({
        success: true,
        state: {
          isRecording: recordingState.isRecording,
          startTime: recordingState.startTime,
          captionCount: recordingState.captions.length,
        },
      });
      return false;

    case 'PROTOBUF_DATA':
      handleProtobufData(message.data)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'PARTICIPANT_INFO':
      handleParticipantInfo(message.data);
      sendResponse({ success: true });
      return false;

    case 'MEET_PAGE_READY':
      console.log('Google Meet page ready:', message.data);
      sendResponse({ success: true });
      return false;

    case 'RECORDING_READY':
      console.log('Recording ready:', message.data);
      // Handle the completed recording from offscreen document
      handleRecordingReady(message.data);
      sendResponse({ success: true });
      return false;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

// Start recording
const handleStartRecording = async (data: unknown, tabId?: number): Promise<Record<string, unknown>> => {
  if (recordingState.isRecording) {
    return { success: false, error: 'Recording already in progress' };
  }

  if (!tabId) {
    return { success: false, error: 'No tab ID provided' };
  }

  try {
    // Create offscreen document if it doesn't exist
    await setupOffscreenDocument();

    // Get tab capture stream
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    recordingState.tabId = tabId;
    recordingState.streamId = streamId;
    recordingState.isRecording = true;
    recordingState.startTime = Date.now();
    recordingState.chunks = [];
    recordingState.captions = [];

    console.log('Recording started for tab:', tabId);

    // Start offscreen recording
    chrome.runtime.sendMessage({
      type: 'START_OFFSCREEN_RECORDING',
      data: { streamId, tabId },
    });

    // Notify content script
    chrome.tabs.sendMessage(tabId, {
      type: 'RECORDING_STATE',
      data: { isRecording: true },
    });

    return { success: true, streamId };
  } catch (error) {
    console.error('Error starting recording:', error);
    recordingState.isRecording = false;
    return { success: false, error: (error as Error).message };
  }
};

// Setup offscreen document
const setupOffscreenDocument = async (): Promise<void> => {
  const offscreenUrl = chrome.runtime.getURL('offscreen/index.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });

  if (existingContexts.length > 0) {
    return; // Offscreen document already exists
  }

  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Recording tab with audio for Google Meet sessions',
  });

  console.log('Offscreen document created');
};

// Stop recording
const handleStopRecording = async (): Promise<Record<string, unknown>> => {
  if (!recordingState.isRecording) {
    return { success: false, error: 'No recording in progress' };
  }

  try {
    // Stop offscreen recording
    chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_RECORDING' });

    recordingState.isRecording = false;
    const duration = recordingState.startTime ? Date.now() - recordingState.startTime : 0;

    // Notify content script
    if (recordingState.tabId) {
      chrome.tabs.sendMessage(recordingState.tabId, {
        type: 'RECORDING_STATE',
        data: { isRecording: false },
      });
    }

    // Prepare recording data
    const recordingData = {
      duration,
      captions: recordingState.captions,
      participants: Array.from(recordingState.participants.entries()).map(([id, name]) => ({
        id,
        name,
      })),
      timestamp: new Date().toISOString(),
    };

    console.log('Recording stopped. Data:', recordingData);

    // Send to API endpoint
    await sendToEndpoint(recordingData);

    // Reset state
    recordingState.tabId = null;
    recordingState.streamId = null;
    recordingState.startTime = null;
    recordingState.chunks = [];
    recordingState.captions = [];

    return { success: true, data: recordingData };
  } catch (error) {
    console.error('Error stopping recording:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Handle protobuf data
const handleProtobufData = async (data: { url: string; buffer: number[] }): Promise<Record<string, unknown>> => {
  try {
    // Convert buffer back to Uint8Array
    const uint8Array = new Uint8Array(data.buffer);

    // Basic protobuf parsing attempt
    // In a real implementation, you would use the actual protobuf schema
    const text = new TextDecoder().decode(uint8Array);

    // Extract caption text (simplified)
    const caption: CaptionData = {
      text: text.substring(0, 500), // Limit length
      timestamp: Date.now(),
    };

    // Store caption if recording
    if (recordingState.isRecording) {
      recordingState.captions.push(caption);
      console.log('Caption captured:', caption.text.substring(0, 50));
    }

    return { success: true };
  } catch (error) {
    console.error('Error parsing protobuf:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Handle participant info
const handleParticipantInfo = (data: { participants: Array<{ id: string; name: string }> }): void => {
  data.participants.forEach(p => {
    recordingState.participants.set(p.id, p.name);
  });
  console.log('Participants updated:', recordingState.participants.size);
};

// Send data to API endpoint
const sendToEndpoint = async (data: Record<string, unknown>): Promise<void> => {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    console.log('Data sent to endpoint successfully');
  } catch (error) {
    console.error('Error sending to endpoint:', error);
    // Don't throw - log error but don't fail the recording stop
  }
};

// Handle recording ready from offscreen document
const handleRecordingReady = (data: { size: number; duration: number; url: string }): void => {
  console.log('Recording processing complete:', data);
  // Here you could upload the video file to your server
  // For now, we just log it
  // In production, you would:
  // 1. Download the blob from the URL
  // 2. Upload to your server
  // 3. Clean up the URL
};
