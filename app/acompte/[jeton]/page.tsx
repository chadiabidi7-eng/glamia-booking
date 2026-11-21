'use client'
// ─────────────────────────────────────────────────────────────────────────────
// LA PAGE DU LIEN D'ACOMPTE (3.3.0, 19 nov. 2026)
//
// La pro a créé le rendez-vous dans l'app et a envoyé ce lien à sa cliente.
// La page montre ce que la cliente paie (acompte, frais de réservation), la
// politique d'annulation avec la même case à cocher que la page de réservation
// (son texte exact est gardé comme preuve), puis l'envoie sur la page Mollie.
// Au retour, elle dit l'issue : payé, pas abouti, ou on vérifie encore.
// Aux couleurs de la pro (rose Glamia sans choix). Le paiement est enregistré
// côté serveur exactement comme un acompte de la page de réservation.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, Calendar, CheckCircle, Clock, Loader, Lock } from 'lucide-react'
import { poserLangue, traduire } from '@/lib/i18n'
import { lisibleSurBlanc } from '@/lib/couleur-lisible'

type Lien = {
  etat: 'ouvert' | 'paye' | 'expire' | 'annule' | 'ferme'
  pro: string; langue: string; prestation: string | null; debut: string | null; fuseau: string
  acompte: number; frais: number; total_cliente: number; delai_annulation: number; expire_le: string
  prenom: string | null; couleur: string | null
  dernier_paiement: { id: string; statut: string } | null
}

