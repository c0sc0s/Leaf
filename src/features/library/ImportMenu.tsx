import { Button } from '@/components/ui/button';
import * as Menu from '@/components/ui/dropdown-menu';
import { ChevronDown, FileText, FolderOpen, Plus } from '@/components/icons';
import { shortcutLabel } from '@/lib/shortcut';

export function ImportMenu({
  onImport,
  onImportFolder,
}: {
  onImport: () => void;
  onImportFolder: () => void;
}) {
  return (
    <Menu.DropdownMenu>
      <Menu.DropdownMenuTrigger asChild>
        <Button variant="glass" className="import-trigger">
          <Plus size={15} />
          导入文件
          <ChevronDown size={13} />
        </Button>
      </Menu.DropdownMenuTrigger>
      <Menu.DropdownMenuContent align="end" sideOffset={6} className="import-menu">
        <Menu.DropdownMenuItem onSelect={onImport}>
          <FileText size={15} />
          导入文件
          <Menu.DropdownMenuShortcut>{shortcutLabel('O')}</Menu.DropdownMenuShortcut>
        </Menu.DropdownMenuItem>
        <Menu.DropdownMenuItem onSelect={onImportFolder}>
          <FolderOpen size={15} />
          导入文件夹
        </Menu.DropdownMenuItem>
      </Menu.DropdownMenuContent>
    </Menu.DropdownMenu>
  );
}
