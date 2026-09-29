function applyBackdrop(window, { platform, supported, enabled, dark }) {
  const active = supported && enabled;
  if (platform === 'darwin') window.setVibrancy(active ? 'under-window' : null);
  else if (platform === 'win32' && supported)
    window.setBackgroundMaterial(active ? 'acrylic' : 'none');
  window.setBackgroundColor(active ? '#00000000' : dark ? '#0a0a0a' : '#ffffff');
}

module.exports = { applyBackdrop };
