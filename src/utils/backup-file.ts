import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { MAX_BACKUP_BYTES } from "../data/backup";

export async function saveBackupFile(text: string, filename: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("이 기기에서는 파일 저장을 열 수 없어요.");
  const file = new File(Paths.cache, filename);
  try {
    file.create({ overwrite: true });
    file.write(text);
    if (file.size > MAX_BACKUP_BYTES)
      throw new Error("백업 파일은 20MB까지 지원해요.");
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "몬스핀 백업 파일 저장",
    });
  } catch (cause) {
    if (file.exists) file.delete();
    throw cause;
  }
  // Keep the cache file available while Android's selected app reads the URI.
  // The OS can clean this cache; the user still needs to save their own copy.
}

export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    if (file.size > MAX_BACKUP_BYTES)
      throw new Error("백업 파일은 20MB까지 지원해요.");
    return await file.text();
  } finally {
    if (file.exists) file.delete();
  }
}
