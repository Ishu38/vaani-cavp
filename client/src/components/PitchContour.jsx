import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function PitchContour({ contour = [], title = "F0 Pitch Contour" }) {
  if (!contour.length) return null;

  const data = contour.map((val, i) => ({ frame: i, f0: Math.round(val) }));

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="frame" stroke="#d1d5db" tick={{ fontSize: 10, fill: "#9ca3af" }}
            label={{ value: "Time (frames)", position: "insideBottom", offset: -2, fill: "#9ca3af", fontSize: 10 }} />
          <YAxis stroke="#d1d5db" tick={{ fontSize: 10, fill: "#9ca3af" }}
            label={{ value: "Hz", angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 10 }} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
          <Line type="monotone" dataKey="f0" stroke="#7c3aed" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles = {
  container: { background: "#fff", border: "1px solid #f3f4f6", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  title: { color: "#7c3aed", fontSize: 13, margin: "0 0 10px", fontWeight: 700 },
};
