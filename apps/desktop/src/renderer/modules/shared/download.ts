export function downloadText(name: string, content: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readSelectedFiles(
  files: FileList | File[],
): Promise<{ name: string; content: string }[]> {
  return Promise.all(
    Array.from(files).map(async (file) => ({
      name: file.webkitRelativePath || file.name,
      content: await file.text(),
    })),
  );
}
