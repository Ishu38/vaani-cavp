import React, { useState, useEffect, useCallback } from "react";
import LiveSpectrogram from "./components/LiveSpectrogram.jsx";
import ContrastiveSpectrogram from "./components/ContrastiveSpectrogram.jsx";
import ProfileDashboard from "./components/ProfileDashboard.jsx";
import ContrastiveView from "./components/ContrastiveView.jsx";
import ProgressTracker from "./components/ProgressTracker.jsx";
import CIFBreakdown from "./components/CIFBreakdown.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";
import {
  analyzeAudio, contrastiveAnalysis, batchAnalyze, getHealth, getTrajectory, downloadReport,
  getLocalSessions, getLocalContrastiveSessions, deleteLocalSession,
  deleteLocalContrastiveSession, clearLocalData, getLocalStorageEstimate,
  login, signup, isAuthenticated, getUser, clearAuth,
} from "./utils/api.js";

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [authMode, setAuthMode] = useState(null); // null shows landing, 'login', 'signup'
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", school: "", schoolId: "" });
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [page, setPage] = useState("home");
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [speakerId, setSpeakerId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [gender, setGender] = useState("child");
  const [l1Language, setL1Language] = useState("auto");

  const L1_OPTIONS = [
    ["auto", "Auto-detect"],
    ["bho", "Bhojpuri"],
    ["hin", "Hindi"],
    ["ben", "Bangla"],
    ["ori", "Odia"],
  ];
  const l1DisplayName = L1_OPTIONS.find(([v]) => v === l1Language)?.[1] || "L1";

  const [singleFile, setSingleFile] = useState(null);
  const [singleResult, setSingleResult] = useState(null);
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [contrastiveResult, setContrastiveResult] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [localSessions, setLocalSessions] = useState([]);
  const [localContrastive, setLocalContrastive] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchResults, setBatchResults] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, fileStatuses: [] }

  useEffect(() => { getHealth().then(setHealth).catch(() => {}); }, []);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        await login({ email: authForm.email, password: authForm.password });
      } else {
        await signup({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
          school: authForm.school,
          schoolId: authForm.schoolId,
        });
      }
      setAuthed(true);
      setAuthMode(null);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearAuth();
    setAuthed(false);
    setAuthMode(null);
    setAuthForm({ name: "", email: "", password: "", school: "", schoolId: "" });
  }

  async function handleSingleAnalyze() {
    if (!singleFile) return;
    setLoading(true); setError(null);
    try {
      const result = await analyzeAudio(singleFile, { speakerId, gender, l1Language });
      setSingleResult(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const handleSingleRecordDone = useCallback((file) => setSingleFile(file), []);
  const handleContrastiveFilesReady = useCallback((a, b) => { setFileA(a); setFileB(b); }, []);

  async function handleContrastiveAnalyze() {
    if (!fileA || !fileB) return;
    setLoading(true); setError(null);
    try {
      const result = await contrastiveAnalysis(fileA, fileB, { speakerId, gender, labelA: `L1 (${l1DisplayName})`, labelB: "L2 (English)", l1Language });
      setContrastiveResult(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleBatchAnalyze() {
    if (batchFiles.length === 0) return;
    setLoading(true);
    setError(null);
    setBatchResults(null);
    setBatchProgress({ current: 0, total: batchFiles.length, fileStatuses: batchFiles.map((f) => ({ name: f.name, status: 'pending' })) });
    try {
      const result = await batchAnalyze(batchFiles, {
        speakerId,
        studentName,
        gender,
        l1Language,
        onProgress: (status) => {
          setBatchProgress((prev) => {
            if (!prev) return prev;
            const completed = prev.fileStatuses.filter((s) => s.status === 'completed').length;
            return { ...prev, current: Math.min(completed + 1, prev.total) };
          });
        },
      });
      setBatchResults(result);
      // Mark all as completed
      setBatchProgress((prev) => ({
        ...prev,
        current: prev.total,
        fileStatuses: prev.fileStatuses.map((s) => ({ ...s, status: 'completed' })),
      }));
    } catch (err) {
      setError(err.message);
      setBatchProgress((prev) => ({
        ...prev,
        fileStatuses: prev.fileStatuses.map((s) =>
          s.status === 'pending' ? { ...s, status: 'failed' } : s
        ),
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleBatchFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 10) {
      setError('Maximum 10 files allowed per batch');
      return;
    }
    setBatchFiles(files);
    setBatchResults(null);
    setBatchProgress(null);
  }

  function handleBatchDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('audio/'));
    if (files.length > 10) {
      setError('Maximum 10 files allowed per batch');
      return;
    }
    setBatchFiles(files);
    setBatchResults(null);
    setBatchProgress(null);
  }

  function removeBatchFile(index) {
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleLoadTrajectory() {
    if (!speakerId) return;
    setLoading(true);
    try { const r = await getTrajectory(speakerId); setTrajectory(r); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleDownloadPdf() {
    if (!singleFile) return;
    try { await downloadReport(singleFile, { gender, studentName, speakerId }); }
    catch (err) { setError(err.message); }
  }

  async function loadLocalData() {
    try {
      const [sessions, contrastive, estimate] = await Promise.all([
        getLocalSessions(),
        getLocalContrastiveSessions(),
        getLocalStorageEstimate(),
      ]);
      setLocalSessions(sessions);
      setLocalContrastive(contrastive);
      setStorageInfo(estimate);
    } catch (err) { console.warn("Failed to load local data:", err); }
  }

  async function handleDeleteSession(id) {
    await deleteLocalSession(id);
    loadLocalData();
  }

  async function handleDeleteContrastive(id) {
    await deleteLocalContrastiveSession(id);
    loadLocalData();
  }

  async function handleClearAll() {
    if (!confirm("Delete all locally stored recordings and results? This cannot be undone.")) return;
    await clearLocalData();
    loadLocalData();
  }

  useEffect(() => { if (page === "storage") loadLocalData(); }, [page]);

  const VaniLogo = () => (
    <div style={styles.logo} onClick={() => { setPage("home"); if(!authed) setAuthMode(null); }}>
      <div style={styles.logoIcon}>
        <div style={styles.logoColor1}></div>
        <div style={styles.logoColor2}></div>
        <div style={styles.logoColor3}></div>
      </div>
      <span style={styles.logoText}>Vani<sup style={{fontSize: '0.5em', position: 'relative', top: '-0.5em'}}>®</sup></span>
    </div>
  );

  const NavLinks = () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      {["Company", "About Me", "Pricing", "Contact"].map(l => (
        <span
          key={l}
          onClick={() => {
            if (l === "Company") setAuthMode("company");
            if (l === "Product") setAuthMode("product");
            if (l === "About Me") setAuthMode("about");
            if (l === "Pricing") setAuthMode("pricing");
            if (l === "Contact") setAuthMode("contact");
          }}
          style={{fontSize: 15, fontWeight: 500, color: "#111", cursor: "pointer", display: "flex", alignItems: "center", gap: 4}}
        >
          {l} {l !== "Pricing" && l !== "About Me" && l !== "Contact" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>}
        </span>
      ))}
    </div>
  );

  const HeroSection = () => (
    <section style={styles.heroClay}>
      <div style={styles.heroClayInner}>
        <div style={styles.decoLeft}>
          <span style={{display: 'inline-block', transform: 'rotate(-20deg) scale(1.2)'}}>🌺</span>
          <span style={{display: 'inline-block', transform: 'translate(20px, 40px) rotate(15deg)'}}>🌿</span>
        </div>
        <div style={styles.decoRight}>
          <span style={{display: 'inline-block', transform: 'rotate(20deg) scale(1.3)'}}>🌼</span>
          <span style={{display: 'inline-block', transform: 'translate(-30px, 30px) rotate(-15deg)'}}>🍃</span>
        </div>

        <div style={styles.heroMCText}>
          <p style={styles.heroShloka}>
            शब्दरूपेण भासन्ती वाणी सर्वप्रकाशिनी ।<br />
            ध्वनेरन्तर्गतं तत्त्वं विज्ञानेन विविच्यते ॥
          </p>
          <h1 className="vani-hero-headline" style={styles.heroMCHeadline}>
            See exactly how your child<br />speaks — and what to fix
          </h1>
          <p style={styles.heroMCSub}>
            Record one sentence. Vani® shows you which sounds your child struggles with, why their mother tongue interferes, and how to help — all in 30 seconds.
          </p>
          <button style={styles.heroMCBtn} onClick={() => authed ? setPage("contrastive") : setAuthMode("signup")}>
            {authed ? "Start Diagnosis" : "Get Started \u2192"}
          </button>
        </div>
      </div>

      <div style={styles.trustedSection}>
        <h2 style={{fontSize: 32, fontWeight: 700, color: '#000', letterSpacing: '-1px'}}>Get a clear picture of how you speak™</h2>
        <p style={{fontSize: 18, color: '#666', marginTop: 12, lineHeight: 1.5}}>The science-backed path to confident, fluent speech.</p>
      </div>
    </section>
  );

  if (!authed) {
    return (
      <div className="vani-app" style={styles.app}>
        <style>{globalCSS}</style>
        <nav style={styles.nav}>
          <div className="vani-nav-inner" style={styles.navInner}>
            <VaniLogo />

            {!authMode && (
              <div style={styles.navCenter}>
                <NavLinks />
              </div>
            )}

            <div className="vani-nav-right" style={styles.navRight}>
              <span style={styles.navTextLink} onClick={() => setAuthMode("signup")}>Get a demo</span>
              <span style={styles.navTextLink} onClick={() => setAuthMode("login")}>Login</span>
              <button style={styles.navSignUpBtn} onClick={() => setAuthMode("signup")}>Sign up &rarr;</button>
            </div>
          </div>
        </nav>

        {!authMode ? (
          <HeroSection />
        ) : authMode === "company" ? (
          <div style={styles.companySection}>
            <div style={styles.companyInner}>
              <h1 style={styles.companyTitle}>Our Philosophy</h1>
              <p style={styles.companyText}>
                Everywhere you look, another course promises a shortcut to perfect English. Yet, so many students still walk away afraid to speak.
              </p>
              <p style={styles.companyText}>
                The problem isn't a lack of effort. It's that traditional methods only teach the surface of the language. They completely overlook the deep, invisible acoustic roots of a student's native tongue. They miss the L1 interference—those subtle, structural hurdles that quietly chip away at a learner's confidence.
              </p>
              <p style={styles.companyText}>
                We built Vani® to change that. We want to move past rote memorization and give teachers the tools to truly understand what's holding a child back. Vani® decodes the unique acoustic realities of a student's speech in seconds, transforming guesswork into targeted, compassionate guidance. Because true fluency isn't just about knowing the words—it's about having the confidence to let them flow.
              </p>
              <p style={{...styles.companyText, marginTop: 40, fontStyle: 'italic', fontWeight: 600}}>
                Warm Regards,<br />Neil Shankar Ray, IIT Patna
              </p>
            </div>
          </div>
        ) : authMode === "product" ? (
          <div style={styles.companySection}>
            <div style={styles.companyInner}>
              <h1 style={styles.companyTitle}>Our Engines</h1>
              <p style={styles.companyText}>
                Vani® is powered by a proprietary suite of AI and acoustic processing engines, designed specifically to decode the intricate layers of children's speech.
              </p>
              
              <div style={styles.productGrid}>
                <div style={styles.productCard}>
                  <div style={styles.productIcon}>🎙️</div>
                  <h3 style={styles.productCardTitle}>VoxScribe™</h3>
                  <p style={styles.productCardDesc}>Our high-fidelity transcription engine, expertly tuned to handle children's speech and complex code-switching environments.</p>
                </div>
                <div style={styles.productCard}>
                  <div style={styles.productIcon}>🌊</div>
                  <h3 style={styles.productCardTitle}>NeuroFormant™ & SpectralCore™</h3>
                  <p style={styles.productCardDesc}>Neural network-based feature extractors that map the precise vowel spaces, formants, and spectral properties of the speaker.</p>
                </div>
                <div style={styles.productCard}>
                  <div style={styles.productIcon}>🧠</div>
                  <h3 style={styles.productCardTitle}>VoxLattice™</h3>
                  <p style={styles.productCardDesc}>The core AI classification engine. It processes high-dimensional acoustic data to detect hidden L1 interference and phonetic deviations.</p>
                </div>
                <div style={styles.productCard}>
                  <div style={styles.productIcon}>🕸️</div>
                  <h3 style={styles.productCardTitle}>LinguaGraph™ & SyntaxNet™</h3>
                  <p style={styles.productCardDesc}>Deep NLP and syntax mapping tools. They pinpoint morpheme boundaries and quantify the invisible cognitive load during speech production.</p>
                </div>
              </div>
            </div>
          </div>
        ) : authMode === "about" ? (
          <div style={styles.companySection}>
            <div style={styles.companyInner}>
              <h1 style={styles.companyTitle}>About Me</h1>
              <p style={styles.companyText}>
                I am an educator and technologist operating at the intersection of human language and machine intelligence. As a linguist and Senior English Facilitator, I have spent my career deconstructing the mechanics of communication.
              </p>
              <p style={styles.companyText}>
                To bring computational rigor to my research, I am currently pursuing an AI/ML certification at IIT Patna. My technical portfolio spans full-stack MERN development and assistive technologies, including a patented framework for multimodal language acquisition.
              </p>
              <p style={styles.companyText}>
                I am actively preparing for doctoral research in Computational Linguistics, driven by a vision to map the unseen acoustic and structural realities of human speech.
              </p>
            </div>
          </div>
        ) : authMode === "pricing" ? (
          <PricingPage onGetStarted={() => setAuthMode("signup")} onContact={() => setAuthMode("contact")} />
        ) : authMode === "contact" ? (
          <ContactPage />
        ) : authMode === "privacy" ? (
          <PrivacyPolicy onBack={() => setAuthMode(null)} />
        ) : (
          <div style={authStyles.wrap}>
            <div style={authStyles.card}>
              <h2 style={authStyles.title}>{authMode === "login" ? "Welcome back" : "Create account"}</h2>
              <p style={authStyles.subtitle}>
                {authMode === "login" ? "Sign in to start voice analysis" : "Register to get started"}
              </p>

              {authError && <div style={authStyles.error}>{authError}</div>}

              <form onSubmit={handleAuth} style={authStyles.form}>
                {authMode === "signup" && (
                  <input
                    style={authStyles.input}
                    placeholder="Full name"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    required
                    minLength={2}
                  />
                )}
                <input
                  style={authStyles.input}
                  type="email"
                  placeholder="Email address"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  required
                />
                <input
                  style={authStyles.input}
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  required
                  minLength={8}
                />
                {authMode === "signup" && (
                  <>
                    <input
                      style={authStyles.input}
                      placeholder="School name (optional)"
                      value={authForm.school}
                      onChange={(e) => setAuthForm({ ...authForm, school: e.target.value })}
                    />
                    <input
                      style={authStyles.input}
                      placeholder="School ID (optional)"
                      value={authForm.schoolId}
                      onChange={(e) => setAuthForm({ ...authForm, schoolId: e.target.value })}
                    />
                  </>
                )}
                <button type="submit" disabled={authLoading} style={authStyles.btn}>
                  {authLoading ? "Please wait..." : authMode === "login" ? "Log In" : "Sign Up \u2192"}
                </button>
              </form>

              <p style={authStyles.toggle}>
                {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
                <span
                  style={authStyles.toggleLink}
                  onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(null); }}
                >
                  {authMode === "login" ? "Sign up" : "Log in"}
                </span>
              </p>
            </div>
          </div>
        )}

        <footer style={styles.footer}>
          <div className="vani-footer-inner" style={styles.footerInner}>
            <VaniLogo />
            <span style={styles.footerCredit}>
              Designed and Developed by Neil Shankar Ray, IIT Patna
            </span>
            <span
              onClick={() => setAuthMode("privacy")}
              style={{ fontSize: 13, color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
            >
              Privacy Policy
            </span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="vani-app" style={styles.app}>
      <style>{globalCSS}</style>

      {/* ── NAV ── */}
      <nav style={styles.nav}>
        <div className="vani-nav-inner" style={styles.navInner}>
          <div style={styles.navLeft}>
            <VaniLogo />
          </div>

          <div className="vani-nav-right" style={styles.navRight}>
            <button onClick={() => setPage("single")} style={styles.navLinkApp}>Single Analysis</button>
            <button onClick={() => setPage("contrastive")} style={styles.navLinkApp}>Contrastive</button>
            <button onClick={() => setPage("batch")} style={styles.navLinkApp}>Batch Upload</button>
            <button onClick={() => setPage("progress")} style={styles.navLinkApp}>Progress</button>
            <button onClick={() => setPage("storage")} style={styles.navLinkApp}>Storage</button>
            <button onClick={() => setPage("pricing")} style={styles.navLinkApp}>Pricing</button>
            <button onClick={handleLogout} style={styles.navSignUpBtn}>Log Out</button>
          </div>
        </div>
      </nav>

      {/* ── ERROR ── */}
      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={styles.errorDismiss}>Dismiss</button>
        </div>
      )}

      {/* ── HOME ── */}
      {page === "home" && (
        <>
          <HeroSection />
          {/* Features */}
          <section style={styles.features}>
            <h2 style={styles.sectionTitle}>10 things we check in one recording.</h2>
            <p style={styles.sectionSubtitle}>
              Every part of your child's speech — sounds, rhythm, fluency, confidence — analyzed automatically.
            </p>
            <div className="vani-feature-grid" style={styles.featureGrid}>
              {[
                { title: "Sound Accuracy", desc: "Checks every sound your child makes against correct English pronunciation", icon: "P" },
                { title: "Word Structure", desc: "How the child builds words — pauses between parts, joining sounds together", icon: "M" },
                { title: "Mental Effort", desc: "Detects when your child is thinking hard — hesitations, pauses, slowing down", icon: "C" },
                { title: "Confidence Check", desc: "Picks up signs of nervousness or comfort in how the child speaks", icon: "E" },
                { title: "Language Switching", desc: "Spots exactly when the child switches between their mother tongue and English", icon: "S" },
                { title: "Rhythm & Flow", desc: "Is the speech smooth and natural, or choppy and uneven?", icon: "R" },
                { title: "Fluency", desc: "Does the child connect words smoothly, or speak one word at a time?", icon: "F" },
                { title: "Voice Clarity", desc: "Checks if the voice sounds clear, breathy, nasal, or strained", icon: "V" },
                { title: "Mother Tongue Influence", desc: "Finds specific sounds affected by Bhojpuri, Hindi, Bangla, or Odia habits", icon: "B" },
                { title: "PDF Report", desc: "A complete report you can download and share with parents or teachers", icon: "D" },
              ].map((f, i) => (
                <div key={i} style={styles.featureCard}>
                  <div style={styles.featureIcon}>{f.icon}</div>
                  <h3 style={styles.featureTitle}>{f.title}</h3>
                  <p style={styles.featureDesc}>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── SINGLE ANALYSIS ── */}
      {page === "single" && (
        <section className="vani-page-section" style={styles.pageSection}>
          <div style={styles.pageHeader}>
            <h2 style={styles.pageTitle}>Analyze Speech</h2>
            <p style={styles.pageSubtitle}>Record or upload a voice sample — we'll tell you exactly what's happening</p>
          </div>

          <div className="vani-input-row" style={styles.inputRow}>
            <InputField label="Student Name" value={studentName} onChange={setStudentName} placeholder="e.g., Aditya" />
            <InputField label="Student ID" value={speakerId} onChange={setSpeakerId} placeholder="e.g., BHOJ001" />
            <SelectField label="Gender" value={gender} onChange={setGender}
              options={[["child","Child"],["male","Male"],["female","Female"],["neutral","Neutral"]]} />
            <SelectField label="L1 Language" value={l1Language} onChange={setL1Language}
              options={L1_OPTIONS} />
          </div>

          <div style={styles.spectroSection}>
            <LiveSpectrogram
              label="Record audio — watch the spectrogram in real time"
              colorScheme="viridis"
              onRecordingDone={handleSingleRecordDone}
            />
          </div>

          <div className="vani-btn-row" style={styles.btnRow}>
            <button
              onClick={handleSingleAnalyze}
              disabled={!singleFile || loading}
              style={!singleFile || loading ? { ...styles.primaryBtn, ...styles.btnDisabled } : styles.primaryBtn}
            >
              {loading ? "Analyzing all 10 layers..." : "Run Full Diagnostic"}
            </button>
            {singleResult && (
              <button onClick={handleDownloadPdf} style={styles.secondaryBtn}>
                Download PDF Report
              </button>
            )}
          </div>

          {loading && <PipelineProgress />}

          {singleResult && (
            <div style={styles.resultSection}>
              <CIFBreakdown cif={singleResult.profile?.cif_analysis} l1Name={singleResult.profile?.l1_display_name || l1DisplayName} />
              <ProfileDashboard profile={singleResult.profile} label="Diagnostic Voice Profile" />
            </div>
          )}
        </section>
      )}

      {/* ── CONTRASTIVE ── */}
      {page === "contrastive" && (
        <section className="vani-page-section" style={styles.pageSection}>
          <div style={styles.pageHeader}>
            <h2 style={styles.pageTitle}>Contrastive Analysis</h2>
            <p style={styles.pageSubtitle}>
              Record L1 ({l1DisplayName}) and L2 (English) side by side — see the spectral difference in real time
            </p>
          </div>

          <div className="vani-input-row" style={styles.inputRow}>
            <InputField label="Student Name" value={studentName} onChange={setStudentName} placeholder="e.g., Aditya" />
            <InputField label="Student ID" value={speakerId} onChange={setSpeakerId} placeholder="e.g., BHOJ001" />
            <SelectField label="Gender" value={gender} onChange={setGender}
              options={[["child","Child"],["male","Male"],["female","Female"],["neutral","Neutral"]]} />
            <SelectField label="L1 Language" value={l1Language} onChange={setL1Language}
              options={L1_OPTIONS} />
          </div>

          <ContrastiveSpectrogram onFilesReady={handleContrastiveFilesReady} l1Name={l1DisplayName} />

          <div className="vani-btn-row" style={styles.btnRow}>
            <button
              onClick={handleContrastiveAnalyze}
              disabled={!fileA || !fileB || loading}
              style={!fileA || !fileB || loading ? { ...styles.primaryBtn, ...styles.btnDisabled } : styles.primaryBtn}
            >
              {loading ? "Running contrastive analysis..." : "Run Contrastive Diagnostic"}
            </button>
          </div>

          {loading && <PipelineProgress />}

          {contrastiveResult && (
            <div style={styles.resultSection}>
              <ContrastiveView report={contrastiveResult.contrastive_report} />
              <div className="vani-dual-grid" style={styles.dualGrid}>
                <CIFBreakdown cif={contrastiveResult.profile_a?.cif_analysis} l1Name={contrastiveResult.profile_a?.l1_display_name || l1DisplayName} />
                <CIFBreakdown cif={contrastiveResult.profile_b?.cif_analysis} l1Name={contrastiveResult.profile_b?.l1_display_name || l1DisplayName} />
              </div>
              <div className="vani-dual-grid" style={styles.dualGrid}>
                <ProfileDashboard profile={contrastiveResult.profile_a} label={`L1 ${contrastiveResult.profile_a?.l1_display_name || l1DisplayName} Profile`} />
                <ProfileDashboard profile={contrastiveResult.profile_b} label="L2 English Profile" />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── BATCH UPLOAD ── */}
      {page === "batch" && (
        <section className="vani-page-section" style={styles.pageSection}>
          <div style={styles.pageHeader}>
            <h2 style={styles.pageTitle}>Batch Upload</h2>
            <p style={styles.pageSubtitle}>
              Upload up to 10 audio files at once — each runs through the full diagnostic pipeline independently
            </p>
          </div>

          <div className="vani-input-row" style={styles.inputRow}>
            <InputField label="Student Name" value={studentName} onChange={setStudentName} placeholder="e.g., Aditya" />
            <InputField label="Student ID" value={speakerId} onChange={setSpeakerId} placeholder="e.g., BHOJ001" />
            <SelectField label="Gender" value={gender} onChange={setGender}
              options={[["child","Child"],["male","Male"],["female","Female"],["neutral","Neutral"]]} />
            <SelectField label="L1 Language" value={l1Language} onChange={setL1Language}
              options={L1_OPTIONS} />
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleBatchDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => document.getElementById('batch-file-input').click()}
            style={batchStyles.dropZone}
          >
            <input
              id="batch-file-input"
              type="file"
              accept="audio/*"
              multiple
              onChange={handleBatchFileChange}
              style={{ display: 'none' }}
            />
            <div style={batchStyles.dropIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p style={batchStyles.dropText}>Drop audio files here, or click to browse</p>
            <p style={batchStyles.dropHint}>.wav, .mp3, .ogg, .webm, .flac, .m4a — max 10 files, 50 MB each</p>
          </div>

          {/* File list */}
          {batchFiles.length > 0 && (
            <div style={batchStyles.fileList}>
              <div style={batchStyles.fileListHeader}>
                <span style={batchStyles.fileListTitle}>{batchFiles.length} file{batchFiles.length !== 1 ? 's' : ''} selected</span>
                <button onClick={() => { setBatchFiles([]); setBatchResults(null); setBatchProgress(null); }} style={batchStyles.clearBtn}>Clear all</button>
              </div>
              {batchFiles.map((file, i) => (
                <div key={i} style={batchStyles.fileItem}>
                  <div style={batchStyles.fileInfo}>
                    <div style={batchStyles.fileIcon}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                    <div>
                      <span style={batchStyles.fileName}>{file.name}</span>
                      <span style={batchStyles.fileSize}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                  <div style={batchStyles.fileActions}>
                    {batchProgress?.fileStatuses[i] && (
                      <span style={{
                        ...batchStyles.statusBadge,
                        ...(batchProgress.fileStatuses[i].status === 'completed' ? batchStyles.statusCompleted :
                            batchProgress.fileStatuses[i].status === 'failed' ? batchStyles.statusFailed :
                            batchStyles.statusPending),
                      }}>
                        {batchProgress.fileStatuses[i].status === 'completed' ? '✓ Done' :
                         batchProgress.fileStatuses[i].status === 'failed' ? '✗ Failed' : '⏳ Queued'}
                      </span>
                    )}
                    {!loading && (
                      <button onClick={() => removeBatchFile(i)} style={batchStyles.removeBtn}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {batchProgress && loading && (
            <div style={batchStyles.progressSection}>
              <div style={batchStyles.progressHeader}>
                <span style={batchStyles.progressLabel}>Processing {batchProgress.current} of {batchProgress.total} files...</span>
                <span style={batchStyles.progressPercent}>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
              </div>
              <div style={batchStyles.progressTrack}>
                <div style={{ ...batchStyles.progressFill, width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="vani-btn-row" style={styles.btnRow}>
            <button
              onClick={handleBatchAnalyze}
              disabled={batchFiles.length === 0 || loading}
              style={batchFiles.length === 0 || loading ? { ...styles.primaryBtn, ...styles.btnDisabled } : styles.primaryBtn}
            >
              {loading ? `Analyzing ${batchFiles.length} files...` : `Run Batch Diagnostic (${batchFiles.length} files)`}
            </button>
          </div>

          {loading && <PipelineProgress />}

          {/* Results */}
          {batchResults && batchResults.results && (
            <div style={batchStyles.resultsSection}>
              <h3 style={batchStyles.resultsTitle}>
                ✓ Batch Complete — {batchResults.results.length} profile{batchResults.results.length !== 1 ? 's' : ''} generated
              </h3>
              <div style={batchStyles.resultsGrid}>
                {batchResults.results.map((r, i) => (
                  <div key={i} style={batchStyles.resultCard}>
                    <div style={batchStyles.resultCardHeader}>
                      <div style={batchStyles.resultCardIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00A699" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </div>
                      <div>
                        <span style={batchStyles.resultFileName}>{batchFiles[i]?.name || `File ${i + 1}`}</span>
                        <span style={batchStyles.resultJobId}>Job: {r.jobId}</span>
                      </div>
                    </div>
                    {r.profile && (
                      <button
                        onClick={() => { setSingleResult({ profile: r.profile }); setPage('single'); }}
                        style={batchStyles.viewProfileBtn}
                      >
                        View Full Profile →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── PROGRESS ── */}
      {page === "progress" && (
        <section className="vani-page-section" style={styles.pageSection}>
          <div style={styles.pageHeader}>
            <h2 style={styles.pageTitle}>Progress Tracker</h2>
            <p style={styles.pageSubtitle}>Track improvement over multiple sessions</p>
          </div>
          <div className="vani-input-row" style={styles.inputRow}>
            <InputField label="Student ID" value={speakerId} onChange={setSpeakerId} placeholder="e.g., BHOJ001" />
            <div style={{ paddingTop: 22 }}>
              <button onClick={handleLoadTrajectory} disabled={!speakerId || loading}
                style={!speakerId || loading ? { ...styles.primaryBtn, ...styles.btnDisabled } : styles.primaryBtn}>
                {loading ? "Loading..." : "Load Progress"}
              </button>
            </div>
          </div>
          {trajectory && <ProgressTracker data={trajectory} />}
        </section>
      )}

      {/* ── LOCAL STORAGE ── */}
      {page === "storage" && (
        <section className="vani-page-section" style={styles.pageSection}>
          <div style={styles.pageHeader}>
            <h2 style={styles.pageTitle}>Local Storage</h2>
            <p style={styles.pageSubtitle}>
              All recordings and results are saved offline in your browser — nothing leaves your machine
            </p>
          </div>

          {storageInfo && (
            <div style={styles.storageBar}>
              <div style={styles.storageBarInner}>
                <div style={{ ...styles.storageBarFill, width: `${Math.min((storageInfo.used / storageInfo.quota) * 100, 100).toFixed(1)}%` }} />
              </div>
              <span style={styles.storageLabel}>
                {(storageInfo.used / 1024 / 1024).toFixed(1)} MB used of {(storageInfo.quota / 1024 / 1024 / 1024).toFixed(1)} GB available
              </span>
            </div>
          )}

          <div className="vani-btn-row" style={styles.btnRow}>
            <button onClick={loadLocalData} style={styles.primaryBtn}>Refresh</button>
            <button onClick={handleClearAll} style={styles.dangerBtn}>Clear All Local Data</button>
          </div>

          <h3 style={styles.storageHeading}>Single Analysis Sessions ({localSessions.length})</h3>
          {localSessions.length === 0 && <p style={styles.emptyText}>No sessions saved yet. Run an analysis to see results here.</p>}
          <div style={styles.sessionList}>
            {localSessions.map((s) => (
              <div key={s.id} style={styles.sessionCard}>
                <div style={styles.sessionInfo}>
                  <span style={styles.sessionName}>{s.studentName || s.speakerId || "Anonymous"}</span>
                  <span style={styles.sessionMeta}>{s.speakerId} — {s.gender}</span>
                  <span style={styles.sessionDate}>{new Date(s.createdAt).toLocaleString()}</span>
                </div>
                <div style={styles.sessionActions}>
                  <button
                    onClick={() => { setSingleResult({ profile: s.profile }); setPage("single"); }}
                    style={styles.smallBtn}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDeleteSession(s.id)}
                    style={styles.smallDangerBtn}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ ...styles.storageHeading, marginTop: 32 }}>Contrastive Sessions ({localContrastive.length})</h3>
          {localContrastive.length === 0 && <p style={styles.emptyText}>No contrastive sessions saved yet.</p>}
          <div style={styles.sessionList}>
            {localContrastive.map((s) => (
              <div key={s.id} style={styles.sessionCard}>
                <div style={styles.sessionInfo}>
                  <span style={styles.sessionName}>{s.studentName || s.speakerId || "Anonymous"}</span>
                  <span style={styles.sessionMeta}>{s.speakerId} — {s.gender} — L1 vs L2</span>
                  <span style={styles.sessionDate}>{new Date(s.createdAt).toLocaleString()}</span>
                </div>
                <div style={styles.sessionActions}>
                  <button
                    onClick={() => {
                      setContrastiveResult({
                        contrastive_report: s.contrastiveReport,
                        profile_a: s.profileA,
                        profile_b: s.profileB,
                      });
                      setPage("contrastive");
                    }}
                    style={styles.smallBtn}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDeleteContrastive(s.id)}
                    style={styles.smallDangerBtn}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PRICING (logged in) ── */}
      {page === "pricing" && (
        <PricingPage onGetStarted={() => setPage("pricing")} onContact={() => setPage("contact")} />
      )}

      {/* ── CONTACT (logged in) ── */}
      {page === "contact" && (
        <ContactPage />
      )}

      {/* ── PRIVACY POLICY (logged in) ── */}
      {page === "privacy" && (
        <PrivacyPolicy onBack={() => setPage("home")} />
      )}

      {/* ── FOOTER ── */}
      <footer style={styles.footer}>
        <div className="vani-footer-inner" style={styles.footerInner}>
          <VaniLogo />
          <span style={styles.footerCredit}>
            Designed and Developed by Neil Shankar Ray, IIT Patna
          </span>
          <span
            onClick={() => setPage("privacy")}
            style={{ fontSize: 13, color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
          >
            Privacy Policy
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ── */

function PricingPage({ onGetStarted, onContact }) {
  const tiers = [
    {
      name: "Free",
      price: "0",
      period: "forever",
      audience: "Individual teachers, NGO pilots",
      features: [
        "3 diagnoses / month",
        "Basic L1 interference report",
        "No student history storage",
        "Watermarked PDF report",
        "Community forum support",
      ],
      cta: "Get Started",
      highlight: false,
    },
    {
      name: "School Pro",
      price: "2,500",
      period: "/ mo per school",
      audience: "Private schools, CBSE/ICSE chains",
      badge: "Best Value",
      features: [
        "Unlimited diagnoses",
        "Full 10-layer analysis report",
        "Student progress tracking (1 yr)",
        "WhatsApp parent reports",
        "Class-level aggregate view",
        "CSV / PDF export",
        "Email support (48hr SLA)",
      ],
      cta: "Start Free Trial",
      highlight: true,
    },
    {
      name: "District / Chain",
      price: "6,999",
      period: "/ mo",
      audience: "School chains (5\u201350 schools)",
      features: [
        "Everything in School Pro",
        "Multi-school dashboard",
        "API access for SIS integration",
        "Custom remediation plans",
        "Monthly strategy call",
        "White-label option",
        "Priority support (4hr SLA)",
      ],
      cta: "Contact Sales",
      highlight: false,
    },
    {
      name: "Enterprise / Govt",
      price: "Custom",
      period: "/ annual",
      audience: "State govts, CBSE Board, NGOs",
      features: [
        "Unlimited schools & students",
        "On-premise deployment option",
        "Custom L1 language training",
        "Research partnership clause",
        "Dedicated CSM",
        "Data sovereignty guarantee",
        "Ministry-level reporting",
      ],
      cta: "Talk to Us",
      highlight: false,
    },
  ];

  return (
    <section style={pricingStyles.section}>
      <div style={pricingStyles.header}>
        <h1 style={pricingStyles.title}>Simple, transparent pricing</h1>
        <p style={pricingStyles.subtitle}>
          Start free. Scale as your school grows. Every plan includes our core AI diagnostic engine.
        </p>
      </div>

      <div className="vani-pricing-grid" style={pricingStyles.grid}>
        {tiers.map((t) => (
          <div
            key={t.name}
            style={{
              ...pricingStyles.card,
              ...(t.highlight ? pricingStyles.cardHighlight : {}),
            }}
          >
            {t.badge && <div style={pricingStyles.badge}>{t.badge}</div>}
            <h3 style={pricingStyles.tierName}>{t.name}</h3>
            <p style={pricingStyles.audience}>{t.audience}</p>

            <div style={pricingStyles.priceBlock}>
              <div style={pricingStyles.priceMain}>
                {t.price !== "Custom" && <span style={pricingStyles.rupee}>{"\u20B9"}</span>}
                <span style={pricingStyles.priceValue}>{t.price}</span>
              </div>
              <span style={pricingStyles.pricePeriod}>{t.period}</span>
            </div>

            <div style={pricingStyles.divider} />

            <ul style={pricingStyles.featureList}>
              {t.features.map((f, i) => (
                <li key={i} style={pricingStyles.featureItem}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="12" fill={t.highlight ? "#000" : "#f0f0f0"} />
                    <path d="M7 12.5l3 3 7-7" stroke={t.highlight ? "#fff" : "#00A699"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={t.cta === "Contact Sales" || t.cta === "Talk to Us" ? onContact : onGetStarted}
              style={{
                ...pricingStyles.cta,
                ...(t.highlight ? pricingStyles.ctaHighlight : {}),
              }}
            >
              {t.cta} &rarr;
            </button>
          </div>
        ))}
      </div>

      {/* ── Payment Section ── */}
      <div style={pricingStyles.paySection}>
        <h2 style={pricingStyles.paySectionTitle}>Subscribe & Pay</h2>
        <p style={pricingStyles.paySectionSub}>Scan the QR code or use the UPI ID to complete your payment instantly.</p>

        <div style={pricingStyles.payCenter}>
          <div style={pricingStyles.payCard}>
            <div style={pricingStyles.payCardHeader}>
              <div style={pricingStyles.payMethodIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="3" stroke="#000" strokeWidth="1.5"/><path d="M7 15h2M12 15h5" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/><rect x="2" y="8" width="20" height="3" fill="#000" opacity="0.1"/></svg>
              </div>
              <div>
                <h3 style={pricingStyles.payMethodName}>Pay with UPI</h3>
                <span style={pricingStyles.payMethodTag}>Instant &middot; Secure</span>
              </div>
            </div>

            <div style={pricingStyles.qrWrap}>
              <div style={pricingStyles.qrFrame}>
                <div style={pricingStyles.qrCornerTL} />
                <div style={pricingStyles.qrCornerTR} />
                <div style={pricingStyles.qrCornerBL} />
                <div style={pricingStyles.qrCornerBR} />
                <img src="/upi-qr.jpeg" alt="UPI QR Code — Neil Shankar Roy" style={pricingStyles.qrImage} />
              </div>
              <p style={pricingStyles.qrScanText}>Scan with any UPI app to pay</p>
            </div>

            <div style={pricingStyles.payDivider} />

            <div style={pricingStyles.upiIdRow}>
              <span style={pricingStyles.upiLabel}>UPI ID</span>
              <div style={pricingStyles.upiIdBox}>
                <span style={pricingStyles.upiIdText}>7001406831-2@axl</span>
                <button
                  style={pricingStyles.upiCopyBtn}
                  onClick={() => {
                    navigator.clipboard.writeText("7001406831-2@axl");
                    alert("UPI ID copied!");
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
            <p style={pricingStyles.upiPayee}>Payee: <strong>Neil Shankar Roy</strong></p>

            <div style={pricingStyles.payDivider} />
            <span style={pricingStyles.acceptedLabel}>Accepted on</span>
            <div style={pricingStyles.upiAppsList}>
              {["PhonePe", "Google Pay", "Paytm", "BHIM"].map(app => (
                <span key={app} style={pricingStyles.upiAppBadge}>{app}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactPage() {
  return (
    <section style={contactStyles.section}>
      <div className="vani-contact-inner" style={contactStyles.inner}>
        <div style={contactStyles.left}>
          <h1 style={contactStyles.title}>Get in touch</h1>
          <p style={contactStyles.subtitle}>
            Have questions about Vani® or want to schedule a demo for your school? We'd love to hear from you.
          </p>

          <div style={contactStyles.cards}>
            <div style={contactStyles.card}>
              <div style={contactStyles.iconWrap}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <div>
                <h3 style={contactStyles.cardLabel}>Address</h3>
                <p style={contactStyles.cardText}>
                  C/o Mrs. Chinu Ray<br />
                  55/1, Jubilee Park, Tollygunge<br />
                  Kolkata &ndash; 700033
                </p>
              </div>
            </div>

            <div style={contactStyles.card}>
              <div style={contactStyles.iconWrap}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </div>
              <div>
                <h3 style={contactStyles.cardLabel}>Phone</h3>
                <p style={contactStyles.cardText}>
                  <a href="tel:+917001406831" style={contactStyles.link}>+91 70014 06831</a><br />
                  <a href="tel:+918420722727" style={contactStyles.link}>+91 84207 22727</a>
                </p>
              </div>
            </div>

            <div style={contactStyles.card}>
              <div style={contactStyles.iconWrap}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div>
                <h3 style={contactStyles.cardLabel}>Email</h3>
                <p style={contactStyles.cardText}>
                  <a href="mailto:roychinu45@gmail.com" style={contactStyles.link}>roychinu45@gmail.com</a>
                </p>
              </div>
            </div>
          </div>

          <div style={contactStyles.mapWrap}>
            <iframe
              title="Office Location"
              src="https://www.google.com/maps?q=55/1+Jubilee+Park+Tollygunge+Kolkata+700033&output=embed"
              style={contactStyles.mapIframe}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href="https://www.google.com/maps/search/55+1+Jubilee+Park+Tollygunge+Kolkata+700033"
              target="_blank"
              rel="noopener noreferrer"
              style={contactStyles.mapLink}
            >
              Open in Google Maps &rarr;
            </a>
          </div>
        </div>

        <div style={contactStyles.right}>
          <div style={contactStyles.formCard}>
            <h2 style={contactStyles.formTitle}>Send us a message</h2>
            <form onSubmit={(e) => { e.preventDefault(); alert("Thank you! We'll get back to you soon."); }} style={contactStyles.form}>
              <input style={contactStyles.input} placeholder="Your name" required />
              <input style={contactStyles.input} type="email" placeholder="Email address" required />
              <input style={contactStyles.input} placeholder="School / Organisation" />
              <textarea style={contactStyles.textarea} placeholder="How can we help?" rows={5} required />
              <button type="submit" style={contactStyles.submitBtn}>Send Message</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

const pricingStyles = {
  section: {
    padding: "80px 40px 100px",
    maxWidth: 1300,
    margin: "0 auto",
  },
  header: { textAlign: "center", marginBottom: 64 },
  title: {
    fontSize: 48,
    fontWeight: 800,
    color: "#000",
    letterSpacing: "-1.5px",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 20,
    color: "#666",
    maxWidth: 560,
    margin: "0 auto",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 20,
    alignItems: "stretch",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 20,
    padding: "40px 28px 32px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    transition: "box-shadow 0.25s, transform 0.25s",
  },
  cardHighlight: {
    border: "2px solid #000",
    boxShadow: "0 12px 48px rgba(0,0,0,0.12)",
    transform: "translateY(-8px)",
    background: "#fafafa",
  },
  badge: {
    position: "absolute",
    top: -13,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#000",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 16px",
    borderRadius: 20,
    letterSpacing: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  tierName: {
    fontSize: 20,
    fontWeight: 800,
    color: "#000",
    marginBottom: 6,
    letterSpacing: "-0.3px",
  },
  audience: {
    fontSize: 13,
    color: "#999",
    marginBottom: 24,
    lineHeight: 1.5,
    minHeight: 40,
  },
  priceBlock: {
    marginBottom: 24,
  },
  priceMain: {
    display: "flex",
    alignItems: "baseline",
    gap: 2,
    marginBottom: 2,
  },
  rupee: {
    fontSize: 22,
    fontWeight: 700,
    color: "#000",
    alignSelf: "flex-start",
    marginTop: 6,
  },
  priceValue: {
    fontSize: 44,
    fontWeight: 800,
    color: "#000",
    letterSpacing: "-2px",
    lineHeight: 1.1,
  },
  pricePeriod: {
    fontSize: 14,
    color: "#999",
    display: "block",
    marginTop: 2,
  },
  divider: {
    height: 1,
    background: "#eee",
    marginBottom: 24,
  },
  featureList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    flex: 1,
    marginBottom: 32,
  },
  featureItem: {
    fontSize: 14,
    color: "#444",
    padding: "7px 0",
    display: "flex",
    alignItems: "center",
    gap: 10,
    lineHeight: 1.4,
  },
  cta: {
    padding: "14px 24px",
    background: "#f0f0f0",
    color: "#000",
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "center",
    transition: "background 0.2s, transform 0.15s",
    marginTop: "auto",
  },
  ctaHighlight: {
    background: "#000",
    color: "#fff",
  },
  // Payment Section
  paySection: {
    marginTop: 80,
    borderTop: "1px solid #eee",
    paddingTop: 64,
  },
  paySectionTitle: {
    fontSize: 36,
    fontWeight: 800,
    color: "#000",
    letterSpacing: "-1px",
    textAlign: "center",
    marginBottom: 12,
  },
  paySectionSub: {
    fontSize: 17,
    color: "#666",
    textAlign: "center",
    marginBottom: 48,
    maxWidth: 500,
    margin: "0 auto 48px",
    lineHeight: 1.5,
  },
  payCenter: {
    display: "flex",
    justifyContent: "center",
  },
  payCard: {
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: 20,
    padding: "40px 36px",
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: 440,
  },
  payCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
  },
  payMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "#f5f5f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  payMethodName: {
    fontSize: 18,
    fontWeight: 800,
    color: "#000",
    marginBottom: 2,
  },
  payMethodTag: {
    fontSize: 11,
    fontWeight: 700,
    color: "#00A699",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  payDivider: {
    height: 1,
    background: "#f0f0f0",
    margin: "20px 0",
  },
  acceptedLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#bbb",
    textTransform: "uppercase",
    letterSpacing: 1,
    display: "block",
    marginBottom: 10,
  },
  // QR Code
  qrWrap: {
    textAlign: "center",
    marginBottom: 4,
  },
  qrFrame: {
    position: "relative",
    display: "inline-block",
    padding: 16,
  },
  qrCornerTL: {
    position: "absolute", top: 0, left: 0, width: 24, height: 24,
    borderTop: "3px solid #000", borderLeft: "3px solid #000", borderRadius: "4px 0 0 0",
  },
  qrCornerTR: {
    position: "absolute", top: 0, right: 0, width: 24, height: 24,
    borderTop: "3px solid #000", borderRight: "3px solid #000", borderRadius: "0 4px 0 0",
  },
  qrCornerBL: {
    position: "absolute", bottom: 0, left: 0, width: 24, height: 24,
    borderBottom: "3px solid #000", borderLeft: "3px solid #000", borderRadius: "0 0 0 4px",
  },
  qrCornerBR: {
    position: "absolute", bottom: 0, right: 0, width: 24, height: 24,
    borderBottom: "3px solid #000", borderRight: "3px solid #000", borderRadius: "0 0 4px 0",
  },
  qrImage: {
    width: 200,
    height: 200,
    objectFit: "contain",
    borderRadius: 8,
    display: "block",
  },
  qrScanText: {
    fontSize: 13,
    color: "#999",
    fontWeight: 600,
    marginTop: 12,
  },
  // UPI ID
  upiIdRow: {
    marginBottom: 12,
  },
  upiLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#bbb",
    textTransform: "uppercase",
    letterSpacing: 1,
    display: "block",
    marginBottom: 8,
  },
  upiIdBox: {
    display: "inline-flex",
    alignItems: "center",
    background: "#f8f8f8",
    border: "1px solid #e5e5e5",
    borderRadius: 10,
    padding: "10px 14px",
    gap: 10,
  },
  upiIdText: {
    fontSize: 16,
    fontWeight: 700,
    color: "#000",
    letterSpacing: 0.3,
    fontFamily: "'SF Mono', 'Fira Code', 'Courier New', monospace",
  },
  upiCopyBtn: {
    background: "#000",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  upiPayee: {
    fontSize: 14,
    color: "#666",
    marginBottom: 0,
  },
  upiAppsList: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  upiAppBadge: {
    background: "#f8f8f8",
    border: "1px solid #e8e8e8",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#333",
  },
};

const contactStyles = {
  section: {
    minHeight: "calc(100vh - 160px)",
    padding: "80px 40px",
    background: "#f9f9f8",
  },
  inner: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 60,
    alignItems: "start",
  },
  left: {},
  title: {
    fontSize: 48,
    fontWeight: 800,
    color: "#000",
    letterSpacing: "-1.5px",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    lineHeight: 1.7,
    marginBottom: 48,
    maxWidth: 460,
  },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "#fff",
    border: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#000",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardText: {
    fontSize: 15,
    color: "#555",
    lineHeight: 1.6,
    margin: 0,
  },
  link: {
    color: "#000",
    textDecoration: "none",
    fontWeight: 500,
    borderBottom: "1px solid #ddd",
    transition: "border-color 0.2s",
  },
  right: {},
  formCard: {
    background: "#fff",
    borderRadius: 24,
    padding: "40px 36px",
    border: "1px solid #e5e5e5",
    boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#000",
    marginBottom: 28,
    letterSpacing: "-0.5px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  input: {
    padding: "14px 16px",
    border: "1px solid #ddd",
    borderRadius: 12,
    fontSize: 15,
    color: "#000",
    background: "#fff",
    outline: "none",
    transition: "border 0.2s",
    fontFamily: "inherit",
  },
  textarea: {
    padding: "14px 16px",
    border: "1px solid #ddd",
    borderRadius: 12,
    fontSize: 15,
    color: "#000",
    background: "#fff",
    outline: "none",
    transition: "border 0.2s",
    fontFamily: "inherit",
    resize: "vertical",
  },
  submitBtn: {
    padding: "16px",
    background: "#000",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
    transition: "opacity 0.2s",
  },
  mapWrap: {
    marginTop: 32,
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid #e5e5e5",
  },
  mapIframe: {
    width: "100%",
    height: 240,
    border: "none",
    display: "block",
  },
  mapLink: {
    display: "block",
    textAlign: "center",
    padding: "12px 16px",
    fontSize: 13,
    fontWeight: 600,
    color: "#000",
    textDecoration: "none",
    background: "#f8f8f8",
    borderTop: "1px solid #eee",
  },
};

function InputField({ label, value, onChange, placeholder }) {
  return (
    <label style={fieldStyles.label}>
      <span style={fieldStyles.labelText}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={fieldStyles.input} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={fieldStyles.label}>
      <span style={fieldStyles.labelText}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyles.input}>
        {options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
      </select>
    </label>
  );
}

function PipelineProgress() {
  const steps = [
    "Listening to the recording", "Extracting voice features",
    "AI sound recognition", "Language analysis",
    "Checking each sound", "Word structure + mental effort",
    "Rhythm & flow check", "Fluency check", "Voice clarity check", "Mother tongue influence check",
  ];
  return (
    <div style={pipeStyles.wrap}>
      <div style={pipeStyles.line} />
      {steps.map((s, i) => (
        <div key={i} style={{ ...pipeStyles.step, animationDelay: `${i * 0.15}s` }}>
          <div style={pipeStyles.dot} />
          <span style={pipeStyles.text}>{s}</span>
        </div>
      ))}
    </div>
  );
}

const pipeStyles = {
  wrap: { background: "#fafafa", border: "1px solid #eee", borderRadius: 16, padding: "32px 40px", margin: "24px 0", position: "relative" },
  line: { position: "absolute", left: 52, top: 32, bottom: 32, width: 2, background: "#ddd" },
  step: { display: "flex", alignItems: "center", gap: 16, padding: "8px 0", animation: "fadeSlide 0.5s ease both" },
  dot: { width: 12, height: 12, borderRadius: "50%", background: "#000", flexShrink: 0, zIndex: 1, border: "2px solid #fff", boxSizing: "content-box" },
  text: { color: "#000", fontSize: 15, fontWeight: 500 },
};

const fieldStyles = {
  label: { display: "flex", flexDirection: "column", gap: 8, flex: "1 1 180px" },
  labelText: { fontSize: 14, fontWeight: 600, color: "#444" },
  input: {
    padding: "12px 16px", border: "1px solid #ddd", borderRadius: 10, fontSize: 15,
    color: "#000", background: "#fff", outline: "none", transition: "border 0.2s",
  },
};

/* ── Styles ── */

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  ::selection { background: #000; color: #fff; }
  @keyframes fadeSlide { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
  input:focus, select:focus { border-color: #000 !important; box-shadow: 0 0 0 1px #000; }
`;

const styles = {
  app: { minHeight: "100vh", background: "#fff", color: "#111" },

  // Nav
  nav: { padding: "0 40px", background: "#fff", position: "sticky", top: 0, zIndex: 100 },
  navInner: { display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1400, margin: "0 auto", height: 80 },
  
  navLeft: { display: "flex", alignItems: "center", gap: 40 },
  logo: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
  logoIcon: { display: "flex", gap: 2 },
  logoColor1: { width: 8, height: 20, background: "#FF5A5F", borderRadius: 4 },
  logoColor2: { width: 8, height: 20, background: "#FFB400", borderRadius: 4, transform: "translateY(4px)" },
  logoColor3: { width: 8, height: 20, background: "#00A699", borderRadius: 4, transform: "translateY(8px)" },
  logoText: { fontSize: 24, fontWeight: 800, color: "#000", letterSpacing: -1 },

  navCenter: { display: "flex", alignItems: "center" },
  
  navRight: { display: "flex", alignItems: "center", gap: 24 },
  navTextLink: { color: "#333", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  navLinkApp: { background: "transparent", border: "none", color: "#333", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  navSignUpBtn: { background: "#000", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 },

  // Hero Clay
  heroClay: { padding: "20px 40px 60px", display: "flex", flexDirection: "column", alignItems: "center" },
  heroClayInner: { 
    background: "#F9F9F8", borderRadius: 40, width: "100%", maxWidth: 1400, 
    minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative", overflow: "hidden", padding: "80px 40px"
  },
  decoLeft: { position: "absolute", left: 0, top: "20%", fontSize: 100, opacity: 0.9 },
  decoRight: { position: "absolute", right: 0, top: "10%", fontSize: 100, opacity: 0.9 },
  heroMCText: { maxWidth: 800, textAlign: "center", position: "relative", zIndex: 10 },
  heroShloka: {
    fontSize: 18, color: "#888", fontStyle: "italic", lineHeight: 1.8,
    marginBottom: 28, letterSpacing: 0.5, textAlign: "center",
  },
  heroMCHeadline: {
    fontSize: 72, fontWeight: 700, color: "#000",
    lineHeight: 1.05, marginBottom: 24, letterSpacing: "-2.5px"
  },
  heroMCSub: { fontSize: 20, color: "#555", lineHeight: 1.5, marginBottom: 40, maxWidth: 600, margin: "0 auto 40px" },
  heroMCBtn: {
    padding: "18px 36px", background: "#000", color: "#fff", border: "none",
    borderRadius: 12, fontSize: 18, fontWeight: 600, cursor: "pointer", transition: "transform 0.2s"
  },

  trustedSection: { marginTop: 60, textAlign: "center" },
  trustedText: { fontSize: 12, fontWeight: 700, color: "#888", letterSpacing: 1.5 },
  trustedLogos: { display: "flex", justifyContent: "center", alignItems: "center", gap: 40, marginTop: 24, flexWrap: "wrap", fontSize: 24, fontWeight: 700, opacity: 0.8 },

  // Features
  features: { padding: "80px 40px", maxWidth: 1200, margin: "0 auto" },
  sectionTitle: { fontSize: 40, fontWeight: 800, color: "#000", textAlign: "center", marginBottom: 12, letterSpacing: "-1px" },
  sectionSubtitle: { fontSize: 18, color: "#555", textAlign: "center", marginBottom: 60, maxWidth: 600, margin: "0 auto 60px" },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 24 },
  featureCard: {
    padding: 32, borderRadius: 24, border: "1px solid #eaeaea", background: "#fff",
    boxShadow: "0 4px 20px rgba(0,0,0,0.03)", transition: "all 0.2s", cursor: "default",
  },
  featureIcon: {
    width: 48, height: 48, borderRadius: 12, background: "#f0f0f0", color: "#000",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, marginBottom: 20,
  },
  featureTitle: { fontSize: 18, fontWeight: 700, color: "#000", marginBottom: 8 },
  featureDesc: { fontSize: 15, color: "#555", lineHeight: 1.6 },

  // Page sections
  pageSection: { maxWidth: 1100, margin: "0 auto", padding: "60px 24px 80px" },
  pageHeader: { marginBottom: 40 },
  pageTitle: { fontSize: 36, fontWeight: 800, color: "#000", marginBottom: 8, letterSpacing: "-1px" },
  pageSubtitle: { fontSize: 18, color: "#555" },
  inputRow: { display: "flex", gap: 20, marginBottom: 32, flexWrap: "wrap" },
  spectroSection: { marginBottom: 24 },
  btnRow: { display: "flex", gap: 16, marginBottom: 32 },
  primaryBtn: {
    padding: "14px 32px", background: "#000", color: "#fff", border: "none",
    borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
  },
  btnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  secondaryBtn: {
    padding: "14px 32px", background: "transparent", color: "#000", border: "2px solid #000",
    borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer",
  },
  dangerBtn: {
    padding: "14px 32px", background: "#dc2626", color: "#fff", border: "none",
    borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer",
  },
  resultSection: { marginTop: 40 },
  dualGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 },

  // Storage
  storageBar: { marginBottom: 24 },
  storageBarInner: { height: 12, background: "#eee", borderRadius: 6, overflow: "hidden" },
  storageBarFill: { height: "100%", background: "#000", borderRadius: 6, transition: "width 0.3s" },
  storageLabel: { fontSize: 13, color: "#555", marginTop: 8, display: "block" },
  storageHeading: { fontSize: 20, fontWeight: 700, color: "#000", marginBottom: 16 },
  emptyText: { fontSize: 15, color: "#888", marginBottom: 20 },
  sessionList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 },
  sessionCard: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 24px", border: "1px solid #eee", borderRadius: 16, background: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.02)"
  },
  sessionInfo: { display: "flex", flexDirection: "column", gap: 4 },
  sessionName: { fontSize: 16, fontWeight: 700, color: "#000" },
  sessionMeta: { fontSize: 14, color: "#555" },
  sessionDate: { fontSize: 13, color: "#888" },
  sessionActions: { display: "flex", gap: 12 },
  smallBtn: {
    padding: "8px 20px", background: "#f5f5f5", color: "#000", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  smallDangerBtn: {
    padding: "8px 20px", background: "#fee", color: "#dc2626", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  errorBanner: {
    background: "#fee", border: "1px solid #fcc", padding: "16px 24px", display: "flex",
    justifyContent: "space-between", alignItems: "center", color: "#c00", fontSize: 15, margin: "24px",
    borderRadius: 12
  },
  errorDismiss: { background: "transparent", border: "1px solid #c00", borderRadius: 8, padding: "6px 16px", cursor: "pointer", color: "#c00", fontSize: 13, fontWeight: 600 },

  // Footer
  footer: { borderTop: "1px solid #eee", padding: "40px", background: "#fff", marginTop: 40 },
  footerInner: { maxWidth: 1400, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" },
  footerCredit: { fontSize: 15, fontWeight: 600, color: "#555" },

  // Company Page
  companySection: { minHeight: "calc(100vh - 160px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 40px", background: "#f9f9f8" },
  companyInner: { maxWidth: 800, background: "#fff", padding: "60px", borderRadius: 32, boxShadow: "0 10px 40px rgba(0,0,0,0.05)" },
  companyTitle: { fontSize: 48, fontWeight: 800, color: "#000", marginBottom: 32, letterSpacing: "-1.5px" },
  companyText: { fontSize: 18, color: "#444", lineHeight: 1.8, marginBottom: 24 },

  // Product Page
  productGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginTop: 40 },
  productCard: { background: "#fafafa", border: "1px solid #eaeaea", borderRadius: 24, padding: "32px 24px" },
  productIcon: { fontSize: 32, marginBottom: 16 },
  productCardTitle: { fontSize: 20, fontWeight: 700, color: "#000", marginBottom: 12 },
  productCardDesc: { fontSize: 15, color: "#555", lineHeight: 1.6 },
};

const batchStyles = {
  dropZone: {
    border: '2px dashed #d0d0d0',
    borderRadius: 20,
    padding: '48px 32px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.25s',
    background: '#fafafa',
    marginBottom: 24,
  },
  dropIcon: {
    marginBottom: 16,
    display: 'flex',
    justifyContent: 'center',
  },
  dropText: {
    fontSize: 17,
    fontWeight: 600,
    color: '#333',
    marginBottom: 8,
  },
  dropHint: {
    fontSize: 13,
    color: '#999',
  },
  fileList: {
    border: '1px solid #eee',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    background: '#fff',
  },
  fileListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    background: '#f8f8f8',
    borderBottom: '1px solid #eee',
  },
  fileListTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#333',
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#999',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #f5f5f5',
    transition: 'background 0.15s',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#000',
    display: 'block',
  },
  fileSize: {
    fontSize: 12,
    color: '#999',
    display: 'block',
    marginTop: 2,
  },
  fileActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 6,
    letterSpacing: 0.3,
  },
  statusPending: {
    background: '#fff8e1',
    color: '#f59e0b',
  },
  statusCompleted: {
    background: '#e6f9f0',
    color: '#00A699',
  },
  statusFailed: {
    background: '#fee',
    color: '#dc2626',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: 'none',
    background: '#f5f5f5',
    color: '#999',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  progressSection: {
    marginBottom: 24,
    padding: '20px 24px',
    background: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 16,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000',
  },
  progressTrack: {
    height: 8,
    background: '#e5e5e5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#000',
    borderRadius: 4,
    transition: 'width 0.4s ease',
  },
  resultsSection: {
    marginTop: 40,
  },
  resultsTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#000',
    marginBottom: 24,
    letterSpacing: '-0.5px',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },
  resultCard: {
    border: '1px solid #e5e5e5',
    borderRadius: 16,
    padding: '20px 24px',
    background: '#fff',
    boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
  },
  resultCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  resultCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: '#e6f9f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultFileName: {
    fontSize: 14,
    fontWeight: 700,
    color: '#000',
    display: 'block',
  },
  resultJobId: {
    fontSize: 12,
    color: '#999',
    display: 'block',
    marginTop: 2,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  viewProfileBtn: {
    width: '100%',
    padding: '10px 16px',
    background: '#f5f5f5',
    color: '#000',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
    textAlign: 'center',
  },
};

const authStyles = {
  wrap: {
    display: "flex", justifyContent: "center", alignItems: "center",
    minHeight: "calc(100vh - 80px)", background: "#fff", padding: "40px",
  },
  card: {
    background: "#fff", borderRadius: 24, padding: "48px 40px", width: 420,
    border: "1px solid #eaeaea", boxShadow: "0 10px 40px rgba(0,0,0,0.05)"
  },
  title: { fontSize: 28, fontWeight: 800, color: "#000", marginBottom: 8, letterSpacing: "-1px" },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 32 },
  error: {
    background: "#fee", border: "1px solid #fcc", color: "#c00",
    padding: "12px 16px", borderRadius: 8, fontSize: 14, marginBottom: 20,
  },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  input: {
    padding: "14px 16px", border: "1px solid #ddd", borderRadius: 12, fontSize: 15,
    color: "#000", background: "#fff", outline: "none", transition: "border 0.2s",
  },
  btn: {
    padding: "16px", background: "#000", color: "#fff", border: "none",
    borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 8,
  },
  toggle: { textAlign: "center", fontSize: 14, color: "#555", marginTop: 24 },
  toggleLink: { color: "#000", fontWeight: 600, cursor: "pointer" },
};
