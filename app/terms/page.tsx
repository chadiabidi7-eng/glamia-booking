export default function TermsPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Terms of Use</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Last updated: 11 July 2026</p>

      <Section title="1. Purpose">
        <p>These Terms of Use govern the use of the Glamia app, designed for beauty professionals to manage their appointments and clients.</p>
      </Section>

      <Section title="2. Access to the service">
        <p>Glamia registration is reserved for beauty professionals. You agree to provide accurate information when signing up.</p>
      </Section>

      <Section title="3. User account">
        <p>Each user is responsible for keeping their login credentials confidential. Any activity carried out from their account is presumed to be theirs.</p>
      </Section>

      <Section title="4. Use of the service">
        <p>You agree to use Glamia for its intended purpose: appointment management, client records and professional communication. Any misuse or fraudulent use may result in account suspension.</p>
      </Section>

      <Section title="5. Data and privacy">
        <p>You are responsible for the personal data of the clients you enter into Glamia. You agree to comply with applicable data protection law (GDPR / UK GDPR) and to inform your clients about how their data is used.</p>
        <p>For more details, see our <a href="/privacy" style={{ color: '#e91e8c', textDecoration: 'underline' }}>Privacy Policy</a>.</p>
      </Section>

      <Section title="6. Intellectual property">
        <p>All elements of the Glamia app (design, code, brand, content) are the exclusive property of Glamia. Any reproduction is prohibited without authorisation.</p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>Glamia makes every effort to keep the service available but cannot guarantee uninterrupted availability. Glamia cannot be held liable for indirect damages arising from the use of the service.</p>
      </Section>

      <Section title="8. Termination">
        <p>You may delete your account at any time. Glamia reserves the right to suspend or delete an account in the event of a breach of these Terms.</p>
      </Section>

      <Section title="9. Changes to these Terms">
        <p>Glamia reserves the right to amend these Terms. Users will be informed of any substantial change.</p>
      </Section>

      <Section title="10. Contact">
        <p>Any questions? <strong>contact@glamia.pro</strong></p>
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
