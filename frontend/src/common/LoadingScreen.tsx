import React, { useState, useEffect } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  onComplete?: () => void;
  backgroundColor?: string;
  contained?: boolean;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

// Story arc: snap a photo → box it up → ship it → profit → enjoy the beach
const EMOJIS = ["👟", "📱", "📸", "📦", "✈️", "💵", "😊", "🏖️"] as const;
const N = EMOJIS.length;

const LOADING_LINES = [
  "Photographing your item...",
  "Listing your treasure...",
  "Finding the right buyer...",
  "Calculating a fair price...",
  "Packaging it up...",
  "Shipping across the country...",
  "Turning clutter into cash...",
  "Connecting seller to buyer...",
  "Making space in your home...",
  "Updating your balance...",
  "Avoiding eye contact at the post office...",
  "Arguing with bubble wrap...",
  "Pretending you knew what it was worth all along...",
  "Googling 'is this antique or just old'...",
  "Taking 47 photos of a mug...",
  "Haggling with a stranger named Dave...",
  "Reconsidering if you actually need the money...",
  "Explaining shipping to your mom...",
  "Resisting the urge to keep it...",
  "Writing 'rare find' with a straight face...",
  "Describing 'good condition' optimistically...",
  "Refreshing the sold notification...",
  "Winning the staring contest with your junk drawer...",
  "Wondering if the box counts as part of the listing...",
  "Convincing yourself $12 was a great deal...",
  "Printing a label for the first time ever...",
  "Talking yourself out of keeping it again...",
  "Measuring something with a shoe...",
  "Realizing you owned this for 8 years unused...",
  "Celebrating quietly at the kitchen table..."
] as const;

// ─── Timing & geometry ────────────────────────────────────────────────────────

// How long each emoji stays featured at the bottom of the orbit
const STEP_MS = 2000;
// CSS transition duration for orbit rotation (kept in sync with emoji counter-rotation)
const ORBIT_TRANSITION_MS = 750;
const TEXT_FADE_MS = 280;

// Orbit circle radius in px. Each emoji is centered at this distance from the origin.
const ORBIT_R = 62;
// Each step rotates the orbit by one slot
const DEG_PER_STEP = 360 / N; // 45°

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT_LINK_ID = "__ls_font__";

