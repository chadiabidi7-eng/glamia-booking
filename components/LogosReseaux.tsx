// ─────────────────────────────────────────────────────────────────────────────
// LES LOGOS DES RÉSEAUX, DESSINÉS ICI ET NULLE PART AILLEURS.
//
// La page fermée proposait « Instagram Instagram », « TikTok TikTok » : le nom
// du réseau était écrit deux fois. L'emplacement de l'icône existait bien dans
// le code, mais il contenait le MOT « Instagram » au lieu d'un dessin.
//
// POURQUOI DES TRACÉS ÉCRITS À LA MAIN : la bibliothèque d'icônes du projet
// (lucide-react) a retiré tous les logos de marque. Aucun `Instagram` à
// importer, ni ici ni ailleurs.
//
// ET POURQUOI PAS UNE IMAGE DISTANTE : une cliente qui ouvre cette page est
// souvent dans les transports, sur un réseau qui laisse tomber les images
// tierces. Un logo qui ne charge pas laisse un carré vide à la place du seul
// moyen de joindre la pro. Le SVG est du texte : il arrive avec la page.
//
// CE SONT LES ICÔNES D'APPLICATION, pas des approximations. Trois détails font
// toute la différence entre « officiel » et « bricolé », et les trois avaient
// été ratés : le glyphe Instagram est un CONTOUR fin, jamais une masse pleine ;
// le fantôme Snapchat est BLANC sur le jaune, jamais noir ; et la note TikTok
// porte ses deux ombres décalées, cyan et rose, sans lesquelles ce n'est
// qu'une croche quelconque.
// ─────────────────────────────────────────────────────────────────────────────

type Props = { size?: number }

/** Le carré arrondi commun aux trois : c'est la forme d'une icône d'app. */
function Pastille({ size, fond, children }: { size: number; fond: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: size * 0.26,
      background: fond, flexShrink: 0, overflow: 'hidden',
    }}>{children}</span>
  )
}

/** Le dégradé d'Instagram porte un identifiant unique : deux dégradés de même
 *  nom dans une page et le navigateur n'en garde qu'un. */
export function LogoInstagram({ size = 22 }: Props) {
  return (
    <Pastille size={size} fond="#fff">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="glamia-ig-fond" cx="30%" cy="107%" r="150%">
            <stop offset="0%" stopColor="#FFDD55" />
            <stop offset="10%" stopColor="#FFDD55" />
            <stop offset="50%" stopColor="#FF543E" />
            <stop offset="100%" stopColor="#C837AB" />
          </radialGradient>
        </defs>
        <rect width="24" height="24" fill="url(#glamia-ig-fond)" />
        {/* Le boîtier, l'objectif et le témoin : des traits, pas des pleins. */}
        <rect
          x="5.1" y="5.1" width="13.8" height="13.8" rx="4.4"
          fill="none" stroke="#fff" strokeWidth="1.65"
        />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" strokeWidth="1.65" />
        <circle cx="16.7" cy="7.4" r="1.05" fill="#fff" />
      </svg>
    </Pastille>
  )
}

export function LogoTikTok({ size = 22 }: Props) {
  // La note et ses deux ombres : cyan décalée à gauche, rose à droite, la
  // blanche par-dessus. C'est ce décalage qui fait reconnaître TikTok.
  const note = 'M16.6 5.82a4.28 4.28 0 0 1-1.03-2.82h-2.9v11.6a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.3-2.49v-2.95a5.51 5.51 0 0 0-.71-.05A5.51 5.51 0 0 0 4.57 14.5a5.51 5.51 0 0 0 5.51 5.51 5.51 5.51 0 0 0 5.51-5.51V8.9a7.14 7.14 0 0 0 4.17 1.34V7.34a4.25 4.25 0 0 1-3.16-1.52z'
  return (
    <Pastille size={size} fond="#000">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={note} fill="#25F4EE" transform="translate(-0.9 0.5)" />
        <path d={note} fill="#FE2C55" transform="translate(0.9 -0.3)" />
        <path d={note} fill="#fff" />
      </svg>
    </Pastille>
  )
}

export function LogoSnapchat({ size = 22 }: Props) {
  return (
    <Pastille size={size} fond="#FFFC00">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {/* Le fantôme est BLANC — c'est l'icône telle qu'elle est sur le
            téléphone. En noir, on reconnaît un fantôme, pas Snapchat. */}
        <path
          fill="#fff"
          stroke="#fff"
          strokeWidth="0.35"
          d="M12.1 3.4c2.1.02 3.83 1.5 4.2 3.55.1.64.06 1.31.03 1.97l-.03.65c.05.03.14.05.27.05.21-.1.46-.09.72-.22a.8.8 0 0 1 .35-.07c.13 0 .26.02.37.06.32.11.52.35.52.6.02.32-.27.6-.85.84-.07.02-.16.05-.25.08-.32.1-.81.26-.94.58-.06.16-.04.38.09.62v.01c.04.1 1.07 2.47 3.37 2.85.18.03.3.19.29.37a.32.32 0 0 1-.03.16c-.17.4-.9.7-2.21.9-.05.06-.09.27-.12.41-.02.13-.05.26-.1.39-.05.19-.18.29-.39.29h-.02c-.1 0-.22-.02-.38-.05a5 5 0 0 0-.9-.1c-.21 0-.43.02-.65.05-.44.08-.81.34-1.23.63-.63.43-1.33.92-2.4.92h-.23c-1.04 0-1.73-.48-2.35-.91-.43-.3-.8-.55-1.24-.63a4.2 4.2 0 0 0-.65-.05c-.36 0-.65.04-.9.1-.16.03-.29.05-.38.05-.2 0-.34-.1-.4-.29a3.7 3.7 0 0 1-.09-.4c-.03-.13-.07-.34-.12-.4-1.31-.2-2.04-.5-2.21-.9a.32.32 0 0 1-.03-.16c-.01-.18.11-.34.3-.37 2.29-.38 3.32-2.75 3.36-2.85v-.01c.13-.24.15-.46.09-.62-.13-.32-.62-.48-.94-.58a3.7 3.7 0 0 1-.25-.08c-.58-.24-.87-.52-.85-.84 0-.25.2-.49.52-.6.11-.04.24-.06.37-.06.09 0 .22.01.35.07.26.13.51.21.72.22.13 0 .22-.02.27-.05l-.03-.65c-.03-.66-.07-1.33.03-1.97C8.27 4.9 10 3.42 12.1 3.4z"
        />
      </svg>
    </Pastille>
  )
}
