import '@src/Popup.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
import { useState, useEffect } from 'react';

const notificationOptions = {
  type: 'basic',
  iconUrl: chrome.runtime.getURL('icon-34.png'),
  title: 'Injecting content script error',
  message: 'You cannot inject script here!',
} as const;

interface RecordingState {
  isRecording: boolean;
  startTime: number | null;
  captionCount: number;
}

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const logo = isLight ? 'popup/logo_vertical.svg' : 'popup/logo_vertical_dark.svg';
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    startTime: null,
    captionCount: 0,
  });
  const [status, setStatus] = useState<string>('Ready');

  useEffect(() => {
    // Get initial recording state
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, response => {
      if (response?.success && response.state) {
        setRecordingState(response.state);
      }
    });
  }, []);

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const injectContentScript = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    if (tab.url!.startsWith('about:') || tab.url!.startsWith('chrome:')) {
      chrome.notifications.create('inject-error', notificationOptions);
    }

    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id! },
        files: ['/content-runtime/example.iife.js', '/content-runtime/all.iife.js'],
      })
      .catch(err => {
        // Handling errors related to other paths
        if (err.message.includes('Cannot access a chrome:// URL')) {
          chrome.notifications.create('inject-error', notificationOptions);
        }
      });
  };

  const startRecording = async () => {
    setStatus('Starting recording...');
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    // Check if we're on Google Meet
    if (!tab.url?.includes('meet.google.com')) {
      setStatus('Error: Please navigate to a Google Meet call');
      setTimeout(() => setStatus('Ready'), 3000);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'START_RECORDING',
        data: { tabId: tab.id },
      },
      response => {
        if (response?.success) {
          setRecordingState({
            isRecording: true,
            startTime: Date.now(),
            captionCount: 0,
          });
          setStatus('Recording...');
        } else {
          setStatus(`Error: ${response?.error || 'Failed to start recording'}`);
          setTimeout(() => setStatus('Ready'), 3000);
        }
      },
    );
  };

  const stopRecording = async () => {
    setStatus('Stopping recording...');
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, response => {
      if (response?.success) {
        setRecordingState({
          isRecording: false,
          startTime: null,
          captionCount: 0,
        });
        setStatus('Recording saved and sent to server');
        setTimeout(() => setStatus('Ready'), 3000);
      } else {
        setStatus(`Error: ${response?.error || 'Failed to stop recording'}`);
        setTimeout(() => setStatus('Ready'), 3000);
      }
    });
  };

  const formatDuration = (startTime: number | null) => {
    if (!startTime) return '00:00';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('App', isLight ? 'bg-slate-50' : 'bg-gray-800')}>
      <header className={cn('App-header', isLight ? 'text-gray-900' : 'text-gray-100')}>
        <button onClick={goGithubSite}>
          <img src={chrome.runtime.getURL(logo)} className="App-logo" alt="logo" />
        </button>

        <div className="mt-4 w-full max-w-md px-4">
          <h2 className="mb-4 text-xl font-bold">Google Meet Recorder</h2>

          <div
            className={cn(
              'mb-4 rounded p-3',
              isLight ? 'border border-gray-300 bg-white' : 'border border-gray-600 bg-gray-700',
            )}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Status:</span>
              <span
                className={cn(
                  'rounded px-2 py-1 text-sm',
                  recordingState.isRecording ? 'bg-red-500 text-white' : 'bg-green-500 text-white',
                )}>
                {recordingState.isRecording ? 'Recording' : 'Idle'}
              </span>
            </div>

            {recordingState.isRecording && (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span>Duration:</span>
                  <span className="font-mono">{formatDuration(recordingState.startTime)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Captions:</span>
                  <span className="font-mono">{recordingState.captionCount}</span>
                </div>
              </>
            )}

            <div className="mt-2 text-sm opacity-75">{status}</div>
          </div>

          {!recordingState.isRecording ? (
            <button
              className={cn(
                'w-full rounded py-3 font-bold shadow transition-transform hover:scale-105',
                isLight ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white',
              )}
              onClick={startRecording}>
              Start Recording
            </button>
          ) : (
            <button
              className="w-full rounded bg-red-500 py-3 font-bold text-white shadow transition-transform hover:scale-105"
              onClick={stopRecording}>
              Stop Recording
            </button>
          )}

          <div className="mt-4 text-center text-sm opacity-75">Navigate to a Google Meet call before recording</div>
        </div>

        <div className="mt-4">
          <button
            className={cn(
              'rounded px-4 py-1 font-bold shadow hover:scale-105',
              isLight ? 'bg-blue-200 text-black' : 'bg-gray-700 text-white',
            )}
            onClick={injectContentScript}>
            {t('injectButton')}
          </button>
        </div>
        <ToggleButton>{t('toggleTheme')}</ToggleButton>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
