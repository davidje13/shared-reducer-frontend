# Shared Reducer Frontend

Shared state management via websockets.

Designed to work with
[shared-reducer-backend](https://github.com/davidje13/shared-reducer-backend).

## Install dependency

```bash
npm install --save git+https://github.com/davidje13/shared-reducer-frontend.git#semver:^2.0.0
```

## Usage

```javascript
import SharedReducer, { actionsHandledCallback, actionsSyncedCallback } from 'shared-reducer-frontend';

const reducer = new SharedReducer(
  'ws://destination',
  'my-token',
  (state) => {
    console.log('latest state is', state);
  },
  (error) => {
    console.log('connection lost', error);
  },
  (warning) => {
    console.log('latest change failed', warning);
  },
);

const dispatch = reducer.dispatch;

dispatch([
  { a: ['=', 8] },
]);

dispatch([
  (state) => {
    return {
      a: ['=', Math.pow(2, state.a)],
    };
  },
]);

dispatch([
  actionsHandledCallback((state) => {
    console.log('state after handling is', state);
  }),
]);

dispatch([
  actionsSyncedCallback((state) => {
    console.log('state after syncing is', state);
  }),
]);

dispatch([
  { a: ['add', 1] },
  { a: ['add', 1] },
]);
```

### Specs

The specs should match the format of
[json-immutability-helper](https://github.com/davidje13/json-immutability-helper).

## WebSocket protocol

The websocket protocol is minimal:

### Messages sent

`<token>`:
The authentication token is sent as the first message when the connection is
established. This is plaintext. The server should respond by either terminating
the connection (if the token is deemed invalid), or with a spec which defines
the latest state in its entirety.

`P` (ping):
Sent periodically to keep the connection alive. Expects to receive a "Pong"
message in response.

`{"change": <spec>, "id": <id>}`:
Defines a delta. This may contain the aggregate result of many operations
performed on the client. The ID should be considered an opaque number which
should be reflected back to the same client in the confirmation message.

### Messages received

`p` (pong):
Reponse to a ping. The server may also decide to send this unsolicited.

`{"change": ['=', <state>]}`:
This should be the first message sent by the server, in response to a
successful authentication.

`{"change": <spec>}`:
This should be sent whenever another client has changed the server state.

`{"change": <spec>, "id": <id>}`:
This should be sent whenever the current client has changed the server
state. Note that the spec and ID should match the client-sent values.

The IDs sent by different clients can coincide, so ensure the ID is only
reflected to the client which sent the spec.

`{"error": <message>, "id": <id>}`:
This should be sent if the server rejects a client-initiated change.

The ID should match the client-sent value.

It is assumed that if this is returned, the server state has not changed (i.e.
the entire spec failed).
