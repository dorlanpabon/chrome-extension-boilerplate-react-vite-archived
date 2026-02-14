// CRITICAL: This code MUST execute before anything else, including HMR
// It intercepts RTCPeerConnection before Google Meet can freeze it

// Store original references immediately
const OriginalRTCPeerConnection = window.RTCPeerConnection;
const OriginalRTCSessionDescription = window.RTCSessionDescription;
const OriginalRTCIceCandidate = window.RTCIceCandidate;

// Store original prototype methods
const originalRTCPeerConnectionMethods = {
  createOffer: OriginalRTCPeerConnection.prototype.createOffer,
  createAnswer: OriginalRTCPeerConnection.prototype.createAnswer,
  setLocalDescription: OriginalRTCPeerConnection.prototype.setLocalDescription,
  setRemoteDescription: OriginalRTCPeerConnection.prototype.setRemoteDescription,
  addIceCandidate: OriginalRTCPeerConnection.prototype.addIceCandidate,
  addTrack: OriginalRTCPeerConnection.prototype.addTrack,
  removeTrack: OriginalRTCPeerConnection.prototype.removeTrack,
  getStats: OriginalRTCPeerConnection.prototype.getStats,
  close: OriginalRTCPeerConnection.prototype.close,
};

// Override RTCPeerConnection immediately
window.RTCPeerConnection = class extends OriginalRTCPeerConnection {
  constructor(config?: RTCConfiguration) {
    super(config);
    console.log('[CEB] RTCPeerConnection created with config:', config);
  }
} as typeof RTCPeerConnection;

// Export stored references for later use
(window as Window & { __CEB_OriginalRTCPeerConnection: typeof RTCPeerConnection }).__CEB_OriginalRTCPeerConnection =
  OriginalRTCPeerConnection;
(
  window as Window & { __CEB_OriginalRTCSessionDescription: typeof RTCSessionDescription }
).__CEB_OriginalRTCSessionDescription = OriginalRTCSessionDescription;
(window as Window & { __CEB_OriginalRTCIceCandidate: typeof RTCIceCandidate }).__CEB_OriginalRTCIceCandidate =
  OriginalRTCIceCandidate;
(
  window as Window & { __CEB_OriginalRTCPeerConnectionMethods: typeof originalRTCPeerConnectionMethods }
).__CEB_OriginalRTCPeerConnectionMethods = originalRTCPeerConnectionMethods;

console.log('[CEB] RTCPeerConnection intercepted at:', new Date().toISOString());
