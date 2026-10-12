import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Arch, build, Platform } from 'electron-builder';

const runtime = resolve('desktop/runtime');
mkdirSync(runtime, { recursive: true });
copyFileSync(process.execPath, resolve(runtime, 'node.exe'));
await build({ targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), config: {
  appId: 'local.agentroom.desktop', productName: 'Room', asar: false,
  directories: { output: process.argv[2] ?? 'desktop/release' },
  files: ['desktop/electron/**/*', 'src/**/*', 'frontend/dist/**/*', 'package.json', '!**/*.test.*'],
  extraResources: [{ from: 'desktop/runtime/node.exe', to: 'runtime/node.exe' }],
  win: { icon: 'desktop/electron/icon.png', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: false, createStartMenuShortcut: false },
} });
