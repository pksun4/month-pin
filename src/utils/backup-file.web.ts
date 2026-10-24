import { MAX_BACKUP_BYTES } from "../data/backup";

export async function saveBackupFile(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  if (blob.size > MAX_BACKUP_BYTES)
    throw new Error("백업 파일은 20MB까지 지원해요.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the URL alive until the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,text/plain";
    input.style.display = "none";
    function finish() {
      input.remove();
    }
    input.addEventListener(
      "cancel",
      () => {
        finish();
        resolve(null);
      },
      { once: true },
    );
    input.addEventListener(
      "change",
      async () => {
        try {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          if (file.size > MAX_BACKUP_BYTES)
            throw new Error("백업 파일은 20MB까지 지원해요.");
          resolve(await file.text());
        } catch (cause) {
          reject(cause);
        } finally {
          finish();
        }
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}
