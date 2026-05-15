import React from "react";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage({ onHome }) {
  const navigate = useNavigate();
  const handleHome = onHome || (() => navigate("/"));
  return (
    <section className="tp-info tp-404">
      <div className="tp-404-mark">404</div>
      <h1 className="tp-info-h1">Lost the plot</h1>
      <p className="tp-info-lede">
        That page isn't part of Vaani. It might have moved, been renamed, or never existed in the first place.
      </p>
      <div className="tp-action-row">
        <button className="tp-btn tp-btn--primary" onClick={handleHome}>Take me home</button>
      </div>
    </section>
  );
}
