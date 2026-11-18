'use client'
// ─────────────────────────────────────────────────────────────────────────────
// LA CLIENTE REVIENT DE LA PAGE DE PAIEMENT DE MOLLIE (3.3.0, 18 nov. 2026)
//
// Elle a quitté la page de réservation pour payer : tout ce qu'elle avait choisi
// a disparu de son écran. Le rendez-vous, lui, est créé par le serveur dès que
// Mollie confirme. Cet écran demande où on en est, toutes les deux secondes, et
// dit clairement l'une des quatre issues : on vérifie, c'est réservé, le
// paiement n'a pas abouti, ou le créneau est parti (remboursée en entier).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { AlertCircle, Calendar, CheckCircle, Clock, CreditCard, Loader } from 'lucide-react'
import { traduire } from '@/lib/i18n'

type Recap = { type?: string; date: string | null; heure: string | null; prestations: string | null; acompte: number; frais: number; total: number; devise: string }
type Etat = { etat: 'attente' | 'confirme' | 'echec' | 'refuse'; recap?: Recap }

const euros = (c: number) => `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`
// Au-delà, Mollie n'a toujours pas tranché : on cesse d'attendre devant l'écran.
const ESSAIS_MAX = 45

export default function RetourMollie({ paiement, slug, couleurs, formatDate }: {
  paiement: string
  slug: string
  /** Les mêmes que l'écran de confirmation habituel : accent = la couleur de la pro (rose Glamia sans choix). */
  couleurs: { rose: string; roseClair: string; accent: string }
  formatDate: (d: string) => string
}) {
  const [etat, setEtat] = useState<Etat>({ etat: 'attente' })
  const [long, setLong] = useState(false)

  useEffect(() => {
    let fini = false
    let essais = 0
    const demander = async () => {
      if (fini) return
      essais++
      const d = await fetch(`/api/mollie/etat?paiement=${paiement}`).then(r => r.json()).catch(() => null) as Etat | null
      if (fini) return
      if (d && d.etat !== 'attente') { setEtat(d); return }
      if (essais >= ESSAIS_MAX) { setLong(true); return }
      setTimeout(demander, 2000)
    }
    demander()
    return () => { fini = true }
  }, [paiement])

  const recommencer = () => { window.location.href = `/reserve/${slug}` }
  const r = etat.recap
  const cadre = (enfants: React.ReactNode) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: couleurs.roseClair }}>
      <div style={{ textAlign: 'center', maxWidth: 380, width: '100%', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {enfants}
      </div>
    </div>
  )
  const pastille = (icone: React.ReactNode) => (
    <div style={{ width: 80, height: 80, borderRadius: 40, background: couleurs.roseClair, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>{icone}</div>
  )
  const bouton = (texte: string) => (
    <button onClick={recommencer} style={{ marginTop: 20, width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', background: couleurs.rose, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{texte}</button>
  )
  const texte = (t: string) => <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.55, margin: 0 }}>{t}</p>
  const titre = (t: string) => <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937', margin: '0 0 8px' }}>{t}</h1>

  if (etat.etat === 'confirme' && r) {
    return cadre(<>
      {pastille(<CheckCircle size={40} color={couleurs.accent} />)}
      {titre(traduire(r.type === 'jour' ? 'retourMollie.payeTitre' : 'resa.rdvEnregistre'))}
      <div style={{ background: couleurs.roseClair, borderRadius: 16, padding: 16, textAlign: 'left', margin: '16px 0' }}>
        {[
          r.date ? { icone: <Calendar size={18} color={couleurs.accent} />, libelle: formatDate(r.date) } : null,
          r.heure ? { icone: <Clock size={18} color={couleurs.accent} />, libelle: r.heure } : null,
          r.prestations ? { icone: <CheckCircle size={18} color={couleurs.accent} />, libelle: r.prestations } : null,
        ].filter(Boolean).map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 24, display: 'flex', justifyContent: 'center' }}>{l!.icone}</span>
            <span style={{ fontSize: 14, color: '#374151' }}>{l!.libelle}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
          <CreditCard size={18} color={couleurs.accent} />{traduire(r.type === 'jour' ? 'retourMollie.paye' : 'resa.acompteVerse')}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: couleurs.accent, fontVariantNumeric: 'tabular-nums' }}>{euros(r.total)}</span>
      </div>
      {r.frais > 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0', textAlign: 'left' }}>{traduire('resa.dontFrais', { somme: euros(r.frais) })}</p>}
      <p style={{ fontSize: 12.5, color: '#6b7280', margin: '14px 0 0', lineHeight: 1.5, textAlign: 'left' }}>{traduire(r.type === 'jour' ? 'retourMollie.merciPaiement' : 'retourMollie.acompteDeduit')}</p>
    </>)
  }
  if (etat.etat === 'echec') {
    return cadre(<>
      {pastille(<AlertCircle size={40} color={couleurs.accent} />)}
      {titre(traduire('retourMollie.echecTitre'))}
      {texte(traduire('retourMollie.echecTexte'))}
      {bouton(traduire('retourMollie.recommencer'))}
    </>)
  }
  if (etat.etat === 'refuse') {
    return cadre(<>
      {pastille(<AlertCircle size={40} color={couleurs.accent} />)}
      {titre(traduire('retourMollie.refuseTitre'))}
      {texte(traduire('retourMollie.refuseTexte'))}
      {bouton(traduire('retourMollie.autreCreneau'))}
    </>)
  }
  if (long) {
    return cadre(<>
      {pastille(<Clock size={40} color={couleurs.accent} />)}
      {titre(traduire('retourMollie.longTitre'))}
      {texte(traduire('retourMollie.longTexte'))}
    </>)
  }
  return cadre(<>
    {pastille(<Loader size={36} color={couleurs.accent} style={{ animation: 'glamia-tourne 1s linear infinite' }} />)}
    <style>{'@keyframes glamia-tourne { to { transform: rotate(360deg) } } @media (prefers-reduced-motion: reduce) { * { animation: none !important } }'}</style>
    {titre(traduire('retourMollie.verification'))}
    {texte(traduire('retourMollie.verificationTexte'))}
  </>)
}
