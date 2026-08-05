'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'de' | 'en';

const STORAGE_KEY = 'festival-buddy-language';

/**
 * Festival Buddy predates its internationalisation layer and therefore has
 * copy spread across server and client components. This catalogue lets us
 * localise that existing UI centrally; new interactive code can use `t()`.
 */
const EN: Record<string, string> = {
  'App öffnen': 'Open app',
  'Für dein Festival': 'For your festival',
  'Wer geht zu': 'Who is going to',
  'welcher Band?': 'which band?',
  'welcher': 'which',
  'Band?': 'band?',
  Stramm: 'Properly',
  Geplant: 'Planned',
  'Jetzt loslegen': 'Get started',
  "So geht's": 'How it works',
  'Alles fürs': 'Everything for',
  'Kein Excel, kein Gruppenchat-Scrollen. Ein Ort für die ganze Crew.':
    'No spreadsheets, no endless group-chat scrolling. One place for the whole crew.',
  'Timetable-Planer': 'Timetable planner',
  'Wer geht zu welcher Band?': 'Who is going to which band?',
  'Hot Slots': 'Hot slots',
  'Gruppen für die Crew': 'Groups for your crew',
  'Läuft offline': 'Works offline',
  'Kein Passwort': 'No password',
  'Rein mit Passkey': 'Enter with a passkey',
  'Gruppe gründen oder beitreten': 'Create or join a group',
  'Bands markieren': 'Pick your bands',
  'In drei Schritten dabei': 'Join in three steps',
  'drei Schritten': 'three steps',
  dabei: '',
  'Festival Buddy ist der Timetable-Planer für deine Crew. Bands markieren, Hot Slots sehen, keinen Auftritt mehr verpassen – und endlich wissen, wo sich alle treffen. 🤘':
    'Festival Buddy is the timetable planner for your crew. Pick bands, spot hot slots, never miss a show – and always know where everyone is meeting. 🤘',
  'Der komplette Running Order in einer sauberen Bühnen-Ansicht. Tippen, markieren, fertig – kein Zettel-Chaos mehr am Bauzaun.':
    'The complete running order in a clean stage view. Tap, pick, done – no more paper chaos by the barrier.',
  'Jeder markiert seine Bands. Du siehst sofort, wer wo mit dabei ist – und findest deine Leute, statt sie zu suchen.':
    'Everyone picks their bands. You instantly see who is going where – and find your people instead of searching for them.',
  'Wenn genug aus der Crew fest zusagen, fängt der Slot an zu brennen. Genau wie diese Karte – die Pflichttermine erkennst du auf einen Blick.':
    'When enough of the crew commits, the slot catches fire. Just like this card – see the must-see shows at a glance.',
  'Gruppe gründen, Code oder Link teilen, fertig. Kein Login-Wirrwarr – deine Leute sind in Sekunden drin.':
    'Create a group, share the code or link, done. No login confusion – your crew joins in seconds.',
  'Installier sie als App aufs Handy. Einmal geladen, läuft alles auch ohne Netz – genau richtig fürs Feld im Funkloch.':
    'Install it on your phone. Once loaded, it works without reception – perfect for the festival field.',
  'Login per Passkey – Face ID oder Fingerabdruck. Nichts zu merken, nichts zu vergessen, nichts zu klauen.':
    'Sign in with a passkey – Face ID or fingerprint. Nothing to remember, forget or steal.',
  'Namen tippen, Face ID / Fingerabdruck – schon bist du drin. Kein Passwort, kein Account-Gedöns.':
    'Enter your name, use Face ID or your fingerprint – you are in. No password, no account hassle.',
  'Neue Crew starten und den Link teilen, oder mit einem Code der bestehenden Gruppe beitreten.':
    'Start a new crew and share the link, or join an existing group with its code.',
  'Deine Bands antippen. Alle sehen live, wer wohin geht – und wo sich die ganze Crew trifft.':
    'Tap your bands. Everyone sees live who is going where – and where the whole crew will meet.',
  'So sieht euer Crew-Plan aus – die brennende Karte ist ein Hot Slot.':
    'This is your crew plan – the burning card is a hot slot.',
  'Kein Auftritt verpasst, keiner verloren im Getümmel. Hol deine Crew an Bord.':
    'Never miss a show or lose anyone in the crowd. Get your crew on board.',
  'Festival Buddy starten': 'Start Festival Buddy',
  'Festival Buddy · Timetable-Planer für die Crew – auf jedem Festival.':
    'Festival Buddy · The timetable planner for every festival crew.',
  '© 2026 DEFƎKT — Alle Rechte defekt.': '© 2026 DEFƎKT — All rights defective.',
  'Impressum': 'Legal notice',
  'Datenschutz': 'Privacy',
  'Zur Startseite': 'Back to home',
  'Zurück zur App': 'Back to the app',
  'Zurück': 'Back',
  'Zur App & anmelden': 'Go to app & sign in',
  'Zur App': 'To the app',
  'Tja… Festival-Saison 2026': 'Well… festival season 2026',
  'Festival Buddy · Wer geht zu welcher Band? 🤘':
    'Festival Buddy · Who is going to which band? 🤘',
  'Nach dem Login gründest du eine Gruppe oder trittst einer bei.':
    'After signing in, create a group or join an existing one.',
  'z. B. Daniel': 'e.g. Daniel',
  "Empfohlen: Dein Gerät merkt sich dich per Passkey (Face ID / Fingerabdruck) – ganz ohne Passwort. Der Name ist nur dein Anzeigename. Anderes Gerät? Beim Login einfach die QR-Code-Option nehmen. Alternativ geht's klassisch mit E-Mail & Passwort.":
    'Recommended: your device remembers you with a passkey (Face ID or fingerprint), without a password. The name is only your display name. On another device, simply use the QR-code option when signing in. Email and password also work.',

  Timetable: 'Timetable',
  'Unsere Bands': 'Our bands',
  Bühnen: 'Stages',
  Bühne: 'Stage',
  Veranstalter: 'Organiser',
  Mitteilungen: 'Notifications',
  'Mitteilungen – neue vorhanden': 'Notifications – new items available',
  'Gruppe & Konto': 'Group & account',
  'Gruppe &amp; Konto': 'Group & account',
  Gruppe: 'Group',
  Gruppen: 'Groups',
  Konto: 'Account',
  OFFLINE: 'OFFLINE',
  'Sync …': 'Syncing…',
  'Detail-Ansicht': 'Detailed view',
  'Kompakte Übersicht': 'Compact view',
  'Band suchen …': 'Search bands…',
  'Band suchen': 'Search bands',
  'Suche zurücksetzen': 'Clear search',
  'Keine Slots an diesem Tag.': 'No slots on this day.',
  'Noch keine Band ausgewählt. Geh in den Timetable und trag dich bei deinen Bands ein – hier entsteht dann euer Crew-Plan.':
    'No bands selected yet. Open the timetable and pick your bands – your crew plan will appear here.',
  'Keine Band gefunden für „': 'No band found for “',
  'Slot unbestätigt – Zeiten können sich ändern':
    'Unconfirmed slot – times may change',
  'Auf Spotify anhören': 'Listen on Spotify',
  'Interesse zurückziehen': 'Remove interest',
  'Meine Position ändern': 'Change my position',
  'Meine Position im Publikum markieren': 'Mark my position in the crowd',
  'Markierung löschen': 'Delete marker',
  'Noch niemand fest eingetragen – sei die/der Erste! 🤘':
    'Nobody is definitely going yet – be the first! 🤘',
  'Tippe auf die Karte, um dein': 'Tap the map to set your',
  'zu setzen – deine Crew sieht, wo du stehst.':
    '– your crew will see where you are.',

  'Weitere Gruppe': 'Another group',
  Schließen: 'Close',
  'Code? Rein da!': 'Got a code? Join in!',
  'Den Code bekommst du von jemandem aus der Gruppe – als Link oder zum Abtippen.':
    'You get the code from someone in the group – as a link or to type in.',
  Beitreten: 'Join',
  'Beitreten 🤘': 'Join 🤘',
  'Neue Gruppe gründen': 'Create a new group',
  Festival: 'Festival',
  Gruppenname: 'Group name',
  'Dein Festival ist nicht dabei?': 'Your festival is missing?',
  'Sag uns Bescheid – wir kümmern uns drum.': "Let us know – we'll take care of it.",
  'Gruppe gründen': 'Create group',
  'Du wirst Owner und bekommst direkt einen Einladungscode, mit dem beliebig viele Leute beitreten können. Name, Gruppenbild und Feuerrahmen stellst du danach im Gruppen-Menü ein.':
    'You become the owner and immediately get an invite code for your crew. You can customise the name, group picture and fire frame afterwards.',
  'Festivals konnten nicht geladen werden – Netz?':
    'Festivals could not be loaded – are you online?',
  'Lade Festivals …': 'Loading festivals…',
  'Moment …': 'One moment…',
  'Weiter zur App': 'Continue to the app',
  'Dieser Einladungslink ist ungültig oder wurde erneuert. Frag nach einem frischen Link!':
    'This invite link is invalid or has been renewed. Ask for a new link!',
  'Doch nicht – Einladung verwerfen': 'Cancel and discard invitation',
  'Einladung wird geöffnet …': 'Opening invitation…',

  'Lade Gruppe …': 'Loading group…',
  'Lade Gruppen-Info …': 'Loading group information…',
  'Aktive Gruppe': 'Active group',
  'Leute einladen': 'Invite people',
  'Link kopieren': 'Copy link',
  'Code kopieren': 'Copy code',
  'Code kopiert 📋': 'Code copied 📋',
  Mitglieder: 'Members',
  'Mitglieder (': 'Members (',
  'Einstellungen (Admins)': 'Settings (admins)',
  Gruppenbild: 'Group picture',
  'Gruppenbild ändern': 'Change group picture',
  'Gruppe umbenennen': 'Rename group',
  'Code neu würfeln': 'Generate new code',
  'Gruppe verlassen': 'Leave group',
  'Gruppe wirklich verlassen?': 'Really leave the group?',
  'Abmelden? Dein Passkey bleibt auf dem Gerät.':
    'Sign out? Your passkey will remain on this device.',
  'Neuen Code würfeln? Der alte Link/Code wird sofort ungültig.':
    'Generate a new code? The old link and code will stop working immediately.',
  'Du bist das letzte Mitglied – die Gruppe wird dabei gelöscht. Sicher?':
    'You are the last member – leaving will delete the group. Are you sure?',
  'Gruppe verlassen? Der dienstälteste Admin (sonst das dienstälteste Mitglied) wird neuer Owner.':
    'Leave the group? The longest-serving admin (or member) will become the new owner.',
  'Meine Gruppen': 'My groups',
  wechseln: 'switch',
  '+ Gruppe gründen oder beitreten': '+ Create or join a group',
  'Deine Icon-Farbe': 'Your icon colour',
  'So erscheint dein Avatar bei den anderen': 'How others see your avatar',
  'Login & Sicherheit': 'Login & security',
  'Passkey bleibt auf dem Gerät': 'Passkey stays on this device',
  Abmelden: 'Sign out',
  'Nicht du? Abmelden': 'Not you? Sign out',
  'Bereich wählen': 'Choose section',
  'Aktuelle Farbe': 'Current colour',
  'Diese Farbe wählen': 'Choose this colour',
  'Icon-Farbe': 'Icon colour',
  'Neuer Code aktiv': 'New code active',
  'Gruppenbild gespeichert': 'Group picture saved',
  'Bild wird verkleinert …': 'Optimising image…',
  'Bild konnte nicht verarbeitet werden': 'Image could not be processed',

  'Login &amp; Sicherheit': 'Login & security',
  'E-Mail & Passwort': 'Email & password',
  'E-Mail &amp; Passwort': 'Email & password',
  Einrichten: 'Set up',
  Ändern: 'Change',
  Abbrechen: 'Cancel',
  Speichern: 'Save',
  Löschen: 'Delete',
  Entfernen: 'Remove',
  'Aktuelles Passwort': 'Current password',
  'Neues Passwort (mind. 8 Zeichen)': 'New password (at least 8 characters)',
  'Passwort (mind. 8 Zeichen)': 'Password (at least 8 characters)',
  Passwort: 'Password',
  'Passwort vergessen?': 'Forgot password?',
  'Neu hier? Konto anlegen': 'New here? Create an account',
  'Ich hab schon ein Konto': 'I already have an account',
  'Zurück zum Login': 'Back to login',
  'Konto anlegen & rein': 'Create account & enter',
  'Passwort setzen & rein': 'Set password & enter',
  'Nochmal zur Sicherheit': 'Repeat password',
  'Neues Passwort setzen': 'Set a new password',
  'Dein Name, z. B. Daniel': 'Your name, e.g. Daniel',
  'Dein Name (für die Crew sichtbar)': 'Your name (visible to the crew)',
  Anzeigename: 'Display name',
  'Passkey anlegen & rein': 'Create passkey & enter',
  'Ich hab schon einen Passkey': 'I already have a passkey',
  '🔑 Ich hab schon einen Passkey': '🔑 I already have a passkey',
  'Rein per Passkey – ohne Passwort': 'Enter with a passkey – no password',
  'Lieber mit E-Mail & Passwort': 'Use email & password instead',
  'Lieber mit Passkey': 'Use a passkey instead',
  'Einloggen': 'Sign in',
  '🔑 Einloggen': '🔑 Sign in',
  'Passkey angelegt': 'Passkey created',
  'Passkey entfernt': 'Passkey removed',
  '+ Passkey hinzufügen': '+ Add passkey',
  'Passwort-Login entfernt': 'Password login removed',
  'Login mit E-Mail & Passwort wirklich entfernen? Du kommst dann nur noch per Passkey rein.':
    'Really remove email and password login? You will only be able to sign in with a passkey.',
  'Unbekannter Fehler': 'Unknown error',
  'Die Passwörter stimmen nicht überein': 'The passwords do not match',

  'Nichts mehr verpassen?': 'Never miss anything?',
  'Mitteilungen aktivieren': 'Enable notifications',
  Aktivieren: 'Enable',
  Deaktivieren: 'Disable',
  'Auf diesem Gerät aktiviert ✓': 'Enabled on this device ✓',
  'Später': 'Later',
  'Neue Version verfügbar': 'New version available',
  'Neu laden': 'Reload',
  'Als App installieren?': 'Install as an app?',
  Installieren: 'Install',
  'Alles klar': 'Got it',
  'Noch keine Mitteilungen – Durchsagen vom Festival landen hier.':
    'No notifications yet – festival announcements will appear here.',
  'Ganze Nachricht lesen': 'Read full message',
  'Festival Buddy Team': 'Festival Buddy team',
  'Ausblenden': 'Dismiss',

  'Veranstalter-Bereich': 'Organiser area',
  'Code einlösen': 'Redeem code',
  'Code ungültig': 'Invalid code',
  'Weiteren Veranstalter-Code einlösen': 'Redeem another organiser code',
  'Bühnenplan': 'Stage map',
  'Tage': 'Days',
  'Slots': 'Slots',
  '+ Tag hinzufügen': '+ Add day',
  '+ Bühne hinzufügen': '+ Add stage',
  '+ Slot hinzufügen': '+ Add slot',
  'Neuer Slot': 'New slot',
  'Bestätigt': 'Confirmed',
  'unbestätigt': 'unconfirmed',
  'Bühne löschen?': 'Delete stage?',
  'Tag löschen?': 'Delete day?',
  'Slot löschen?': 'Delete slot?',
  'Bühnenplan speichern': 'Save stage map',
  'Bühnen-Elemente (': 'Stage elements (',
  '+ Element hinzufügen': '+ Add element',
  'Bühnen-Beschriftung': 'Stage label',
  'Auswählen/Verschieben': 'Select/move',
  'Auf die Karte tippen, um den ausgewählten POI dorthin zu verschieben.':
    'Tap the map to move the selected POI there.',
  'Gespeichert – für alle sichtbar': 'Saved – visible to everyone',
  'Speichere …': 'Saving…',
  'Gespeichert': 'Saved',
  'Fehler beim Speichern': 'Could not save',
  'Keine Verbindung': 'No connection',
  'Sende …': 'Sending…',
  Senden: 'Send',
  'An alle senden': 'Send to everyone',
  'Bisherige Mitteilungen': 'Previous notifications',
  'Noch keine Mitteilungen gesendet.': 'No notifications sent yet.',
  Titel: 'Title',
  Text: 'Message',
  'Festival-Name': 'Festival name',
  'Edition/Untertitel': 'Edition/subtitle',
  'Gruppen & Rollen': 'Groups & roles',

  'Keine Verbindung – dafür braucht es Netz': 'No connection – this requires internet access',
  'Keine Verbindung – bitte später erneut': 'No connection – please try again later',
  'Zu viele Versuche – bitte später erneut': 'Too many attempts – please try again later',
  'Fehler': 'Error',
  'Lade …': 'Loading…',
};

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (german: string) => string;
} | null>(null);

