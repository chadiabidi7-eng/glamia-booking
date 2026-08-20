import type { Metadata } from 'next';
import { traduireDans } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// LA PAGE D'AIDE SUIT LA LANGUE DEMANDÉE, COMME LES CONDITIONS.
//
// C'est l'adresse d'assistance déclarée à Apple. Le testeur qui examine la
// fiche anglaise l'ouvre : il doit y trouver de l'anglais, pas du français.
// Elle lit donc ?lang=en ou ?lang=es, exactement comme /cgu et /confidentialite.
//
// La moitié de ses réponses étaient écrites en dur dans le code. Elles sont
// désormais dans les fichiers de langue, avec tout le reste.
// ─────────────────────────────────────────────────────────────────────────────

type Params = { searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const { lang } = await searchParams;
  return {
    title: traduireDans(lang, 'aide.metaTitre'),
    description: traduireDans(lang, 'aide.description'),
  };
}

const ROSE = '#C0567A';

export default async function AidePage({ searchParams }: Params) {
  const { lang } = await searchParams;
  const t = (cle: string) => traduireDans(lang, cle);
  const suffixe = lang ? `?lang=${lang}` : '';

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{t('aide.titre')}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6b7280', marginBottom: 28 }}>
        {t('aide.intro')}
      </p>

      {/* ── Bloc contact ── */}
      <div style={{ border: '1px solid #f0d9e2', background: '#fdf5f8', borderRadius: 14, padding: 20, marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#111827' }}>{t('aide.nousContacter')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href="mailto:contact@glamia.pro"
            style={{ display: 'inline-block', background: ROSE, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center' }}
          >{t('aide.ecrireEmail')}</a>
          <a
            href="https://www.instagram.com/glamia.officiel/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', background: '#fff', color: ROSE, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center', border: `1.5px solid ${ROSE}` }}
          >{t('aide.ecrireInstagram')}</a>
        </div>
      </div>

      <Section title={t('aide.essaiTitre')}>
        <p>
          {t('aide.essaiDebut')} <strong>{t('aide.essaiQuatorzeJours')}</strong>. {t('aide.essaiSuite')}
        </p>
      </Section>

      <Section title={t('aide.gererAbonnement')}>
        <p>
          {t('aide.abonnementApple')} <strong>{t('aide.reglages')}</strong>{t('aide.cheminApple')}
          <strong>{t('aide.abonnements')}</strong> → <strong>Glamia</strong>. {t('aide.resiliationEffet')}
        </p>
      </Section>

      <Section title={t('aide.payTitre')}>
        <p>{t('aide.payTexte')}</p>
      </Section>

      <Section title={t('aide.bug')}>
        <p>{t('aide.bugTexte')}</p>
      </Section>

      <Section title={t('aide.supprimerCompte')}>
        <p>{t('aide.supprimerCompteTexte')}</p>
      </Section>

      <Section title={t('aide.vousEtesCliente')}>
        <p>{t('aide.clienteTexte')}</p>
      </Section>

      <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <a href={`/cgu${suffixe}`} style={{ color: '#9ca3af' }}>{t('resa.conditionsUtilisation')}</a>
        <a href={`/confidentialite${suffixe}`} style={{ color: '#9ca3af' }}>{t('resa.confidentialite')}</a>
      </div>
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
