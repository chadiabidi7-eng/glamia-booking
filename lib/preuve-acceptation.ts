// ─────────────────────────────────────────────────────────────────────────────
// LA PREUVE D'ACCEPTATION D'UN PAIEMENT (3.3.0, 21 nov. 2026)
//
// Décision de Chadi : à chaque paiement, on garde automatiquement ce que la
// cliente a vu et accepté — d'abord pour montrer à Mollie que le risque est
// tenu, ensuite pour que la pro puisse répondre à une contestation. Rien n'est
// fabriqué à l'avance : le dossier se met en forme le jour où on le demande.
//
// Gardé : les textes exacts de l'encadré tels qu'affichés (règle d'annulation,
// qui encaisse et rembourse, case cochée), la page, la langue, la version des
// conditions pour les clientes, l'heure du serveur, l'adresse internet et
// l'appareil. Ce que Mollie dit du paiement (moyen, 3-D Secure) s'ajoute
// ensuite, côté serveur de paiement, quand il est payé.
//
// Jamais bloquant : si l'écriture échoue, la cliente paie quand même et l'échec
// est écrit dans le journal du serveur.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/mollie-reservation'

/** Version des « Conditions applicables aux clientes » en ligne. À changer à chaque nouvelle version. */
export const CONDITIONS_CLIENTES_VERSION = '2026-11-21'

const texte = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

export async function enregistrerPreuve(req: NextRequest, p: {
  paiementId: unknown
  page: 'page_reservation' | 'lien_acompte'
  langue: unknown
  encadre: unknown
  caseTexte: unknown
  accepteeLe: string
}) {
  if (typeof p.paiementId !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.paiementId)) return
  const e = (p.encadre && typeof p.encadre === 'object' ? p.encadre : {}) as Record<string, unknown>
  const v = (e.valeurs && typeof e.valeurs === 'object' ? e.valeurs : {}) as Record<string, unknown>
  const entier = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) < 10_000_000 ? x as number : null)
  const valeurs = { delai: entier(v.delai), acompte: entier(v.acompte), frais: entier(v.frais), total: entier(v.total), pro: texte(v.pro, 80) }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const { error } = await supabaseAdmin.from('mollie_preuves').upsert({
    paiement_id: p.paiementId,
    acceptee_le: p.accepteeLe,
    page: p.page,
    langue: texte(p.langue, 5),
    encadre: { regle: texte(e.regle, 600), paiement: texte(e.paiement, 600), case: texte(p.caseTexte, 1200), valeurs },
    conditions_version: CONDITIONS_CLIENTES_VERSION,
    ip: ip ? ip.slice(0, 64) : null,
    appareil: texte(req.headers.get('user-agent'), 400),
    maj_le: new Date().toISOString(),
  }, { onConflict: 'paiement_id', ignoreDuplicates: true })
  if (error) console.error('[preuve-acceptation] non enregistrée', p.paiementId, error.message)
}
