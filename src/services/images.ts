import {
  IMAGE_CHUNK_BYTES,
  IMAGE_CHUNK_CHARS,
  MAX_IMAGE_BYTES,
} from "../../shared/image-limits";
import type { WrongItem } from "../../shared/library";
import { api, json, ApiError } from "./api";

export async function imageData(file: Blob): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw Error("单张图片不能超过 10 MB");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("请选择 PNG、JPEG 或 WebP 图片");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("图片读取失败，请重新选择"));
    reader.readAsDataURL(file);
  });
}

// The original stored image stays intact; only the optional AI copy is resized.
export async function classroomImageData(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/png");
      if (data.length < 2_750_000) return data;
      scale *= 0.75;
    }
    throw Error("课堂图片转换失败，原图仍保留在错题本中");
  } finally {
    bitmap.close();
  }
}

export async function saveWrongWithImage(
  form: object,
  image: string,
  progress: (value: number) => void,
): Promise<WrongItem> {
  if (!image || image.length < 2_750_000)
    return api("/wrongs", {
      method: "POST",
      body: json({ ...form, ...(image ? { imageData: image } : {}) }),
    });
  const [header, data] = image.split(",");
  const mime = header.slice(5, -7);
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_IMAGE_BYTES) throw Error("单张图片不能超过 10 MB");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = Array.from(digest, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const upload = await api<{ id: string }>("/image-uploads", {
    method: "POST",
    body: json({ mime, bytes: bytes.length, sha256 }),
  });
  try {
    for (let offset = 0; offset < bytes.length; offset += IMAGE_CHUNK_BYTES) {
      const options = {
        method: "PUT",
        body: json({
          data: data.slice(
            (offset / 3) * 4,
            (offset / 3) * 4 + IMAGE_CHUNK_CHARS,
          ),
        }),
      };
      const path = `/image-uploads/${upload.id}/chunks/${offset}`;
      try {
        await api(path, { ...options, signal: AbortSignal.timeout(60000) });
      } catch (e) {
        if (e instanceof ApiError && e.status < 500) throw e;
        await api(path, { ...options, signal: AbortSignal.timeout(60000) });
      }
      progress(
        Math.min(
          99,
          Math.round(((offset + IMAGE_CHUNK_BYTES) / bytes.length) * 100),
        ),
      );
    }
    const path = "/wrongs",
      options = {
        method: "POST",
        body: json({ ...form, imageUploadId: upload.id }),
      };
    let result: WrongItem;
    try {
      result = await api<WrongItem>(path, options);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) throw e;
      result = await api<WrongItem>(path, options);
    }
    progress(100);
    return result;
  } finally {
    await api(`/image-uploads/${upload.id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }
}

export async function wrongImageBlob(
  id: string,
  bytes: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (bytes <= 2 * 1024 * 1024) {
    const response = await fetch(`/api/wrongs/${id}/image`, {
      signal,
      credentials: "same-origin",
    });
    if (!response.ok) throw Error("图片读取失败");
    return response.blob();
  }
  const count = Math.ceil(bytes / IMAGE_CHUNK_BYTES);
  const parts: BlobPart[] = new Array(count);
  let mime = "",
    next = 0;
  const controller = new AbortController();
  const readSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, count) }, async () => {
        while (next < count) {
          const index = next++;
          const part = await api<{ data: string; mime: string }>(
            `/wrongs/${id}/image/chunks/${index}`,
            { signal: readSignal },
          );
          parts[index] = Uint8Array.from(atob(part.data), (c) =>
            c.charCodeAt(0),
          );
          mime = part.mime;
        }
      }),
    );
  } catch (error) {
    controller.abort();
    throw error;
  }
  const blob = new Blob(parts, { type: mime });
  if (blob.size !== bytes) throw Error("图片未读取完整，请重试");
  return blob;
}
