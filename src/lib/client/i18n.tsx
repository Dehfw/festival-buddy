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
import { usePathname } from 'next/navigation';

export type Locale = 'de' | 'en';

const STORAGE_KEY = 'festival-buddy-language';

const PAGE_METADATA: Record<
  string,
  { de: { title: string; description?: string }; en: { title: string; description?: string } }
> = {
  '/': {
    de: {
      title: 'Festival Buddy – Wer geht zu welcher Band? | MerchMaster',
      description: 'Der Timetable-Planer für deine Festival-Crew.',
    },
    en: {
      title: 'Festival Buddy – Who is going to which band? | MerchMaster',
      description: 'The timetable planner for your festival crew.',
    },
  },
  '/veranstalter': {
    de: {
      title: 'Festival Buddy für Veranstalter – Timetable, Bühnenpläne & Mitteilungen | MerchMaster',
      description: 'Festival Buddy für Veranstalter und ihre Festivalteams.',
    },
    en: {
      title: 'Festival Buddy for organisers – timetables, stage maps & notifications | MerchMaster',
      description: 'Festival Buddy for organisers and their festival teams.',
    },
  },
  '/fuer-bands': {
    de: {
      title: 'Festival Buddy für Bands – deine Fans planen dich ein | MerchMaster',
      description: 'Festival Buddy für Bands – und MerchMaster für den Merch-Stand.',
    },
    en: {
      title: 'Festival Buddy for bands – your fans plan you in | MerchMaster',
      description: 'Festival Buddy for bands – and MerchMaster for the merch table.',
    },
  },
  '/impressum': {
    de: { title: 'Impressum – Festival Buddy by MerchMaster' },
    en: { title: 'Legal notice – Festival Buddy by MerchMaster' },
  },
  // Legal text intentionally remains German in both language modes.
  '/datenschutz': {
    de: { title: 'Datenschutz – Festival Buddy by MerchMaster' },
    en: { title: 'Datenschutz – Festival Buddy by MerchMaster' },
  },
};

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
  '© 2026 MerchMaster · Festival Buddy ist kostenlos und bleibt es.': '© 2026 MerchMaster · Festival Buddy is free and stays free.',
  'Impressum': 'Legal notice',
  'Datenschutz': 'Privacy',
  'Zur Startseite': 'Back to home',
  'Zurück zur App': 'Back to the app',
  'Zurück': 'Back',
  'Zur App & anmelden': 'Go to app & sign in',
  'Zur App': 'To the app',
  'Tja… Festival-Saison 2026': 'Well… festival season 2026',
  'Festival Buddy – Wer geht zu welcher Band? | MerchMaster':
    'Festival Buddy – Who is going to which band? | MerchMaster',
  'Festival Buddy by MerchMaster – Wer geht zu welcher Band?':
    'Festival Buddy by MerchMaster – Who is going to which band?',
  'Wer geht zu welcher Band? Timetable-Planer für deine Crew – auf jedem Festival.':
    'Who is going to which band? A timetable planner for your crew – at every festival.',
  'Der Timetable-Planer für deine Festival-Crew. Wer geht zu welcher Band? Gruppen gründen, Bands markieren, Hot Slots sehen – offline-fähig, ohne Passwort. Für jedes Festival.':
    'The timetable planner for your festival crew. Who is going to which band? Create groups, pick bands and spot hot slots – offline-ready and password-free. For every festival.',
  'Festival Buddy – Wer geht zu welcher Band? Timetable-Planer für deine Crew.':
    'Festival Buddy – Who is going to which band? A timetable planner for your crew.',
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
  Lineup: 'Line-up',
  '· Lineup folgt': '· line-up to be announced',
  'A–Z': 'A–Z',
  '🤘 Crew-Top': '🤘 Crew top',
  '🔖 Nur meine': '🔖 Only mine',
  '🔖 Merken': '🔖 Save',
  '🔖 Gemerkt': '🔖 Saved',
  Announced: 'Announced',
  'Auf Spotify reinhören': 'Listen on Spotify',
  'Noch kein Timetable': 'No timetable yet',
  'Spielzeit steht noch nicht fest – kommt mit dem Timetable':
    'Set time not confirmed yet – it arrives with the timetable',
  'Für diese Band ist kein Spotify-Profil hinterlegt.':
    'No Spotify profile is stored for this band.',
  'Noch niemand aus der Crew – sei die/der Erste! 🤘':
    'Nobody from the crew yet – be the first! 🤘',
  'Für dieses Festival ist noch keine Band eingetragen. Sobald die ersten announced sind, stehen sie hier.':
    'No bands have been added for this festival yet. As soon as the first ones are announced, they will show up here.',
  'Du hast dir noch keine Band gemerkt. Tipp auf das Lesezeichen neben einer Band.':
    'You have not saved any bands yet. Tap the bookmark next to a band.',
  'Für dieses Festival ist noch kein Lineup eingetragen. Sobald die ersten Bands announced sind, könnt ihr sie hier durchhören und markieren.':
    'No line-up has been added for this festival yet. As soon as the first bands are announced, you can listen through them here and mark your favourites.',
  'Slot unbestätigt – Zeiten können sich ändern':
    'Unconfirmed slot – times may change',
  'Auf Spotify anhören': 'Listen on Spotify',
  'Interesse zurückziehen': 'Remove interest',
  'Ich bin dabei!': "I'm going!",
  'Ich bin dabei': "I'm going",
  '🤔 Ich bin interessiert (unverbindlich)': "🤔 I'm interested",
  'Ich bin interessiert': "I'm interested",
  'Dabei (': 'Going (',
  'Will die Crew sehen (': 'The crew wants to see (',
  'Interessiert (': 'Interested (',
  Fertig: 'Done',
  'Vergangene Bands ausblenden': 'Hide past bands',
  '▴ Vergangene Bands ausblenden': '▴ Hide past bands',
  '🔗 Link kopieren': '🔗 Copy link',
  'Link teilen': 'Share link',
  'wechseln →': 'switch →',
  Einladung: 'Invitation',
  Mitglied: 'Member',
  Eintrag: 'entry',
  'einziger Login-Weg': 'only sign-in method',
  'Reset-Link schicken': 'Send reset link',
  'E-Mail schreiben': 'Write email',
  Zuklappen: 'Collapse',
  Beschriftung: 'Label',
  Absperrung: 'Barrier',
  Zelt: 'Tent',
  'FOH/Turm': 'FOH/tower',
  Moin: 'Hi',
  Sprache: 'Language',
  'Deutsch oder Englisch': 'German or English',
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
  'Gruppe verlassen?': 'Leave the group?',
  Verlassen: 'Leave',
  'Abmelden?': 'Sign out?',
  'Dein Passkey bleibt auf dem Gerät.': 'Your passkey will remain on this device.',
  'Neuen Code würfeln?': 'Generate a new code?',
  'Der alte Link/Code wird sofort ungültig.':
    'The old link and code will stop working immediately.',
  'Neu würfeln': 'Generate',
  'Du bist das letzte Mitglied – die Gruppe wird dabei gelöscht.':
    'You are the last member – leaving will delete the group.',
  'Der dienstälteste Admin (sonst das dienstälteste Mitglied) wird neuer Owner.':
    'The longest-serving admin (or member) will become the new owner.',
  'Mitglied entfernen?': 'Remove member?',
  'Zum Admin machen?': 'Make an admin?',
  'Admin-Rechte entziehen?': 'Remove admin rights?',
  Ernennen: 'Appoint',
  Entziehen: 'Remove',
  'Meine Gruppen': 'My groups',
  wechseln: 'switch',
  '+ Gruppe gründen oder beitreten': '+ Create or join a group',
  'Deine Icon-Farbe': 'Your icon colour',
  'So erscheint dein Avatar bei den anderen': 'How others see your avatar',
  'Dein Name und deine Icon-Farbe – so erscheinst du bei den anderen':
    'Your name and icon colour – how others see you',
  'Namen ändern': 'Change name',
  'Name geändert': 'Name changed',
  'Name konnte nicht gespeichert werden – braucht Netz':
    'The name could not be saved – requires internet access',
  'Der Name ist nur dein Anzeigename – Login (Passkey bzw. E-Mail) bleibt unverändert. Ein früher angelegter Passkey zeigt beim Login evtl. noch den alten Namen, funktioniert aber weiterhin.':
    'The name is only your display name – your login (passkey or email) stays the same. A previously created passkey may still show your old name at sign-in, but it keeps working.',
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
  'Passkey entfernen?': 'Remove passkey?',
  'Passwort-Login entfernen?': 'Remove password login?',
  'Du kommst dann nur noch per Passkey rein.':
    'You will then only be able to sign in with a passkey.',
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

  // Public organiser page
  'Festival Buddy für Veranstalter – Timetable, Bühnenpläne & Mitteilungen | MerchMaster':
    'Festival Buddy for organisers – timetables, stage maps & notifications | MerchMaster',
  'Bring dein Festival in die App: Timetable, Bühnen und Bühnenpläne selbst pflegen, Mitteilungen mit Push an alle Besucher – kostenlos, ohne dass du Besucherdaten siehst.':
    'Bring your festival into the app: manage the timetable, stages and stage maps yourself and send push notifications to every visitor – free, without access to personal visitor data.',
  'Festival Buddy für Veranstalter – Timetable, Bühnenpläne und Mitteilungen selbst pflegen.':
    'Festival Buddy for organisers – manage timetables, stage maps and notifications yourself.',
  'Für Crews': 'For crews',

  /* Marke MerchMaster: Band-Funnel und „Warum kostenlos" */
  'Kostenlos, ohne Haken': 'Free, no catch',
  'Warum ist das': 'Why is this',
  'umsonst?': 'free?',
  'Weil wir unser Geld woanders verdienen. Festival Buddy kommt von MerchMaster – der App, mit der Bands ihren Merch am Stand verkaufen. Kein Abo, keine Werbung, kein Datenverkauf: Wir bauen das Ding, weil wir selbst auf Festivals stehen.':
    'Because we earn our money elsewhere. Festival Buddy comes from MerchMaster – the app bands use to sell merch at the table. No subscription, no ads, no data selling: we build this because we go to festivals ourselves.',
  'Ich bin in einer Band': 'I am in a band',
  'MerchMaster ansehen': 'Take a look at MerchMaster',
  'Du spielst selbst in einer': 'Are you in a',
  'Deine Fans planen deinen Slot hier ein – und für den Merch-Stand danach gibt es MerchMaster.':
    'Your fans plan your slot in here – and MerchMaster takes care of the merch table afterwards.',
  'Für Bands': 'For bands',
  'Selbst in einer Band? Verkauf deinen Merch mit':
    'In a band yourself? Sell your merch with',
  'Deine Fans': 'Your fans',
  'planen dich': 'plan you',
  'ein.': 'in.',
  'Auf jedem Festival stehen tausend Leute vor derselben Frage: Wo bin ich um 21 Uhr? Festival Buddy beantwortet sie – und euer Slot steht mittendrin.':
    'At every festival a thousand people face the same question: where am I at 9pm? Festival Buddy answers it – and your slot is right in the middle of it.',
  'Merch verkaufen mit MerchMaster': 'Sell merch with MerchMaster',
  'Was ist MerchMaster?': 'What is MerchMaster?',
  'Euer Slot im': 'Your slot in the',
  'Plan der Crew': 'crew\'s plan',
  'Ihr müsst dafür nichts tun und nichts bezahlen. Sobald euer Festival den Timetable pflegt, seid ihr drin.':
    'You do not have to do anything or pay anything. As soon as your festival maintains its timetable, you are in.',
  'Fans markieren euch': 'Fans mark you',
  'Jede Crew plant ihren Festivaltag über den Timetable. Wer euch antippt, hat euren Slot fest im Plan – und alle in seiner Gruppe sehen es.':
    'Every crew plans its festival day in the timetable. Anyone who taps you has your slot locked into their plan – and everyone in their group can see it.',
  'Erinnerung vor dem Auftritt': 'A reminder before you play',
  'Kurz vor Beginn kommt eine Push-Nachricht aufs Handy. Niemand steht mehr am falschen Ende des Geländes, wenn ihr anfangt.':
    'Shortly before you start, a push notification hits their phone. Nobody is stuck at the wrong end of the site any more when you go on.',
  'Hot Slots zeigen Zugkraft': 'Hot slots show your pull',
  'Sagen genug aus einer Crew fest zu, fängt euer Slot in der App an zu brennen. Das ist der Termin, den keiner mehr sausen lässt.':
    'When enough of a crew commits, your slot catches fire in the app. That is the show nobody skips any more.',
  'Reinhören mit einem Tipp': 'One tap to listen',
  'Zu jeder Band führt ein Link direkt aufs Spotify-Profil. Wer euch noch nicht kennt, hört rein, bevor er sich entscheidet.':
    'Every band links straight to its Spotify profile. Anyone who does not know you yet can listen before deciding.',
  'Euer Festival ist noch nicht dabei?': 'Your festival is not on board yet?',
  'Schreib uns': 'Write to us',
  '– wir fragen bei der Orga an.': '– we will ask the organisers.',
  'Und am': 'And at the',
  'Merch-Stand?': 'merch table?',
  'Festival Buddy ist kostenlos, weil wir unser Geld woanders verdienen: mit MerchMaster, der App für den Merch-Tisch. Bestand, Kartenzahlung und Abrechnung auf einem Handy – gebaut für Bands, getestet auf Tour.':
    'Festival Buddy is free because we earn our money elsewhere: with MerchMaster, the app for the merch table. Inventory, card payments and settlement on one phone – built for bands, tested on tour.',
  'Bestand im Blick': 'Inventory at a glance',
  'Welche Größe ist noch da, was ist durch? Der Bestand läuft mit, statt auf einem Zettel im Case zu liegen.':
    'Which size is left, what has sold out? Your stock keeps up instead of sitting on a scrap of paper in the case.',
  'Kartenzahlung am Stand': 'Card payments at the table',
  'Karte und kontaktlos direkt am Merch-Tisch, mit dem SumUp-Reader. Kein extra Kassensystem, nur euer Handy.':
    'Card and contactless right at the merch table with a SumUp reader. No separate POS system, just your phone.',
  'Abrechnung nach der Show': 'Settlement after the show',
  'Statt Kopfrechnen im Nightliner steht die Abrechnung fertig da – inklusive dem, was die Venue abbekommt.':
    'Instead of doing maths in the nightliner, the settlement is ready – including the venue’s cut.',
  'Zahlen pro Show': 'Numbers per show',
  'Was lief wo am besten, was verstaubt im Case? Nach der Tour wisst ihr, was ihr nachdrucken solltet.':
    'What sold best where, what is gathering dust? After the tour you know what to reprint.',
  'Weniger Zettelwirtschaft hinterm Tisch, mehr Zeit für die Leute davor. Schau dir MerchMaster an.':
    'Less paperwork behind the table, more time for the people in front of it. Take a look at MerchMaster.',
  'Zu MerchMaster': 'Go to MerchMaster',
  'Unsere Band spielt auf einem Festival': 'Our band is playing a festival',
  'Für Veranstalter': 'For organisers',
  'Dein Festival.': 'Your festival.',
  'Live beim': 'Live with your',
  'Publikum.': 'audience.',
  Selbst: 'Self',
  Verwaltet: 'Managed',
  'Zugang anfragen': 'Request access',
  'Ich habe schon einen Code': 'I already have a code',
  'So planen deine Besucher – aus dem Timetable, den du pflegst.':
    'This is how your visitors plan – using the timetable you manage.',
  'Alles für': 'Everything for',
  'dein Festival': 'your festival',
  'Kein PDF-Update, kein Aushang am Bauzaun. Ein Ort für Timetable, Pläne und Ansagen.':
    'No PDF updates and no notices on the fence. One place for timetables, maps and announcements.',
  'Lineup schon im Winter': 'Line-up ready in winter',
  'Du musst nicht auf die Running Order warten. Sobald deine ersten Bands announced sind, kommen sie ins Lineup – dein Publikum hört rein und markiert, wen es sehen will. Die Spielzeiten reichst du später nach.':
    'No need to wait for the running order. As soon as your first bands are announced they go into the line-up – your audience listens through them and marks who they want to see. Set times follow later.',
  'Erst das Lineup, später Tage, Bühnen, Slots und Bühnenpläne. Deine Besucher planen ab der ersten angekündigten Band mit – und sehen jede Änderung sofort.':
    'The line-up first, days, stages, slots and stage maps later. Your visitors start planning with the very first announced band – and see every change instantly.',
  'Festival Buddy ist der Timetable-Planer, mit dem Crews ihren Festivalbesuch planen. Als Veranstalter pflegst du Timetable, Bühnenpläne und Mitteilungen deines Festivals selbst – und dein Publikum ist schon dabei, bevor die Running Order steht. 🤘':
    'Festival Buddy is the timetable planner crews use for their festival. As an organiser you maintain your timetable, stage maps and notifications yourself – and your audience is on board before the running order even exists. 🤘',
  'Timetable im Griff': 'Your timetable under control',
  'Tage, Bühnen und Slots legst du direkt in der App an und änderst sie jederzeit. Jede Änderung ist in Sekunden bei allen Besuchern – ohne neues PDF, ohne App-Update.':
    'Create and update days, stages and slots directly in the app. Every change reaches all visitors within seconds – without a new PDF or app update.',
  'Bühnenpläne & POIs': 'Stage maps & POIs',
  'Pfleg zu jeder Bühne einen Grundriss: Bühne, FOH, Barrieren – plus Punkte wie WC, Wasser, Merch, Sanitäter und Ausgänge. Deine Besucher finden alles auf Anhieb.':
    'Create a map for every stage: stage, FOH and barriers, plus points such as toilets, water, merch, medics and exits. Your visitors can find everything straight away.',
  'Mitteilungen mit Push': 'Push notifications',
  'Slot verschoben, Band ausgefallen, Unwetterwarnung? Eine Mitteilung erreicht alle, die dein Festival in der App planen – auf Wunsch als Push direkt aufs Handy.':
    'A slot moved, a band cancelled or severe weather is coming? A notification reaches everyone planning your festival in the app – optionally as a push message on their phone.',
  'Reichweite im Blick': 'See your reach',
  'Du siehst jederzeit, wie viele Gruppen und wie viele Leute dein Festival schon planen – als anonyme Summen, damit du ein Gefühl für die Menge bekommst.':
    'See how many groups and people are planning your festival at any time – as anonymous totals that give you a sense of the audience.',
  'Privatsphäre eingebaut': 'Privacy built in',
  'Wer in welcher Gruppe steckt und wer zu welcher Band geht, bleibt privat. Du bekommst nie Namen oder Profile zu sehen – nur Zahlen.':
    'Group membership and band choices stay private. You never see names or profiles – only totals.',
  'Im Team pflegen': 'Manage it as a team',
  'Mehrere Leute pro Festival: Jeder Zugang kommt per Einladungscode, dein Team arbeitet gleichzeitig am selben Timetable – Löschen warnt vorher, was dranhängt.':
    'Multiple organisers per festival: every account joins by invitation code, your team works on the same timetable, and deletion warnings show what is affected.',
  'Schreib uns eine Mail mit Festival-Name und Termin. Wir legen dein Festival an und schicken dir deinen Einladungscode – kostenlos.':
    'Email us your festival name and dates. We will create the festival and send you an invitation code – free of charge.',
  'Mit Passkey anmelden wie jeder Besucher, dann den Code im Veranstalter-Bereich einlösen. Kein Extra-Konto, kein Passwort.':
    'Sign in with a passkey like any visitor, then redeem the code in the organiser area. No separate account and no password.',
  Loslegen: 'Get started',
  'Tage, Bühnen, Slots und Bühnenpläne anlegen. Deine Besucher planen ab der ersten Minute mit – und sehen jede Änderung sofort.':
    'Create days, stages, slots and stage maps. Visitors can start planning immediately and see every change at once.',
  'in der App': 'in the app',
  'Bring dein Festival in die App – dein Publikum plant schon. Schreib uns, wir legen los.':
    'Bring your festival into the app – your audience is already planning. Contact us and we will get started.',
  'Festival App für Veranstalter': 'Festival app for organisers',
  'Timetable Software Festival': 'Festival timetable software',
  'Running Order verwalten': 'Manage running orders',
  'Festival Timetable pflegen': 'Manage festival timetables',
  'Line-up App Veranstalter': 'Line-up app for organisers',
  'Festival Push Mitteilungen': 'Festival push notifications',
  'Bühnenplan App': 'Stage map app',

  // Remaining app, login and settings copy
  '! 🤘 Fast geschafft – du brauchst noch eine Crew: Gründe eine Gruppe oder tritt mit einem Einladungscode bei.':
    '! 🤘 Almost there – you still need a crew. Create a group or join one with an invitation code.',
  'Ein Code für alle: Link öffnen oder Code eintippen – fertig. Code antippen kopiert ihn.':
    'One code for everyone: open the link or enter the code – done. Tap the code to copy it.',
  'Admins können die Gruppe bearbeiten, Mitglieder entfernen und weitere Admins ernennen. Der Owner bleibt unantastbar.':
    'Admins can edit the group, remove members and appoint more admins. The owner cannot be changed.',
  'Farbe konnte nicht gespeichert werden – braucht Netz':
    'The colour could not be saved – an internet connection is required',
  'Icon-Farbe geändert': 'Icon colour changed',
  '🔥 Feuerrahmen ab': '🔥 Fire frame from',
  aus: 'off',
  '– aus': '– off',
  'Alter Einladungslink/-code wird sofort ungültig':
    'The old invitation link and code will stop working immediately',
  '↻ Code neu würfeln': '↻ Generate new code',
  'Gespeichert – Login mit E-Mail & Passwort ist aktiv':
    'Saved – email and password login is active',
  'Dein Browser kann leider keine Passkeys – mit E-Mail & Passwort kommst du trotzdem rein.':
    'Your browser does not support passkeys, but you can still sign in with email and password.',
  'Mit E-Mail & Passwort': 'With email & password',
  '← Ich hab schon ein Konto': '← I already have an account',
  '← Zurück zum Login': '← Back to login',
  '← Zur Startseite': '← Back to home',
  '← Zurück zur App': '← Back to the app',
  '← Zurück': '← Back',
  '🔑 Lieber mit Passkey': '🔑 Use a passkey instead',
  'Empfohlen: Dein Gerät merkt sich dich per Passkey (Face ID / Fingerabdruck) – ganz ohne Passwort. Der Name ist nur dein Anzeigename. Anderes Gerät? Beim Login einfach die QR-Code-Option nehmen. Alternativ geht&apos;s klassisch mit E-Mail & Passwort.':
    'Recommended: your device remembers you with a passkey (Face ID or fingerprint), without a password. The name is only your display name. On another device, use the QR-code option when signing in. Email and password also work.',
  'Wenn es zu dieser E-Mail ein Konto gibt, ist gerade eine Mail mit dem Reset-Link rausgegangen (30 Minuten gültig). Schau auch im Spam-Ordner nach.':
    'If an account exists for this email address, a reset link has just been sent (valid for 30 minutes). Please check your spam folder too.',
  'Der Link ist unvollständig – bitte den kompletten Link aus der Mail öffnen oder einen neuen anfordern.':
    'The link is incomplete. Open the full link from the email or request a new one.',
  'Lade deine Gruppe … Beim allerersten Start wird einmal Netz gebraucht, danach läuft alles auch offline.':
    'Loading your group… The first launch requires internet access; after that the app also works offline.',
  'Vorschau konnte nicht geladen werden – Netz?':
    'The preview could not be loaded – are you online?',
  'Aktivieren hat nicht geklappt – später nochmal versuchen.':
    'Could not enable notifications – please try again later.',
  'Durchsagen vom Festival & Erinnerungen an deine Bands – auch bei geschlossener App':
    'Festival announcements & reminders for your bands – even when the app is closed',
  'Durchsagen vom Festival und Erinnerungen, bevor deine Bands starten – als Mitteilung direkt aufs Gerät, auch wenn die App zu ist.':
    'Festival announcements and reminders before your bands start – delivered directly to your device, even when the app is closed.',
  'Mitteilungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen deines Browsers, dann kannst du sie hier aktivieren.':
    'Notifications are blocked in your browser. Allow them in the site settings, then enable them here.',
  'Es gibt ein Update vom Festival Buddy. Kurz neu laden, dann bist du auf dem neuesten Stand – deine Auswahl bleibt erhalten.':
    'A Festival Buddy update is available. Reload briefly to get the latest version – your selections will be preserved.',
  'Festival Buddy auf Homescreen bzw. Desktop installieren – startet schneller und läuft auch offline im Infield.':
    'Install Festival Buddy on your home screen or desktop – it starts faster and works offline at the festival.',
  'Hol dir den Festival Buddy auf den Home-Bildschirm: Tippe in Safari auf':
    'Add Festival Buddy to your home screen: in Safari, tap',
  'Auf dem iPhone gibt&apos;s Mitteilungen nur für die installierte App: Tippe in Safari auf':
    'On iPhone, notifications only work with the installed app: in Safari, tap',
  'und dann auf': 'and then',
  Teilen: 'Share',
  '„Zum Home-Bildschirm“': '“Add to Home Screen”',
  '– startet schneller, läuft auch offline im Infield, und nur die installierte App kann dir':
    '– it starts faster, works offline at the festival, and only the installed app can',
  '– danach kannst du sie hier aktivieren.':
    '– then you can enable them here.',
  'schicken (Durchsagen vom Festival, Erinnerungen an deine Bands – so will es iOS).':
    'send notifications (festival announcements and band reminders – as required by iOS).',
  '🗺️ Karte ansehen – wo steht die Crew?': '🗺️ View map – where is the crew?',
  'Doch nicht – austragen': 'Cancel – remove me',
  'Hier steht deine Crew. Trag dich bei der Band ein, um deine eigene Position zu markieren.':
    'Your crew is here. Join the band slot to mark your own position.',

  // Organiser dashboard and editors
  'Hier pflegen Veranstalter Timetable, Bühnen und Bühnenpläne ihres Festivals. Dafür brauchst du ein normales Konto – bitte zuerst in der App mit deinem Passkey anmelden und dann hierher zurückkommen.':
    'Organisers manage their festival timetable, stages and stage maps here. You need a regular account – sign in to the app with your passkey first, then return here.',
  'Was kann der Veranstalter-Bereich?': 'What can the organiser area do?',
  'Löse deinen Veranstalter-Code ein, um den Timetable, die Bühnen und die Bühnenpläne deines Festivals zu pflegen. Den Code bekommst du vom Festival-Buddy-Team –':
    'Redeem your organiser code to manage your festival timetable, stages and stage maps. You receive the code from the Festival Buddy team –',
  'hier steht, wie das läuft': 'see how it works here',
  Einlösen: 'Redeem',
  'Festival konnte nicht geladen werden': 'Festival could not be loaded',
  'Keine Verbindung – der Veranstalter-Bereich braucht Netz':
    'No connection – the organiser area requires internet access',
  'Keine Verbindung – der Editor braucht Netz':
    'No connection – the editor requires internet access',
  'Für den Bühnenplan brauchst du zuerst eine Bühne (Tab „Bühnen“).':
    'Create a stage first before editing the stage map (Stages tab).',
  '👥 Noch keine Gruppen zu diesem Festival': '👥 No groups for this festival yet',
  'Veranstalter-Team': 'Organiser team',
  'Weitere Veranstalter kommen per Einladungscode dazu; Zugänge entziehen kann nur das Festival-Buddy-Team.':
    'Additional organisers join by invitation code; only the Festival Buddy team can revoke access.',
  Bearbeiten: 'Edit',
  'Noch keine Festivaltage – lege den ersten Tag an, danach kannst du Slots im Timetable planen.':
    'No festival days yet – create the first day, then add slots to the timetable.',
  'Noch keine Bühnen – lege die erste Bühne an, danach kannst du Slots planen und den Bühnenplan bearbeiten.':
    'No stages yet – create the first stage, then plan slots and edit the stage map.',
  'Sets nach Mitternacht mit Stunden ≥ 24 eintragen (z. B. 25:30 = 01:30 am Folgetag).':
    'Enter sets after midnight using hours ≥ 24 (e.g. 25:30 = 01:30 the following day).',
  'Slots brauchen mindestens einen Festivaltag und eine Bühne – beides legst du in den Tabs „Tage“ und „Bühnen“ an.':
    'Slots require at least one festival day and one stage – create both in the Days and Stages tabs.',
  '⚠ Überschneidet sich auf dieser Bühne mit „': '⚠ Overlaps on this stage with “',
  ') – speichern geht trotzdem.': ') – you can still save it.',
  '⚠️ Daran hängen bereits': '⚠️ Already linked:',
  Einträge: 'entries',
  'von Besuchern (Zusagen/Interessen samt Treffpunkt-Markern) – die werden unwiderruflich mit gelöscht!':
    'from visitors (attendance, interests and meeting-point markers) – these will be permanently deleted too!',
  'Diese Mitteilung geht an ALLE Mitglieder aller Gruppen dieses Festivals – in der App und als Push.':
    'This notification will go to ALL members of every group for this festival – in the app and by push.',
  'An alle senden?': 'Send to everyone?',
  'Mitteilung löschen?': 'Delete notification?',
  'Was sollen alle wissen?': 'What should everyone know?',
  'Zu viele Mitteilungen – bitte kurz warten':
    'Too many notifications – please wait a moment',
  'Festival Buddy Team (app-weit)': 'Festival Buddy team (app-wide)',
  '🗑 Löschen': '🗑 Delete',
  '✥ Auswählen/Verschieben': '✥ Select/move',
  '✓ Gespeichert': '✓ Saved',
  '✓ Gespeichert – für alle sichtbar': '✓ Saved – visible to everyone',
  '(du)': '(you)',
  'Kürzel (z. B. FSTR)': 'Short name (e.g. FSTR)',
  'Kurz (z. B. Fr)': 'Short (e.g. Fri)',
  'Lang (z. B. Freitag)': 'Long (e.g. Friday)',
  'Name (z. B. Faster)': 'Name (e.g. Faster)',
  'Beginn (17:30)': 'Start (17:30)',
  'Ende (18:30)': 'End (18:30)',
  'Spotify-Artist-ID (optional)': 'Spotify artist ID (optional)',
  Farbe: 'Colour',
  Person: 'person',
  Leute: 'people',
  '← App': '← App',
  'Edition/Untertitel (z. B. „30.07.–01.08.2026 · Wacken“)':
    'Edition/subtitle (e.g. “30 Jul–1 Aug 2026 · Wacken”)',
  'feste Zusage': 'confirmed attendee',
  'feste Zusagen': 'confirmed attendees',
  'interessiert (unverbindlich)': 'interested',
  'Position markiert': 'Position marked',
  'gerade eben': 'just now',
  'gelöschtem Konto': 'deleted account',
  Uhr: '',
  Umbenannt: 'Renamed',
  'z. B. Programmänderung Faster Stage': 'e.g. schedule change on Faster Stage',
  'Auf die Karte tippen, um den POI zu platzieren.':
    'Tap the map to place the POI.',
  'POI auf der Karte antippen, um ihn zu bearbeiten.':
    'Tap a POI on the map to edit it.',

  // Legal notice. The privacy policy intentionally remains in German.
  'Impressum – Festival Buddy by MerchMaster': 'Legal notice – Festival Buddy by MerchMaster',
  'Anbieterkennzeichnung gemäß § 5 DDG.': 'Provider information pursuant to § 5 DDG.',
  'Angaben gemäß § 5 DDG': 'Information pursuant to § 5 DDG',
  Deutschland: 'Germany',
  Kontakt: 'Contact',
  'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV':
    'Responsible for content pursuant to § 18(2) MStV',
  'Haftung für Inhalte': 'Liability for content',
  'Festival Buddy ist ein kostenloses Tool für Festival-Crews und wird von MerchMaster herausgegeben. Für eigene Inhalte auf diesen Seiten sind wir nach den allgemeinen Gesetzen verantwortlich. Nutzergenerierte Inhalte (z. B. Namen, Gruppen, Band-Auswahl) geben die Ansicht der jeweiligen Mitglieder wieder. Bandnamen, Timetable und Logos sind Eigentum der jeweiligen Rechteinhaber.':
    'Festival Buddy is a free tool for festival crews, published by MerchMaster. We are responsible for our own content on these pages under applicable law. User-generated content (such as names, groups and band selections) reflects the views of the respective members. Band names, timetables and logos belong to their respective rights holders.',
  'Wie wir mit deinen Daten umgehen, steht in der':
    'Details about how we handle your data are available in the',
  Datenschutzerklärung: 'privacy policy',

  // Cross-links and contact emails
  'Du machst selbst ein': 'Do you organise a',
  'Festival?': 'festival?',
  'Pfleg Timetable, Bühnenpläne und Mitteilungen deines Festivals direkt in Festival Buddy – dein Publikum plant live mit.':
    'Manage your festival timetable, stage maps and notifications directly in Festival Buddy – your audience plans along live.',
  'Festival Buddy für unser Festival': 'Festival Buddy for our festival',
  'Festival-Wunsch für FestivalBuddy': 'Festival request for Festival Buddy',
  'Moin! Mir fehlt ein Festival in der Auswahl: Festival: Jahr: Link zum Lineup (falls vorhanden): Danke & 🤘':
    'Hi! A festival is missing from the list: Festival: Year: Line-up link (if available): Thanks & 🤘',
  'Schreib uns kurz, welches Festival dir fehlt – am besten mit Jahr und Link zum Lineup. Wir melden uns, sobald es am Start ist. 🤘':
    'Tell us which festival is missing, ideally with the year and a line-up link. We will get back to you as soon as it is available. 🤘',
  oder: 'or',
  'Keine Verbindung – dafür braucht es Netz': 'No connection – this requires internet access',
  'Keine Verbindung – bitte später erneut': 'No connection – please try again later',
  'Zu viele Versuche – bitte später erneut': 'Too many attempts – please try again later',
  'Zu viele Versuche – bitte kurz warten': 'Too many attempts – please wait a moment',
  'Zu viele Versuche': 'Too many attempts',
  'Nicht eingeloggt': 'Not signed in',
  'Nicht eingeloggt – bitte mit Passkey anmelden': 'Not signed in – please use your passkey',
  'Noch in keiner Gruppe': 'Not in a group yet',
  'Kein Mitglied dieser Gruppe': 'Not a member of this group',
  'Festival nicht gefunden': 'Festival not found',
  'Ungültige Anfrage': 'Invalid request',
  'Unbekannter Slot': 'Unknown slot',
  'Unbekannter Nutzer': 'Unknown user',
  'Login abgelaufen – bitte nochmal versuchen': 'Login expired – please try again',
  'Passkey hier unbekannt – bitte erst registrieren':
    'This passkey is unknown here – please register it first',
  'Passkey konnte nicht bestätigt werden': 'The passkey could not be verified',
  'Nur Admins dürfen das': 'Only admins can do this',
  'Die eigene Rolle lässt sich nicht ändern – zum Austreten bitte „Gruppe verlassen“ benutzen':
    'You cannot change your own role – use “Leave group” instead',
  'Der Owner ist unantastbar': 'The owner cannot be changed',
  'Rolle muss "admin" oder "member" sein': 'Role must be “admin” or “member”',
  'Gruppenname muss 2–40 Zeichen lang sein': 'Group name must be 2–40 characters long',
  'Feuerrahmen-Schwelle muss 0–99 sein (0 = aus)':
    'Fire-frame threshold must be 0–99 (0 = off)',
  'Gruppe existiert nicht mehr': 'The group no longer exists',
  'Kein Gruppenbild': 'No group picture',
  'Nur WebP, JPEG oder PNG erlaubt': 'Only WebP, JPEG or PNG images are allowed',
  'Bild fehlt oder ist größer als 300 KB': 'Image is missing or larger than 300 KB',
  'Vorgang abgelaufen – bitte nochmal versuchen': 'Request expired – please try again',
  'Dieser Passkey ist schon registriert': 'This passkey is already registered',
  'Nutzer existiert nicht mehr': 'The user no longer exists',
  'Registrierung abgelaufen – bitte nochmal versuchen':
    'Registration expired – please try again',
  'Registrierung fehlgeschlagen – bitte nochmal versuchen':
    'Registration failed – please try again',
  'Unbekanntes Festival': 'Unknown festival',
  'Das Festival ist schon vorbei – dafür lässt sich keine Gruppe mehr gründen':
    'This festival is already over – a new group can no longer be created for it',
  'Gruppe konnte nicht angelegt werden – bitte nochmal versuchen':
    'The group could not be created – please try again',
  'Name muss 2–30 Zeichen lang sein': 'Name must be 2–30 characters long',
  'Unbekannte Farbe': 'Unknown colour',
  'Koordinaten müssen 0–100 sein': 'Coordinates must be between 0 and 100',
  'Erst bei der Band eintragen, dann Position markieren':
    'Join the band slot before marking your position',
  'Unbekannte Bühne': 'Unknown stage',
  'Ungültiger Blueprint': 'Invalid stage map',
  'Mitteilung nicht gefunden': 'Notification not found',
  'Bitte eine gültige E-Mail-Adresse angeben': 'Please enter a valid email address',
  'Das aktuelle Passwort ist falsch': 'The current password is incorrect',
  'Diese E-Mail gehört schon zu einem anderen Konto':
    'This email address already belongs to another account',
  'Ungültige Subscription': 'Invalid subscription',
  'Push nicht konfiguriert': 'Push notifications are not configured',
  'Fehler beim Senden': 'Could not send',
  'Serverfehler': 'Server error',
  'E-Mail:': 'Email:',
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
  const saveBand = key.match(/^(.+) merken$/);
  if (saveBand) return spaced(`Save ${saveBand[1]}`);
  const unsaveBand = key.match(/^(.+) nicht mehr merken$/);
  if (unsaveBand) return spaced(`Stop saving ${unsaveBand[1]}`);
  const announcedBands = key.match(/^· (\d+) Bands announced$/);
  if (announcedBands) return spaced(`· ${announcedBands[1]} bands announced`);
  const interested = key.match(/^(\d+) interessiert$/);
  if (interested) return spaced(`${interested[1]} interested`);
  const since = key.match(/^seit (.+)$/);
  if (since) return spaced(`since ${since[1]}`);
  const removeMember = key.match(/^(.+) wirklich aus der Gruppe entfernen\?$/);
  if (removeMember) return spaced(`Really remove ${removeMember[1]} from the group?`);
  const removeLogin = key.match(/^(.+) wirklich entfernen\? Damit kannst du dich dann nicht mehr einloggen\.$/);
  if (removeLogin) return spaced(`Really remove ${removeLogin[1]}? You will no longer be able to sign in with it.`);
  const commitments = key.match(/^(\d+) festen Zusagen$/);
  if (commitments) return spaced(`from ${commitments[1]} confirmed attendees`);
  const minutesAgo = key.match(/^vor (\d+) Min\.$/);
  if (minutesAgo) return spaced(`${minutesAgo[1]} min ago`);
  const hoursAgo = key.match(/^vor (\d+) Std\.$/);
  if (hoursAgo) return spaced(`${hoursAgo[1]} hr ago`);
  const daysAgo = key.match(/^vor (\d+) Tag(?:en)?$/);
  if (daysAgo) return spaced(`${daysAgo[1]} day${daysAgo[1] === '1' ? '' : 's'} ago`);
  const interestedNonBinding = key.match(/^(\d+) interessiert \(unverbindlich\)$/);
  if (interestedNonBinding) return spaced(`${interestedNonBinding[1]} interested`);
  const sentBy = key.match(/^gesendet von (.+)$/);
  if (sentBy) return spaced(`sent by ${sentBy[1]}`);
  const removed = key.match(/^(.+) entfernt$/);
  if (removed) return spaced(`${removed[1]} removed`);
  const nowAdmin = key.match(/^(.+) ist jetzt Admin$/);
  if (nowAdmin) return spaced(`${nowAdmin[1]} is now an admin`);
  const noAdmin = key.match(/^(.+) ist kein Admin mehr$/);
  if (noAdmin) return spaced(`${noAdmin[1]} is no longer an admin`);
  const makeAdmin = key.match(/^(.+) zum Admin machen\? Admins können die Gruppe bearbeiten, Mitglieder entfernen und weitere Admins ernennen\.$/);
  if (makeAdmin) return spaced(`Make ${makeAdmin[1]} an admin? Admins can edit the group, remove members and appoint more admins.`);
  const revokeAdmin = key.match(/^(.+) die Admin-Rechte entziehen\?$/);
  if (revokeAdmin) return spaced(`Remove admin rights from ${revokeAdmin[1]}?`);
  const makeAdminTitle = key.match(/^(.+) zum Admin machen$/);
  if (makeAdminTitle) return spaced(`Make ${makeAdminTitle[1]} an admin`);
  const revokeAdminTitle = key.match(/^(.+) die Admin-Rechte entziehen$/);
  if (revokeAdminTitle) return spaced(`Remove admin rights from ${revokeAdminTitle[1]}`);
  const removeMemberTitle = key.match(/^(.+) entfernen$/);
  if (removeMemberTitle) return spaced(`Remove ${removeMemberTitle[1]}`);
  const deleteDay = key.match(/^(.+) \((\d{4}-\d{2}-\d{2})\) wird entfernt(?: – inklusive (\d+) (?:Slot|Slots) an diesem Tag)?\.$/);
  if (deleteDay) {
    const included = deleteDay[3]
      ? `, including ${deleteDay[3]} slot${deleteDay[3] === '1' ? '' : 's'} on this day`
      : '';
    return spaced(`${deleteDay[1]} (${deleteDay[2]}) will be removed${included}.`);
  }
  const deleteStage = key.match(/^"(.+)" wird entfernt – inklusive Bühnenplan(?: und (\d+) (?:Slot|Slots) auf dieser Bühne)?\.$/);
  if (deleteStage) {
    const included = deleteStage[2]
      ? ` and ${deleteStage[2]} slot${deleteStage[2] === '1' ? '' : 's'} on this stage`
      : '';
    return spaced(`"${deleteStage[1]}" will be removed, including its stage map${included}.`);
  }
  const deleteSlot = key.match(/^"(.+)" \(([^)]+)\) wird aus dem Timetable entfernt\.$/);
  if (deleteSlot) return spaced(`"${deleteSlot[1]}" (${deleteSlot[2]}) will be removed from the timetable.`);
  const deleteAnnouncement = key.match(/^„(.+)“ für alle löschen\? Die Mitteilung verschwindet aus der App aller Nutzer – bereits zugestellte Push-Benachrichtigungen lassen sich aber nicht zurückholen\.$/);
  if (deleteAnnouncement) return spaced(`Delete “${deleteAnnouncement[1]}” for everyone? It will disappear from the app, but delivered push notifications cannot be recalled.`);
  const sentPush = key.match(/^✓ Gesendet – (\d+) Push-Geräte? erreicht; in der App sehen sie alle\.$/);
  if (sentPush) return spaced(`✓ Sent – reached ${sentPush[1]} push device${sentPush[1] === '1' ? '' : 's'}; everyone can see it in the app.`);
  const serverError = key.match(/^Serverfehler \((\d+)\)$/);
  if (serverError) return spaced(`Server error (${serverError[1]})`);
  const statusError = key.match(/^Fehler \((\d+)\)$/);
  if (statusError) return spaced(`Error (${statusError[1]})`);
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

