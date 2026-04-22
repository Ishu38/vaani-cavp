import { useState, useRef, useCallback } from "react";

export default function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000,
        sampleSize: 16,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Pick the best available codec
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=pcm")
      ? "audio/webm;codecs=pcm"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

    const mr = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 256000,
    });
    chunks.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunks.current, { type: mimeType });
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.current = mr;
    mr.start(1000);
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorder.current && recording) {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl(null);
  }, []);

  return { recording, audioBlob, audioUrl, start, stop, reset };
}
