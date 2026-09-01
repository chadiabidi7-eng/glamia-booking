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
//
// ── CE QUI RESTE VRAI ───────────────────────────────────────────────────────
//
// Ce texte est écrit pour protéger Glamia et la pro autant que possible, mais
// il n'a été relu par aucun juriste — ni en français, ni en anglais. Le faire
// relire reste la bonne chose à faire, dans les deux langues.
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

export default function PageLegale({ bloc, lang }: { bloc: 'cgu' | 'confidentialite' | 'suppression'; lang?: string }) {
  const locale = lang || 'fr';
  const t = (cle: string) => i18n.t(`${bloc}.${cle}`, { locale });
  const sections = i18n.t(`${bloc}.sections`, { locale }) as unknown as Section[];
  const contact = t('contact');

  return (
    <div style={{
      maxWidth: 640, margin: '0 auto', padding: '40px 20px',
      fontFamily: 'system-ui, sans-serif', color: '#1f2937',
    }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{t('titre')}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>{t('maj')}</p>

      {sections.map((section, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: '#111827' }}>
            {section.titre}
          </h2>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#374151' }}>
            {section.paragraphes.map((p, j) => (
              <Paragraphe key={j} texte={p.replace('{contact}', `${contact} {contact}`)} lang={lang} />
            ))}
            {section.liste && (
              <ul>{section.liste.map((l, j) => <li key={j}>{l}</li>)}</ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
