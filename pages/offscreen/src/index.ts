console.log('Offscreen document loaded');

interface RecordingData {
  streamId: string;
  tabId: number;
}

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingStream: MediaStream | null = null;

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message.type);

  switch (message.type) {
    case 'START_OFFSCREEN_RECORDING':
      startRecording(message.data as RecordingData)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: (error as Error).message }));
      return true; // Keep channel open for async response

    case 'STOP_OFFSCREEN_RECORDING':
      stopRecording()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: (error as Error).message }));
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
  }
});

const startRecording = async (data: RecordingData): Promise<Record<string, unknown>> => {
  try {
    console.log('Starting offscreen recording with streamId:', data.streamId);

    // Get the stream from the streamId
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: data.streamId,
        },
      } as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: data.streamId,
        },
      } as MediaTrackConstraints,
    });

    // Create MediaRecorder
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    }

    mediaRecorder = new MediaRecorder(recordingStream, options);
    recordedChunks = [];

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log('Received chunk:', event.data.size, 'bytes');
      }
    };

    mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped, processing video...');
      void processRecording();
    };

    mediaRecorder.onerror = error => {
      console.error('MediaRecorder error:', error);
    };

    mediaRecorder.start(1000); // Collect data every second
    console.log('MediaRecorder started');

    return { success: true };
  } catch (error) {
    console.error('Error starting recording:', error);
    return { success: false, error: (error as Error).message };
  }
};

const stopRecording = async (): Promise<Record<string, unknown>> => {
  try {
    if (!mediaRecorder) {
      return { success: false, error: 'No active recording' };
    }

    console.log('Stopping MediaRecorder');
    mediaRecorder.stop();

    // Stop all tracks
    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
      recordingStream = null;
    }

    return { success: true };
  } catch (error) {
    console.error('Error stopping recording:', error);
    return { success: false, error: (error as Error).message };
  }
};

const processRecording = async (): Promise<void> => {
  try {
    console.log('Processing recording, chunks:', recordedChunks.length);

    if (recordedChunks.length === 0) {
      console.warn('No recorded chunks');
      return;
    }

    // Create blob from chunks
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    console.log('Created blob:', blob.size, 'bytes');

    // For now, just create a download link
    // In production, you would convert with ffmpeg.wasm and upload to server
    const url = URL.createObjectURL(blob);

    // Notify background script that recording is ready
    chrome.runtime.sendMessage({
      type: 'RECORDING_READY',
      data: {
        size: blob.size,
        duration: recordedChunks.length,
        url: url,
      },
    });

    // Optional: Convert to MP4 using ffmpeg.wasm
    // This is commented out to avoid loading time issues during development
    // await convertToMp4(blob);
  } catch (error) {
    console.error('Error processing recording:', error);
  }
};

// Optional: Convert to MP4 using ffmpeg.wasm
// Uncomment this function when you need MP4 conversion
/*
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

async function convertToMp4(webmBlob: Blob): Promise<void> {
  try {
    console.log('Initializing FFmpeg...');
    const ffmpeg = new FFmpeg();
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    console.log('FFmpeg loaded, converting...');
    
    // Write input file
    await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
    
    // Convert to MP4
    await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-c:a', 'aac', 'output.mp4']);
    
    // Read output file
    const data = await ffmpeg.readFile('output.mp4');
    const mp4Blob = new Blob([data], { type: 'video/mp4' });
    
    console.log('Conversion complete, MP4 size:', mp4Blob.size, 'bytes');
    
    // Create download URL
    const url = URL.createObjectURL(mp4Blob);
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'RECORDING_READY',
      data: {
        size: mp4Blob.size,
        format: 'mp4',
        url: url,
      },
    });
  } catch (error) {
    console.error('Error converting to MP4:', error);
  }
}
*/

console.log('Offscreen recording handler initialized');
