import { permanentRedirect } from 'next/navigation';

/**
 * Die Landingpage ist auf "/" umgezogen (Standard-Startseite). Alte Links
 * auf "/landing" leiten dauerhaft dorthin weiter.
 */
export default function LandingRedirect() {
  permanentRedirect('/');
}
