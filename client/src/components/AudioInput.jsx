import React, { useRef } from "react";
import useRecorder from "../hooks/useRecorder.js";

export default function AudioInput({ label, onAudioReady }) {
  const { recording, audioBlob, audioUrl, start, stop, reset } = useRecorder();
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) onAudioReady(file, label);
  }

  function handleRecordDone() {
    stop();
    setTimeout(() => {
      // After stop, audioBlob becomes available
    }, 100);
  }

  React.useEffect(() => {
    if (audioBlob) {
      const file = new File([audioBlob], `${label.replace(/\s+/g, "_")}_recording.webm`, {
        type: "audio/webm",
      });
      onAudioReady(file, label);
    }
  }, [audioBlob]);

  return (
    <div style={styles.container}>
      <h3 style={styles.label}>{label}</h3>
      <div style={styles.controls}>
        {!recording ? (
          <button onClick={start} style={{ ...styles.btn, ...styles.recordBtn }}>
            Record
          </button>
        ) : (
          <button onClick={stop} style={{ ...styles.btn, ...styles.stopBtn }}>
            Stop
          </button>
        )}
        <span style={styles.or}>or</span>
        <button onClick={() => fileRef.current?.click()} style={styles.btn}>
          Upload File
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        {audioBlob && (
          <button onClick={reset} style={{ ...styles.btn, ...styles.resetBtn }}>
            Clear
          </button>
        )}
      </div>
      {audioUrl && <audio controls src={audioUrl} style={styles.audio} />}
    </div>
  );
}

const styles = {
  container: {
    border: "1px solid #333",
    borderRadius: 8,
    padding: 16,
    background: "#1a1a2e",
    marginBottom: 12,
  },
  label: { margin: "0 0 10px", color: "#00d4ff", fontSize: 14, fontWeight: 600 },
  controls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  btn: {
    padding: "8px 16px",
    border: "1px solid #444",
    borderRadius: 6,
    background: "#16213e",
    color: "#e0e0e0",
    cursor: "pointer",
    fontSize: 13,
  },
  recordBtn: { background: "#b91c1c", borderColor: "#ef4444", color: "#fff" },
  stopBtn: { background: "#92400e", borderColor: "#f59e0b", color: "#fff" },
  resetBtn: { background: "#374151", borderColor: "#6b7280" },
  or: { color: "#666", fontSize: 12 },
  audio: { marginTop: 10, width: "100%" },
};
