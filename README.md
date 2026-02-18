# React + TypeScript + Vite

## Bluetooth IPC Quick Start

Use Electron IPC (not websocket):

- Request channel: `bluetooth:action`
- Event channel: `bluetooth:event`
- Endpoints: `ble`, `classic`

Send an action:

```js
const result = await window.ipcRenderer.invoke('bluetooth:action', {
  endpoint: 'ble',
  action: 'status.get',
  payload: {},
});
```

Listen for Bluetooth events:

```js
window.ipcRenderer.on('bluetooth:event', (_event, event) => {
  console.log(event.endpoint, event.type, event.payload);
});
```

Response shape:

```json
{
  "ok": true,
  "endpoint": "ble",
  "action": "status.get",
  "payload": {}
}
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
}
```

- Replace `plugin:@typescript-eslint/recommended` to `plugin:@typescript-eslint/recommended-type-checked` or `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends` list

## Bluetooth Repository (IPC)

Bluetooth is handled by `BluetoothRepository` in Electron main process (no local websocket server).
Implementation lives in `electron/services/bluetooth-service.ts`; repository is a thin IO wrapper in `electron/repositories/BluetoothRepository.ts`.

- IPC action channel: `bluetooth:action`
- IPC event channel: `bluetooth:event`
- Endpoints: `ble`, `classic`

### Adapter note

BLE scan/connect needs `@abandonware/noble`.  
Classic scan/connect needs `node-bluetooth-serial-port` on Linux/Windows.
On macOS, Classic runs in info-only mode (list known/paired/connected devices) and cannot open RFCOMM socket connections.

### Action format

```json
{
  "endpoint": "ble",
  "action": "status.get",
  "payload": {}
}
```

### Supported actions

- `ping`
- `status.get`
- `devices.list`
- `scan.start` payload: `{ "allowDuplicates": true, "serviceUuids": [] }`
- `scan.stop`
- `device.connect` payload: `{ "id": "device-id" }`
- `device.disconnect` payload: `{ "id": "device-id" }`
- `printers.list` (`classic` only)
- `printer.print` payload: `{ "content": "text to print", "printer": "optional-printer-name", "title": "optional-job-title" }` (`classic` only)

### Minimal renderer example

```js
window.ipcRenderer.invoke('bluetooth:action', {
  endpoint: 'ble',
  action: 'status.get',
});

window.ipcRenderer.on('bluetooth:event', (_event, payload) => {
  console.log(payload);
});
```
