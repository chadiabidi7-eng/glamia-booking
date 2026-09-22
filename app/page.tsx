import { permanentRedirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// LA RACINE DU BOOKING N'A JAMAIS RIEN SERVI.
//
// Elle renvoyait vers `/reserve`, une page qui n'existe pas : quiconque tapait
// `booking.glamia.pro` tombait sur une erreur 404. Ça n'avait aucune
// conséquence tant que personne ne venait par là — les pages de réservation
// s'atteignent par leur adresse complète, depuis une bio Instagram.
//
// ÇA EN A UNE MAINTENANT QUE GOOGLE PASSE. Il suit les liens, arrive sur la
// racine, et trouve une erreur : un moteur juge un domaine dans son ensemble,
// et une porte d'entrée cassée est exactement ce qu'il retient contre lui.
//
// ON L'ENVOIE DONC SUR LE SITE, qui est la vraie porte d'entrée de Glamia.
//
// REDIRECTION PERMANENTE, ET C'EST VOULU : c'est elle qui transmet à
// glamia.pro la réputation acquise par ce domaine, au lieu de la laisser se
// perdre. Une redirection temporaire ne transmettrait rien.
//
// Ce qu'elle coûte : les navigateurs la retiennent longtemps. Le jour où une
// vraie page d'accueil existerait ici, elle mettrait du temps à réapparaître
// chez ceux qui sont déjà passés.
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  permanentRedirect('https://glamia.pro');
}
