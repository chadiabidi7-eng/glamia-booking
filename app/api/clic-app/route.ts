import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// « INDÉPENDANTE BEAUTÉ ? REJOINS GLAMIA » — QUI A CLIQUÉ, ET DEPUIS OÙ.
//
// Une page de réservation ne sert pas qu'à ses clientes : elle circule entre
// pros. Une prothésiste voit le lien d'une consœur, l'ouvre par curiosité, et
// c'est notre seule occasion de lui parler. Le pied de page lui tend la main.
//
// CE QU'ON MESURE, ET CE QU'ON NE MESURE PAS. On compte les clics, leur date,
// et la page de quelle pro les a produits — c'est ce dernier point qui compte
// vraiment : il dit QUELLES PROS NOUS EN RAMÈNENT D'AUTRES. En revanche, le
// téléchargement lui-même nous échappe : entre le clic et l'installation il y
// a l'App Store, qui ne nous rend aucun compte. Seul un lien de campagne
// App Store donnerait les installations, et ce n'est pas ce qui est branché.
//
// APPELÉE PAR `sendBeacon`, PAS PAR `fetch`. Le clic ouvre l'App Store dans la
// foulée : un `fetch` normal serait annulé par la navigation, et le compteur
// raterait précisément les clics qui aboutissent — les seuls qui comptent.
// `sendBeacon` est fait pour ça, le navigateur le poste même en partant.
//
// ELLE NE PEUT RIEN CASSER : elle avale tout et répond toujours oui. Personne
// ne doit rater l'App Store parce que notre comptage a trébuché.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gdgfgbxoapgmrbttdyac.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const court = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max))

export async function POST(req: NextRequest) {
  try {
    // `sendBeacon` envoie un Blob : le corps se lit en texte, pas en JSON.
    const brut = await req.text()
    const c = JSON.parse(brut || '{}') as Record<string, unknown>

    // `pro_id` ne peut pas être vide en base, et sans lui la ligne ne dirait
    // rien d'utile : on préfère ne rien écrire.
    const proId = typeof c.pro_id === 'string' && /^[0-9a-f-]{36}$/i.test(c.pro_id) ? c.pro_id : null
    if (!proId) return NextResponse.json({ ok: true })

    await supabaseAdmin.from('evenements_app').insert({
      pro_id: proId,
      evenement: 'clic_rejoindre_glamia',
      contexte: {
        slug: court(c.slug, 80),
        ecran: court(c.ecran, 40),
        langue: court(c.langue, 5),
        navigateur: court(req.headers.get('user-agent'), 300),
      },
    })
  } catch { /* un comptage raté n'est pas un incident */ }

  return NextResponse.json({ ok: true })
}
