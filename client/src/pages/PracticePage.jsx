import React from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import TestFlow from "../components/TestFlow.jsx";
import NotFoundPage from "./NotFoundPage.jsx";

const VALID_TEST_TYPES = new Set(["ielts", "toefl"]);

function SignInRequired({ testType, onRequireSignIn }) {
  const label = testType === "toefl" ? "TOEFL Speaking" : "IELTS Speaking";
  return (
    <main className="tp-section">
      <div className="tp-card">
        <div className="tp-card-header">
          <div>
            <h1 className="tp-card-title">Sign in to record your {label} mock</h1>
            <p className="tp-card-sub">
              Vaani saves every attempt to your account so you can track band trends and
              compare attempts. Your audio never leaves your device until you sign in,
              consent, and submit.
            </p>
          </div>
        </div>

        <div className="tp-action-row" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="tp-btn tp-btn--primary"
            onClick={() => onRequireSignIn?.("Sign in to record and save your mock.")}
          >
            Sign in with Google
          </button>
        </div>

        <ul className="tp-detail-notes" style={{ marginTop: 28, listStyle: "disc", paddingLeft: 18 }}>
          <li>One Google sign-in covers IELTS and TOEFL Speaking.</li>
          <li>Your recordings, transcripts, and scores are tied to your account, not your device.</li>
          <li>Until you sign in, the recorder is offline — no mic access, no upload.</li>
        </ul>
      </div>
    </main>
  );
}

export default function PracticePage() {
  const { testType } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext() || {};
  const { user, requireSignIn } = ctx;

  if (!VALID_TEST_TYPES.has(testType)) {
    return <NotFoundPage onHome={() => navigate("/")} />;
  }

  if (!user) {
    return <SignInRequired testType={testType} onRequireSignIn={requireSignIn} />;
  }

  return (
    <TestFlow
      testType={testType}
      onExit={() => navigate("/")}
      authed={!!user}
      user={user}
      onRequireSignIn={requireSignIn}
    />
  );
}
