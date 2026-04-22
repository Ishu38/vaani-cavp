import React from "react";

export default function PrivacyPolicy({ onBack }) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <button style={styles.backBtn} onClick={onBack}>
          &larr; Back
        </button>




        <h2 style={styles.title}>
          PRIVACY POLICY — Vani<sup style={{ fontSize: "0.5em" }}>&trade;</sup>: Contrastive Acoustic Voice Profiling
        </h2>

        {/* Section 1 */}
        <h3 style={styles.sectionHeading}>1. Introduction and Scope</h3>
        <p style={styles.paragraph}>
          This Privacy Policy governs the collection, processing, and storage of personal and acoustic
          data by the "Vani&trade;: Contrastive Acoustic Voice Profiling" application ("Vani&trade;,"
          the "Software," or the "Service"), developed and maintained by Neil Shankar Ray ("Developer,"
          "we," "us," or "our").
        </p>
        <p style={styles.paragraph}>
          Because Vani&trade; processes vocal telemetry and acoustic biometrics, we are committed to
          the highest standards of data minimization, transparency, and security. This document outlines
          our practices regarding your data rights and our obligations as a Data Fiduciary.
        </p>

        {/* Section 2 */}
        <h3 style={styles.sectionHeading}>2. Categories of Data Processed</h3>
        <p style={styles.paragraph}>
          To execute contrastive acoustic profiling, Vani&trade; processes the following distinct
          categories of data:
        </p>
        <ul style={styles.list}>
          <li style={styles.listItem}>
            <strong>Raw Audio Data:</strong> Ephemeral audio streams captured via the device microphone.
            Note: Unless explicitly permitted by the user for model training, raw audio is processed in
            real-time and immediately discarded after feature extraction.
          </li>
          <li style={styles.listItem}>
            <strong>Extracted Acoustic Features (Vocal Telemetry):</strong> Non-reversable algorithmic
            outputs, including but not limited to Mel-frequency cepstral coefficients (MFCCs),
            fundamental frequency (F0), formants, jitter, shimmer, and phonation thresholds.
          </li>
          <li style={styles.listItem}>
            <strong>Contrastive Profiles:</strong> The aggregated statistical models representing your
            unique acoustic signature, used solely for comparative linguistic and acoustic analysis
            within the Software.
          </li>
          <li style={styles.listItem}>
            <strong>System &amp; Usage Telemetry:</strong> Anonymous application logs, crash reports, and
            hardware environment details (e.g., OS version, processing architecture) required for
            debugging and optimizing the Software's machine learning pipelines.
          </li>
        </ul>

        {/* Section 3 */}
        <h3 style={styles.sectionHeading}>3. Purpose and Legal Basis for Processing</h3>
        <p style={styles.paragraph}>
          We process your data strictly on the legal basis of Explicit Consent and Legitimate Interest
          to provide the core functionality of the Service. The purposes include:
        </p>
        <ul style={styles.list}>
          <li style={styles.listItem}>
            Performing real-time or batch acoustic analysis and contrastive profiling.
          </li>
          <li style={styles.listItem}>
            Visualizing linguistic and phonetic metrics within the user interface.
          </li>
          <li style={styles.listItem}>
            Improving the accuracy and latency of the underlying computational linguistics models.
          </li>
        </ul>
        <p style={styles.prohibition}>
          <strong>Strict Prohibition:</strong> Under no circumstances is your acoustic data or vocal
          telemetry cross-referenced with external databases for the purpose of personal identification,
          surveillance, or third-party marketing.
        </p>

        {/* Section 4 */}
        <h3 style={styles.sectionHeading}>4. Data Architecture, Storage, and Security</h3>
        <ul style={styles.list}>
          <li style={styles.listItem}>
            <strong>Edge Processing / Local Inference:</strong> Wherever computationally feasible,
            Vani&trade; prioritizes edge computing. Acoustic feature extraction is performed locally on
            your device, ensuring that raw audio streams never leave your hardware.
          </li>
          <li style={styles.listItem}>
            <strong>Data at Rest and in Transit:</strong> Any data that must be synced or stored
            externally is protected using AES-256 encryption at rest and TLS 1.3 protocols in transit.
          </li>
          <li style={styles.listItem}>
            <strong>Retention Minimization:</strong> Contrastive profiles are retained only for the
            duration of your active use of the Service. If an account or local profile is deleted, all
            associated acoustic metadata is permanently purged.
          </li>
        </ul>

        {/* Section 5 */}
        <h3 style={styles.sectionHeading}>5. Third-Party Sub-Processors</h3>
        <p style={styles.paragraph}>
          Vani&trade; operates with a strict data-isolation framework. We do not sell, license, or trade
          your acoustic data. We may engage specialized cloud infrastructure providers (Sub-Processors)
          solely for hosting the application backend or storing encrypted telemetry. These entities are
          bound by strict Data Processing Agreements (DPAs) that prohibit any independent access or use
          of your data.
        </p>

        {/* Section 6 */}
        <h3 style={styles.sectionHeading}>6. Your Data Rights</h3>
        <p style={styles.paragraph}>
          Subject to applicable data protection laws (including the DPDP Act), you possess the following
          rights regarding your data:
        </p>
        <ul style={styles.list}>
          <li style={styles.listItem}>
            <strong>Right to Information and Access:</strong> You may request a highly detailed export of
            the acoustic features and profiles currently stored by Vani&trade;.
          </li>
          <li style={styles.listItem}>
            <strong>Right to Erasure (Right to be Forgotten):</strong> You may mandate the immediate
            deletion of all raw audio, telemetry, and contrastive profiles associated with your usage.
          </li>
          <li style={styles.listItem}>
            <strong>Right to Withdraw Consent:</strong> You may revoke microphone permissions or consent
            for data processing at any time, acknowledging this will suspend the Software's core
            functionality.
          </li>
        </ul>

        {/* Section 7 */}
        <h3 style={styles.sectionHeading}>7. Policy Modifications</h3>
        <p style={styles.paragraph}>
          As the machine learning models and features of Vani&trade; evolve, we may revise this Privacy
          Policy. Material changes pertaining to how we handle biometric or acoustic data will be
          communicated via explicit in-app notifications prior to taking effect.
        </p>

        {/* Section 8 */}
        <h3 style={styles.sectionHeading}>8. Data Controller Contact Information</h3>
        <p style={styles.paragraph}>
          For inquiries regarding this Privacy Policy, to exercise your data rights, or to request a
          data audit, please contact the Data Fiduciary:
        </p>
        <div style={styles.contactBlock}>
          <p style={styles.contactLine}><strong>Developer:</strong> Neil Shankar Ray</p>
          <p style={styles.contactLine}><strong>Email:</strong> roychinu45@gmail.com</p>
          <p style={styles.contactLine}>
            <strong>Address:</strong> c/o Mrs. Chinu Ray, 55/1 Jubilee Park, Tollygaunge,
            Kolkata -33, West Bengal, India
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "#fff",
    display: "flex",
    justifyContent: "center",
    padding: "40px 20px 80px",
  },
  container: {
    maxWidth: 800,
    width: "100%",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "40px 48px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  backBtn: {
    background: "none",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "8px 18px",
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    cursor: "pointer",
    marginBottom: 24,
  },
  meta: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.3,
    marginBottom: 32,
    marginTop: 8,
    letterSpacing: "-0.3px",
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: 600,
    color: "#111827",
    marginTop: 32,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
    marginBottom: 16,
  },
  prohibition: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
    marginBottom: 16,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "12px 16px",
  },
  list: {
    paddingLeft: 24,
    marginBottom: 16,
  },
  listItem: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
    marginBottom: 10,
  },
  contactBlock: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "16px 20px",
    marginTop: 8,
  },
  contactLine: {
    fontSize: 15,
    lineHeight: 1.7,
    color: "#374151",
    margin: "4px 0",
  },
};
