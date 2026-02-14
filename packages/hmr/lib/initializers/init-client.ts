import { DO_UPDATE, DONE_UPDATE, LOCAL_RELOAD_SOCKET_URL } from '../consts.js';
import MessageInterpreter from '../interpreter/index.js';

export default ({ id, onUpdate }: { id: string; onUpdate: () => void }) => {
  // Wrap WebSocket connection in a promise to avoid blocking content script execution
  void Promise.resolve().then(() => {
    const ws = new WebSocket(LOCAL_RELOAD_SOCKET_URL);

    ws.onopen = () => {
      ws.addEventListener('message', event => {
        const message = MessageInterpreter.receive(String(event.data));

        if (message.type === DO_UPDATE && message.id === id) {
          onUpdate();
          ws.send(MessageInterpreter.send({ type: DONE_UPDATE }));
        }
      });
    };

    ws.onerror = () => {
      // Silently handle connection errors to avoid breaking content scripts
      console.warn('[HMR] Failed to connect to hot reload server');
    };
  });
};
