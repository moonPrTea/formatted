(() => {
  let preference = 'system';
  try {
    preference = localStorage.getItem('formatted.theme') ?? 'system';
  } catch {}
  const mode =
    preference === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference === 'light'
        ? 'light'
        : 'dark';
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  window.windowAppearance?.setMode(mode);
})();
