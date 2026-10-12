const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const buttons = [...document.querySelectorAll('button')];
  ipcRenderer.on('room:chatgpt-status', (_event, message) => { status.textContent = message; status.title = message; });
  for (const button of buttons) button.addEventListener('click', async () => {
    buttons.forEach(item => { item.disabled = true; });
    try { const message = await ipcRenderer.invoke('room:chatgpt-action', button.id); status.textContent = message; status.title = message; }
    catch (error) { status.textContent = error.message; status.title = error.message; }
    finally { buttons.forEach(item => { item.disabled = false; }); }
  });
});
