export async function saveFile(name: string, bytes: Uint8Array, mime: string) {
  if (window.desktop) return window.desktop.saveFile(name, bytes);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    return true;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
