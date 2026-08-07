const defaultProcessedVideoBucket = "redd-processed-videos";
const bucketNamePattern = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

export function processedVideoUrl(
  fileName: string,
  bucketName =
    process.env.NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET ??
    defaultProcessedVideoBucket,
): string {
  if (!bucketNamePattern.test(bucketName)) {
    throw new Error("The processed-video bucket name is invalid.");
  }

  return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(fileName)}`;
}
