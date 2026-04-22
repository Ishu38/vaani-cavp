import React, { useRef, useState, useCallback } from "react";
import LiveSpectrogram from "./LiveSpectrogram.jsx";

/**
 * Side-by-side real-time spectrogram for contrastive analysis.
 * Records L1 and L2 (English) with live visual feedback.
 * Parents can see the spectral difference in real time.
 */
export default function ContrastiveSpectrogram({ onFilesReady, l1Name = "L1" }) {
  const specARef = useRef(null);
  const specBRef = useRef(null);
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [step, setStep] = useState(0); // 0=ready, 1=recording A, 2=A done, 3=recording B, 4=both done

  const handleFileA = useCallback((file) => {
    setFileA(file);
    setStep(2);
  }, []);

  const handleFileB = useCallback((file) => {
    setFileB(file);
    setStep(4);
  }, []);

  React.useEffect(() => {
    if (fileA && fileB && onFilesReady) {
      onFilesReady(fileA, fileB);
    }
  }, [fileA, fileB, onFilesReady]);

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <h2 style={styles.title}>Live Contrastive Spectrogram</h2>
        <p style={styles.subtitle}>
          Record both samples and watch the spectral differences in real time
        </p>
      </div>

      {step === 0 && (
        <div style={styles.instructions}>
          <div style={styles.stepCard}>
            <span style={styles.stepNum}>Step 1</span>
            <span style={styles.stepText}>Record the child speaking in <strong>{l1Name}</strong> (L1)</span>
          </div>
          <div style={styles.arrow}>then</div>
          <div style={styles.stepCard}>
            <span style={styles.stepNum}>Step 2</span>
            <span style={styles.stepText}>Record the same content in <strong>English</strong> (L2)</span>
          </div>
          <div style={styles.arrow}>then</div>
          <div style={styles.stepCard}>
            <span style={styles.stepNum}>Step 3</span>
            <span style={styles.stepText}>See the <strong>visual difference</strong> and run contrastive analysis</span>
          </div>
        </div>
      )}

      <div style={styles.dualView}>
        <div style={styles.panel}>
          <div style={styles.panelBadge}>
            <span style={{ ...styles.badge, background: "#7c3aed" }}>L1</span>
            {l1Name} (Mother Tongue)
          </div>
          <LiveSpectrogram
            ref={specARef}
            label={`L1 — ${l1Name}`}
            colorScheme="viridis"
            onRecordingDone={handleFileA}
            height={200}
          />
          {fileA && <div style={styles.ready}>Sample A ready</div>}
        </div>

        <div style={styles.divider}>
          <span style={styles.vsText}>VS</span>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelBadge}>
            <span style={{ ...styles.badge, background: "#0891b2" }}>L2</span>
            English (Target)
          </div>
          <LiveSpectrogram
            ref={specBRef}
            label="L2 — English"
            colorScheme="magma"
            onRecordingDone={handleFileB}
            height={200}
          />
          {fileB && <div style={styles.ready}>Sample B ready</div>}
        </div>
      </div>

      {fileA && fileB && (
        <div style={styles.comparisonHint}>
          Both samples captured. Look at the spectrograms above — the visual patterns show where
          L1 phonology differs from L2. Dense warm colors = energy concentration.
          Gaps = missing formants. The analysis below will quantify exactly what you see.
        </div>
      )}

      {/* Upload alternative */}
      <details style={styles.uploadSection}>
        <summary style={styles.uploadSummary}>Or upload existing audio files</summary>
        <div style={styles.uploadRow}>
          <label style={styles.uploadLabel}>
            L1 ({l1Name}) audio:
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFileA(f); setStep((s) => Math.max(s, 2)); }
              }}
              style={styles.fileInput}
            />
          </label>
          <label style={styles.uploadLabel}>
            L2 (English) audio:
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFileB(f); setStep(4); }
              }}
              style={styles.fileInput}
            />
          </label>
        </div>
      </details>
    </div>
  );
}

const styles = {
  container: {
    background: "#0a0a1a",
    borderRadius: 12,
    padding: 20,
    border: "1px solid #222",
    marginBottom: 20,
  },
  titleRow: { marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
    background: "linear-gradient(90deg, #00d4ff, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: { color: "#666", fontSize: 13, margin: "4px 0 0" },
  instructions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  stepCard: {
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "12px 18px",
    textAlign: "center",
    flex: "1 1 180px",
  },
  stepNum: { display: "block", color: "#00d4ff", fontSize: 10, fontWeight: 800, letterSpacing: 2, marginBottom: 4 },
  stepText: { color: "#ccc", fontSize: 13 },
  arrow: { color: "#444", fontSize: 12 },
  dualView: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 0,
    alignItems: "start",
  },
  panel: { minWidth: 0 },
  panelBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    color: "#aaa",
    fontSize: 12,
    fontWeight: 600,
  },
  badge: {
    padding: "2px 8px",
    borderRadius: 4,
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    minHeight: 200,
  },
  vsText: {
    color: "#333",
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 3,
    writingMode: "vertical-lr",
  },
  ready: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: 600,
    marginTop: 6,
    textAlign: "center",
  },
  comparisonHint: {
    background: "#1a1a2e",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 14,
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 16,
  },
  uploadSection: { marginTop: 16 },
  uploadSummary: { color: "#555", fontSize: 12, cursor: "pointer" },
  uploadRow: { display: "flex", gap: 16, marginTop: 10 },
  uploadLabel: { color: "#888", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 },
  fileInput: { fontSize: 12, color: "#aaa" },
};
