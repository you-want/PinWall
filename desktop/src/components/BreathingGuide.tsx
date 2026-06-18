import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "../i18n";
import { getSettings } from "../services/storage";
import { getToneMessage, breathingInhale, breathingHold, breathingExhale, breathingDone, breathingIntro } from "../data/careTones";
import type { CareTone } from "../types";

type BreathPhase = "idle" | "inhale" | "hold" | "exhale" | "done";

interface BreathingGuideProps {
  rounds?: number;
  onClose: () => void;
}

export function BreathingGuide({ rounds = 4, onClose }: BreathingGuideProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<BreathPhase>("idle");
  const [currentRound, setCurrentRound] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toneRef = useRef<CareTone>("warm");

  // Load tone on mount
  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      toneRef.current = (settings.careTone ?? "warm") as CareTone;
      setMessage(getToneMessage(breathingIntro, toneRef.current));
    })();
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runPhase = useCallback((p: BreathPhase, duration: number, onComplete: () => void) => {
    setPhase(p);
    setSecondsLeft(duration);
    const tone = toneRef.current;

    if (p === "inhale") setMessage(getToneMessage(breathingInhale, tone));
    else if (p === "hold") setMessage(getToneMessage(breathingHold, tone));
    else if (p === "exhale") setMessage(getToneMessage(breathingExhale, tone));

    clearTimer();
    let remaining = duration;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearTimer();
        onComplete();
      }
    }, 1000);
  }, [clearTimer]);

  const startBreathing = useCallback(() => {
    setCurrentRound(1);
    const doRound = (round: number) => {
      // Inhale 4s
      runPhase("inhale", 4, () => {
        // Hold 4s
        runPhase("hold", 4, () => {
          // Exhale 6s
          runPhase("exhale", 6, () => {
            if (round < rounds) {
              setCurrentRound(round + 1);
              doRound(round + 1);
            } else {
              setPhase("done");
              setMessage(getToneMessage(breathingDone, toneRef.current));
            }
          });
        });
      });
    };
    doRound(1);
  }, [rounds, runPhase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const bubbleScale = phase === "inhale" ? 1.4 : phase === "hold" ? 1.4 : phase === "exhale" ? 0.8 : 1;
  const bubbleTransition = phase === "inhale" ? "transform 4s ease-in-out"
    : phase === "exhale" ? "transform 6s ease-in-out"
    : "transform 0.3s ease";

  return (
    <div data-interactive="true" className="breathing-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="breathing-content">
        {/* Bubble */}
        <div
          className={`breathing-bubble ${phase}`}
          style={{ transform: `scale(${bubbleScale})`, transition: bubbleTransition }}
        >
          <span className="breathing-seconds">{secondsLeft > 0 ? secondsLeft : ""}</span>
        </div>

        {/* Message */}
        <div className="breathing-message">{message}</div>

        {/* Round indicator */}
        {phase !== "idle" && phase !== "done" && (
          <div className="breathing-round">
            {t.breathing_round.replace("{{n}}", String(currentRound))} / {rounds}
          </div>
        )}

        {/* Controls */}
        {phase === "idle" && (
          <div className="breathing-controls">
            <button className="breathing-btn breathing-btn-start" onClick={startBreathing}>
              {t.breathing_start}
            </button>
            <button className="breathing-btn breathing-btn-stop" onClick={onClose}>
              {t.breathing_stop}
            </button>
          </div>
        )}
        {phase === "done" && (
          <button className="breathing-btn breathing-btn-start" onClick={onClose}>
            ✓
          </button>
        )}
        {phase !== "idle" && phase !== "done" && (
          <button className="breathing-btn breathing-btn-stop" onClick={() => { clearTimer(); onClose(); }}>
            {t.breathing_stop}
          </button>
        )}
      </div>
    </div>
  );
}
