import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkbenchApp } from './WorkbenchApp';
import './workbench.css';
import { loadPreferences } from './preferences';

loadPreferences().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode><WorkbenchApp /></StrictMode>,
)).catch((error: Error) => {
  document.getElementById('root')!.textContent = `无法读取界面偏好：${error.message}。请重新打开 Room。`;
});
