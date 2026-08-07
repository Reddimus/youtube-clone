"use client";

import { allowedVideoExtensions } from "@yt/contract";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  getVideoExtension,
  maxDescriptionLength,
  maxTitleLength,
  maxUploadBytes,
  uploadVideo,
  validateVideoFileSize,
} from "../firebase/functions";
import { formatBytes } from "../lib/format";
import { DevelopRail } from "./develop-rail";
import { useToast } from "./toast";
import styles from "./upload-dialog.module.css";

type Phase = "idle" | "uploading" | "developing";

const acceptAttribute = allowedVideoExtensions
  .map((extension) => `.${extension}`)
  .join(",");

export function UploadDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const { notify } = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const fileErrorId = useId();

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const busy = phase === "uploading";

  const reset = useCallback(() => {
    setFile(null);
    setFileError(null);
    setTitle("");
    setDescription("");
    setPhase("idle");
    setProgress(0);
    setDragging(false);
    if (inputRef.current) {
      // Without this, re-selecting the same file after an error fires no
      // change event and the picker appears dead.
      inputRef.current.value = "";
    }
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dialogRef.current?.close();
    setOpen(false);
    reset();
  }, [reset]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      // showModal gives focus trapping, Escape-to-close, and an inert
      // background without hand-rolling any of it.
      dialog.showModal();
    }
  }, [open]);

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) {
      return;
    }
    try {
      getVideoExtension(candidate.name);
      validateVideoFileSize(candidate.size);
      setFile(candidate);
      setFileError(null);
      if (!title) {
        setTitle(
          candidate.name.replace(/\.[^.]+$/, "").slice(0, maxTitleLength),
        );
      }
    } catch (error) {
      setFile(null);
      setFileError(
        error instanceof Error
          ? error.message
          : "That file cannot be uploaded.",
      );
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || busy) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("uploading");
    setProgress(0);

    try {
      const result = await uploadVideo(
        file,
        { title, description },
        { onProgress: setProgress, signal: controller.signal },
      );
      setPhase("developing");
      notify(
        "Upload complete. Redd is developing your video — it will appear in the feed when it is ready.",
        "success",
      );
      // The feed is server-rendered, so refresh it rather than mutating local
      // state; the new video shows up as soon as the transcode finishes.
      router.refresh();
      window.setTimeout(() => {
        if (abortRef.current === controller) {
          close();
        }
      }, 2_500);
      void result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPhase("idle");
        setProgress(0);
        return;
      }
      setPhase("idle");
      setProgress(0);
      notify(
        error instanceof Error
          ? error.message
          : "The upload failed. Try again.",
        "error",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const percent = Math.round(progress * 100);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={styles.triggerLabel}>Upload</span>
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={`${titleId}-heading`}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        onCancel={(event) => {
          if (busy) {
            // Escape must not silently abandon an upload in flight.
            event.preventDefault();
          }
        }}
      >
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <div className={styles.head}>
            <h2 id={`${titleId}-heading`} className={styles.heading}>
              Upload a video
            </h2>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              disabled={busy}
            >
              <span className="visuallyHidden">Close</span>
              <span aria-hidden="true">×</span>
            </button>
          </div>

          {phase === "developing" ? (
            <div className={styles.done}>
              <DevelopRail stage="developing" />
              <p>
                Your video is being developed into 360p and 720p. It joins the
                feed automatically when it is ready — you can close this.
              </p>
            </div>
          ) : (
            <>
              <div
                className={dragging ? styles.dropZoneActive : styles.dropZone}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => {
                  setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={inputRef}
                  id={`${titleId}-file`}
                  className={styles.fileInput}
                  type="file"
                  accept={acceptAttribute}
                  disabled={busy}
                  aria-describedby={fileError ? fileErrorId : undefined}
                  aria-invalid={fileError ? true : undefined}
                  onChange={(event) => {
                    acceptFile(event.target.files?.[0]);
                  }}
                />
                <label className={styles.fileLabel} htmlFor={`${titleId}-file`}>
                  {file ? "Choose a different file" : "Choose a video file"}
                </label>
                <p className={styles.dropHint}>
                  {file
                    ? `${file.name} · ${formatBytes(file.size)}`
                    : `or drop one here — MP4, MOV, WebM, or M4V up to ${formatBytes(maxUploadBytes)}`}
                </p>
              </div>

              {fileError && (
                <p id={fileErrorId} className={styles.error} role="alert">
                  {fileError}
                </p>
              )}

              <div className={styles.field}>
                <label htmlFor={titleId}>Title</label>
                <input
                  id={titleId}
                  type="text"
                  value={title}
                  maxLength={maxTitleLength}
                  disabled={busy}
                  placeholder="What is this video?"
                  onChange={(event) => {
                    setTitle(event.target.value);
                  }}
                />
                <span className={styles.counter}>
                  {title.length}/{maxTitleLength}
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor={descriptionId}>
                  Description{" "}
                  <span className={styles.optional}>(optional)</span>
                </label>
                <textarea
                  id={descriptionId}
                  rows={3}
                  value={description}
                  maxLength={maxDescriptionLength}
                  disabled={busy}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                />
              </div>

              {busy && (
                <div className={styles.progressWrap}>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Upload progress"
                  >
                    <div
                      className={styles.progressFill}
                      style={{ inlineSize: `${percent}%` }}
                    />
                  </div>
                  <span className={styles.progressLabel}>{percent}%</span>
                </div>
              )}

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={close}
                >
                  {busy ? "Cancel upload" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={!file || busy}
                >
                  {busy ? `Uploading ${percent}%` : "Upload"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
