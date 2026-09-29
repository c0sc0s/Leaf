import { downloads, getDownloadPlatform } from '../website.js';
import MacInstallationHelp from './MacInstallationHelp.jsx';

function PlatformIcon({ platform }) {
  return (
    <svg
      className="platform-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {platform === 'macOS' ? (
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.76 3.08.82 1.18-.24 2.31-.94 3.57-.85 1.51.12 2.64.72 3.39 1.8-3.1 1.86-2.36 5.95.48 7.1-.57 1.5-1.31 2.98-2.52 4.1ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.57-2.33 4.5-3.74 4.25Z" />
      ) : (
        <path d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z" />
      )}
    </svg>
  );
}

export default function DownloadActions() {
  const platform = getDownloadPlatform(typeof navigator === 'undefined' ? undefined : navigator);
  const visibleDownloads = platform
    ? downloads.filter((download) => download.platform === platform)
    : downloads;

  return (
    <>
      <div className="download-actions">
        {visibleDownloads.map(({ platform, href }, index) => (
          <a
            className={`button ${index === 0 ? 'button-primary' : 'button-outline'}`}
            href={href}
            key={platform}
          >
            <PlatformIcon platform={platform} />
            下载 {platform} 版
          </a>
        ))}
      </div>
      {visibleDownloads.some(({ platform }) => platform === 'macOS') && <MacInstallationHelp />}
    </>
  );
}