const ROSE = '#C2779E'
const euros = (c: number) => `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`
const ESSAIS_MAX = 45
const premiereMajuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function PageLienAcompte() {
  const { jeton } = useParams<{ jeton: string }>()
  const [lien, setLien] = useState<Lien | null>(null)
  const [introuvable, setIntrouvable] = useState(false)
  const [coche, setCoche] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Au retour de Mollie : le numéro du paiement qu'elle vient de tenter.
  const [retour, setRetour] = useState<string | null>(null)
  const [patience, setPatience] = useState(false)

  const lire = useCallback(async (): Promise<Lien | null> => {
    const r = await fetch('/api/mollie/lien-acompte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lire', jeton }) }).catch(() => null)
    if (!r) return null
    if (r.status === 404) { setIntrouvable(true); return null }
    const d = await r.json().catch(() => null) as Lien | null
    if (d?.etat) { poserLangue(d.langue); setLien(d) }
    return d
  }, [jeton])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('paiement')
    setRetour(p && /^[0-9a-f-]{36}$/i.test(p) ? p : null)
    void lire()
  }, [lire])

  // De retour de Mollie, pas encore tranché : on redemande toutes les deux secondes.
  const verdictRetour = useMemo(() => {
    if (!retour || !lien) return null
    if (lien.etat === 'paye') return 'paye'
    const d = lien.dernier_paiement
    if (d && d.id === retour && ['echoue', 'expire', 'annule'].includes(d.statut)) return 'echec'
    return 'attente'
  }, [retour, lien])
  useEffect(() => {
    if (verdictRetour !== 'attente') return
    let n = 0
    const t = setInterval(async () => {
      n++
      if (n > ESSAIS_MAX) { setPatience(true); clearInterval(t); return }
      await lire()
    }, 2000)
    return () => clearInterval(t)
  }, [verdictRetour, lire])

  const accent = lien?.couleur ?? ROSE
  const accentTexte = lien?.couleur ? lisibleSurBlanc(lien.couleur) : ROSE
  const casePour = (conditions: string) => lien ? traduire('resa.consentMollie', { somme: euros(lien.total_cliente), acompte: euros(lien.acompte), frais: euros(lien.frais), delai: lien.delai_annulation, pro: lien.pro, conditions }) : ''
  // La preuve enregistrée = exactement la phrase affichée, le lien n'étant que le nom des conditions.
  const texteCase = casePour(traduire('resa.conditionsClientes'))
  const lienConditions = lien ? `/conditions-clientes${lien.langue !== 'fr' ? `?lang=${lien.langue}` : ''}` : ''

  const payer = async () => {
    if (!lien || !coche || envoi) return
    setEnvoi(true); setErreur(null)
    const r = await fetch('/api/mollie/lien-acompte', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'payer', jeton, cle: crypto.randomUUID(), langue: lien.langue, politique_texte: texteCase }),
    }).then(x => x.json()).catch(() => null) as { url?: string; error?: string } | null
    if (r?.url) { window.location.href = r.url; return }
    setEnvoi(false)
    // Le lien a changé d'état entre-temps (payé, périmé, annulé) : on relit et on le dit.
    if (r?.error && ['paye', 'expire', 'annule', 'ferme'].includes(r.error)) { await lire(); return }
    setErreur(traduire('lienAcompte.paiementInjoignable'))
  }

  const date = (iso: string, avecHeure: boolean) => new Date(iso).toLocaleString(lien?.langue === 'en' ? 'en-GB' : lien?.langue ?? 'fr', {
    weekday: avecHeure ? 'long' : undefined, day: 'numeric', month: 'long', ...(avecHeure ? { hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }), timeZone: lien?.fuseau,
  })

  // ── LES ÉCRANS D'ISSUE ─────────────────────────────────────────────────────
  const issue = (icone: React.ReactNode, titre: string, texte: string, action?: React.ReactNode) => (
    <main style={S.fond}><section style={{ ...S.carte, textAlign: 'center' }}>
      <div style={S.icone}>{icone}</div>
      <h1 style={S.titreIssue}>{titre}</h1>
      <p style={S.texte}>{texte}</p>
      {action}
    </section></main>
  )
  if (introuvable) return issue(<AlertCircle size={34} color="#8A7F85" />, traduire('lienAcompte.inconnuTitre'), traduire('lienAcompte.inconnuTexte'))
  if (!lien) return <main style={S.fond}><Loader size={26} color={ROSE} style={{ animation: 'tourne 1s linear infinite' }} /><style>{TOURNE}</style></main>
  const pro = { pro: lien.pro }
  if (lien.etat === 'paye') return issue(<CheckCircle size={38} color="#2E7D4F" />, traduire('lienAcompte.payeTitre'), traduire('lienAcompte.payeTexte'))
  if (verdictRetour === 'attente' && !patience) return <>{issue(<Loader size={34} color={accent} style={{ animation: 'tourne 1s linear infinite' }} />, traduire('lienAcompte.verification'), traduire('lienAcompte.verificationTexte'))}<style>{TOURNE}</style></>
  if (lien.etat === 'expire') return issue(<Clock size={34} color="#8A7F85" />, traduire('lienAcompte.expireTitre'), traduire('lienAcompte.expireTexte', pro))
  if (lien.etat === 'annule') return issue(<AlertCircle size={34} color="#8A7F85" />, traduire('lienAcompte.annuleTitre'), traduire('lienAcompte.annuleTexte'))
  if (lien.etat === 'ferme') return issue(<AlertCircle size={34} color="#8A7F85" />, traduire('lienAcompte.fermeTitre'), traduire('lienAcompte.fermeTexte', pro))
  if (verdictRetour === 'echec') return issue(<AlertCircle size={34} color="#B3261E" />, traduire('lienAcompte.echecTitre'), traduire('lienAcompte.echecTexte'),
    <button style={{ ...S.bouton, background: accent }} onClick={() => { setRetour(null); window.history.replaceState(null, '', window.location.pathname) }}>{traduire('lienAcompte.reessayer')}</button>)

  // ── LE PAIEMENT ───────────────────────────────────────────────────────────
  return (
    <main style={S.fond}>
      <style>{TOURNE}</style>
      <section style={S.carte}>
        <p style={{ ...S.chez, color: accentTexte }}>{traduire('lienAcompte.chez', pro)}</p>
        <h1 style={S.titre}>{traduire('lienAcompte.titre')}</h1>
        {lien.prenom && <p style={S.texte}>{traduire('lienAcompte.bonjour', { prenom: lien.prenom })}</p>}

        <div style={S.rdv}>
          {lien.prestation && <p style={S.prestation}>{lien.prestation}</p>}
          {lien.debut && <p style={S.ligneRdv}><Calendar size={15} color="#6E6268" strokeWidth={2} />{premiereMajuscule(date(lien.debut, true))}</p>}
        </div>

        <div style={S.montants}>
          <p style={S.ligne}><span>{traduire('lienAcompte.acompte')}</span><span>{euros(lien.acompte)}</span></p>
          <p style={S.ligne}><span>{traduire('lienAcompte.frais')}</span><span>{euros(lien.frais)}</span></p>
          <p style={{ ...S.ligne, ...S.total }}><span>{traduire('lienAcompte.total')}</span><span>{euros(lien.total_cliente)}</span></p>
        </div>

        {/* La règle d'annulation, en clair, avant la case (Chadi, 21 nov. 2026 : texte allégé). */}
        <p style={S.regle}><strong style={{ color: '#1f2937' }}>{traduire('resa.condMollieTitre', { delai: lien.delai_annulation })}</strong>{traduire('resa.condMollieTexte', { somme: euros(lien.acompte) })}</p>

        <label style={S.case}>
          <input type="checkbox" checked={coche} onChange={e => setCoche(e.target.checked)} style={{ width: 22, height: 22, accentColor: accent, flexShrink: 0, marginTop: 1 }} />
          <span>{(() => { const [avant, apres] = casePour('\u0001').split('\u0001'); return <>{avant}<a href={lienConditions} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: accentTexte, fontWeight: 700, textDecoration: 'underline' }}>{traduire('resa.conditionsClientes')}</a>{apres}</> })()}</span>
        </label>

        <button style={{ ...S.bouton, background: accent, opacity: coche && !envoi ? 1 : 0.45 }} disabled={!coche || envoi} onClick={payer} aria-disabled={!coche || envoi}>
          {envoi ? <Loader size={18} color="#fff" style={{ animation: 'tourne 1s linear infinite' }} /> : <Lock size={16} color="#fff" strokeWidth={2.2} />}
          {traduire('lienAcompte.payer', { somme: euros(lien.total_cliente) })}
        </button>
        {!coche && <p style={S.aide}>{traduire('lienAcompte.case')}</p>}
        {erreur && <p style={S.erreur}>{erreur}</p>}
        <p style={S.aide}>{traduire('lienAcompte.valable', { date: date(lien.expire_le, false) })}</p>
        {/* Qui vend, qui rembourse (20 nov. 2026), et les conditions des clientes. */}
        <p style={{ ...S.aide, textAlign: 'justify', hyphens: 'none' }}>{traduire('resa.paiementProMollie', { pro: lien.pro })}</p>

      </section>
    </main>
  )
}

