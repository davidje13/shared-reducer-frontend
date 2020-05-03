export default class WebSocketConnection {
    private readonly messageCallback;
    private readonly errorCallback;
    private ws;
    private pingTimeout;
    constructor(wsUrl: string, token: string | undefined, messageCallback: (message: unknown) => void, errorCallback?: ((error: string) => void) | undefined);
    send(message: object): void;
    close(): void;
    private queueNextPing;
    private sendPing;
    private handleMessage;
    private handleError;
    private handleClose;
}
//# sourceMappingURL=WebSocketConnection.d.ts.map