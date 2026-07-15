export default function CGUPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Conditions Générales d&apos;Utilisation</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Dernière mise à jour : 15 juillet 2026</p>

      <Section title="1. Objet">
        <p>Les présentes CGU régissent l&apos;utilisation des services Glamia : l&apos;application mobile destinée aux professionnels de la beauté (gestion de rendez-vous, clientèle, encaissements) et les pages de réservation en ligne accessibles aux clientes de ces professionnels. Elles s&apos;appliquent aux professionnels inscrits (« la professionnelle ») comme aux clientes qui réservent ou paient via une page Glamia (« la cliente »).</p>
      </Section>

      <Section title="2. Accès au service">
        <p>L&apos;inscription à Glamia est réservée aux professionnels de la beauté. L&apos;utilisateur s&apos;engage à fournir des informations exactes lors de son inscription. La réservation en ligne est ouverte aux clientes sans création de compte.</p>
      </Section>

      <Section title="3. Compte utilisateur">
        <p>Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion. Toute activité réalisée depuis son compte est présumée être de son fait.</p>
      </Section>

      <Section title="4. Abonnements">
        <p>Glamia propose des formules d&apos;abonnement mensuelles (dont Glamia Pro et Glamia Pro Pay), dont les prix et le contenu sont présentés dans l&apos;application avant toute souscription. Un essai gratuit peut être proposé aux nouveaux comptes ; à son terme, le compte bascule sur l&apos;offre gratuite sauf souscription d&apos;un abonnement.</p>
        <p>Les abonnements sont souscrits, gérés et résiliés via l&apos;App Store (Apple), selon les conditions d&apos;Apple. La résiliation prend effet à la fin de la période en cours. Certaines fonctionnalités, dont les encaissements Glamia Pay, sont réservées à des formules spécifiques indiquées dans l&apos;application.</p>
      </Section>

      <Section title="5. Utilisation du service">
        <p>L&apos;utilisateur s&apos;engage à utiliser Glamia conformément à sa destination : gestion de rendez-vous, suivi de clientèle, communication professionnelle et encaissement de prestations réellement fournies. Tout usage abusif ou frauduleux pourra entraîner la suspension du compte. Les messages envoyés aux clientes depuis Glamia (rappels SMS, WhatsApp ou email, y compris leurs versions personnalisées) sont émis sous la responsabilité de la professionnelle.</p>
      </Section>

      <Section title="6. Paiements — Glamia Pay">
        <p>Glamia Pay permet à la professionnelle d&apos;encaisser ses prestations : paiement en ligne lors de la réservation (acompte ou totalité), empreinte bancaire, liens de paiement, et encaissement sans contact Tap to Pay sur iPhone.</p>
        <p>Les paiements sont traités par <strong>Stripe</strong>, prestataire de services de paiement agréé. La professionnelle qui active Glamia Pay ouvre un compte Stripe Express et accepte les conditions de Stripe (Stripe Connected Account Agreement). Glamia n&apos;est pas un établissement de paiement et ne détient pas les fonds : ils transitent par le compte Stripe de la professionnelle. Les données bancaires sont collectées et conservées par Stripe ; Glamia n&apos;y a pas accès.</p>
        <p>Des frais de service s&apos;appliquent aux encaissements réalisés via Glamia Pay ; ils sont portés à la connaissance de la professionnelle dans l&apos;application avant l&apos;activation du service.</p>
      </Section>

      <Section title="7. Réservation en ligne, acompte et empreinte bancaire">
        <p>Selon le choix de la professionnelle, la réservation en ligne peut être conditionnée à : un <strong>acompte</strong> (payé immédiatement et déduit du prix de la prestation), le <strong>paiement total</strong> de la prestation, ou une <strong>empreinte bancaire</strong> (carte enregistrée sans débit immédiat, débitable uniquement en cas d&apos;absence ou d&apos;annulation tardive, pour le montant annoncé lors de la réservation).</p>
        <p>Le montant à payer ou à garantir, ainsi que les frais de réservation, sont affichés à la cliente avant toute validation de paiement.</p>
      </Section>

      <Section title="8. Frais de réservation">
        <p>Les paiements effectués lors d&apos;une réservation en ligne (acompte, paiement total, ou prélèvement d&apos;une empreinte) comprennent des <strong>frais de réservation</strong>, affichés à la cliente avant le paiement. Ces frais rémunèrent le service de réservation et de paiement en ligne fourni par Glamia.</p>
        <p><strong>Les frais de réservation sont acquis dès la réservation et ne sont pas remboursables</strong>, y compris en cas d&apos;annulation dans les délais : seul le montant de la prestation (acompte ou totalité) est alors remboursé, conformément à l&apos;article 9.</p>
      </Section>

      <Section title="9. Annulation et remboursement">
        <p>Sauf conditions particulières affichées par la professionnelle, la politique d&apos;annulation est la suivante :</p>
        <p><strong>Annulation plus de 24 h avant le rendez-vous</strong> : l&apos;acompte ou le paiement de la prestation est remboursé à 100 % sur la carte utilisée (hors frais de réservation, non remboursables) ; une empreinte bancaire est libérée sans aucun débit. Le remboursement apparaît sur le compte de la cliente sous 5 à 10 jours ouvrés selon sa banque.</p>
        <p><strong>Annulation moins de 24 h avant le rendez-vous, ou absence</strong> : les sommes payées sont conservées par la professionnelle ; une empreinte bancaire peut être débitée du montant annoncé lors de la réservation, frais de réservation inclus.</p>
        <p>La professionnelle peut par ailleurs, à sa discrétion, procéder à tout moment à un remboursement partiel ou total du montant de la prestation depuis son application.</p>
      </Section>

      <Section title="10. Versements à la professionnelle">
        <p>Les sommes encaissées via Glamia Pay sont créditées sur le solde Stripe de la professionnelle après le délai de traitement bancaire, puis versées sur son compte bancaire : automatiquement selon la fréquence choisie, ou manuellement. Un virement instantané peut être proposé lorsque la banque de la professionnelle y est éligible ; les frais de cette option lui sont indiqués avant confirmation.</p>
      </Section>

      <Section title="11. Litiges bancaires">
        <p>En cas de contestation d&apos;un paiement par la cliente auprès de sa banque (chargeback), la procédure est gérée par Stripe et les réseaux bancaires. La professionnelle est notifiée dans l&apos;application et peut soumettre ses justificatifs via son espace Stripe. L&apos;issue du litige relève de la banque émettrice ; Glamia ne peut en garantir le résultat.</p>
      </Section>

      <Section title="12. Reçus et factures">
        <p>Pour chaque encaissement, la professionnelle peut adresser à la cliente un reçu numérique (email ou SMS), y compris lorsqu&apos;un paiement n&apos;a pas abouti. Les documents émis mentionnent le montant, la date et l&apos;identité de la professionnelle.</p>
      </Section>

      <Section title="13. Données et vie privée">
        <p>L&apos;utilisateur est responsable des données personnelles de ses clientes qu&apos;il saisit dans Glamia. Il s&apos;engage à respecter le RGPD et à informer ses clientes de l&apos;utilisation de leurs données.</p>
        <p>Pour plus de détails, consultez notre <a href="/confidentialite" style={{ color: '#e91e8c', textDecoration: 'underline' }}>Politique de confidentialité</a>.</p>
      </Section>

      <Section title="14. Propriété intellectuelle">
        <p>L&apos;ensemble des éléments de l&apos;application Glamia (design, code, marque, contenus) sont la propriété exclusive de Glamia. Toute reproduction est interdite sans autorisation.</p>
      </Section>

      <Section title="15. Limitation de responsabilité">
        <p>Glamia met tout en œuvre pour assurer la disponibilité du service, mais ne peut garantir une disponibilité ininterrompue. Glamia ne saurait être tenue responsable des dommages indirects liés à l&apos;utilisation du service. Les prestations réservées via Glamia sont fournies par la professionnelle, seule responsable de leur exécution ; Glamia n&apos;est pas partie au contrat entre la professionnelle et sa cliente.</p>
      </Section>

      <Section title="16. Résiliation">
        <p>L&apos;utilisateur peut supprimer son compte à tout moment. Glamia se réserve le droit de suspendre ou supprimer un compte en cas de violation des présentes CGU. La suppression du compte est sans effet sur les obligations nées des paiements déjà encaissés (remboursements, litiges en cours).</p>
      </Section>

      <Section title="17. Modification des CGU">
        <p>Glamia se réserve le droit de modifier les présentes CGU. Les utilisateurs seront informés de toute modification substantielle.</p>
      </Section>

      <Section title="18. Contact">
        <p>Pour toute question : <strong>contact@glamia.pro</strong></p>
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