function normalise(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function translated(value: string): string {
  const key = normalise(value);
  const spaced = (result: string) =>
    `${/^\s/.test(value) ? ' ' : ''}${result}${/\s$/.test(value) ? ' ' : ''}`;
  const direct = EN[key];
  if (direct !== undefined) return spaced(direct);

  const pending = key.match(/^OFFLINE · (\d+) ausstehend$/);
  if (pending) return spaced(`OFFLINE · ${pending[1]} pending`);
  const older = key.match(/^(\d+) ältere Mitteilungen anzeigen$/);
  if (older) return spaced(`Show ${older[1]} older notifications`);
  const interested = key.match(/^(\d+) interessiert$/);
  if (interested) return spaced(`${interested[1]} interested`);
  const since = key.match(/^seit (.+)$/);
  if (since) return spaced(`since ${since[1]}`);
  const removeMember = key.match(/^(.+) wirklich aus der Gruppe entfernen\?$/);
  if (removeMember) return spaced(`Really remove ${removeMember[1]} from the group?`);
  const removeLogin = key.match(/^(.+) wirklich entfernen\? Damit kannst du dich dann nicht mehr einloggen\.$/);
  if (removeLogin) return spaced(`Really remove ${removeLogin[1]}? You will no longer be able to sign in with it.`);
  const dayNames: Record<string, string> = {
    Montag: 'Monday',
    Dienstag: 'Tuesday',
    Mittwoch: 'Wednesday',
    Donnerstag: 'Thursday',
    Freitag: 'Friday',
    Samstag: 'Saturday',
    Sonntag: 'Sunday',
  };
  if (dayNames[key]) return spaced(dayNames[key]);
  if (key.includes(' · bis ') && key.endsWith(' Uhr')) {
    return spaced(key.replace(' · bis ', ' · until ').replace(/ Uhr$/, ''));
  }
  return value;
}

function localiseTree(root: HTMLElement, locale: Locale) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('[data-no-i18n], script, style')) continue;
    let original = node.__festivalBuddyGerman ?? node.data;
    // React can reuse a text node when a counter/status changes. Detect that
    // fresh German value instead of restoring the old one from our Weak state.
    if (
      locale === 'en' &&
      node.__festivalBuddyGerman &&
      node.data !== node.__festivalBuddyGerman &&
      node.data !== translated(node.__festivalBuddyGerman)
    ) {
      original = node.data;
    }
    node.__festivalBuddyGerman = original;
    const next = locale === 'en' ? translated(original) : original;
    if (node.data !== next) node.data = next;
  }

  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.closest('[data-no-i18n]')) continue;
    for (const attribute of ['aria-label', 'title', 'placeholder'] as const) {
      const current = element.getAttribute(attribute);
      if (!current) continue;
      const key = `data-i18n-original-${attribute}`;
      let original = element.getAttribute(key) ?? current;
      if (locale === 'en' && current !== original && current !== translated(original)) {
        original = current;
      }
      element.setAttribute(key, original);
      const next = locale === 'en' ? translated(original) : original;
      if (current !== next) element.setAttribute(attribute, next);
    }
  }
}

