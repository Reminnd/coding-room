export async function loadPreferences() {
  if (!window.roomDesktop) return;
  const preferences = await window.roomDesktop.readPreferences();
  for (const key of Object.keys(localStorage)) if (key.startsWith('room-')) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
}

export function savePreference(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  void window.roomDesktop?.writePreference(key, value).catch((error: Error) => {
    window.dispatchEvent(new CustomEvent('room-preference-error', { detail: error.message }));
  });
}
