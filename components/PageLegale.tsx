import Editeur from '@/components/Editeur';
import i18n from '@/lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// LES PAGES DE DROIT : CONDITIONS ET CONFIDENTIALITÉ.
//
// ── POURQUOI UNE LISTE DE SECTIONS, ET PAS UN GABARIT FIGÉ ──────────────────
//
// Le texte anglais N'A PAS le même nombre de parties que le français : il
// couvre trois droits au lieu d'un — Royaume-Uni, États-Unis, Canada — et
// ajoute ce que le texte français ne dit nulle part : quelle loi s'applique,
// devant quel tribunal, et jusqu'où va notre responsabilité.
//
// Une page qui rendrait « section 1 à 10 » ne pourrait pas afficher les deux.
// Chaque langue apporte donc ses propres sections, et la page les déroule.
//
// ── LA LANGUE VIENT DE L'ADRESSE ────────────────────────────────────────────
//
// Ces pages n'appartiennent à aucune pro : on les ouvre depuis une page de
// réservation, depuis l'app, ou en tapant l'adresse. Les liens qui y mènent
// ajoutent la langue — /cgu?lang=en. Sans rien, c'est le français, exactement
// ce que voient les pros d'aujourd'hui.
// ─────────────────────────────────────────────────────────────────────────────

type Section = { titre: string; paragraphes: string[]; liste?: string[] };

/** Un paragraphe peut porter un lien ou une adresse : on les pose ici. */
function Paragraphe({ texte, lang }: { texte: string; lang?: string }) {
  const suffixe = lang ? `?lang=${lang}` : '';

  if (texte.includes('{confidentialite}')) {
    const [avant, apres] = texte.split('{confidentialite}');
    return (
      <p>
        {avant}
        <a href={`/confidentialite${suffixe}`} style={{ color: '#e91e8c', textDecoration: 'underline' }}>
          {i18n.t('resa.confidentialite', { locale: lang || 'fr' })}
        </a>
        {apres}
      </p>
    );
  }

  if (texte.includes('{contact}')) {
    const [avant, apres] = texte.split('{contact}');
    return <p>{avant}<strong>contact@glamia.pro</strong>{apres}</p>;
  }

  return <p>{texte}</p>;
}

export default function PageLegale({ bloc, lang }: { bloc: 'cgu' | 'confidentialite' | 'suppression' | 'conditionsClientes'; lang?: string }) {
  const locale = lang || 'fr';
  const t = (cle: string) => i18n.t(`${bloc}.${cle}`, { locale });
  const sections = i18n.t(`${bloc}.sections`, { locale }) as unknown as Section[];
  const contact = t('contact');

  const retour = i18n.t('pageLegale.retour', { locale });
  const SITE = 'https://glamia.pro';

  return (
    // LA PAGE PRÉSENTÉE COMME UN DOCUMENT GLAMIA (Chadi, 20 nov. 2026) : le logo en tête, qui
    // ramène au site principal, un lien de retour, puis le texte. Les textes à lire
    // attentivement sont justifiés, sans jamais couper un mot.
    <div lang={locale} style={{ minHeight: '100dvh', background: '#FAF7F5', fontFamily: 'system-ui, sans-serif', color: '#1f2937', WebkitFontSmoothing: 'antialiased' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #F0E6EA' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <a href={SITE} aria-label="Glamia" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/glamia-logo-net.png" alt="Glamia" width={682} height={176} style={{ height: 30, width: 'auto' }} />
          </a>
          <a href={SITE} style={{ fontSize: 13.5, fontWeight: 600, color: '#B0578A', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <span aria-hidden>←</span>{retour}
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.05)', textAlign: 'justify', hyphens: 'none' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 8px', letterSpacing: -0.3, textAlign: 'left', textWrap: 'balance' }}>{t('titre')}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', textAlign: 'left' }}>{t('maj')}</p>
      {/* À QUI S'ADRESSE CE TEXTE (Chadi, 20 nov. 2026) : dit tout en haut, quand la page le précise. */}
      {(() => {
        const pour = i18n.t(`${bloc}.pour`, { locale, defaultValue: '' }) as string;
        return pour ? (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4b5563', background: '#FBF1F6', borderRadius: 12, padding: '14px 16px', margin: '0 0 32px' }}>{pour}</p>
        ) : null;
      })()}

      {sections.map((section, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: '#111827' }}>
            {section.titre}
          </h2>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#374151' }}>
            {section.paragraphes.map((p, j) => (
              // Un espace entre deux paragraphes (24 nov. 2026) : les longs passages étaient collés.
              <div key={j} style={{ marginBottom: j < section.paragraphes.length - 1 ? 12 : 0 }}>
                <Paragraphe texte={p.replace('{contact}', `${contact} {contact}`)} lang={lang} />
              </div>
            ))}
            {section.liste && (
              <ul>{section.liste.map((l, j) => <li key={j}>{l}</li>)}</ul>
            )}
          </div>
        </div>
      ))}
      <Editeur locale={locale} />
        </div>

        <footer style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <a href={SITE} style={{ fontSize: 14, fontWeight: 600, color: '#B0578A', textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden>←</span>{retour}
          </a>
          <p style={{ margin: 0, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: '#B0578A' }}>{i18n.t('pageLegale.slogan', { locale })}</p>
        </footer>
      </main>
    </div>
  );
}
