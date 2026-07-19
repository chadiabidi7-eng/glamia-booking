export default function ConfidentialitePage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Politique de confidentialité</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Dernière mise à jour : 19 juillet 2026</p>

      <Section title="1. Responsable du traitement">
        <p>Glamia, application de gestion de rendez-vous et d&apos;encaissement pour professionnels de la beauté.</p>
      </Section>

      <Section title="2. Données collectées">
        <p>Lors de la prise de rendez-vous en ligne, nous collectons :</p>
        <ul>
          <li>Prénom et nom</li>
          <li>Adresse email</li>
          <li>Numéro de téléphone</li>
          <li>Prestations choisies, date et heure du rendez-vous</li>
          <li>Commentaires optionnels laissés par la cliente</li>
        </ul>
        <p>Si vous réglez en ligne (acompte, empreinte bancaire ou paiement via Glamia Pay), nous collectons également le montant, le type et la date de la transaction ainsi que les identifiants techniques de paiement. Les données de votre carte bancaire sont saisies et traitées directement par notre prestataire de paiement (Stripe) et ne sont jamais stockées par Glamia.</p>
      </Section>

      <Section title="3. Finalité du traitement">
        <p>Vos données sont utilisées exclusivement pour :</p>
        <ul>
          <li>La gestion et le suivi de vos rendez-vous</li>
          <li>L&apos;envoi de confirmations, rappels et notifications par email liés à vos rendez-vous</li>
          <li>Le traitement des paiements, acomptes, empreintes bancaires et remboursements liés à vos rendez-vous</li>
          <li>La communication entre vous et votre praticienne</li>
        </ul>
      </Section>

      <Section title="4. Base légale">
        <p>Le traitement est fondé sur l&apos;exécution du service demandé (prise de rendez-vous et, le cas échéant, paiement associé) conformément à l&apos;article 6.1.b du RGPD. La conservation des données de paiement et de facturation répond en outre à nos obligations légales et comptables (article 6.1.c du RGPD).</p>
      </Section>

      <Section title="5. Durée de conservation">
        <p>Vos données sont conservées pendant la durée de la relation commerciale avec votre praticienne, puis supprimées dans un délai de 12 mois après votre dernier rendez-vous.</p>
        <p>Les données de paiement et de facturation sont conservées le temps requis par nos obligations légales et comptables.</p>
      </Section>

      <Section title="6. Paiements et Glamia Pay">
        <p>Glamia met à disposition de votre praticienne des fonctionnalités de paiement — acompte à la réservation, empreinte bancaire, encaissement par carte (y compris sans terminal, la carte étant posée sur l&apos;iPhone de la praticienne) et liens de paiement — regroupées sous le nom Glamia Pay.</p>
        <p>Ces paiements sont traités par <strong>Stripe</strong> (Stripe Payments Europe, Ltd.), prestataire certifié conforme à la norme de sécurité PCI-DSS. Les informations de votre carte bancaire sont saisies et traitées <strong>directement par Stripe</strong> : elles ne transitent pas par Glamia et ne sont jamais conservées sur nos serveurs.</p>
        <p>Lorsque vous laissez une empreinte bancaire, aucune somme n&apos;est débitée à la réservation : il s&apos;agit d&apos;une autorisation permettant à votre praticienne de débiter le montant convenu en cas d&apos;absence non annulée, selon les conditions affichées avant paiement.</p>
      </Section>

      <Section title="7. Partage des données">
        <p>Vos données sont accessibles uniquement à la praticienne auprès de laquelle vous prenez rendez-vous. Elles ne sont ni vendues, ni partagées avec des tiers à des fins commerciales.</p>
        <p>Nous faisons appel à des prestataires techniques (sous-traitants) strictement nécessaires au fonctionnement du service :</p>
        <ul>
          <li>Hébergement des données : Supabase (serveurs situés dans l&apos;Union européenne).</li>
          <li>Paiements : Stripe, pour le traitement sécurisé des transactions Glamia Pay.</li>
          <li>Envoi des emails (confirmations, rappels) : notre prestataire d&apos;emailing.</li>
        </ul>
      </Section>

      <Section title="8. Vos droits">
        <p>Conformément au RGPD, vous disposez des droits suivants :</p>
        <ul>
          <li>Droit d&apos;accès, de rectification et de suppression de vos données</li>
          <li>Droit à la portabilité</li>
          <li>Droit d&apos;opposition et de limitation du traitement</li>
        </ul>
        <p>Pour exercer vos droits, contactez-nous à : <strong>contact@glamia.pro</strong></p>
      </Section>

      <Section title="9. Cookies">
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
