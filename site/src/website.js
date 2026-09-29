const repository = 'https://github.com/c0sc0s/Leaf';

export const socialLinks = [
  { name: 'GitHub', icon: 'github', href: repository },
  { name: '哔哩哔哩', icon: 'bilibili', href: 'https://www.bilibili.com/' },
];

export const downloads = [
  {
    platform: 'macOS',
    href: `${repository}/releases/latest/download/Leaf-mac-arm64.dmg`,
  },
  {
    platform: 'Windows',
    href: `${repository}/releases/latest/download/Leaf-win-x64.exe`,
  },
];

export function getDownloadPlatform({
  userAgentData,
  platform = '',
  userAgent = '',
  maxTouchPoints = 0,
} = {}) {
  const system = userAgentData?.platform || platform || userAgent;

  // iPadOS can identify itself as a Mac when requesting desktop websites.
  if (
    /Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent) ||
    (/Mac/i.test(system) && maxTouchPoints > 1)
  ) {
    return null;
  }
  if (/Mac/i.test(system)) return 'macOS';
  if (/Win/i.test(system)) return 'Windows';
  return null;
}
