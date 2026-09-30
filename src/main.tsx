import { start } from './app/start';
import './theme.css';
import './styles/base.css';
import './styles/overlays.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/materials.css';

void start().catch((error: unknown) => {
  const root = document.getElementById('root')!;
  root.style.cssText = 'padding:48px;max-width:720px;margin:auto';
  const heading = document.createElement('h1');
  heading.textContent = '无法打开书库';
  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement('button');
  retry.textContent = '重试';
  retry.onclick = () => location.reload();
  root.replaceChildren(heading, detail, retry);
  window.desktop?.ready();
});
