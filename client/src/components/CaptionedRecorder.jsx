import React, { useEffect, useRef, useState, useCallback } from "react";

const SpeechRecognitionImpl =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

// Mobile / TWA detection. Web Speech API on Android Chrome is unreliable
// (intermittent permission flow, missing punctuation, mid-utterance drops)
// and the live caption strip is purely a UX nicety — the real transcript
// comes from Whisper on the engine, which scores correctly regardless. We
// hide the caption panel entirely on mobile to avoid users thinking
// "Vaani didn't hear me" when actually the recording is fine.
const isMobile =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)")?.matches ||
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    /android|iphone|ipad|ipod/i.test(navigator?.userAgent || ""));

export default function CaptionedRecorder({
  prepSec = 0,
  responseSec = 120,
  responseMinSec = 60,
  onComplete,
  lang = "en-US",
}) {
  const [phase, setPhaseState] = useState(prepSec > 0 ? "prep" : "idle");
  // phaseRef mirrors the latest phase so async callbacks (notably the
  // SpeechRecognition.onend handler that closes over phase at the time it
  // was attached) see the current value. Without this, onend kept reading
  // the phase from when the recognizer was started — so transitioning to
  // "stopped" mid-utterance would silently restart recognition.
  const phaseRef = useRef(prepSec > 0 ? "prep" : "idle");
  const setPhase = useCallback((p) => {
    phaseRef.current = typeof p === "function" ? p(phaseRef.current) : p;
    setPhaseState(phaseRef.current);
  }, []);
  const [secondsLeft, setSecondsLeft] = useState(prepSec > 0 ? prepSec : responseSec);
  // Actual elapsed seconds while recording, captured from a Date.now() delta
  // when the recorder stops. Doesn't rely on secondsLeft, which can be stale
  // due to React's state-update batching across the prep→recording handoff.
  const [recordedSec, setRecordedSec] = useState(0);
  const [finalCaption, setFinalCaption] = useState("");
  const [interimCaption, setInterimCaption] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recError, setRecError] = useState(null);
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const recordStartRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);

  const captionsSupported = !!SpeechRecognitionImpl;

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopLevelMeter = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startLevelMeter = (stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      // level meter is best-effort
    }
  };

  const startRecognition = useCallback(() => {
    if (!SpeechRecognitionImpl) return;
    const rec = new SpeechRecognitionImpl();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (e) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      if (finalText) setFinalCaption((prev) => (prev + " " + finalText).trim());
      setInterimCaption(interim);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (recognitionRef.current === rec && phaseRef.current === "recording") {
        try { rec.start(); } catch {}
      }
    };
    recognitionRef.current = rec;
    try { rec.start(); } catch {}
  }, [lang]);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.onend = null; rec.stop(); } catch {}
    }
    setInterimCaption("");
  }, []);

  const stopRecording = useCallback(() => {
    clearTimer();
    stopRecognition();
    stopLevelMeter();
    if (recordStartRef.current) {
      const elapsed = Math.max(0, Math.round((Date.now() - recordStartRef.current) / 1000));
      setRecordedSec(elapsed);
      recordStartRef.current = null;
    }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopRecognition]);

  const startRecording = useCallback(async () => {
    setRecError(null);
    setFinalCaption("");
    setInterimCaption("");
    setAudioBlob(null);
    setAudioUrl(null);
    try {
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
      startLevelMeter(stream);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 256000 });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = mr;
      mr.start(1000);
      recordStartRef.current = Date.now();
      setRecordedSec(0);
      startRecognition();
      setPhase("recording");
      setSecondsLeft(responseSec);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stopRecording();
            setPhase("review");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e) {
      setRecError(e?.message || "Microphone access failed");
      setPhase("idle");
    }
  }, [responseSec, startRecognition, stopRecording]);

  useEffect(() => {
    if (phase !== "prep") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearTimer();
          startRecording();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, startRecording]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopRecognition();
      stopLevelMeter();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stopRecognition]);

  const handleFinish = () => {
    stopRecording();
    setPhase("review");
  };

  const handleSubmit = () => {
    if (audioBlob && onComplete) {
      onComplete({ blob: audioBlob, transcript: finalCaption.trim() });
    }
  };

  const handleRetry = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setFinalCaption("");
    setInterimCaption("");
    setRecordedSec(0);
    setSecondsLeft(prepSec > 0 ? prepSec : responseSec);
    setPhase(prepSec > 0 ? "prep" : "idle");
  };

  const displaySec = phase === "review" ? recordedSec : secondsLeft;
  const mm = String(Math.floor(displaySec / 60)).padStart(2, "0");
  const ss = String(displaySec % 60).padStart(2, "0");
  const tooShort = audioBlob && responseMinSec && recordedSec < responseMinSec;

  return (
    <div className="tp-recorder">
      <div className="tp-timer-row">
        <div className={`tp-timer ${phase === "prep" ? "tp-timer--prep" : ""} ${phase === "recording" ? "tp-timer--live" : ""}`}>
          <span className="tp-timer-label">
            {phase === "prep" && "Preparation"}
            {phase === "recording" && "Recording"}
            {phase === "review" && "Response captured"}
            {phase === "idle" && "Ready"}
          </span>
          <span className="tp-timer-value">{mm}:{ss}</span>
        </div>
        {phase === "recording" && (
          <div className="tp-level">
            <div className="tp-level-bar" style={{ width: `${level * 100}%` }} />
          </div>
        )}
      </div>

      {recError && <div className="tp-alert tp-alert--error">{recError}</div>}

      {phase === "idle" && (
        <div className="tp-action-row">
          <button className="tp-btn tp-btn--primary" onClick={startRecording}>
            Start recording
          </button>
          <span className="tp-hint">Mic access required. No data leaves your browser until you submit.</span>
        </div>
      )}

      {phase === "prep" && (
        <div className="tp-action-row">
          <span className="tp-hint">Use this time to note your key points. Recording will begin automatically.</span>
          <button className="tp-btn tp-btn--ghost" onClick={() => { clearTimer(); startRecording(); }}>
            Skip and start now
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="tp-action-row">
          <button className="tp-btn tp-btn--stop" onClick={handleFinish}>
            Finish early
          </button>
          <span className="tp-hint">Speak clearly. Captions may not display in Firefox (recording still works).</span>
        </div>
      )}

      {phase === "review" && (
        <div className="tp-action-row">
          {audioUrl && <audio className="tp-audio" src={audioUrl} controls />}
          <button className="tp-btn tp-btn--primary" onClick={handleSubmit} disabled={!audioBlob}>
            Submit for scoring
          </button>
          <button className="tp-btn tp-btn--ghost" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {tooShort && (
        <div className="tp-alert tp-alert--warn">
          Your response is shorter than the recommended {responseMinSec}s for this task. Short samples produce unreliable band estimates.
        </div>
      )}

      {!isMobile && (
        <div className="tp-caption-panel" aria-live="polite">
          <div className="tp-caption-heading">
            Live captions {captionsSupported
              ? "(preview — your scoring transcript uses Whisper)"
              : "(needs Chrome / Edge — your audio still records and scores fine)"}
          </div>
          <div className="tp-caption-body">
            <span className="tp-caption-final">{finalCaption}</span>
            <span className="tp-caption-interim"> {interimCaption}</span>
            {!finalCaption && !interimCaption && phase === "recording" && (
              <span className="tp-caption-placeholder">Listening…</span>
            )}
            {!finalCaption && !interimCaption && phase !== "recording" && (
              <span className="tp-caption-placeholder">Captions will appear here while you speak.</span>
            )}
          </div>
        </div>
      )}
      {isMobile && phase === "recording" && (
        <div className="tp-mobile-listening">
          <span className="tp-mobile-listening-dot" /> Listening — your audio is captured cleanly. Full transcript appears with the report.
        </div>
      )}
    </div>
  );
}
