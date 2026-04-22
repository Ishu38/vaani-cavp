import React, { useRef, useEffect } from "react";

export default function SpectrogramView({ melData, title = "Mel Spectrogram" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!melData || !melData.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const rows = melData.length;
    const cols = melData[0]?.length || 0;
    if (cols === 0) return;

    canvas.width = cols * 4;
    canvas.height = rows * 3;

    let minVal = Infinity, maxVal = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = melData[r][c];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }
    const range = maxVal - minVal || 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const norm = (melData[r][c] - minVal) / range;
        // Purple-based colormap
        const red = Math.round(124 * norm + 30 * (1 - norm));
        const green = Math.round(58 * norm + 10 * (1 - norm));
        const blue = Math.round(237 * norm + 60 * (1 - norm));
        ctx.fillStyle = `rgb(${red},${green},${blue})`;
        ctx.fillRect(c * 4, (rows - 1 - r) * 3, 4, 3);
      }
    }
  }, [melData]);

  if (!melData || !melData.length) return null;

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>{title}</h4>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.axes}>
        <span>Time</span>
        <span>Frequency</span>
      </div>
    </div>
  );
}

const styles = {
  container: { background: "#fff", border: "1px solid #f3f4f6", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  title: { color: "#7c3aed", fontSize: 13, margin: "0 0 10px", fontWeight: 700 },
  canvas: { width: "100%", height: 180, borderRadius: 8, display: "block" },
  axes: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginTop: 6 },
};
