import { useState, useCallback } from "react";
import { useI18n } from "../i18n";
import { useMoodStore } from "../stores/moodStore";
import { getSettings } from "../services/storage";
import { useLanguageStore } from "../stores/languageStore";
import { getToneMessage, moodResponses } from "../data/careTones";
import { generateMoodResponse } from "../services/aiService";
import type { CareTone } from "../types";

const MOOD_EMOJIS = [
  { value: 5, zh: "很棒", en: "Great", emoji: "😄" },
  { value: 4, zh: "还不错", en: "Good", emoji: "🙂" },
  { value: 3, zh: "一般", en: "Okay", emoji: "😐" },
  { value: 2, zh: "有点累", en: "Tired", emoji: "😔" },
  { value: 1, zh: "不太好", en: "Not well", emoji: "😢" },
];

interface MoodCardProps {
  cardId: string;
  onDone: () => void;
}

export function MoodCard({ cardId: _cardId, onDone }: MoodCardProps) {
  const { t, lang } = useI18n();
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSelect = useCallback(async (mood: number) => {
    setSelectedMood(mood);
    setLoading(true);

    try {
      const settings = await getSettings();
      const tone = (settings.careTone ?? "warm") as CareTone;
      let msg: string;

      // Try AI response if available
      if (settings.ai?.enabled && settings.ai.apiKey) {
        try {
          const aiLang = useLanguageStore.getState().lang;
          msg = await generateMoodResponse(mood, settings.ai, aiLang, tone);
        } catch {
          msg = getToneMessage(moodResponses[mood] ?? moodResponses[3], tone);
        }
      } else {
        msg = getToneMessage(moodResponses[mood] ?? moodResponses[3], tone);
      }

      setResponse(msg);

      // Save to mood store
      const now = new Date();
      useMoodStore.getState().addEntry({
        date: now.toISOString().slice(0, 10),
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        mood,
        note: msg,
      });
    } catch (err) {
      console.error("[MoodCard] error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div data-interactive="true" className="mood-card-inline">
      <div className="mood-card-inner">
        <div className="mood-card-subtitle">{t.mood_subtitle}</div>
        <div className="mood-card-title">{t.mood_prompt}</div>
        <div className="mood-emoji-row">
          {MOOD_EMOJIS.map((m) => (
            <button
              key={m.value}
              className={`mood-emoji-btn ${selectedMood === m.value ? "selected" : ""}`}
              onClick={() => handleSelect(m.value)}
              disabled={loading || selectedMood !== null}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span className="mood-label">{lang === "zh" ? m.zh : m.en}</span>
            </button>
          ))}
        </div>
        {loading && <div className="mood-loading">💭 ...</div>}
        {response && <div className="mood-response">{response}</div>}
        {selectedMood !== null && !loading && (
          <button className="mood-done-btn" onClick={onDone}>
            ✓
          </button>
        )}
      </div>
    </div>
  );
}
