import { traduireDans } from '@/lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// LES CONDITIONS D'UTILISATION.
//
// ── LA LANGUE VIENT DE L'ADRESSE ────────────────────────────────────────────
//
// Cette page n'appartient à aucune pro : elle est ouverte depuis la page de
// réservation d'une cliente, depuis l'app d'une pro, ou tapée directement.
// Elle n'a donc aucun profil à interroger.
//
// Les liens qui y mènent ajoutent la langue : /cgu?lang=en. Sans rien, c'est le
// français — c'est ce que voient les 767 pros d'aujourd'hui, et ça ne bouge pas.
//
// ── ⚠️ CE TEXTE ANGLAIS EST UNE TRADUCTION, PAS UN TEXTE DE DROIT ANGLAIS ───
//
// Il dit fidèlement ce que disent les conditions françaises, pour qu'une pro
// anglophone comprenne ce qu'elle accepte. Il n'a PAS été écrit pour le droit
// britannique ou américain, et il n'a été relu par aucun juriste.
//
// À FAIRE RELIRE AVANT DE VENDRE AU ROYAUME-UNI OU AUX ÉTATS-UNIS.
// ─────────────────────────────────────────────────────────────────────────────

export default async function CGUPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const t = (cle: string) => traduireDans(lang, `cgu.${cle}`);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{t('titre')}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>{t('maj')}</p>

      {(['1', '2', '3', '4'] as const).map(n => (
        <Section key={n} title={t(`s${n}t`)}>
          <p>{t(`s${n}`)}</p>
        </Section>
      ))}

      <Section title={t('s5t')}>
        <p>{t('s5')}</p>
        <p>
          {t('s5b')}{' '}
          <a
            href={lang ? `/confidentialite?lang=${lang}` : '/confidentialite'}
            style={{ color: '#e91e8c', textDecoration: 'underline' }}>
            {traduireDans(lang, 'resa.confidentialite')}
          </a>.
        </p>
      </Section>

      {(['6', '7', '8', '9'] as const).map(n => (
        <Section key={n} title={t(`s${n}t`)}>
          <p>{t(`s${n}`)}</p>
        </Section>
      ))}

      <Section title={t('s10t')}>
        <p>{t('s10')} <strong>contact@glamia.pro</strong></p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: '#111827' }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: '#374151' }}>{children}</div>
    </div>
  );
}
