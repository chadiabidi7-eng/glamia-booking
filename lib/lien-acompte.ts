// ─────────────────────────────────────────────────────────────────────────────
// L'ACOMPTE OU L'EMPREINTE DEMANDÉS PAR LA PRO, DEPUIS LA FICHE RDV (29 sept.).
//
// En attente, la ligne porte le mode « lien_acompte » ou « lien_empreinte ».
// La bascule (réglé, ou mort à l'heure du rendez-vous) est écrite à UN seul
// endroit : la fonction serveur stripe-encaisser, que la page de paiement, le
// webhook et l'app appellent tous les trois.
// ─────────────────────────────────────────────────────────────────────────────

export const estLienAcompte = (mode?: string | null) => mode === 'lien_acompte' || mode === 'lien_empreinte'

export async function finaliserLienAcompte(paiementId: string): Promise<string | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co'}/functions/v1/stripe-encaisser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action: 'finaliser_lien', paiement_id: paiementId }),
    })
    return ((await r.json()) as { statut?: string })?.statut ?? null
  } catch (e) {
    console.error('[api/propay/lien] finaliser:', e)
    return null
  }
}

