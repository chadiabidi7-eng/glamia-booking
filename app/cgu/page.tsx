export default function CGUPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Conditions Générales d&apos;Utilisation</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Dernière mise à jour : 29 mars 2026</p>

      <Section title="1. Objet">
        <p>Les présentes CGU régissent l&apos;utilisation de l&apos;application Glamia, destinée aux professionnels de la beauté pour la gestion de leurs rendez-vous et de leur clientèle.</p>
      </Section>

      <Section title="2. Accès au service">
        <p>L&apos;inscription à Glamia est réservée aux professionnels de la beauté. L&apos;utilisateur s&apos;engage à fournir des informations exactes lors de son inscription.</p>
      </Section>

      <Section title="3. Compte utilisateur">
        <p>Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion. Toute activité réalisée depuis son compte est présumée être de son fait.</p>
      </Section>

      <Section title="4. Utilisation du service">
        <p>L&apos;utilisateur s&apos;engage à utiliser Glamia conformément à sa destination : gestion de rendez-vous, suivi de clientèle et communication professionnelle. Tout usage abusif ou frauduleux pourra entraîner la suspension du compte.</p>
      </Section>

      <Section title="5. Données et vie privée">
        <p>L&apos;utilisateur est responsable des données personnelles de ses clientes qu&apos;il saisit dans Glamia. Il s&apos;engage à respecter le RGPD et à informer ses clientes de l&apos;utilisation de leurs données.</p>
        <p>Pour plus de détails, consultez notre <a href="/confidentialite" style={{ color: '#e91e8c', textDecoration: 'underline' }}>Politique de confidentialité</a>.</p>
      </Section>

      <Section title="6. Propriété intellectuelle">
        <p>L&apos;ensemble des éléments de l&apos;application Glamia (design, code, marque, contenus) sont la propriété exclusive de Glamia. Toute reproduction est interdite sans autorisation.</p>
      </Section>

      <Section title="7. Limitation de responsabilité">
        <p>Glamia met tout en œuvre pour assurer la disponibilité du service, mais ne peut garantir une disponibilité ininterrompue. Glamia ne saurait être tenue responsable des dommages indirects liés à l&apos;utilisation du service.</p>
      </Section>

      <Section title="8. Résiliation">
        <p>L&apos;utilisateur peut supprimer son compte à tout moment. Glamia se réserve le droit de suspendre ou supprimer un compte en cas de violation des présentes CGU.</p>
      </Section>

      <Section title="9. Modification des CGU">
        <p>Glamia se réserve le droit de modifier les présentes CGU. Les utilisateurs seront informés de toute modification substantielle.</p>
      </Section>

      <Section title="10. Contact">
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
