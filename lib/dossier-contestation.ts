// ─────────────────────────────────────────────────────────────────────────────
// LE DOSSIER DE CONTESTATION — LECTURE DES DONNÉES (3.3.0, 21 nov. 2026)
//
// Tout ce qui a été gardé automatiquement autour d'un rendez-vous payé par Mollie :
// les paiements, ce que la cliente a vu et accepté (preuve d'acceptation), comment
// elle a payé et si sa banque l'a vérifiée, la vie du rendez-vous (rappel,
// confirmation, décalage, annulation, absence). Rien n'est inventé ni recalculé :
// tout est lu tel qu'enregistré.
//
// L'adresse est signée par le serveur de paiement (fonction mollie-dossier),
// valable 7 jours ; personne ne peut la deviner ni la fabriquer.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SECRET_MOLLIE, supabaseAdmin } from '@/lib/mollie-reservation'

/** Le rendez-vous dont l'adresse est signée et encore valable, sinon null. */
export function verifierJeton(jeton: string): string | null {
  const m = /^([0-9a-f-]{36})\.(\d{10})\.([0-9a-f]{40})$/i.exec(jeton)
  if (!m || !SECRET_MOLLIE) return null
  const [, rdv, exp, sig] = m
  if (Number(exp) * 1000 < Date.now()) return null
  const attendu = createHmac('sha256', SECRET_MOLLIE).update(`dossier.${rdv}.${exp}`).digest('hex').slice(0, 40)
  const a = Buffer.from(attendu), b = Buffer.from(sig.toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b) ? rdv : null
}

export type Paiement = {
  id: string; mollie_paiement_id: string | null; type: string; montant: number; frais_reservation: number; total_cliente: number
  devise: string; statut: string; montant_rembourse: number; politique_texte: string | null; politique_version: string | null
  politique_acceptee_le: string | null; cliente_mail: string | null; cree_le: string; paye_le: string | null
  preuve: {
    acceptee_le: string; page: string; langue: string | null; encadre: { regle?: string | null; paiement?: string | null; case?: string | null; valeurs?: { type?: string | null; delai?: number | null; acompte?: number | null; montant?: number | null; frais?: number | null; total?: number | null; pro?: string | null; date?: string | null } }
    conditions_version: string | null; ip: string | null; appareil: string | null
    // Aucune donnée de carte (Chadi, 21 nov. 2026) : le moyen et la vérification par la banque, rien d'autre.
    mollie: { methode?: string; securite?: string | null; portefeuille?: string | null } | null
  } | null
}

export async function lireDossier(rdvId: string) {
  const { data: rdv } = await supabaseAdmin.from('rendez_vous')
    .select('id, pro_id, cliente_id, date, duree, technique, techniques, prix, statut, created_at, source, rappel_envoye_at, rappel_confirme_at, annule_par, annule_le, absente_le, decale_le, date_avant')
    .eq('id', rdvId).maybeSingle()
  if (!rdv) return null
  const r = rdv as Record<string, unknown>
  const [{ data: pro }, { data: cliente }, { data: paiements }] = await Promise.all([
    supabaseAdmin.from('profiles').select('pseudo, prenom, nom, timezone, slug').eq('id', r.pro_id as string).maybeSingle(),
    r.cliente_id ? supabaseAdmin.from('clientes').select('prenom, nom, telephone, email').eq('id', r.cliente_id as string).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('mollie_paiements')
      .select('id, mollie_paiement_id, type, montant, frais_reservation, total_cliente, devise, statut, montant_rembourse, politique_texte, politique_version, politique_acceptee_le, cliente_mail, cree_le, paye_le')
      .eq('rdv_id', rdvId).not('paye_le', 'is', null).order('paye_le').limit(10),
  ])
  const liste = (paiements ?? []) as Omit<Paiement, 'preuve'>[]
  const { data: preuves } = liste.length
    ? await supabaseAdmin.from('mollie_preuves').select('paiement_id, acceptee_le, page, langue, encadre, conditions_version, ip, appareil, mollie').in('paiement_id', liste.map(p => p.id))
    : { data: [] }
  const parId = new Map(((preuves ?? []) as (Paiement['preuve'] & { paiement_id: string })[]).map(p => [p.paiement_id, p]))
  return {
    rdv: r,
    pro: (pro ?? {}) as Record<string, string | null>,
    cliente: (cliente ?? null) as Record<string, string | null> | null,
    paiements: liste.map(p => ({ ...p, preuve: parId.get(p.id) ?? null })) as Paiement[],
  }
}
