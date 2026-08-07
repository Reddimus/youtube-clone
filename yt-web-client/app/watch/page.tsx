'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { isSafeProcessedVideoName } from '../firebase/functions';
import { processedVideoUrl } from '../firebase/storage';

function WatchContent() {
  const videoSrc = useSearchParams().get('v');

  if (!isSafeProcessedVideoName(videoSrc)) {
    return <div role="alert">Invalid video.</div>;
  }

  return (
    <div>
      <h1>Watch Page</h1>
      <video controls src={processedVideoUrl(videoSrc)}/>
    </div>
  );
}

export default function Watch() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WatchContent />
    </Suspense>
  );
}
