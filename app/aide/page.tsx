import type { Metadata } from 'next';
import { traduire } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Aide & assistance — Glamia',
  description: traduire('aide.description'),
};

const ROSE = '#C0567A';

export default function AidePage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{traduire('aide.titre')}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6b7280', marginBottom: 28 }}>
        {traduire('aide.intro')}
      </p>

      {/* ── Bloc contact ── */}
      <div style={{ border: '1px solid #f0d9e2', background: '#fdf5f8', borderRadius: 14, padding: 20, marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#111827' }}>{traduire('aide.nousContacter')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href="mailto:contact@glamia.pro"
            style={{ display: 'inline-block', background: ROSE, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center' }}
          >{traduire('aide.ecrireEmail')}</a>
          <a
            href="https://www.instagram.com/glamia.officiel/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', background: '#fff', color: ROSE, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center', border: `1.5px solid ${ROSE}` }}
          >{traduire('aide.ecrireInstagram')}</a>
        </div>
      </div>

      <Section title="L'essai gratuit, comment ça marche ?">
        <p>
          {traduire('aide.essaiDebut')} <strong>{traduire('aide.essaiQuatorzeJours')}</strong>. À la fin de l&apos;essai, vous
          pouvez rester en version gratuite ou passer à Glamia&nbsp;Pro pour les clientes illimitées et les statistiques avancées.
          Aucun prélèvement n&apos;a lieu tant que vous ne choisissez pas un abonnement.
        </p>
      </Section>

      <Section title={traduire('aide.gererAbonnement')}>
        <p>
          {traduire('aide.abonnementApple')} <strong>{traduire('aide.reglages')}</strong>{traduire('aide.cheminApple')}
          <strong>{traduire('aide.abonnements')}</strong> → <strong>Glamia</strong>. {traduire('aide.resiliationEffet')}
        </p>
      </Section>

      <Section title="Glamia Pay : comment être payée ?">
        <p>
          Depuis l&apos;app, vous pouvez encaisser vos clientes par carte, sans terminal (la carte se pose sur votre iPhone), demander un
          acompte ou une empreinte à la réservation, et envoyer un lien de paiement par SMS. Tout est suivi dans votre caisse Glamia.
          Si un paiement ou un remboursement vous pose question, écrivez-nous&nbsp;: on regarde avec vous.
        </p>
      </Section>

      <Section title={traduire('aide.bug')}>
        <p>
          Fermez complètement l&apos;application puis rouvrez-la&nbsp;; si le problème persiste, déconnectez-vous et reconnectez-vous.
          Si ça ne suffit pas, écrivez-nous à <strong>contact@glamia.pro</strong> en décrivant ce qu&apos;il se passe (et, si possible,
          une capture d&apos;écran)&nbsp;: on vous répond rapidement.
        </p>
      </Section>

      <Section title={traduire('aide.supprimerCompte')}>
        <p>
          Vous pouvez demander la suppression définitive de votre compte et de toutes vos données à tout moment en nous écrivant à{' '}
          <strong>contact@glamia.pro</strong> depuis l&apos;adresse de votre compte. La suppression est effectuée sous quelques jours,
          conformément au RGPD.
        </p>
      </Section>

      <Section title={traduire('aide.vousEtesCliente')}>
        <p>
          Pour modifier ou annuler un rendez-vous, utilisez le lien de réservation que votre professionnelle vous a partagé, ou
          contactez-la directement. Pour un souci technique sur la réservation en ligne, écrivez-nous à <strong>contact@glamia.pro</strong>.
        </p>
      </Section>

      <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <a href="/cgu" style={{ color: '#9ca3af' }}>{traduire('resa.conditionsUtilisation')}</a>
        <a href="/confidentialite" style={{ color: '#9ca3af' }}>{traduire('resa.confidentialite')}</a>
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
