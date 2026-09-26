const button = document.getElementById('start');
const status = document.getElementById('status');
const detail = document.getElementById('detail');
async function start() {
  button.disabled = true;
  status.textContent = '正在启动 Room 并连接 Codex…';
  detail.textContent = '首次启动可能需要数秒。';
  try {
    const result = await window.__TAURI__.core.invoke('start_room');
    status.textContent = result.panel ? 'Room 已连接到 Codex' : 'Room 服务已启动';
    detail.textContent = result.message;
    document.getElementById('address').textContent = result.url;
    button.textContent = '重新连接';
  } catch (error) {
    status.textContent = '连接未完成';
    detail.textContent = String(error);
    button.textContent = '重试';
  } finally {
    button.disabled = false;
  }
}
button.addEventListener('click', start);
void start();
