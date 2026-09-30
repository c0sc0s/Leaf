import type { ImportSource, ImportFile } from '@leaf/contracts/documents';

const maxBytes = 512 * 1024 * 1024;
export async function fileSources(files: File[]): Promise<ImportSource[]> {
  if (files.reduce((bytes, file) => bytes + file.size, 0) > maxBytes)
    throw new Error('一次导入不能超过 512 MB');
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      files: [{ name: file.name, data: new Uint8Array(await file.arrayBuffer()), mime: file.type }],
    })),
  );
}
export async function folderSource(files: File[]): Promise<ImportSource> {
  if (files.length > 10000 || files.reduce((bytes, file) => bytes + file.size, 0) > maxBytes)
    throw new Error('文件夹超过 512 MB 或 10000 个文件');
  const name = files[0]?.webkitRelativePath.split('/')[0] || '文档';
  return {
    name,
    folder: true,
    files: await Promise.all(
      files
        .filter((file) =>
          file.webkitRelativePath
            .split('/')
            .slice(1, -1)
            .every((part) => !part.startsWith('.') && part !== 'node_modules'),
        )
        .map(async (file) => ({
          name: file.webkitRelativePath.split('/').slice(1).join('/') || file.name,
          data: new Uint8Array(await file.arrayBuffer()),
          mime: file.type,
        })),
    ),
  };
}
export async function droppedSources(data: DataTransfer): Promise<ImportSource[]> {
  const entries = [...data.items]
      .filter((item) => item.kind === 'file')
      .map((item) => item.webkitGetAsEntry()),
    fallback = [...data.files];
  if (!entries.length || entries.some((entry) => !entry)) return fileSources(fallback);
  let bytes = 0,
    count = 0;
  const walk = async (entry: FileSystemEntry, prefix = ''): Promise<ImportFile[]> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      bytes += file.size;
      if (++count > 10000 || bytes > maxBytes) throw new Error('导入超过 512 MB 或 10000 个文件');
      return [
        {
          name: prefix + file.name,
          data: new Uint8Array(await file.arrayBuffer()),
          mime: file.type,
        },
      ];
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader(),
      files: ImportFile[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      for (const child of batch) {
        if (child.isDirectory && (child.name.startsWith('.') || child.name === 'node_modules'))
          continue;
        files.push(...(await walk(child, child.isDirectory ? prefix + child.name + '/' : prefix)));
      }
    }
    return files;
  };
  const result: ImportSource[] = [];
  for (const entry of entries)
    result.push({
      name: entry!.name,
      ...(entry!.isDirectory ? { folder: true } : {}),
      files: await walk(entry!),
    });
  return result;
}
