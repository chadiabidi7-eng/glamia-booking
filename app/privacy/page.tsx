export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Privacy Policy</h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 32 }}>Last updated: 11 July 2026</p>

      <Section title="1. Data controller">
        <p>Glamia, an appointment management app for beauty professionals.</p>
      </Section>

      <Section title="2. Data we collect">
        <p>When you book an appointment online, we collect:</p>
        <ul>
          <li>First and last name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Selected services, appointment date and time</li>
          <li>Optional comments you leave with your booking</li>
        </ul>
      </Section>

      <Section title="3. How we use your data">
        <p>Your data is used exclusively to:</p>
        <ul>
          <li>Manage and keep track of your appointments</li>
          <li>Send you booking confirmations, reminders and appointment-related email notifications</li>
          <li>Enable communication between you and your beauty professional</li>
        </ul>
      </Section>

      <Section title="4. Legal basis">
        <p>Processing is based on the performance of the service you request (booking an appointment), in accordance with Article 6(1)(b) of the GDPR / UK GDPR.</p>
      </Section>

      <Section title="5. Data retention">
        <p>Your data is kept for the duration of your relationship with your beauty professional, then deleted within 12 months of your last appointment.</p>
      </Section>

      <Section title="6. Data sharing">
        <p>Your data is only accessible to the professional you book with. It is never sold or shared with third parties for commercial purposes.</p>
        <p>Hosting: Supabase (EU servers).</p>
      </Section>

      <Section title="7. Your rights">
        <p>Under the GDPR / UK GDPR, you have the following rights:</p>
        <ul>
          <li>Right to access, rectify and erase your data</li>
          <li>Right to data portability</li>
          <li>Right to object to and restrict processing</li>
        </ul>
        <p>To exercise your rights, contact us at: <strong>contact@glamia.pro</strong></p>
      </Section>

      <Section title="8. Cookies">
        <p>The Glamia booking site does not use advertising cookies. Only technical cookies required for the service to work are used.</p>
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
