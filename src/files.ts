/* File pickers for images and project files. */
import { toast } from './store';

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
  if (f.size > 1.5 * 1024 * 1024) toast('Large image — consider hosting it and using a URL instead');
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(f);
  });
}
