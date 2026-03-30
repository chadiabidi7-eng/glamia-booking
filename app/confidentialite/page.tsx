export default function ConfidentialitePage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Politique de confidentialité</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Dernière mise à jour : 29 mars 2026</p>

      <Section title="1. Responsable du traitement">
        <p>Glamia, application de gestion de rendez-vous pour professionnels de la beauté.</p>
      </Section>

      <Section title="2. Données collectées">
        <p>Lors de la prise de rendez-vous en ligne, nous collectons :</p>
        <ul>
          <li>Prénom et nom</li>
          <li>Numéro de téléphone</li>
          <li>Prestations choisies, date et heure du rendez-vous</li>
          <li>Commentaires optionnels laissés par la cliente</li>
        </ul>
      </Section>

      <Section title="3. Finalité du traitement">
        <p>Vos données sont utilisées exclusivement pour :</p>
        <ul>
          <li>La gestion et le suivi de vos rendez-vous</li>
          <li>L&apos;envoi de rappels et notifications liés à vos rendez-vous</li>
          <li>La communication entre vous et votre praticienne</li>
        </ul>
      </Section>

      <Section title="4. Base légale">
        <p>Le traitement est fondé sur l&apos;exécution du service demandé (prise de rendez-vous) conformément à l&apos;article 6.1.b du RGPD.</p>
      </Section>

      <Section title="5. Durée de conservation">
        <p>Vos données sont conservées pendant la durée de la relation commerciale avec votre praticienne, puis supprimées dans un délai de 12 mois après votre dernier rendez-vous.</p>
      </Section>

      <Section title="6. Partage des données">
        <p>Vos données sont accessibles uniquement à la praticienne auprès de laquelle vous prenez rendez-vous. Elles ne sont ni vendues, ni partagées avec des tiers à des fins commerciales.</p>
        <p>Hébergement : Supabase (serveurs UE).</p>
      </Section>

      <Section title="7. Vos droits">
        <p>Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul>
          <li>Droit d&apos;accès, de rectification et de suppression de vos données</li>
          <li>Droit à la portabilité</li>
          <li>Droit d&apos;opposition et de limitation du traitement</li>
        </ul>
        <p>Pour exercer vos droits, contactez-nous à : <strong>contact@glamia.pro</strong></p>
      </Section>

      <Section title="8. Cookies">
        <p>Le site de réservation Glamia n&apos;utilise pas de cookies publicitaires. Seuls des cookies techniques nécessaires au bon fonctionnement du service sont utilisés.</p>
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