const TOURNE = '@keyframes tourne { to { transform: rotate(360deg) } }'
const S: Record<string, React.CSSProperties> = {
  regle: { fontSize: 13, lineHeight: 1.5, color: '#4b5563', background: '#FBF1F6', borderRadius: 12, padding: '12px 14px', margin: '0 0 16px', textAlign: 'justify', hyphens: 'none' },
  fond: { minHeight: '100dvh', background: '#FAF7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#1C1C1E', WebkitFontSmoothing: 'antialiased' },
  carte: { width: '100%', maxWidth: 440, background: '#fff', borderRadius: 22, padding: '26px 22px', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.06)' },
  chez: { margin: 0, fontSize: 14, fontWeight: 700 },
  titre: { margin: '6px 0 14px', fontSize: 24, lineHeight: 1.2, fontWeight: 750, letterSpacing: -0.4, textWrap: 'balance' },
  titreIssue: { margin: '14px 0 8px', fontSize: 21, fontWeight: 750, textWrap: 'balance' },
  icone: { display: 'flex', justifyContent: 'center' },
  texte: { margin: '0 0 10px', fontSize: 15, lineHeight: 1.5, color: '#4A4448', textWrap: 'pretty' },
  rdv: { background: '#F6F2F0', borderRadius: 14, padding: '12px 14px', margin: '6px 0 16px' },
  prestation: { margin: '0 0 4px', fontSize: 15.5, fontWeight: 700 },
  ligneRdv: { margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, color: '#4A4448' },
  montants: { borderTop: '1px solid #EFE8E4', paddingTop: 10, marginBottom: 16 },
  ligne: { display: 'flex', justifyContent: 'space-between', margin: '6px 0', fontSize: 15, color: '#4A4448', fontVariantNumeric: 'tabular-nums' },
  total: { color: '#1C1C1E', fontWeight: 750, fontSize: 16.5, borderTop: '1px solid #EFE8E4', paddingTop: 10, marginTop: 10 },
  case: { display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, color: '#4A4448', cursor: 'pointer', marginBottom: 16, textAlign: 'justify', hyphens: 'none' },
  bouton: { width: '100%', minHeight: 52, border: 'none', borderRadius: 999, color: '#fff', fontSize: 16, fontWeight: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginTop: 4 },
  aide: { margin: '10px 0 0', fontSize: 12.5, color: '#8A7F85', textAlign: 'center' },
  erreur: { margin: '10px 0 0', fontSize: 13.5, color: '#B3261E', textAlign: 'center' },
  mollie: { margin: '14px 0 0', fontSize: 11.5, color: '#A0949A', textAlign: 'center' },
}
