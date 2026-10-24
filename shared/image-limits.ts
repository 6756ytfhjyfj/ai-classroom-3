// Chunks are divisible by three so their base64 strings can be joined losslessly.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_STORAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_CHUNK_BYTES = 768 * 1024;
export const IMAGE_CHUNK_CHARS = (IMAGE_CHUNK_BYTES / 3) * 4;
export const MAX_IMAGE_DATA_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
export const IMAGE_UPLOAD_LIFETIME_MS = 10 * 60 * 1000;
