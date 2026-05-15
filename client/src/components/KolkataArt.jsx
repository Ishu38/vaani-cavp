import React from "react";

/**
 * Kolkata heritage hero backdrop — inline SVG (no external assets).
 *
 * Silhouette scene layered back-to-front:
 *   - sky gradient (warm dawn over the Hooghly)
 *   - distant skyline: Victoria Memorial dome, St Paul's spire,
 *     Writers' Building, colonial row
 *   - Howrah Bridge cantilever (right side, iconic)
 *   - river with light ripples
 *   - foreground: a tram carriage and a yellow Ambassador taxi
 *   - subtle Kalighat-pat line motif as a horizontal divider band
 *
 * Styled through the .kh-root var-driven palette so the whole scene
 * shifts with the site theme.
 */
export default function KolkataArt() {
  return (
    <div className="kh-root" aria-hidden="true">
      <svg
        viewBox="0 0 1600 700"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="kh-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbe4b8" />
            <stop offset="35%" stopColor="#f5c783" />
            <stop offset="75%" stopColor="#e08f4a" />
            <stop offset="100%" stopColor="#8a3c1f" />
          </linearGradient>
          <linearGradient id="kh-river" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a3512" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#2a1408" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="kh-sun" cx="0.75" cy="0.28" r="0.18">
            <stop offset="0%" stopColor="#fff3d4" stopOpacity="1" />
            <stop offset="60%" stopColor="#fbc06a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fbc06a" stopOpacity="0" />
          </radialGradient>
          <pattern id="kh-grain" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="transparent" />
            <circle cx="1" cy="1" r="0.35" fill="#000" opacity="0.035" />
            <circle cx="3" cy="3" r="0.35" fill="#fff" opacity="0.04" />
          </pattern>
        </defs>

        {/* Sky */}
        <rect x="0" y="0" width="1600" height="700" fill="url(#kh-sky)" />
        <rect x="0" y="0" width="1600" height="700" fill="url(#kh-sun)" />

        {/* Distant hills / horizon haze */}
        <path
          d="M0,360 L80,350 L160,360 L260,340 L380,355 L520,345 L680,360 L820,350 L960,358 L1120,340 L1280,352 L1440,342 L1600,356 L1600,420 L0,420 Z"
          fill="#3a1d0a"
          opacity="0.35"
        />

        {/* Skyline — colonial row with domes and spires */}
        <g fill="#2a1408" opacity="0.88">
          {/* Writers' Building block */}
          <rect x="70" y="320" width="190" height="100" />
          <rect x="72" y="314" width="12" height="10" />
          <rect x="90" y="314" width="12" height="10" />
          <rect x="108" y="314" width="12" height="10" />
          <rect x="126" y="314" width="12" height="10" />
          <rect x="144" y="314" width="12" height="10" />
          <rect x="162" y="314" width="12" height="10" />
          <rect x="180" y="314" width="12" height="10" />
          <rect x="198" y="314" width="12" height="10" />
          <rect x="216" y="314" width="12" height="10" />
          <rect x="234" y="314" width="12" height="10" />

          {/* St Paul's Cathedral spire */}
          <rect x="300" y="270" width="34" height="150" />
          <polygon points="300,270 317,228 334,270" />
          <rect x="312" y="216" width="10" height="14" />
          <polygon points="312,216 317,202 322,216" />

          {/* Mid-rise row */}
          <rect x="360" y="330" width="60" height="90" />
          <rect x="425" y="312" width="80" height="108" />
          <rect x="512" y="324" width="46" height="96" />
          <rect x="566" y="300" width="70" height="120" />

          {/* Victoria Memorial — central dome cluster */}
          <rect x="660" y="322" width="200" height="98" />
          <circle cx="760" cy="300" r="56" />
          <rect x="756" y="232" width="8" height="30" />
          <polygon points="754,232 760,214 766,232" />
          <circle cx="690" cy="320" r="24" />
          <circle cx="830" cy="320" r="24" />

          {/* High Court area */}
          <rect x="880" y="324" width="80" height="96" />
          <polygon points="880,324 920,286 960,324" />

          {/* GPO dome */}
          <rect x="975" y="330" width="120" height="90" />
          <circle cx="1035" cy="310" r="30" />
          <rect x="1032" y="266" width="6" height="24" />

          {/* Low row before the bridge */}
          <rect x="1110" y="340" width="60" height="80" />
          <rect x="1175" y="328" width="45" height="92" />
        </g>

        {/* Howrah Bridge — cantilever silhouette on the right */}
        <g stroke="#2a1408" strokeWidth="5" fill="none" opacity="0.92">
          {/* Deck */}
          <line x1="1220" y1="392" x2="1590" y2="392" />
          {/* Main towers */}
          <polygon points="1240,392 1270,392 1260,200 1250,200" fill="#2a1408" stroke="none" />
          <polygon points="1520,392 1550,392 1540,200 1530,200" fill="#2a1408" stroke="none" />
          {/* Top chord (cantilever trusses) */}
          <path d="M1255,200 C1320,260 1390,276 1460,260 C1510,248 1530,220 1535,200" />
          {/* Vertical truss members */}
          <line x1="1280" y1="392" x2="1280" y2="238" />
          <line x1="1320" y1="392" x2="1320" y2="268" />
          <line x1="1370" y1="392" x2="1370" y2="276" />
          <line x1="1420" y1="392" x2="1420" y2="272" />
          <line x1="1470" y1="392" x2="1470" y2="260" />
          <line x1="1510" y1="392" x2="1510" y2="226" />
          {/* Diagonals */}
          <line x1="1255" y1="204" x2="1320" y2="268" />
          <line x1="1320" y1="268" x2="1370" y2="276" />
          <line x1="1370" y1="276" x2="1420" y2="272" />
          <line x1="1420" y1="272" x2="1470" y2="260" />
          <line x1="1470" y1="260" x2="1535" y2="204" />
          <line x1="1280" y1="238" x2="1320" y2="392" />
          <line x1="1320" y1="268" x2="1370" y2="392" />
          <line x1="1370" y1="276" x2="1420" y2="392" />
          <line x1="1420" y1="272" x2="1470" y2="392" />
          <line x1="1470" y1="260" x2="1510" y2="392" />
          {/* Pier extension into river */}
          <rect x="1248" y="392" width="14" height="60" fill="#2a1408" stroke="none" />
          <rect x="1528" y="392" width="14" height="60" fill="#2a1408" stroke="none" />
        </g>

        {/* Hooghly river */}
        <rect x="0" y="420" width="1600" height="280" fill="url(#kh-river)" />

        {/* River ripples */}
        <g stroke="#fbc06a" strokeOpacity="0.18" strokeWidth="1.5" fill="none">
          <path d="M60,480 Q120,472 180,480 T300,480" />
          <path d="M420,500 Q480,492 540,500 T660,500" />
          <path d="M900,488 Q960,480 1020,488 T1140,488" />
          <path d="M200,540 Q260,532 320,540 T440,540" />
          <path d="M700,560 Q760,552 820,560 T940,560" />
          <path d="M1080,548 Q1140,540 1200,548 T1320,548" />
          <path d="M400,600 Q460,592 520,600 T640,600" />
          <path d="M900,612 Q960,604 1020,612 T1140,612" />
        </g>

        {/* Foreground embankment */}
        <rect x="0" y="612" width="1600" height="90" fill="#2a1408" opacity="0.92" />

        {/* Tram (left foreground) */}
        <g transform="translate(120,548)" fill="#c8553d">
          <rect x="0" y="0" width="210" height="54" rx="6" />
          <rect x="8" y="8" width="30" height="18" fill="#fbe4b8" opacity="0.8" />
          <rect x="44" y="8" width="30" height="18" fill="#fbe4b8" opacity="0.8" />
          <rect x="80" y="8" width="30" height="18" fill="#fbe4b8" opacity="0.8" />
          <rect x="116" y="8" width="30" height="18" fill="#fbe4b8" opacity="0.8" />
          <rect x="152" y="8" width="50" height="18" fill="#fbe4b8" opacity="0.8" />
          <rect x="-6" y="48" width="222" height="8" fill="#1c0a04" />
          <circle cx="30" cy="62" r="8" fill="#1c0a04" />
          <circle cx="180" cy="62" r="8" fill="#1c0a04" />
          {/* Pantograph */}
          <line x1="100" y1="0" x2="100" y2="-18" stroke="#1c0a04" strokeWidth="2" />
          <line x1="92" y1="-18" x2="108" y2="-18" stroke="#1c0a04" strokeWidth="2" />
        </g>

        {/* Ambassador taxi (mid-right foreground) */}
        <g transform="translate(980,560)" fill="#d4a84b">
          <path d="M0,42 L14,20 C22,8 40,2 60,2 L120,2 C140,2 156,8 162,20 L176,42 Z" />
          <rect x="-4" y="38" width="188" height="14" rx="2" />
          <rect x="24" y="12" width="36" height="22" fill="#fbe4b8" opacity="0.7" />
          <rect x="64" y="12" width="36" height="22" fill="#fbe4b8" opacity="0.7" />
          <rect x="104" y="12" width="42" height="22" fill="#fbe4b8" opacity="0.7" />
          <circle cx="40" cy="54" r="10" fill="#1c0a04" />
          <circle cx="140" cy="54" r="10" fill="#1c0a04" />
          <circle cx="40" cy="54" r="4" fill="#d4a84b" />
          <circle cx="140" cy="54" r="4" fill="#d4a84b" />
        </g>

        {/* Overhead wires */}
        <g stroke="#1c0a04" strokeOpacity="0.5" strokeWidth="1.2">
          <line x1="0" y1="540" x2="1600" y2="530" />
          <line x1="0" y1="535" x2="1600" y2="525" />
        </g>

        {/* Kalighat pat-inspired border flourish across the bottom */}
        <g transform="translate(0,690)" fill="none" stroke="#fbc06a" strokeOpacity="0.35" strokeWidth="1">
          <path d="M0,6 Q40,-4 80,6 T160,6 T240,6 T320,6 T400,6 T480,6 T560,6 T640,6 T720,6 T800,6 T880,6 T960,6 T1040,6 T1120,6 T1200,6 T1280,6 T1360,6 T1440,6 T1520,6 T1600,6" />
        </g>

        {/* Paper grain texture overlay */}
        <rect x="0" y="0" width="1600" height="700" fill="url(#kh-grain)" />
      </svg>
    </div>
  );
}
