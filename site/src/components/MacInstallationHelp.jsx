import { useState } from 'react';

const command = 'sudo xattr -dr com.apple.quarantine "/Applications/Leaf.app"';

export default function MacInstallationHelp() {
  const [copyStatus, setCopyStatus] = useState('');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <details className="mac-installation-help">
      <summary>macOS 提示「Apple 无法验证」？</summary>
      <div className="mac-installation-content">
        <p>
          先将 Leaf 拖入「应用程序」。确认应用来自可信来源后，打开「终端」，粘贴并运行下面的命令，再重新打开 Leaf。
        </p>
        <div className="installation-command">
          <code>{command}</code>
          <button type="button" onClick={copyCommand}>
            {copyStatus === 'copied' ? '已复制' : '复制命令'}
          </button>
        </div>
        <p className="installation-hint">
          按提示输入 Mac 登录密码并回车，输入时不会显示字符。此命令会移除 Leaf 的下载隔离标记；若安装在其他位置，请修改命令中的路径。
        </p>
        <p className="installation-copy-status" role="status">
          {copyStatus === 'copied' && '命令已复制，可粘贴到终端。'}
          {copyStatus === 'failed' && '复制失败，请手动选择上面的命令并复制。'}
        </p>
      </div>
    </details>
  );
}
