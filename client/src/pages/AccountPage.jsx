import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { refreshUser, updateProfile, uploadAvatar } from "../utils/api.js";

function initialsOf(name, email) {
  const src = (name || email || "").trim();
  if (!src) return "U";
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

const FIELDS = [
  { key: "name", label: "Full name", placeholder: "Neil Shankar Ray" },
  { key: "email", label: "Email", placeholder: "you@example.com", readOnly: true },
  { key: "phone", label: "Phone", placeholder: "+91 98765 43210", inputMode: "tel" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "nativeLanguage", label: "Native language (L1)", placeholder: "Bengali, Hindi, Tamil…" },
  {
    key: "preparingFor",
    label: "Preparing for",
    type: "select",
    options: [
      { value: "", label: "—" },
      { value: "ielts", label: "IELTS Speaking" },
      { value: "toefl", label: "TOEFL Speaking" },
    ],
  },
  { key: "targetBand", label: "Target band / score", placeholder: "e.g. 7.5" },
];

const ADDRESS_FIELDS = [
  { key: "line1", label: "Address line", placeholder: "House / street", wide: true },
  { key: "city", label: "City", placeholder: "Kolkata" },
  { key: "state", label: "State", placeholder: "West Bengal" },
  { key: "country", label: "Country", placeholder: "India" },
  { key: "pincode", label: "Pincode", placeholder: "700019", inputMode: "numeric" },
];

export default function AccountPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    refreshUser().then((u) => {
      if (alive && u) {
        setForm(buildForm(u));
      } else if (alive && user) {
        setForm(buildForm(user));
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return <Navigate to="/" replace />;
  if (!form) {
    return (
      <main className="tp-section">
        <div className="tp-card">Loading your account…</div>
      </main>
    );
  }

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (k, v) => setForm((f) => ({ ...f, address: { ...f.address, [k]: v } }));

  const onSave = async (e) => {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    const patch = {
      name: form.name,
      phone: form.phone,
      dob: form.dob,
      nativeLanguage: form.nativeLanguage,
      preparingFor: form.preparingFor,
      targetBand: form.targetBand,
      address: form.address,
    };
    try {
      const fresh = await updateProfile(patch);
      setForm(buildForm(fresh));
      setStatus("saved");
      // If this save came from the first-sign-in onboarding redirect, hop
      // straight to the recorder once the basics (dob + nativeLanguage) are
      // filled in. Otherwise stay on /account so the user can keep editing.
      if (isOnboarding && fresh?.dob && fresh?.nativeLanguage) {
        setTimeout(() => navigate("/practice/ielts", { replace: true }), 600);
      } else {
        setTimeout(() => setStatus("idle"), 1800);
      }
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Could not save your profile");
    }
  };

  const onAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const fresh = await uploadAvatar(file);
      setForm(buildForm(fresh));
    } catch (err) {
      setError(err?.message || "Could not upload avatar");
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <main className="tp-section">
      <div className="tp-card">
        <div className="tp-card-header">
          <div>
            <h1 className="tp-card-title">{isOnboarding ? "Welcome to Vaani" : "Your account"}</h1>
            <p className="tp-card-sub">
              {isOnboarding
                ? "Just a few details before your first mock. Your date of birth and native language are needed for accurate scoring; the rest helps us put your name on the report."
                : "Saved across every IELTS / TOEFL practice. Your name, mother tongue, and target band shape how Vaani scores you."}
            </p>
          </div>
        </div>

        <section className="tp-account-avatar">
          <div className="tp-account-avatar-circle">
            {form.avatarUrl ? (
              <img src={form.avatarUrl} alt="" />
            ) : (
              <span>{initialsOf(form.name, form.email)}</span>
            )}
          </div>
          <div>
            <button
              type="button"
              className="tp-btn tp-btn--secondary tp-btn--sm"
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
            >
              {avatarBusy ? "Uploading…" : form.avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={onAvatarPick}
            />
            <div className="tp-account-avatar-hint">PNG, JPEG, or WebP, up to 2&nbsp;MB.</div>
          </div>
        </section>

        <form className="tp-form-grid" onSubmit={onSave}>
          {FIELDS.map((f) => (
            <label key={f.key} className={`tp-form-field${f.wide ? " tp-form-field--wide" : ""}`}>
              <span>{f.label}</span>
              {f.type === "select" ? (
                <select
                  className="tp-input"
                  value={form[f.key] || ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="tp-input"
                  type={f.type || "text"}
                  inputMode={f.inputMode}
                  placeholder={f.placeholder}
                  value={form[f.key] || ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  readOnly={f.readOnly}
                  disabled={f.readOnly}
                />
              )}
            </label>
          ))}

          <div className="tp-form-field tp-form-field--wide">
            <span style={{ fontWeight: 600, marginTop: 6 }}>Address</span>
          </div>
          {ADDRESS_FIELDS.map((f) => (
            <label key={f.key} className={`tp-form-field${f.wide ? " tp-form-field--wide" : ""}`}>
              <span>{f.label}</span>
              <input
                className="tp-input"
                inputMode={f.inputMode}
                placeholder={f.placeholder}
                value={form.address?.[f.key] || ""}
                onChange={(e) => setAddr(f.key, e.target.value)}
              />
            </label>
          ))}

          <div className="tp-form-field tp-form-field--wide" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <button className="tp-btn tp-btn--primary" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </button>
            {status === "saved" && <span style={{ color: "var(--tp-accent)" }}>Saved.</span>}
            {error && <span style={{ color: "#c1432d" }}>{error}</span>}
          </div>
        </form>
      </div>
    </main>
  );
}

function buildForm(u) {
  return {
    name: u.name || "",
    email: u.email || "",
    avatarUrl: u.avatarUrl || "",
    phone: u.phone || "",
    dob: u.dob || "",
    nativeLanguage: u.nativeLanguage || "",
    preparingFor: u.preparingFor || "",
    targetBand: u.targetBand || "",
    address: {
      line1: u.address?.line1 || "",
      city: u.address?.city || "",
      state: u.address?.state || "",
      country: u.address?.country || "India",
      pincode: u.address?.pincode || "",
    },
  };
}
