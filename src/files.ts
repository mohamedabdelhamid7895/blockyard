/* File pickers for images and project files. */
import { toast, useTarget } from './store';
import { useSession } from './api';

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
  });
}

/** Lets the user choose an image and returns it as a data URL. */
export async function pickImage(): Promise<string | null> {
  const f = await pickFile('image/*');
  if (!f) return null;
  // Signed in: upload to the site's assets, so the image is cached instead of embedded in the page.
  const t = useTarget.getState();
  if (t.kind === 'remote' && t.projectId) {
    try {
      const res = await fetch(`${String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/projects/${t.projectId}/assets?name=${encodeURIComponent(f.name)}`, {
        method: 'POST', body: f, headers: { 'Content-Type': f.type || 'application/octet-stream', Authorization: `Bearer ${useSession.getState().token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Upload failed');
      return body.url as string;
    } catch (e) {
      toast((e as Error).message);
      return null;
    }
  }
  if (f.size > 1.5 * 1024 * 1024) toast('Large image — consider hosting it and using a URL instead');
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(f);
  });
}
