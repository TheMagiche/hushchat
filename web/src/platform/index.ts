export interface Platform {
  notify(title: string, body: string): Promise<void>;
  exportBackup(data: Uint8Array): Promise<void>;
  importBackup(): Promise<Uint8Array | null>;
  pickFiles(): Promise<File[]>;
  saveFileStream(name: string, size: number): Promise<WritableStream<Uint8Array>>;
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export class WebPlatform implements Platform {
  async notify(title: string, body: string): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification(title, { body, icon: '/icon.png' });
      }
    }
  }

  async exportBackup(data: Uint8Array): Promise<void> {
    const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peerchat-backup-${new Date().toISOString().slice(0, 10)}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importBackup(): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.bin';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const buf = await file.arrayBuffer();
        resolve(new Uint8Array(buf));
      };
      input.click();
    });
  }

  async pickFiles(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = () => {
        resolve(Array.from(input.files || []));
      };
      input.click();
    });
  }

  async saveFileStream(name: string, _size: number): Promise<WritableStream<Uint8Array>> {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: { suggestedName: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        return new WritableStream({
          async write(chunk) {
            await writable.write(chunk as unknown as BufferSource);
          },
          async close() {
            await writable.close();
          },
        });
      } catch {
        // Fallback to memory blob accumulator
      }
    }

    const chunks: Uint8Array[] = [];
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk);
      },
      close() {
        const blob = new Blob(chunks as unknown as BlobPart[]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }
}

export const platform: Platform = new WebPlatform();
