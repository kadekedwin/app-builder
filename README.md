# React + TypeScript + Vite

## Bluetooth IPC Quick Start

Use Electron IPC (not websocket):

- BLE request channel: `bluetooth:ble:action`
- BLE event channel: `bluetooth:ble:event`
- Classic request channel: `bluetooth:classic:action`
- Classic event channel: `bluetooth:classic:event`

Send a BLE action:

```js
const result = await window.ipcRenderer.invoke('bluetooth:ble:action', {
  action: 'status.get',
  payload: {},
});
```

Send a Classic action:

```js
const result = await window.ipcRenderer.invoke('bluetooth:classic:action', {
  action: 'status.get',
  payload: {},
});
```

Listen for BLE and Classic events separately:

```js
window.ipcRenderer.on('bluetooth:ble:event', (_event, event) => {
  console.log('ble', event.type, event.payload);
});
window.ipcRenderer.on('bluetooth:classic:event', (_event, event) => {
  console.log('classic', event.type, event.payload);
});
```

Response shape (both channels):

```json
{
  "ok": true,
  "endpoint": "classic",
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

Bluetooth is split by protocol end-to-end (service, repository, IPC, and UI):

- BLE service: `electron/services/bluetooth/ble-service.ts`
- Classic service: `electron/services/bluetooth/classic-service.ts`
- BLE repository: `electron/repositories/BleBluetoothRepository.ts`
- Classic repository: `electron/repositories/ClassicBluetoothRepository.ts`
- BLE IPC: `electron/ipc/bluetooth-ble.ts`
- Classic IPC: `electron/ipc/bluetooth-classic.ts`

### Adapter note

BLE scan/connect needs `@abandonware/noble`.  
Classic scan/connect needs `node-bluetooth-serial-port` on Linux/Windows.
On macOS, Classic runs in info-only mode (list known/paired/connected devices) and cannot open RFCOMM socket connections.

### Action format (BLE)

```json
{
  "action": "status.get",
  "payload": {}
}
```

### Action format (Classic)

```json
{
  "action": "status.get",
  "payload": {}
}
```

### Supported BLE actions

- `ping`
- `status.get`
- `devices.list`
- `scan.start` payload: `{ "allowDuplicates": true, "serviceUuids": [] }`
- `scan.stop`
- `device.connect` payload: `{ "id": "device-id" }`
- `device.disconnect` payload: `{ "id": "device-id" }`

### Supported Classic actions

- `ping`
- `status.get`
- `devices.list`
- `scan.start`
- `scan.stop`
- `device.connect` payload: `{ "id": "device-id" }`
- `device.disconnect` payload: `{ "id": "device-id" }`
- `printers.list` (`classic` only)
- `printer.print` payload: `{ "content": "text to print", "printer": "optional-printer-name", "title": "optional-job-title" }` (`classic` only)

### Minimal renderer example

```js
window.ipcRenderer.invoke('bluetooth:ble:action', {
  action: 'status.get',
});
window.ipcRenderer.invoke('bluetooth:classic:action', {
  action: 'status.get',
});

window.ipcRenderer.on('bluetooth:ble:event', (_event, payload) => {
  console.log('ble', payload);
});
window.ipcRenderer.on('bluetooth:classic:event', (_event, payload) => {
  console.log('classic', payload);
});
```

### Example UI screen

A ready-to-use frontend demo screen is available at route `/bluetooth`:

- page: `src/pages/BluetoothConsole.tsx`
- home navigation button: `src/pages/Home.tsx`

It includes buttons for:

- `scan.start`, `scan.stop`, `devices.list`, `device.connect`, `device.disconnect`
- pair helper guidance
- `printers.list`, `printer.print` (classic endpoint)
