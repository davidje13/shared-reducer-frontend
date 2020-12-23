# Shared Reducer Frontend

Shared state management via websockets.

Designed to work with
[shared-reducer-backend](https://github.com/davidje13/shared-reducer-backend)
and
[json-immutability-helper](https://github.com/davidje13/json-immutability-helper).

## Install dependency

```bash
npm install --save shared-reducer-frontend json-immutability-helper
```

(if you want to use an alternative reducer, see the instructions below).

When using this with `shared-reducer-backend`, ensure both dependencies are
at the same major version (e.g. both are `2.x` or both are `3.x`). The API
may change between major versions.

## Usage

```javascript
import SharedReducer, { actionsHandledCallback, actionsSyncedCallback } from 'shared-reducer-frontend';
import context from 'json-immutability-helper';

const reducer = SharedReducer
  .for('ws://destination', (state) => {
    console.log('latest state is', state);
  })
  .withReducer(context)
  .withToken('my-token')
  .withErrorHandler((error) => { console.log('connection lost', error); })
  .withWarningHandler((warning) => { console.log('latest change failed', warning); })
  .build();

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

The specs need to match whichever reducer you are using. In the examples
above, that is
[json-immutability-helper](https://github.com/davidje13/json-immutability-helper).

## WebSocket protocol

The websocket protocol is minimal:

### Messages sent

`<token>`:
The authentication token is sent as the first message when the connection is
established. This is plaintext. The server should respond by either terminating
the connection (if the token is deemed invalid), or with an `init` event which
defines the latest state in its entirety. If no token is specified using
`withToken`, no message will be sent (when not using authentication, it is
assumed the server will send the `init` event unprompted).

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

`{"init": <state>}`:
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

## Alternative reducer

To enable different features of `json-immutability-helper`, you can
customise it before passing it to `withReducer`. For example, to
enable list commands such as `updateWhere` and mathematical commands
such as Reverse Polish Notation (`rpn`):

```js
import SharedReducer from 'shared-reducer-frontend';
import listCommands from 'json-immutability-helper/commands/list';
import mathCommands from 'json-immutability-helper/commands/math';
import context from 'json-immutability-helper';

const reducer = SharedReducer
  .for('ws://destination', (state) => {})
  .withReducer(context.with(listCommands, mathCommands))
  .build();
```

If you want to use an entirely different reducer, create a wrapper
and pass it to `withReducer`:

```js
import SharedReducer from 'shared-reducer-frontend';
import context from 'json-immutability-helper';

const myReducer = {
  update: (value, spec) => {
    // return a new value which is the result of applying
    // the given spec to the given value (or throw an error)
  },
  combine: (specs) => {
    // return a new spec which is equivalent to applying
    // all the given specs in order
  },
};

const reducer = SharedReducer
  .for('ws://destination', (state) => {})
  .withReducer(myReducer)
  .build();
```

Be careful when using your own reducer to avoid introducing
security vulnerabilities; the functions will be called with
untrusted input, so should be careful to avoid attacks such
as code injection or prototype pollution.
