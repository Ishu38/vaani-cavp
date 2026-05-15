import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ContactPage() {
  const navigate = useNavigate();
  const address = "55/1 Jubilee Park, Tollygunge, Kolkata 700033, West Bengal, India";
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=m&z=15&ie=UTF8&iwloc=B&output=embed`;

  const [form, setForm] = useState({ name: "", email: "", org: "", topic: "Pilot enquiry", message: "" });
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();
    const subject = `[Vaani] ${form.topic} — ${form.name || "Enquiry"}`;
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      form.org ? `Organisation: ${form.org}` : null,
      `Topic: ${form.topic}`,
      "",
      form.message,
    ].filter(Boolean).join("\n");
    window.location.href = `mailto:neilshankarray@vaaani.in?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return (
    <section className="tp-info">
      <button className="tp-btn tp-btn--ghost tp-btn--sm" onClick={() => navigate("/")}>← Back</button>
      <h1 className="tp-info-h1">Contact Us</h1>
      <p className="tp-info-lede">
        For pilot engagements, coaching-institute licensing, or research collaboration — please reach out by email
        or post. We respond to business enquiries within two working days.
      </p>

      <div className="tp-contact-grid">
        <div className="tp-info-card">
          <div className="tp-info-card-title">Correspondence address</div>
          <address className="tp-address">
            <b>Neil Shankar Ray</b><br />
            C/o Mrs. Chinu Ray<br />
            55/1, Jubilee Park<br />
            Tollygunge, Kolkata-33<br />
            West Bengal, India
          </address>

          <div className="tp-info-card-title" style={{ marginTop: 22 }}>Email</div>
          <p><a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a></p>

          <div className="tp-info-card-title" style={{ marginTop: 22 }}>Professional</div>
          <p>
            <a href="https://www.linkedin.com/in/neilsray" target="_blank" rel="noreferrer" className="tp-link">
              LinkedIn — /in/neilsray
            </a>
          </p>
        </div>

        <div className="tp-map-card">
          <iframe
            title="Vaani — correspondence address on Google Maps"
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="tp-map-iframe"
          />
          <div className="tp-map-caption">
            Map data © Google. {address}.{" "}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="tp-link"
            >
              Open in Google Maps ↗
            </a>
          </div>
        </div>
      </div>

      <form className="tp-info-card tp-info-card--wide tp-contact-form" onSubmit={onSubmit}>
        <div className="tp-info-card-title">Send a message</div>
        <p className="tp-info-muted">
          Submitting opens your email client with a pre-filled draft to neilshankarray@vaaani.in. We reply within two
          working days.
        </p>
        <div className="tp-form-grid">
          <label className="tp-form-field">
            <span>Your name</span>
            <input className="tp-input" value={form.name} onChange={set("name")} placeholder="Full name" required />
          </label>
          <label className="tp-form-field">
            <span>Email</span>
            <input className="tp-input" type="email" value={form.email} onChange={set("email")} placeholder="you@domain.com" required />
          </label>
          <label className="tp-form-field">
            <span>Organisation (optional)</span>
            <input className="tp-input" value={form.org} onChange={set("org")} placeholder="School, institute, or company" />
          </label>
          <label className="tp-form-field">
            <span>Topic</span>
            <select className="tp-input" value={form.topic} onChange={set("topic")}>
              <option>Pilot enquiry</option>
              <option>Coaching-institute licensing</option>
              <option>Research collaboration</option>
              <option>Press / media</option>
              <option>Other</option>
            </select>
          </label>
          <label className="tp-form-field tp-form-field--wide">
            <span>Message</span>
            <textarea
              className="tp-input tp-textarea"
              rows={6}
              value={form.message}
              onChange={set("message")}
              placeholder="Tell us about your students, timelines, or what you'd like Vaani to help with."
              required
            />
          </label>
        </div>
        <div className="tp-action-row" style={{ marginTop: 18 }}>
          <button type="submit" className="tp-btn tp-btn--primary">Open email draft</button>
        </div>
      </form>
    </section>
  );
}
