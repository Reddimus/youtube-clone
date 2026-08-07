import {
  extensionFromFileName,
  maxUploadBytes,
  normalizeUploadSize,
  type PublicVideo,
} from "@yt/contract";

import { getFirebaseFunctions } from "./firebase";

export { maxUploadBytes };
export type { PublicVideo };

export const maxTitleLength = 100;
export const maxDescriptionLength = 5_000;

interface GenerateUploadUrlRequest {
  fileExtension: string;
  fileSize: number;
  title?: string;
  description?: string;
}

interface GenerateUploadUrlResponse {
  url: string;
  fields: Record<string, string>;
  fileName: string;
  maxUploadBytes: number;
}

export interface UploadDetails {
  title?: string;
  description?: string;
}

export interface UploadResult {
  videoId: string;
  fileName: string;
}

/** Re-exported so the UI validates a file with exactly the server's rules. */
export function getVideoExtension(fileName: string): string {
  return extensionFromFileName(fileName);
}

export function validateVideoFileSize(size: number): void {
  try {
    normalizeUploadSize(size);
  } catch {
    throw new Error("Choose a non-empty video no larger than 250 MiB.");
  }
}

function cleanText(
  value: string | undefined,
  limit: number,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > limit) {
    throw new Error(`Keep this under ${limit} characters.`);
  }

  return trimmed;
}

/**
 * Uploads a video through a short-lived signed POST policy.
 *
 * `XMLHttpRequest` is used rather than `fetch` because it is still the only
 * browser API that reports upload progress, and a 250 MiB upload with no
 * progress feedback is indistinguishable from a hung page.
 */
export async function uploadVideo(
  file: File,
  details: UploadDetails = {},
  options: {
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<UploadResult> {
  validateVideoFileSize(file.size);
  const fileExtension = getVideoExtension(file.name);
  const title = cleanText(details.title, maxTitleLength);
  const description = cleanText(details.description, maxDescriptionLength);

  const { httpsCallable } = await import("firebase/functions");
  const generateUploadUrl = httpsCallable<
    GenerateUploadUrlRequest,
    GenerateUploadUrlResponse
  >(await getFirebaseFunctions(), "generateUploadUrl");

  const response = await generateUploadUrl({
    fileExtension,
    fileSize: file.size,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  });

  if (response.data.maxUploadBytes < file.size) {
    throw new Error("The video exceeds the server upload limit.");
  }

  const formData = new FormData();
  for (const [name, value] of Object.entries(response.data.fields)) {
    formData.append(name, value);
  }
  formData.append("file", file, file.name);

  await postWithProgress(response.data.url, formData, options);

  const fileName = response.data.fileName;
  return { videoId: fileName.slice(0, fileName.lastIndexOf(".")), fileName };
}

function postWithProgress(
  url: string,
  body: FormData,
  {
    onProgress,
    signal,
  }: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled.", "AbortError"));
      return;
    }

    const request = new XMLHttpRequest();
    request.open("POST", url, true);

    const abort = () => {
      request.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });

    const settle = (finish: () => void) => {
      signal?.removeEventListener("abort", abort);
      finish();
    };

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        settle(resolve);
        return;
      }
      settle(() =>
        reject(new Error(`Video upload failed with status ${request.status}.`)),
      );
    });

    request.addEventListener("error", () => {
      settle(() =>
        reject(new Error("The network dropped while uploading the video.")),
      );
    });

    request.addEventListener("abort", () => {
      settle(() => reject(new DOMException("Upload cancelled.", "AbortError")));
    });

    request.send(body);
  });
}
