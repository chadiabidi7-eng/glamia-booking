import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aide & assistance — Glamia',
  description: "Besoin d'aide avec Glamia ? Contactez-nous par email ou sur Instagram, et retrouvez les réponses aux questions les plus fréquentes.",
};

const ROSE = '#C0567A';

export default function AidePage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Aide &amp; assistance</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6b7280', marginBottom: 28 }}>
        Une question, un souci, une idée ? On est là pour vous aider. On lit et on répond à tout, généralement sous 24 à 48&nbsp;heures (jours ouvrés).
      </p>

      {/* ── Bloc contact ── */}
      <div style={{ border: '1px solid #f0d9e2', background: '#fdf5f8', borderRadius: 14, padding: 20, marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#111827' }}>Nous contacter</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href="mailto:contact@glamia.pro"
            style={{ display: 'inline-block', background: ROSE, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center' }}
          >
            Écrire à contact@glamia.pro
          </a>
          <a
            href="https://www.instagram.com/glamia.officiel/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', background: '#fff', color: ROSE, textDecoration: 'none', fontWeight: 600, fontSize: 15, padding: '12px 18px', borderRadius: 10, textAlign: 'center', border: `1.5px solid ${ROSE}` }}
          >
            Nous écrire sur Instagram (@glamia.officiel)
          </a>
        </div>
      </div>

      <Section title="L'essai gratuit, comment ça marche ?">
        <p>
          À l&apos;installation, vous découvrez <strong>tout Glamia gratuitement pendant 14 jours</strong>. À la fin de l&apos;essai, vous
          pouvez rester en version gratuite ou passer à Glamia&nbsp;Pro pour les clientes illimitées et les statistiques avancées.
          Aucun prélèvement n&apos;a lieu tant que vous ne choisissez pas un abonnement.
        </p>
      </Section>

      <Section title="Gérer ou résilier mon abonnement">
        <p>
          Les abonnements Glamia sont gérés par Apple. Pour modifier ou résilier&nbsp;: ouvrez <strong>Réglages</strong> sur votre iPhone
          → touchez votre nom en haut → <strong>Abonnements</strong> → <strong>Glamia</strong>. La résiliation prend effet à la fin de
          la période déjà payée&nbsp;; vous gardez l&apos;accès jusque-là.
        </p>
      </Section>

      <Section title="Glamia Pay : comment être payée ?">
        <p>
          Depuis l&apos;app, vous pouvez encaisser vos clientes par carte, sans terminal (la carte se pose sur votre iPhone), demander un
          acompte ou une empreinte à la réservation, et envoyer un lien de paiement par SMS. Tout est suivi dans votre caisse Glamia.
          Si un paiement ou un remboursement vous pose question, écrivez-nous&nbsp;: on regarde avec vous.
        </p>
      </Section>

      <Section title="J'ai un bug ou un souci de connexion">
        <p>
          Fermez complètement l&apos;application puis rouvrez-la&nbsp;; si le problème persiste, déconnectez-vous et reconnectez-vous.
          Si ça ne suffit pas, écrivez-nous à <strong>contact@glamia.pro</strong> en décrivant ce qu&apos;il se passe (et, si possible,
          une capture d&apos;écran)&nbsp;: on vous répond rapidement.
        </p>
      </Section>

      <Section title="Supprimer mon compte et mes données">
        <p>
          Vous pouvez demander la suppression définitive de votre compte et de toutes vos données à tout moment en nous écrivant à{' '}
          <strong>contact@glamia.pro</strong> depuis l&apos;adresse de votre compte. La suppression est effectuée sous quelques jours,
          conformément au RGPD.
        </p>
      </Section>

      <Section title="Vous êtes cliente et vous avez pris rendez-vous ?">
        <p>
          Pour modifier ou annuler un rendez-vous, utilisez le lien de réservation que votre professionnelle vous a partagé, ou
          contactez-la directement. Pour un souci technique sur la réservation en ligne, écrivez-nous à <strong>contact@glamia.pro</strong>.
        </p>
      </Section>

      <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <a href="/cgu" style={{ color: '#9ca3af' }}>Conditions d&apos;utilisation</a>
        <a href="/confidentialite" style={{ color: '#9ca3af' }}>Politique de confidentialité</a>
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
