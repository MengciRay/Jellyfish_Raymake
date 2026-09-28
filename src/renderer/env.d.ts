interface Window {
  habitat: {
    load(): Promise<unknown>;
    save(world: unknown): Promise<void>;
    ignoreMouse(ignore: boolean): void;
    quit(): void;
    onTogglePanel(callback: () => void): () => void;
  };
}