function translatedMailto(value: string, locale: Locale) {
  if (locale !== 'en' || !value.startsWith('mailto:')) return value;
  const [address, query = ''] = value.split('?', 2);
  const params = new URLSearchParams(query);
  for (const field of ['subject', 'body']) {
    const current = params.get(field);
    if (current) params.set(field, translated(current));
  }
  const suffix = params.toString();
  return suffix ? `${address}?${suffix}` : address;
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

    if (element instanceof HTMLAnchorElement) {
      const current = element.getAttribute('href');
      if (!current?.startsWith('mailto:')) continue;
      const key = 'data-i18n-original-href';
      const original = element.getAttribute(key) ?? current;
      element.setAttribute(key, original);
      const next = translatedMailto(original, locale);
      if (current !== next) element.setAttribute('href', next);
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
  const pathname = usePathname();

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
      attributeFilter: ['aria-label', 'title', 'placeholder', 'href'],
    });
    return () => observer.disconnect();
  }, [locale]);

  useEffect(() => {
    const metadata = PAGE_METADATA[pathname]?.[locale];
    if (!metadata) return;
    document.title = metadata.title;
    if (!metadata.description) return;
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      document.head.querySelector(selector)?.setAttribute('content', metadata.description);
    }
  }, [locale, pathname]);

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

export function LanguageSwitch({ placement = 'floating' }: { placement?: 'floating' | 'profile' }) {
  const { locale, setLocale } = useLanguage();
  const pathname = usePathname();
  const isPublicPage =
    pathname === '/' ||
    pathname === '/veranstalter' ||
    pathname === '/passwort-reset' ||
    pathname.startsWith('/join/');

  if (placement === 'floating' && !isPublicPage) return null;

  return (
    <div
      data-no-i18n
      className={
        placement === 'floating'
          ? 'fixed bottom-4 right-3 z-[100] flex rounded-full border border-rivet bg-steel/95 p-0.5 text-[10px] font-black tracking-wider shadow-xl backdrop-blur'
          : 'flex shrink-0 rounded-full border border-rivet bg-steel-2 p-0.5 text-[10px] font-black tracking-wider'
      }
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
