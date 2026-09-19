// ─────────────────────────────────────────────────────────────────────────────
// LES LOGOS DES RÉSEAUX, DESSINÉS ICI ET NULLE PART AILLEURS.
//
// La page fermée proposait « Instagram Instagram », « TikTok TikTok » : le nom
// du réseau était écrit deux fois. L'emplacement de l'icône existait bien dans
// le code, mais il contenait le MOT « Instagram » au lieu d'un dessin — un
// détail qui saute aux yeux de toutes les clientes d'une pro dont la page s'est
// fermée, c'est-à-dire au pire moment.
//
// POURQUOI DES TRACÉS ÉCRITS À LA MAIN : la bibliothèque d'icônes du projet
// (lucide-react) a retiré tous les logos de marque. Aucun `Instagram` à
// importer, ni ici ni ailleurs — vérifié sur la version installée.
//
// ET POURQUOI PAS UNE IMAGE DISTANTE : une cliente qui ouvre cette page est
// souvent dans les transports, sur un réseau qui laisse tomber les images
// tierces. Un logo qui ne charge pas laisse un carré vide à la place du seul
// moyen de joindre la pro. Le SVG est du texte : il arrive avec la page.
//
// CHAQUE LOGO GARDE SES COULEURS DE MARQUE, sur une pastille ronde — c'est
// l'icône de l'application telle qu'elle est sur le téléphone de la cliente.
// Elle la reconnaît sans lire.
// ─────────────────────────────────────────────────────────────────────────────

type Props = { size?: number }

/** Le dégradé d'Instagram porte un identifiant unique : deux dégradés de même
 *  nom dans une page et le navigateur n'en garde qu'un. */
export function LogoInstagram({ size = 22 }: Props) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="glamia-ig" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FEDA75" />
            <stop offset="25%" stopColor="#FA7E1E" />
            <stop offset="50%" stopColor="#D62976" />
            <stop offset="75%" stopColor="#962FBF" />
            <stop offset="100%" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect width="24" height="24" fill="url(#glamia-ig)" />
        <path
          fill="#fff"
          d="M12 6.865a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27zm0 8.468a3.333 3.333 0 1 1 0-6.666 3.333 3.333 0 0 1 0 6.666zm6.538-8.671a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0zM12 4.54c-2.003 0-2.253.008-3.04.044-.786.036-1.322.16-1.79.343a3.61 3.61 0 0 0-1.306.85 3.61 3.61 0 0 0-.85 1.306c-.183.468-.307 1.004-.343 1.79C4.635 9.66 4.626 9.91 4.626 12s.009 2.34.045 3.127c.036.786.16 1.322.343 1.79.19.483.44.892.85 1.306.414.41.823.66 1.306.85.468.183 1.004.307 1.79.343.787.036 1.037.045 3.04.045s2.253-.009 3.04-.045c.786-.036 1.322-.16 1.79-.343a3.61 3.61 0 0 0 1.306-.85c.41-.414.66-.823.85-1.306.183-.468.307-1.004.343-1.79.036-.787.045-1.037.045-3.127s-.009-2.34-.045-3.127c-.036-.786-.16-1.322-.343-1.79a3.61 3.61 0 0 0-.85-1.306 3.61 3.61 0 0 0-1.306-.85c-.468-.183-1.004-.307-1.79-.343C14.253 4.548 14.003 4.54 12 4.54zm0 1.8c1.966 0 2.2.008 2.976.043.718.033 1.108.153 1.368.254.344.134.59.294.848.552.258.258.418.504.552.848.101.26.221.65.254 1.368.035.776.043 1.01.043 2.976s-.008 2.2-.043 2.976c-.033.718-.153 1.108-.254 1.368a2.28 2.28 0 0 1-.552.848c-.258.258-.504.418-.848.552-.26.101-.65.221-1.368.254-.776.035-1.01.043-2.976.043s-2.2-.008-2.976-.043c-.718-.033-1.108-.153-1.368-.254a2.28 2.28 0 0 1-.848-.552 2.28 2.28 0 0 1-.552-.848c-.101-.26-.221-.65-.254-1.368-.035-.776-.043-1.01-.043-2.976s.008-2.2.043-2.976c.033-.718.153-1.108.254-1.368.134-.344.294-.59.552-.848a2.28 2.28 0 0 1 .848-.552c.26-.101.65-.221 1.368-.254C9.8 6.348 10.034 6.34 12 6.34z"
        />
      </svg>
    </span>
  )
}

export function LogoTikTok({ size = 22 }: Props) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', background: '#000' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="#fff"
          d="M16.6 5.82a4.28 4.28 0 0 1-1.03-2.82h-2.9v11.6a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.3-2.49v-2.95a5.51 5.51 0 0 0-.71-.05A5.51 5.51 0 0 0 4.57 14.5a5.51 5.51 0 0 0 5.51 5.51 5.51 5.51 0 0 0 5.51-5.51V8.9a7.14 7.14 0 0 0 4.17 1.34V7.34a4.25 4.25 0 0 1-3.16-1.52z"
        />
      </svg>
    </span>
  )
}

export function LogoSnapchat({ size = 22 }: Props) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden', background: '#FFFC00' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="#000"
          d="M12.1 4c1.95.02 3.56 1.4 3.9 3.3.1.6.06 1.22.03 1.83-.01.2-.02.4-.03.6.05.03.13.05.25.05.2-.01.43-.08.67-.2a.74.74 0 0 1 .32-.07c.12 0 .24.02.34.06.3.1.48.32.48.55.01.3-.25.56-.79.78-.06.02-.14.05-.23.08-.3.09-.75.24-.87.54-.06.15-.04.35.08.58v.01c.04.09 1 2.29 3.13 2.64.17.03.28.18.27.34a.3.3 0 0 1-.03.15c-.16.37-.83.65-2.05.83-.04.06-.08.25-.11.38-.02.12-.05.24-.09.36-.05.18-.17.27-.36.27h-.02c-.09 0-.2-.02-.35-.05a4.6 4.6 0 0 0-.83-.09c-.2 0-.4.02-.6.05-.4.07-.75.31-1.14.58-.58.4-1.23.85-2.22.85h-.21c-.96 0-1.6-.44-2.17-.84-.4-.28-.74-.51-1.14-.58a3.9 3.9 0 0 0-.6-.05c-.34 0-.6.04-.84.09-.14.03-.26.05-.35.05-.19 0-.31-.09-.36-.27a3.4 3.4 0 0 1-.09-.36c-.03-.13-.07-.32-.11-.38-1.22-.18-1.9-.46-2.05-.83a.3.3 0 0 1-.03-.15c0-.16.1-.31.27-.34 2.14-.35 3.1-2.55 3.13-2.64v-.01c.13-.23.15-.43.09-.58-.13-.3-.58-.45-.87-.54a3.4 3.4 0 0 1-.23-.08c-.54-.22-.8-.48-.79-.78 0-.23.18-.45.48-.55.1-.04.22-.06.34-.06.08 0 .2.01.32.07.24.12.47.19.67.2.12 0 .2-.02.25-.05l-.03-.6c-.03-.61-.07-1.23.03-1.83A3.92 3.92 0 0 1 12.1 4z"
        />
      </svg>
    </span>
  )
}
