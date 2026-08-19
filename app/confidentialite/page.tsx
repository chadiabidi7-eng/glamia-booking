import { traduireDans } from '@/lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// LA POLITIQUE DE CONFIDENTIALITÉ.
//
// Même règle que les conditions d'utilisation : la langue vient de l'adresse
// (/confidentialite?lang=en), et rien du tout veut dire français.
//
// ── ⚠️ CELLE-CI DEMANDE PLUS QU'UNE TRADUCTION ──────────────────────────────
//
// Le texte anglais dit fidèlement ce que dit le français. Mais il PARLE DU
// RGPD, qui est le droit européen. Une pro britannique relève du UK GDPR, une
// pro américaine de lois d'État — le CCPA en Californie, d'autres ailleurs.
// Les articles cités et les droits listés ne sont pas les mêmes.
//
// À FAIRE RELIRE PAR UN JURISTE AVANT D'OUVRIR LE ROYAUME-UNI OU LES
// ÉTATS-UNIS. Ce n'est pas un détail de forme : c'est ce qui protège la pro
// autant que Glamia.
// ─────────────────────────────────────────────────────────────────────────────

export default async function ConfidentialitePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const t = (cle: string) => traduireDans(lang, `confidentialite.${cle}`);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{t('titre')}</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>{t('maj')}</p>

      <Section title={t('s1t')}><p>{t('s1')}</p></Section>

      <Section title={t('s2t')}>
        <p>{t('s2')}</p>
        <ul>{['s2l1', 's2l2', 's2l3', 's2l4', 's2l5'].map(c => <li key={c}>{t(c)}</li>)}</ul>
        <p>{t('s2b')}</p>
      </Section>

      <Section title={t('s3t')}>
        <p>{t('s3')}</p>
        <ul>{['s3l1', 's3l2', 's3l3', 's3l4'].map(c => <li key={c}>{t(c)}</li>)}</ul>
      </Section>

      <Section title={t('s4t')}><p>{t('s4')}</p></Section>

      <Section title={t('s5t')}>
        <p>{t('s5')}</p>
        <p>{t('s5b')}</p>
      </Section>

      <Section title={t('s6t')}>
        <p>{t('s6')}</p>
        <p>{t('s6b')}</p>
        <p>{t('s6c')}</p>
      </Section>

      <Section title={t('s7t')}>
        <p>{t('s7')}</p>
        <p>{t('s7b')}</p>
        <ul>{['s7l1', 's7l2', 's7l3'].map(c => <li key={c}>{t(c)}</li>)}</ul>
      </Section>

      <Section title={t('s8t')}>
        <p>{t('s8')}</p>
        <ul>{['s8l1', 's8l2', 's8l3'].map(c => <li key={c}>{t(c)}</li>)}</ul>
        <p>{t('s8b')} <strong>contact@glamia.pro</strong></p>
      </Section>

      <Section title={t('s9t')}><p>{t('s9')}</p></Section>
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
