import { X, Moon, Sun, Monitor, Check, LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
export function IconButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Spinner({ text = '正在加载…' }: { text?: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>{text}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>('button,input,select')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab' && root) {
        const items = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,a[href],textarea',
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
export function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="阅读偏好" onClose={onClose}>
      <p className="muted">为自己留一处舒服的阅读空间。</p>
      <div className="settings-section">
        <label>应用外观</label>
        <div className="theme-options">
          {(
            [
              ['light', '浅色', Sun],
              ['dark', '深色', Moon],
              ['system', '跟随系统', Monitor],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              className={settings.theme === value ? 'selected' : ''}
              onClick={() => onChange({ ...settings, theme: value })}
            >
              <Icon size={24} />
              <span>{label}</span>
              {settings.theme === value && <Check size={13} />}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <label htmlFor="reader-theme">PDF 页面外观</label>
        <select
          id="reader-theme"
          value={settings.readerTheme}
          onChange={(e) =>
            onChange({ ...settings, readerTheme: e.target.value as Settings['readerTheme'] })
          }
        >
          <option value="follow">跟随应用</option>
          <option value="light">始终浅色</option>
          <option value="dark">始终深色</option>
        </select>
        <p className="small muted">原版采用护眼色彩转换；舒适阅读直接使用深浅色文字与背景。</p>
      </div>
      <div className="settings-section">
        <label>舒适阅读字体</label>
        <div className="segmented">
          <button
            className={settings.font === 'serif' ? 'selected' : ''}
            onClick={() => onChange({ ...settings, font: 'serif' })}
          >
            衬线体 · 书页感
          </button>
          <button
            className={settings.font === 'sans' ? 'selected' : ''}
            onClick={() => onChange({ ...settings, font: 'sans' })}
          >
            无衬线 · 更清晰
          </button>
        </div>
      </div>
      <div className="settings-section">
        <label htmlFor="font-size">
          字号 <span>{settings.fontSize}px</span>
        </label>
        <input
          id="font-size"
          type="range"
          min="14"
          max="30"
          value={settings.fontSize}
          onChange={(e) => onChange({ ...settings, fontSize: Number(e.target.value) })}
        />
      </div>
      <div className="settings-section">
        <label htmlFor="line-height">
          行距 <span>{settings.lineHeight.toFixed(1)}</span>
        </label>
        <input
          id="line-height"
          type="range"
          min="1.4"
          max="2.2"
          step="0.1"
          value={settings.lineHeight}
          onChange={(e) => onChange({ ...settings, lineHeight: Number(e.target.value) })}
        />
      </div>
      <div className="settings-section">
        <label htmlFor="reading-width">
          正文宽度 <span>{settings.width}px</span>
        </label>
        <input
          id="reading-width"
          type="range"
          min="440"
          max="850"
          step="10"
          value={settings.width}
          onChange={(e) => onChange({ ...settings, width: Number(e.target.value) })}
        />
      </div>
      <div className="settings-footer">
        <span className="status-dot" />
        偏好自动保存在本机
      </div>
    </Modal>
  );
}