const CSS = `
  .ls-root {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    z-index: 9999;
    background-color: #1c1c1e;
  }

  /* Fixed-size stage so the orbit never bleeds out */
  .ls-orbit-stage {
    position: relative;
    width: ${ORBIT_R * 2 + 80}px;
    height: ${ORBIT_R * 2 + 80}px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* The rotating ring — CSS transition keeps the spin smooth */
  .ls-orbit {
    position: relative;
    width: ${ORBIT_R * 2}px;
    height: ${ORBIT_R * 2}px;
    transition: transform ${ORBIT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Each emoji is absolutely centered at the orbit origin, then translated outward */
  .ls-orbit-emoji {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 36px;
    height: 36px;
    margin-left: -18px;
    margin-top: -18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    line-height: 1;
    user-select: none;
    opacity: 0.25;
    /* transform is set inline; transition covers both the counter-rotation and scale */
    transition:
      transform ${ORBIT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1),
      opacity   ${ORBIT_TRANSITION_MS}ms ease;
  }

  .ls-orbit-emoji--featured {
    opacity: 1;
  }

  /* ── Loading text ─────────────────────────────────────── */

  .ls-text {
    position: fixed;
    bottom: 10vh;
    left: 0;
    right: 0;
    text-align: center;
    font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
    font-size: 16px;
    font-style: italic;
    color: #9a9187;
    letter-spacing: 0.025em;
    padding: 0 32px;
    transition: opacity ${TEXT_FADE_MS}ms ease;
    pointer-events: none;
    user-select: none;
  }

  .ls-text--visible { opacity: 1; }
  .ls-text--hidden  { opacity: 0; }

  /* ── Mobile ───────────────────────────────────────────── */

  @media (max-width: 600px) {
    .ls-text { font-size: 14px; bottom: 8vh; }
  }

  /* ── Contained mode: fills the nearest position:relative parent ── */

  .ls-root--contained {
    position: absolute;
    inset: 0;
    z-index: 10;
    background-color: #1c1c1e;
  }
  .ls-root--contained .ls-text {
    position: absolute;
    bottom: 6%;
    font-size: 13px;
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoadingScreen({
  onComplete,
  backgroundColor = "#F5F2EE",
  contained = false
}: LoadingScreenProps): React.ReactElement {
  // Which emoji is currently at the bottom of the orbit (the featured one)
  const [emojiIndex, setEmojiIndex] = useState(0);
  // Cumulative orbit rotation. Starts at 180° so emoji 0 (👟) opens at the bottom.
  // Decreases by DEG_PER_STEP each step so the orbit spins clockwise continuously.
  const [orbitRot, setOrbitRot] = useState(180);
  const [textIndex, setTextIndex] = useState(0);
  const [textVisible, setTextVisible] = useState(true);

  // Inject Google Fonts link once, signal parent on unmount
  useEffect(() => {
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement("link");
      link.id = FONT_LINK_ID;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&display=swap";
      document.head.appendChild(link);
    }
    return () => {
      onComplete?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance the featured emoji on a fixed interval
  useEffect(() => {
    const timer = setTimeout(() => {
      setEmojiIndex(i => (i + 1) % N);
      // Each step rotates the orbit one slot counter-clockwise (visually: next emoji
      // travels to the bottom spotlight position)
      setOrbitRot(prev => prev - DEG_PER_STEP);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [emojiIndex]);

  // Fade the loading text out → swap → fade back in each time the emoji changes
  useEffect(() => {
    setTextVisible(false);
    const swap = setTimeout(() => {
      setTextIndex(i => (i + 1) % LOADING_LINES.length);
      setTextVisible(true);
    }, TEXT_FADE_MS + 20);
    return () => clearTimeout(swap);
  }, [emojiIndex]);

  return (
    <>
      {/* Self-contained styles rendered inline so they're present on frame 1 */}
      <style>{CSS}</style>

      <div
        className={`ls-root${contained ? " ls-root--contained" : ""}`}
        style={{ backgroundColor }}
      >
        {/* Fixed-size orbit stage — overflow hidden keeps emojis clipped */}
        <div className="ls-orbit-stage">
          {/*
            The orbit div rotates as a whole. Each emoji counter-rotates by the
            same amount to stay upright. Because both transitions share the same
            duration + easing, they stay perfectly in sync.
          */}
          <div className="ls-orbit" style={{ transform: `rotate(${orbitRot}deg)` }}>
            {EMOJIS.map((emoji, i) => {
              // Static angle for this emoji slot (evenly distributed around the circle)
              const angleDeg = (i / N) * 360;
              const angleRad = (angleDeg * Math.PI) / 180;
              // Position on the circle (CSS coords: y increases downward, so negate cos)
              const x = ORBIT_R * Math.sin(angleRad);
              const y = -ORBIT_R * Math.cos(angleRad);
              const isFeatured = i === emojiIndex;

              return (
                <span
                  key={i}
                  className={`ls-orbit-emoji${isFeatured ? " ls-orbit-emoji--featured" : ""}`}
                  style={{
                    transform: `translate(${x}px, ${y}px) rotate(${-orbitRot}deg) scale(${isFeatured ? 2 : 0.7})`
                  }}
                  aria-hidden="true"
                >
                  {emoji}
                </span>
              );
            })}
          </div>
        </div>

        <p
          className={`ls-text ${textVisible ? "ls-text--visible" : "ls-text--hidden"}`}
          aria-live="polite"
        >
          {LOADING_LINES[textIndex]}
        </p>
      </div>
    </>
  );
}