declare global {
  interface Text {
    __festivalBuddyGerman?: string;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('de');

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setLocaleState(
      saved === 'de' || saved === 'en'
        ? saved
        : navigator.language.toLowerCase().startsWith('de')
          ? 'de'
          : 'en',
    );
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    const root = document.getElementById('festival-buddy-root');
    if (!root) return;
    localiseTree(root, locale);
    const observer = new MutationObserver(() => localiseTree(root, locale));
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder'],
    });
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    const nativeConfirm = window.confirm.bind(window);
    window.confirm = (message?: string) =>
      nativeConfirm(locale === 'en' && message ? translated(message) : message);
    return () => {
      window.confirm = nativeConfirm;
    };
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t: (text: string) => (locale === 'en' ? translated(text) : text) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage();
  return (
    <div
      data-no-i18n
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.2rem)] right-3 z-[100] flex rounded-full border border-rivet bg-steel/95 p-0.5 text-[10px] font-black tracking-wider shadow-xl backdrop-blur sm:bottom-4"
      role="group"
      aria-label="Language / Sprache"
    >
      {(['de', 'en'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLocale(item)}
          aria-pressed={locale === item}
          className={`rounded-full px-2.5 py-1.5 transition ${
            locale === item ? 'bg-blood text-black' : 'text-ash hover:text-bone'
          }`}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
