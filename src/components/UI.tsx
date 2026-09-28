import { X, Moon, Sun, Monitor, Check, LoaderCircle } from 'lucide-react';
import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import type { Settings } from '../types';
export function IconButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
  shortcut,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  shortcut?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`icon-button ${active ? 'active' : ''} ${className}`}
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
          {shortcut && <kbd className="tooltip-shortcut">{shortcut}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
  const before = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content
          className="modal"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            before.current?.focus();
          }}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <button className="icon-button" aria-label="关闭" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
              aria-pressed={settings.theme === value}
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
        <p className="small muted">深色页面会转换整页颜色，包括图片；可单独保留原始颜色。</p>
      </div>
      <div className="settings-section">
        <label htmlFor="original-colors">原版颜色</label>
        <select
          id="original-colors"
          value={settings.originalColors ? 'original' : 'follow'}
          onChange={(e) => onChange({ ...settings, originalColors: e.target.value === 'original' })}
        >
          <option value="follow">跟随页面外观</option>
          <option value="original">整页保持原始颜色</option>
        </select>
        <p className="small muted">核对图片与图表颜色时，可保留原始页面颜色。</p>
      </div>
      <div className="settings-footer">
        <span className="status-dot" />
        偏好自动保存在本机
      </div>
    </Modal>
  );
}
