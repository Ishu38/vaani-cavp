import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";

/**
 * Real-time spectrogram using Web Audio API.
 * Renders a scrolling waterfall spectrogram on canvas as audio is captured.
 * Exposes start/stop/getBlob via ref for parent control.
 */
const LiveSpectrogram = forwardRef(function LiveSpectrogram(
  { label = "Live", height = 220, colorScheme = "viridis", onRecordingDone },
  ref
) {
  const canvasRef = useRef(null);
  const waveformRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const colRef = useRef(0);
  const frameCountRef = useRef(0);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);
  const stopRef = useRef(null);
  const MAX_DURATION = 120; // 2 minutes max

  // Color maps
  const colorMaps = {
    viridis: (t) => {
      const r = Math.round(68 + t * 187);
      const g = Math.round(1 + t * 180 + (1 - t) * 40);
      const b = Math.round(84 + (1 - t) * 130);
      return `rgb(${r},${g},${b})`;
    },
    magma: (t) => {
      const r = Math.round(t * 255);
      const g = Math.round(t * t * 128);
      const b = Math.round(60 + (1 - t) * 150 + t * 80);
      return `rgb(${r},${g},${b})`;
    },
    inferno: (t) => {
      const r = Math.round(t * 230 + 10);
      const g = Math.round(t * t * 200);
      const b = Math.round((1 - t) * 180 + t * 40);
      return `rgb(${r},${g},${b})`;
    },
  };

  const getColor = colorMaps[colorScheme] || colorMaps.viridis;

  const startRecording = useCallback(async () => {
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
    streamRef.current = stream;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    source.connect(analyser);
    analyserRef.current = analyser;

    // Pick the best available codec for recording
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=pcm")
      ? "audio/webm;codecs=pcm"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 256000 });
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (onRecordingDone) {
        const file = new File([blob], `${label.replace(/\s+/g, "_")}.webm`, { type: mimeType });
        onRecordingDone(file, blob, url);
      }
    };
    mediaRecorderRef.current = mr;
    mr.start(1000); // 1-second chunks for reliable long recordings

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    colRef.current = 0;
    frameCountRef.current = 0;

    setRecording(true);
    setDuration(0);
    setAudioUrl(null);
    timerRef.current = setInterval(() => {
      setDuration((d) => {
        if (d + 0.1 >= MAX_DURATION) {
          // Auto-stop at max duration via ref to avoid stale closure
          if (stopRef.current) stopRef.current();
          return MAX_DURATION;
        }
        return d + 0.1;
      });
    }, 100);

    drawSpectrogram();
  }, [label, onRecordingDone]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  }, []);

  // Keep stopRef in sync so the timer interval can call it without stale closures
  stopRef.current = stopRecording;

  const reset = useCallback(() => {
    setAudioUrl(null);
    setDuration(0);
    colRef.current = 0;
    frameCountRef.current = 0;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const wCanvas = waveformRef.current;
    if (wCanvas) {
      const ctx = wCanvas.getContext("2d");
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, wCanvas.width, wCanvas.height);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    start: startRecording,
    stop: stopRecording,
    reset,
    isRecording: () => recording,
  }));

  function drawSpectrogram() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const wCanvas = waveformRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);

    function draw() {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeData);

      // Throttle spectrogram scroll — advance every 3rd frame (~20fps)
      // With canvas width 1800 and 1px advance: 1800 / 20 = 90s before wrap
      frameCountRef.current++;
      const shouldAdvance = frameCountRef.current % 3 === 0;

      if (shouldAdvance) {
        const col = colRef.current % canvas.width;
        const binsToShow = Math.min(bufferLength, canvas.height);

        for (let i = 0; i < binsToShow; i++) {
          const val = dataArray[i] / 255;
          ctx.fillStyle = getColor(val);
          ctx.fillRect(col, canvas.height - i - 1, 1, 1);
        }

        // Draw time cursor
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(col + 1, 0, 1, canvas.height);

        // Clear ahead
        ctx.fillStyle = "#0a0a1a";
        ctx.fillRect((col + 3) % canvas.width, 0, 8, canvas.height);

        colRef.current += 1;
      }

      // Waveform
      if (wCanvas) {
        const wCtx = wCanvas.getContext("2d");
        wCtx.fillStyle = "#0a0a1a";
        wCtx.fillRect(0, 0, wCanvas.width, wCanvas.height);

        wCtx.lineWidth = 1.5;
        wCtx.strokeStyle = "#00d4ff";
        wCtx.beginPath();
        const sliceWidth = wCanvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * wCanvas.height) / 2;
          if (i === 0) wCtx.moveTo(x, y);
          else wCtx.lineTo(x, y);
          x += sliceWidth;
        }
        wCtx.lineTo(wCanvas.width, wCanvas.height / 2);
        wCtx.stroke();

        // RMS level bar
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = (timeData[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const level = Math.min(1, rms * 4);
        wCtx.fillStyle = level > 0.7 ? "#ef4444" : level > 0.4 ? "#f59e0b" : "#22c55e";
        wCtx.fillRect(wCanvas.width - 20, wCanvas.height * (1 - level), 14, wCanvas.height * level);
        wCtx.strokeStyle = "#333";
        wCtx.strokeRect(wCanvas.width - 20, 0, 14, wCanvas.height);
      }
    }

    draw();
  }

  useEffect(() => {
    // Set canvas resolution
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 1800;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, 1800, 256);
    }
    const wCanvas = waveformRef.current;
    if (wCanvas) {
      wCanvas.width = 1800;
      wCanvas.height = 60;
      const ctx = wCanvas.getContext("2d");
      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, 1800, 60);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      // Clean up media resources if still active on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.label}>{label}</h3>
        <div style={styles.controls}>
          {!recording ? (
            <button onClick={startRecording} style={{ ...styles.btn, ...styles.recordBtn }}>
              <span style={styles.redDot} /> Record (up to 2 min)
            </button>
          ) : (
            <>
              <button onClick={stopRecording} style={{ ...styles.btn, ...styles.stopBtn }}>
                Stop
              </button>
              <span style={styles.timer}>
                {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
                <span style={styles.timerMax}> / 2:00</span>
              </span>
            </>
          )}
          {audioUrl && !recording && (
            <>
              <button onClick={reset} style={{ ...styles.btn, ...styles.resetBtn }}>
                Clear
              </button>
              <span style={styles.durationBadge}>
                {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")} recorded
              </span>
            </>
          )}
          {recording && <span style={styles.live}>LIVE</span>}
        </div>
      </div>

      {/* Recording progress bar */}
      {recording && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${Math.min((duration / MAX_DURATION) * 100, 100)}%` }} />
        </div>
      )}

      {/* Frequency labels */}
      <div style={styles.spectroWrap}>
        <div style={styles.freqLabels}>
          <span>22k</span>
          <span>16k</span>
          <span>11k</span>
          <span>5.5k</span>
          <span>0 Hz</span>
        </div>
        <div style={styles.canvasWrap}>
          <canvas ref={canvasRef} style={styles.canvas} />
          <canvas ref={waveformRef} style={styles.waveCanvas} />
        </div>
      </div>

      {audioUrl && (
        <audio controls src={audioUrl} style={styles.audio} />
      )}
    </div>
  );
});

export default LiveSpectrogram;

const styles = {
  container: {
    border: "1px solid #333",
    borderRadius: 10,
    padding: 16,
    background: "linear-gradient(180deg, #0f0f23 0%, #1a1a2e 100%)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  label: { margin: 0, color: "#00d4ff", fontSize: 14, fontWeight: 700 },
  controls: { display: "flex", alignItems: "center", gap: 8 },
  btn: {
    padding: "7px 16px",
    border: "1px solid #444",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  recordBtn: { background: "#7f1d1d", borderColor: "#ef4444", color: "#fca5a5" },
  stopBtn: { background: "#78350f", borderColor: "#f59e0b", color: "#fde68a" },
  resetBtn: { background: "#1f2937", borderColor: "#4b5563", color: "#9ca3af" },
  redDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
    animation: "pulse 1s infinite",
  },
  timer: {
    color: "#fde68a",
    fontSize: 16,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
  },
  timerMax: {
    color: "#78716c",
    fontSize: 12,
    fontWeight: 500,
  },
  durationBadge: {
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 600,
  },
  progressBar: {
    height: 3,
    background: "#1f2937",
    borderRadius: 2,
    marginBottom: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)",
    borderRadius: 2,
    transition: "width 0.1s linear",
  },
  live: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 2,
    animation: "pulse 1s infinite",
  },
  spectroWrap: { display: "flex", gap: 6 },
  freqLabels: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#555",
    paddingTop: 2,
    paddingBottom: 2,
    width: 30,
    textAlign: "right",
  },
  canvasWrap: { flex: 1 },
  canvas: {
    width: "100%",
    height: 180,
    borderRadius: 6,
    border: "1px solid #222",
    display: "block",
  },
  waveCanvas: {
    width: "100%",
    height: 40,
    borderRadius: 4,
    border: "1px solid #222",
    marginTop: 4,
    display: "block",
  },
  audio: { marginTop: 10, width: "100%" },
};
