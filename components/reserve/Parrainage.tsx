'use client'

import { useState } from 'react'
import { Check, HeartHandshake, Send } from 'lucide-react'
import { traduire } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// LE PARRAINAGE SUR LA PAGE DE RÉSERVATION (Ultra, 7 nov. 2026)
//
// · TicketParrainage : la cliente reconnue voit SON code, ce qu'il rapporte à
//   son amie et à elle, et un bouton pour le partager. Si une récompense
//   l'attend (cagnotte, % ou soin offert), on le lui dit : elle s'applique à
//   CE rendez-vous, puisqu'elle est en train de le prendre.
// · ChampCodeParrainage : la nouvelle cliente peut entrer le code d'une amie ;
//   « −10 % offert par Sarah » s'affiche aussitôt. La vraie remise est
//   recalculée par le serveur à la création du rendez-vous.
// ─────────────────────────────────────────────────────────────────────────────

export type Gain = { type: 'pourcentage' | 'euros' | 'gratuit' | 'tampon'; valeur: number }

export function texteGain(g: Gain, sym: string, pourElle = false): string {
  if (g.type === 'pourcentage') return `−${g.valeur} %`
  if (g.type === 'euros') return pourElle ? `${g.valeur} ${sym}` : `−${g.valeur} ${sym}`
  if (g.type === 'tampon') return traduire('parrainage.tamponOffert')
  return traduire('parrainage.soinOffert')
}

export function TicketParrainage({ code, filleule, ambassadrice, sym, nomPro, lien, rose, roseTexte }: {
  code: string; filleule: Gain; ambassadrice: Gain; sym: string; nomPro: string; lien: string; rose: string; roseTexte: string
}) {
  const [copie, setCopie] = useState(false)
  const message = traduire('parrainage.message', { pro: nomPro, code, gain: texteGain(filleule, sym), lien })
  const partager = async () => {
    try {
      if (navigator.share) { await navigator.share({ text: message }); return }
      await navigator.clipboard.writeText(message)
      setCopie(true); setTimeout(() => setCopie(false), 2200)
    } catch { /* partage annulé */ }
  }
  return (
    <div style={{ border: `1.5px dashed ${rose}`, background: '#FFF7FA', borderRadius: 16, padding: '11px 13px', marginBottom: 18 }}>
      {/* Compact (Chadi, 7 nov. 2026) : le code et « Partager » sur une ligne ;
          le bouton en contour, plus discret que « Prendre rendez-vous » — le but
          reste qu'elle réserve. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <HeartHandshake size={14} color={roseTexte} />
        <span style={{ fontSize: 10.5, fontWeight: 800, color: roseTexte, textTransform: 'uppercase', letterSpacing: 0.7 }}>{traduire('parrainage.tonCode')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', letterSpacing: 1.5 }}>{code}</span>
        <button type="button" onClick={partager} style={{
          border: `1.5px solid ${rose}`, background: '#fff', color: roseTexte, borderRadius: 999,
          fontSize: 13, fontWeight: 700, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0,
        }}>
          {copie ? <Check size={14} /> : <Send size={14} />}
          {copie ? traduire('parrainage.copieCourt') : traduire('parrainage.partagerCourt')}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #F3D5E4', borderRadius: 12, padding: '7px 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1f2937' }}>{texteGain(filleule, sym)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{traduire('parrainage.pourTonAmieSeul')}</span>
        </div>
        <div style={{ flex: 1, background: rose, borderRadius: 12, padding: '7px 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{texteGain(ambassadrice, sym, true)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{traduire('parrainage.pourToiCourt')}</span>
        </div>
      </div>
    </div>
  )
}

/** Ce que la cliente reconnue a gagné et qui s'applique à CE rendez-vous. */
export function RecompenseParrainage({ texte, rose, roseTexte }: { texte: string; rose: string; roseTexte: string }) {
  return (
    <div style={{ background: 'linear-gradient(135deg, #FFF0F6 0%, #FFF9FB 100%)', border: '1.5px solid #F3D5E4', borderRadius: 16, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 17, background: rose, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <HeartHandshake size={17} color="#fff" />
      </div>
      <p style={{ margin: 0, fontSize: 14, color: roseTexte, fontWeight: 700, lineHeight: 1.45 }}>{texte}</p>
    </div>
  )
}

export function ChampCodeParrainage({ proId, valeur, onChange, verifie, onVerifie, sym, rose, roseTexte, styleInput, styleLabel }: {
  proId: string; valeur: string; onChange: (v: string) => void
  verifie: { code: string; prenom: string; gain: Gain } | null
  onVerifie: (v: { code: string; prenom: string; gain: Gain } | null) => void
  sym: string; rose: string; roseTexte: string; styleInput: React.CSSProperties; styleLabel: React.CSSProperties
}) {
  const [etat, setEtat] = useState<'rien' | 'verif' | 'faux'>('rien')
  const verifier = async (v: string) => {
    const code = v.trim().toUpperCase()
    if (code.length < 4) { onVerifie(null); setEtat('rien'); return }
    setEtat('verif')
    try {
      const r = await fetch('/api/parrainage/verifier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: proId, code }) })
      const d = await r.json()
      if (d?.ok) { onVerifie({ code: d.code, prenom: d.prenom, gain: d.gain }); setEtat('rien') }
      else { onVerifie(null); setEtat('faux') }
    } catch { onVerifie(null); setEtat('rien') }
  }
  return (
    <div style={{ marginTop: 12 }}>
      {/* Dans la couleur de la page de la pro (Chadi, 7 nov. 2026) : le champ se remarque. */}
      <label style={{ ...styleLabel, color: roseTexte }}>{traduire('parrainage.champ')}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text" value={valeur} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          placeholder={traduire('parrainage.champExemple')}
          onChange={e => { onChange(e.target.value.toUpperCase()); if (verifie) onVerifie(null); setEtat('rien') }}
          onBlur={e => verifier(e.target.value)}
          style={{ ...styleInput, letterSpacing: 1, fontWeight: 700, borderColor: rose, ...(verifie ? { background: '#FFF7FA' } : {}) }}
        />
        {verifie && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: 10, background: '#4CAF7A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="#fff" strokeWidth={3} /></span>}
      </div>
      {verifie && (
        <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 700, color: roseTexte }}>
          {traduire('parrainage.offertPar', { gain: texteGain(verifie.gain, sym), prenom: verifie.prenom })}
        </p>
      )}
      {etat === 'faux' && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#b45309' }}>{traduire('parrainage.codeInconnu')}</p>}
      {etat !== 'faux' && !verifie && <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>{traduire('parrainage.champDetail')}</p>}
    </div>
  )
}
