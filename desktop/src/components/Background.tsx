import { convertFileSrc } from "@tauri-apps/api/core";
import type { BackgroundImage } from "../types";

interface BackgroundProps {
  image: BackgroundImage | null;
  opacity: number;
}

export function Background({ image, opacity }: BackgroundProps) {
  return (
    <div className="background-container">
      {image ? (
        <img
          src={convertFileSrc(image.path)}
          alt="Background"
          className="background-image"
          style={{ opacity }}
        />
      ) : (
        <div className="transparent-background" />
      )}
    </div>
  );
}
