import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FileShelfDialog } from "./FileShelfDialog";
import { shelfRequest } from "../services/widgetWorkspaceTools";
import { useLanguageStore } from "../stores/languageStore";
vi.mock("../services/widgetWorkspaceTools", () => ({ shelfRequest: vi.fn() }));
vi.mock("../services/widgetTools", async original => ({ ...await original<typeof import("../services/widgetTools")>(), clearNativeTool: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
beforeEach(() => { useLanguageStore.setState({ lang: "en" }); vi.mocked(shelfRequest).mockReset().mockResolvedValue({ entries: [], added: 0, skipped: 0 }); });
it("stays usable after StrictMode cleanup while the first activation is settling", async () => {
  render(<StrictMode><FileShelfDialog onClose={vi.fn()} /></StrictMode>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add files" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Add files" }));
  await waitFor(() => expect(shelfRequest).toHaveBeenCalledWith({ method: "add" }, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add files" })).toBeEnabled());
});
