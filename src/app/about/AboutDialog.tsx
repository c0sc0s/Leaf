import { version } from '../../../package.json';
import { BookOpen, Command, FolderOpen, NotebookPen, Sun } from '@leaf/ui/icons';
import { Modal } from '@leaf/ui/primitives/composition';
import type { UpdatesClient } from '../../platform/updates';
import { UpdatePanel } from './UpdatePanel';

export function AboutDialog({ onClose, updates }: { onClose: () => void; updates: UpdatesClient }) {
  return (
    <Modal title="关于 Leaf" onClose={onClose}>
      <div className="about-logo">
        Leaf<span>{version}</span>
      </div>
      <p>轻量本地阅读器，通过插件扩展文档格式和阅读能力。</p>
      <UpdatePanel updates={updates} />
      <div className="about-features">
        <span>
          <FolderOpen size={17} />
          本地书库与阅读进度
        </span>
        <span>
          <BookOpen size={17} />
          连续滚动与文字批注
        </span>
        <span>
          <NotebookPen size={17} />
          高光、划线与页边笔记
        </span>
        <span>
          <Sun size={17} />
          为昼夜准备的阅读主题
        </span>
      </div>
      <div className="shortcut-list">
        <div>
          <span>导入文件</span>
          <kbd>
            <Command size={12} /> / Ctrl + O
          </kbd>
        </div>
        <div>
          <span>搜索文档</span>
          <kbd>
            <Command size={12} /> / Ctrl + F
          </kbd>
        </div>
        <div>
          <span>翻页</span>
          <kbd>← →</kbd>
        </div>
      </div>
      <p className="small muted">
        书库、批注和阅读进度保存在本机。启用 AI 插件并提问时，所需原文会发送到你配置的模型服务。
      </p>
    </Modal>
  );
}
