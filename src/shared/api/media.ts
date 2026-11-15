import { fetchWithSecurity } from './client';

export async function uploadImageToDrive(
  folderName: string,
  file: File,
): Promise<Record<string, unknown>> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

  const response = await fetchWithSecurity(
    '/api/drive/upload-image',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderName,
        fileName: file.name,
        mimeType: file.type,
        dataBase64,
      }),
    },
    { requireAdmin: true },
  );

  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  > & { error?: string };
  if (!response.ok) {
    throw new Error(result?.error || `Upload failed: ${response.status}`);
  }
  return result;
}
