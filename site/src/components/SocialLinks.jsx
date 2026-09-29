import { socialLinks } from '../website.js';

function SocialIcon({ icon }) {
  if (icon === 'github') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.63 0c2.15-1.45 3.09-1.15 3.09-1.15.61 1.55.23 2.69.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.04.76 2.09v3.1c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m7 2 3 4m7-4-3 4" />
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="m7.5 11 2 .5m5-.5 2-.5M9 15.5l3 1 3-1M7 20v2m10-2v2" />
    </svg>
  );
}

export default function SocialLinks() {
  return (
    <nav className="social-links" aria-label="相关链接">
      {socialLinks.map(({ name, icon, href }) => (
        <a
          key={icon}
          href={href}
          aria-label={name}
          title={name}
          target="_blank"
          rel="noopener noreferrer"
        >
          <SocialIcon icon={icon} />
        </a>
      ))}
    </nav>
  );
}
