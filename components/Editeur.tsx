// ─────────────────────────────────────────────────────────────────────────────
// QUI ÉDITE GLAMIA (Chadi, 22 nov. 2026) — l'identité de l'entreprise, obligatoire sur le
// site (loi pour la confiance dans l'économie numérique, art. 6 ; Code de la consommation)
// et regardée par Mollie à la vérification. Affichée en bas des conditions d'utilisation,
// des conditions clientes et de la politique de confidentialité.
// Téléphone et franchise de TVA donnés par Chadi le 22 nov. 2026 (pas de numéro de TVA).
// ─────────────────────────────────────────────────────────────────────────────
import i18n from '@/lib/i18n';

export const EDITEUR = {
  nom: 'Nina Lindsay Tiraboschi',
  commercial: 'Bloom Studio',
  siren: '108 656 331',
  siret: '108 656 331 00015',
  adresse: '21 boulevard François et Émile Zola, 13100 Aix-en-Provence, France',
  email: 'contact@glamia.pro',
  telephone: '+33 6 52 82 03 57',
};

export default function Editeur({ locale }: { locale: string }) {
  const t = (cle: string, o: Record<string, string> = {}) => i18n.t(`pageLegale.editeur.${cle}`, { locale, ...o });
  const ligne = { margin: '0 0 6px' } as const;
  return (
    <section aria-labelledby="qui-edite" style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid #F0E6EA', textAlign: 'left' }}>
      <h2 id="qui-edite" style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>{t('titre')}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.65, color: '#374151' }}>
        <p style={ligne}>{t('qui', { nom: EDITEUR.nom, commercial: EDITEUR.commercial })}</p>
        <p style={ligne}>SIREN {EDITEUR.siren} · SIRET {EDITEUR.siret}</p>
        <p style={ligne}>{t('adresse')} : {EDITEUR.adresse}</p>
        <p style={ligne}>{t('contact')} : <a href={`mailto:${EDITEUR.email}`} style={{ color: '#B0578A' }}>{EDITEUR.email}</a> · <a href={`tel:${EDITEUR.telephone.replace(/ /g, '')}`} style={{ color: '#B0578A' }}>{EDITEUR.telephone}</a></p>
        <p style={ligne}>{t('tva')}</p>
        <p style={ligne}>{t('publication', { nom: EDITEUR.nom })}</p>
        <p style={{ margin: 0 }}>{t('hebergement')}</p>
      </div>
    </section>
  );
}
