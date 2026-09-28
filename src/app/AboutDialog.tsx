import { Modal } from '../components/UI';
import { BookOpen, FolderOpen, NotebookPen, Sun, Command } from '../components/icons';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="关于 Leaf" onClose={onClose}>
      <div className="about-logo">
        Leaf<span>1.4</span>
      </div>
      <p>本地 PDF 与 Markdown 阅读器，支持原版阅读、章节导航和阅读进度。</p>
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
        示例书籍是 Leaf 原创演示文档。应用保留 PDF
        原始字体、图片和版面，支持连续滚动、定位续读和文字批注。文档不会上传。
      </p>
    </Modal>
  );
}
