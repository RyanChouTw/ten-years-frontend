export function openWs(url, { onMessage, onOpen, onClose, onError }) {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => onOpen?.());
  ws.addEventListener('close', () => onClose?.());
  ws.addEventListener('error', (e) => onError?.(e));
  ws.addEventListener('message', (e) => {
    try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ }
  });
  return {
    send(obj) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    },
    close() { try { ws.close(); } catch {} },
    get state() { return ws.readyState; },
  };
}
