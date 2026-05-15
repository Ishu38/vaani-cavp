import React from "react";

export function SkeletonLine({ width = "100%", height = 14, className = "" }) {
  return (
    <span
      className={`tp-skeleton tp-skeleton-line ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ height = 80, className = "" }) {
  return (
    <div
      className={`tp-skeleton tp-skeleton-block ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}

// Skeletons are presentational: they announce themselves to screen readers
// (role=status + aria-live=polite + sr-only label) but do NOT carry
// aria-busy. The parent that toggles between skeleton and real content
// owns aria-busy so screen readers see the busy state on the *content*
// region rather than on the placeholder that is about to disappear.

export function PromptsSkeleton() {
  return (
    <div className="tp-skeleton-stack" role="status" aria-live="polite">
      <span className="tp-sr-only">Loading prompts</span>
      <SkeletonLine width="40%" height={16} />
      <SkeletonBlock height={48} />
      <SkeletonBlock height={140} />
      <SkeletonBlock height={64} />
    </div>
  );
}

export function ResultSkeleton() {
  return (
    <div className="tp-skeleton-stack" role="status" aria-live="polite">
      <span className="tp-sr-only">Loading result</span>
      <SkeletonBlock height={120} />
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
    </div>
  );
}

export function AnalyzingSkeleton({ etaSec = 30 }) {
  return (
    <div className="tp-analyzing" role="status" aria-live="polite">
      <div className="tp-spinner" />
      <div>
        <div className="tp-analyzing-title">Analyzing your response…</div>
        <div className="tp-analyzing-sub">
          Forced alignment, formant extraction, band mapping. Typically {etaSec}s — please don't close this tab.
        </div>
      </div>
    </div>
  );
}
