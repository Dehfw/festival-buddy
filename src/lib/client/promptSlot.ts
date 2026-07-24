/**
 * Am unteren Rand soll immer nur EIN Banner gleichzeitig stehen (Install-
 * und Push-Hinweis teilen sich dieselbe Position). Der InstallPrompt
 * meldet hier seine Sichtbarkeit, der PushPrompt wartet, bis der Platz
 * frei ist. Bewusst ein Mini-Modul statt React-Context – die beiden
 * Komponenten hängen an verschiedenen Stellen im Baum.
 */

type Listener = () => void;

let installPromptVisible = false;
const listeners = new Set<Listener>();

export function setInstallPromptVisible(visible: boolean): void {
  if (installPromptVisible === visible) return;
  installPromptVisible = visible;
  for (const listener of [...listeners]) listener();
}

export function isInstallPromptVisible(): boolean {
  return installPromptVisible;
}

/** Auf Sichtbarkeits-Wechsel lauschen; Rückgabe = Unsubscribe. */
export function onPromptSlotChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
