import { PinCard } from "./PinCard";
import type { PinCardData } from "../types";

interface PinBoardProps {
  cards: PinCardData[];
  zIndexMap: Record<string, number>;
  onPositionChange: (id: string, x: number, y: number) => void;
  onBringToFront: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
}

export function PinBoard({
  cards,
  zIndexMap,
  onPositionChange,
  onBringToFront,
  onToggleCollapse,
  onClose,
  onMinimize,
}: PinBoardProps) {
  return (
    <div className="pin-board">
      {cards.map((card) => (
        <PinCard
          key={card.id}
          card={card}
          onPositionChange={onPositionChange}
          onBringToFront={onBringToFront}
          onToggleCollapse={onToggleCollapse}
          onClose={onClose}
          onMinimize={onMinimize}
          zIndex={zIndexMap[card.id] || 100}
        />
      ))}
    </div>
  );
}
