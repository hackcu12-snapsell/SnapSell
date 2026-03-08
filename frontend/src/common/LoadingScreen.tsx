import React, { useState, useEffect } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  onComplete?: () => void;   // called when the component unmounts (loading done)
  backgroundColor?: string;  // default "#F5F2EE"
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const EMOJIS = ["👟", "📱", "📸", "📦", "✈️", "💵", "😊", "🏖️"] as const;

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
  "Celebrating quietly at the kitchen table...",
] as const;

// ─── Timing ───────────────────────────────────────────────────────────────────

const ENTER_MS = 440;
const HOLD_MS  = 1050;
const EXIT_MS  = 380;
const TEXT_FADE_MS = 280;

type Phase = "enter" | "hold" | "exit";

const PHASE_DURATION: Record<Phase, number> = {
  enter: ENTER_MS,
  hold:  HOLD_MS,
  exit:  EXIT_MS,
};

const NEXT_PHASE: Record<Phase, Phase> = {
  enter: "hold",
  hold:  "exit",
  exit:  "enter",   // special-cased below to also advance emojiIndex
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT_LINK_ID = "__ls_font__";

// One string — injected as a <style> tag in the JSX so it's always present
// on the first render without needing a useEffect flush.
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
  }

  /* Clip window so the emoji doesn't peek out at the edges during travel */
  .ls-stage {
    overflow: hidden;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 140px;
  }

  .ls-emoji {
    font-size: 80px;
    line-height: 1;
    display: block;
    will-change: transform, opacity;
    user-select: none;
  }

  /* ── Phase animations ─────────────────────────────────── */

  .ls-emoji--enter {
    animation: lsIn ${ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .ls-emoji--hold {
    /* forwards fill from the enter animation keeps it at translateX(0) */
    opacity: 1;
  }
  .ls-emoji--exit {
    animation: lsOut ${EXIT_MS}ms cubic-bezier(0.64, 0, 0.78, 0) forwards;
  }

  @keyframes lsIn {
    from { transform: translateX(130vw); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes lsOut {
    from { transform: translateX(0);      opacity: 1; }
    to   { transform: translateX(-130vw); opacity: 0; }
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
    .ls-emoji       { font-size: 56px; }
    .ls-stage       { height: 96px; }
    .ls-text        { font-size: 14px; bottom: 8vh; }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoadingScreen({
  onComplete,
  backgroundColor = "#F5F2EE",
}: LoadingScreenProps): React.ReactElement {
  const [emojiIndex, setEmojiIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [textIndex, setTextIndex] = useState(0);
  const [textVisible, setTextVisible] = useState(true);

  // Inject Google Fonts link once per page load
  useEffect(() => {
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement("link");
      link.id   = FONT_LINK_ID;
      link.rel  = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&display=swap";
      document.head.appendChild(link);
    }
    // Signal the parent when this screen unmounts (loading is done)
    return () => { onComplete?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase state machine ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (phase === "exit") {
        // Advance to the next emoji and restart the cycle
        setEmojiIndex((i) => (i + 1) % EMOJIS.length);
        setPhase("enter");
      } else {
        setPhase(NEXT_PHASE[phase]);
      }
    }, PHASE_DURATION[phase]);

    return () => clearTimeout(timer);
  }, [phase]);

  // ── Text fade-out → swap → fade-in on each new emoji ────────────────────
  useEffect(() => {
    setTextVisible(false);
    const swap = setTimeout(() => {
      setTextIndex((i) => (i + 1) % LOADING_LINES.length);
      setTextVisible(true);
    }, TEXT_FADE_MS + 20);
    return () => clearTimeout(swap);
  }, [emojiIndex]);

  return (
    <>
      {/* Self-contained styles: rendered inline so they're present on frame 1 */}
      <style>{CSS}</style>

      <div className="ls-root" style={{ backgroundColor }}>
        <div className="ls-stage">
          {/*
            key={emojiIndex} forces React to mount a fresh element for each
            emoji, which re-triggers the CSS animation from the start.
          */}
          <span
            key={emojiIndex}
            className={`ls-emoji ls-emoji--${phase}`}
            aria-hidden="true"
          >
            {EMOJIS[emojiIndex]}
          </span>
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
