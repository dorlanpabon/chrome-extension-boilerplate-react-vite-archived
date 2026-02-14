console.log('[CEB] Google Meet content script loaded at document_start');

// Intercept Google Meet caption channels
interface CaptionData {
  text: string;
  timestamp: number;
  participantId?: string;
  participantName?: string;
}

interface MeetMessage {
  type: 'CAPTION_UPDATE' | 'RECORDING_STATE' | 'PARTICIPANT_INFO';
  data: unknown;
}

// Store captions
const captionsBuffer: CaptionData[] = [];

// Intercept fetch and XMLHttpRequest to capture protobuf data
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);

  const url = args[0] instanceof Request ? args[0].url : args[0];

  // Intercept caption-related endpoints
  if (
    typeof url === 'string' &&
    url.includes('meet.google.com') &&
    (url.includes('caption') || url.includes('transcript'))
  ) {
    try {
      const clonedResponse = response.clone();
      const arrayBuffer = await clonedResponse.arrayBuffer();

      // Send to background for protobuf decoding
      chrome.runtime.sendMessage({
        type: 'PROTOBUF_DATA',
        data: {
          url,
          buffer: Array.from(new Uint8Array(arrayBuffer)),
        },
      });
    } catch (error) {
      console.error('Error processing Meet response:', error);
    }
  }

  return response;
};

// Intercept XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
  (this as XMLHttpRequest & { _url: string | URL })._url = url;
  return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
};

XMLHttpRequest.prototype.send = function (...args: unknown[]) {
  const url = (this as XMLHttpRequest & { _url: string | URL })._url;

  if (
    typeof url === 'string' &&
    url.includes('meet.google.com') &&
    (url.includes('caption') || url.includes('transcript'))
  ) {
    this.addEventListener('load', function () {
      try {
        if (this.response instanceof ArrayBuffer) {
          chrome.runtime.sendMessage({
            type: 'PROTOBUF_DATA',
            data: {
              url,
              buffer: Array.from(new Uint8Array(this.response)),
            },
          });
        }
      } catch (error) {
        console.error('Error processing XHR response:', error);
      }
    });
  }

  return originalSend.apply(this, args as Parameters<typeof originalSend>);
};

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: MeetMessage, sender, sendResponse) => {
  if (message.type === 'CAPTION_UPDATE') {
    const caption: CaptionData = message.data;
    captionsBuffer.push(caption);

    // Notify popup/UI
    window.postMessage(
      {
        type: 'MEET_CAPTION_UPDATE',
        caption,
      },
      '*',
    );

    sendResponse({ success: true });
  } else if (message.type === 'RECORDING_STATE') {
    console.log('Recording state changed:', message.data);
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

// Extract participant information from DOM
const extractParticipantInfo = (): Array<{ id: string; name: string }> => {
  const participants: Array<{ id: string; name: string }> = [];

  // Google Meet participant selectors (these may change)
  const participantElements = document.querySelectorAll('[data-participant-id]');

  participantElements.forEach(el => {
    const id = el.getAttribute('data-participant-id');
    const nameEl = el.querySelector('[data-self-name], .participant-name');
    const name = nameEl?.textContent?.trim() || 'Unknown';

    if (id) {
      participants.push({ id, name });
    }
  });

  return participants;
};

// Send participant info periodically
setInterval(() => {
  const participants = extractParticipantInfo();
  if (participants.length > 0) {
    chrome.runtime.sendMessage({
      type: 'PARTICIPANT_INFO',
      data: { participants },
    });
  }
}, 5000);

// Notify background that Meet page is ready
chrome.runtime.sendMessage({
  type: 'MEET_PAGE_READY',
  data: { url: window.location.href },
});

console.log('[CEB] Google Meet interception active');
