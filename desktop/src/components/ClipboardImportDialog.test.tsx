import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardImportDialog } from "./ClipboardImportDialog";
import { readClipboardText } from "../services/widgetClipboard";
import { useCardStore, tauriHandler } from "../stores/cardStore";
import { useLanguageStore } from "../stores/languageStore";

vi.mock("../services/widgetClipboard", async importOriginal => ({
  ...await importOriginal<typeof import("../services/widgetClipboard")>(),
  readClipboardText: vi.fn(),
}));
vi.mock("../stores/cardStore", async importOriginal => ({
  ...await importOriginal<typeof import("../stores/cardStore")>(),
  tauriHandler: { flush: vi.fn(async () => {}), retry: vi.fn(async () => {}) },
}));

describe("host clipboard import", () => {
  beforeEach(() => {
    vi.mocked(readClipboardText).mockReset().mockResolvedValue("first line\nsecond line");
    vi.mocked(tauriHandler.flush).mockReset().mockResolvedValue();
    vi.mocked(tauriHandler.retry).mockReset().mockResolvedValue();
    useCardStore.setState({ cards: [], zIndexMap: {}, _zIndexCounter: 100 });
    useLanguageStore.setState({ lang: "en" });
  });

  it("requires a host click to read and a separate confirmation to create", async () => {
    const complete = vi.fn();
    render(<ClipboardImportDialog onComplete={complete} />);
    expect(readClipboardText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read text once" }));
    expect(await screen.findByRole("textbox", { name: "Note text" })).toHaveValue("first line\nsecond line");
    expect(useCardStore.getState().cards).toHaveLength(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Captured" } });
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const [card] = useCardStore.getState().cards;
    expect(card).toMatchObject({ title: "Captured", content: "first line\nsecond line", cardType: "note", reminderEnabled: false });
    expect(complete).toHaveBeenCalledWith({ created: true, cardId: card.id });
    expect(tauriHandler.flush).toHaveBeenCalledOnce();
  });

  it("cancels before reading and cancels a late read without creating a note", async () => {
    const complete = vi.fn();
    let finish!: (text: string) => void;
    vi.mocked(readClipboardText).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ClipboardImportDialog onComplete={complete} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readClipboardText).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({ created: false });
    view.unmount();
    const reading = render(<ClipboardImportDialog onComplete={complete} />);
    fireEvent.click(screen.getByRole("button", { name: "Read text once" }));
    const signal = vi.mocked(readClipboardText).mock.calls[0][0];
    reading.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { finish("late private text"); });
    expect(useCardStore.getState().cards).toHaveLength(0);
  });

  it("retries failed persistence without creating a duplicate note", async () => {
    vi.mocked(tauriHandler.flush).mockRejectedValueOnce(new Error("save failed"));
    const complete = vi.fn();
    render(<ClipboardImportDialog onComplete={complete} />);
    fireEvent.click(screen.getByRole("button", { name: "Read text once" }));
    expect(await screen.findByRole("textbox", { name: "Note text" })).toHaveValue("first line\nsecond line");
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));
    await screen.findByRole("alert");
    expect(complete).not.toHaveBeenCalled();
    expect(useCardStore.getState().cards).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(useCardStore.getState().cards).toHaveLength(1);
    expect(tauriHandler.retry).toHaveBeenCalledOnce();
  });

  it("shows sensitive-text guidance and keeps note creation unavailable", async () => {
    vi.mocked(readClipboardText).mockRejectedValue(new Error("clipboard_sensitive"));
    render(<ClipboardImportDialog onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Read text once" }));
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent("marked as private");
    expect(screen.queryByRole("button", { name: "Create note" })).not.toBeInTheDocument();
    expect(useCardStore.getState().cards).toHaveLength(0);
  });
});
