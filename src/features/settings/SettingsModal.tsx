import { SettingsIllustration } from '@/components/Mascot';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Moon, Sun, Monitor, Check } from '@/components/icons';
import type { Settings } from '../../types';
import { Modal } from '../../components/UI';
import { Button } from '@/components/ui/button';
import type { CSSProperties } from 'react';
import './settings.css';

export function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const glassSupported = window.desktop?.translucent === true;
  return (
    <Modal title="阅读偏好" onClose={onClose} className="settings-dialog">
      <div className="preferences-body">
        <SettingsIllustration />
        <section className="preferences-section" aria-labelledby="app-appearance-heading">
          <h3 id="app-appearance-heading">应用外观</h3>
          <ToggleGroup
            type="single"
            className="preferences-themes"
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
                <Icon size={18} />
                <span>{label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
        <section className="preferences-section" aria-labelledby="window-effects-heading">
          <h3 id="window-effects-heading">窗口效果</h3>
          <div className="preferences-glass">
            <div className="preferences-toggle-row">
              <div>
                <label id="frosted-glass-label" htmlFor="frosted-glass">
                  毛玻璃背景
                </label>
                <p id="frosted-glass-description">
                  {glassSupported
                    ? '让窗口背景透出柔和的壁纸色彩。'
                    : '适用于 macOS 和 Windows 11 22H2 及以上桌面应用。'}
                </p>
              </div>
              <Button
                id="frosted-glass"
                type="button"
                role="switch"
                aria-labelledby="frosted-glass-label"
                aria-describedby="frosted-glass-description"
                aria-checked={glassSupported && settings.frostedGlass}
                disabled={!glassSupported}
                variant="ghost"
                className="preferences-switch"
                onClick={() => onChange({ ...settings, frostedGlass: !settings.frostedGlass })}
              >
                <span aria-hidden="true" />
              </Button>
            </div>
            <div
              className="preferences-transparency"
              data-disabled={!glassSupported || !settings.frostedGlass}
            >
              <label htmlFor="glass-transparency">
                背景透明度
                <output htmlFor="glass-transparency">{settings.glassTransparency}%</output>
              </label>
              <input
                id="glass-transparency"
                type="range"
                min="0"
                max="100"
                step="1"
                style={{ '--range-progress': `${settings.glassTransparency}%` } as CSSProperties}
                value={settings.glassTransparency}
                disabled={!glassSupported || !settings.frostedGlass}
                aria-describedby="glass-transparency-description"
                aria-valuetext={`${settings.glassTransparency}% 透明度`}
                onChange={(event) =>
                  onChange({ ...settings, glassTransparency: Number(event.target.value) })
                }
              />
              <div className="preferences-range-labels" aria-hidden="true">
                <span>更清晰</span>
                <span>更通透</span>
              </div>
              <p id="glass-transparency-description">数值越大，背景越通透。调整后立即生效。</p>
            </div>
          </div>
        </section>
        <section className="preferences-section" aria-labelledby="reading-appearance-heading">
          <h3 id="reading-appearance-heading">阅读显示</h3>
          <div className="preferences-reading">
            <div className="preferences-row">
              <div className="preferences-row-copy">
                <label htmlFor="reader-theme">正文外观</label>
                <p id="reader-theme-description">PDF 与 Markdown 的正文主题。</p>
              </div>
              <NativeSelect
                id="reader-theme"
                aria-describedby="reader-theme-description"
                value={settings.readerTheme}
                onChange={(e) =>
                  onChange({ ...settings, readerTheme: e.target.value as Settings['readerTheme'] })
                }
              >
                <NativeSelectOption value="follow">跟随应用</NativeSelectOption>
                <NativeSelectOption value="light">始终浅色</NativeSelectOption>
                <NativeSelectOption value="dark">始终深色</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="preferences-row">
              <div className="preferences-row-copy">
                <label htmlFor="original-colors">原版颜色</label>
                <p id="original-colors-description">可保留 PDF 中图片与图表的原始颜色。</p>
              </div>
              <NativeSelect
                id="original-colors"
                aria-describedby="original-colors-description"
                value={settings.originalColors ? 'original' : 'follow'}
                onChange={(e) =>
                  onChange({ ...settings, originalColors: e.target.value === 'original' })
                }
              >
                <NativeSelectOption value="follow">跟随页面外观</NativeSelectOption>
                <NativeSelectOption value="original">整页保持原始颜色</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </section>
      </div>
      <div className="preferences-footer">
        <Check size={14} aria-hidden="true" />
        偏好自动保存在本机
      </div>
    </Modal>
  );
}
