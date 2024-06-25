// 1. GCS file interactions
// 2. Local file interactions

import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const storage = new Storage();

const rawVideoBucketName = "redd-raw-videos";
const processedVideoBucketName = "redd-processed-videos";

const localRawVideoPath = "./raw-videos";
const localProcessedVideoPath = "./processed-videos";

/**
 * Creates the local directories for raw & processed videos.
 */
export function setupDirectories() {
  ensureDirectoryExistence(localRawVideoPath);
  ensureDirectoryExistence(localProcessedVideoPath);
}

/**
 * @param rawVideoName - The name of the file to convert from {@link localRawVideoPath}.
 * @param processedVideoName - The name of the file to convert to {@link localProcessedVideoPath}.
 * @returns A promise that resolves when the video has been converted.
 */
export function convertVideo(rawVideoName: string, processedVideoName: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(`${localRawVideoPath}/${rawVideoName}`)
    .outputOptions('-vf', 'scale=-1:360') // 360p
    .on('end', function() {
      let message: string = 'Processing finished successfully';
      console.log(message);
      resolve();
    })
    .on('error', function(err: any) {
      let message: string = 'An error occurred: ' + err.message;
      console.log(message);
      reject(message);
    })
    .save(`${localRawVideoPath}/${processedVideoName}`);
  })
}

/**
 * @param fileName - The name of the file to download from the
 * {@link rawVideoBucketName} bucket into the {@link localRawVideoPath} directory.
 * @returns A promise that resolves when the file has been downloaded.
 */
export async function downloadRawVideo(fileName: string) {
  await storage.bucket(rawVideoBucketName)
    .file(fileName)
    .download({ destination: `${localRawVideoPath}/${fileName}` });

  console.log(
    `gs://${rawVideoBucketName}/${fileName} downloaded to ${localRawVideoPath}/${fileName}.`
  )
}

/**
 * @param fileName - The name of the file to upload from the
 * {@link localProcessedVideoPath} directory into the {@link processedVideoBucketName} bucket.
 * @returns A promise that resolves when the file has been uploaded.
 */
export async function uploadProcessedVideo(fileName: string) {
  const bucket = storage.bucket(processedVideoBucketName);

  await bucket.upload(`${localProcessedVideoPath}/${fileName}`, {
    destination: fileName
  });
  console.log(
    `${localProcessedVideoPath}/${fileName} uploaded to gs://${processedVideoBucketName}/${fileName}.`
  );

  await bucket.file(fileName).makePublic();
}

/**
 * @param fileName - The name of the file to delete from the
 * {@link localRawVideoPath} folder.
 * @returns A promise that resolves when the file has been deleted.
 * 
 */
export function deleteRawVideo(fileName: string) {
  return deleteFile(`${localRawVideoPath}/${fileName}`);
}


/**
* @param fileName - The name of the file to delete from the
* {@link localProcessedVideoPath} folder.
* @returns A promise that resolves when the file has been deleted.
* 
*/
export function deleteProcessedVideo(fileName: string) {
  return deleteFile(`${localProcessedVideoPath}/${fileName}`);
}

/**
 * @param filePath - The path of the file to delete.
 * @returns A promise that resolves when the file has been deleted.
 */
function deleteFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(`File ${filePath} does not exist at ${filePath}, skipping deletion.`);
      resolve();  // Or reject() if you want to stop the process
    } else {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log(`Error deleting file: ${err} at ${filePath}`);
          console.log(`Error: ${err}`);
          reject(err);
        } else {
          console.log(`Deleted file: ${filePath} at ${filePath}`);
          resolve();
        }
      })
    }
  })
}

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath - The directory path to check.
 */
function ensureDirectoryExistence(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true }); // recursive: true creates parent directories if they don't exist
    console.log(`Directory created at ${dirPath}`)
  }
}