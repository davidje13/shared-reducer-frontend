const PING = 'P';
const PONG = 'p';
const PING_INTERVAL = 20 * 1000;

function getWebSocketClass(): typeof WebSocket {
  // This condition will disappear at compile time and the function will be inlined;
  // The output in /build/ always uses WebSocket, never require('ws')

  /* eslint-disable
       import/no-extraneous-dependencies,
       @typescript-eslint/no-require-imports,
       global-require
  */
  return (process.env.NODE_ENV === 'production') ? WebSocket : require('ws');
  /* eslint-enable
       import/no-extraneous-dependencies,
       @typescript-eslint/no-require-imports,
       global-require
  */
}

export default class WebSocketConnection {
  private ws: WebSocket;

  private pingTimeout: NodeJS.Timeout | null = null;

  public constructor(
    wsUrl: string,
    token: string | undefined = undefined,
    private readonly messageCallback: (message: unknown) => void,
    private readonly errorCallback: ((error: string) => void) | undefined = undefined,
  ) {
    this.ws = new (getWebSocketClass())(wsUrl);
    this.ws.addEventListener('message', this.handleMessage);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('close', this.handleClose);
    if (token) {
      this.ws.addEventListener('open', () => this.ws.send(token), { once: true });
    }
    this.queueNextPing();
  }

  public send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  public close(): void {
    this.ws.close();
    if (this.pingTimeout !== null) {
      clearTimeout(this.pingTimeout);
    }
  }

  private queueNextPing(): void {
    if (this.pingTimeout !== null) {
      clearTimeout(this.pingTimeout);
    }
    this.pingTimeout = setTimeout(this.sendPing, PING_INTERVAL);
  }

  private sendPing = (): void => {
    this.ws.send(PING);
  };

  private handleMessage = ({ data }: { data: string }): void => {
    this.queueNextPing();
    if (data !== PONG) {
      this.messageCallback(JSON.parse(data));
    }
  };

  private handleError = (): void => {
    this.errorCallback?.('Failed to connect');
  };

  private handleClose = (): void => {
    if (this.pingTimeout !== null) {
      clearTimeout(this.pingTimeout);
    }
  };
}
