import { SettingsIllustration } from '@/components/Mascot';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Moon, Sun, Monitor, Check } from '@/components/icons';
import type { Settings } from '../../types';
import { Modal } from '../../components/UI';

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
      <SettingsIllustration />
      <div className="settings-section">
        <label>应用外观</label>
        <ToggleGroup
          type="single"
          className="theme-options"
          value={settings.theme}
          onValueChange={(theme) => {
            if (theme) onChange({ ...settings, theme: theme as Settings['theme'] });
          }}
          aria-label="应用外观"
        >
          {(
            [
              ['light', '浅色', Sun],
              ['dark', '深色', Moon],
              ['system', '跟随系统', Monitor],
            ] as const
          ).map(([value, label, Icon]) => (
            <ToggleGroupItem
              value={value}
              key={value}
              className={settings.theme === value ? 'selected' : ''}
            >
              <Icon size={24} />
              <span>{label}</span>
              {settings.theme === value && <Check size={13} />}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="settings-section">
        <label htmlFor="reader-theme">PDF 页面外观</label>
        <NativeSelect
          id="reader-theme"
          value={settings.readerTheme}
          onChange={(e) =>
            onChange({ ...settings, readerTheme: e.target.value as Settings['readerTheme'] })
          }
        >
          <NativeSelectOption value="follow">跟随应用</NativeSelectOption>
          <NativeSelectOption value="light">始终浅色</NativeSelectOption>
          <NativeSelectOption value="dark">始终深色</NativeSelectOption>
        </NativeSelect>
        <p className="small muted">深色页面会转换整页颜色，包括图片；可单独保留原始颜色。</p>
      </div>
      <div className="settings-section">
        <label htmlFor="original-colors">原版颜色</label>
        <NativeSelect
          id="original-colors"
          value={settings.originalColors ? 'original' : 'follow'}
          onChange={(e) => onChange({ ...settings, originalColors: e.target.value === 'original' })}
        >
          <NativeSelectOption value="follow">跟随页面外观</NativeSelectOption>
          <NativeSelectOption value="original">整页保持原始颜色</NativeSelectOption>
        </NativeSelect>
        <p className="small muted">核对图片与图表颜色时，可保留原始页面颜色。</p>
      </div>
      <div className="settings-footer">
        <span className="status-dot" />
        偏好自动保存在本机
      </div>
    </Modal>
  );
}
