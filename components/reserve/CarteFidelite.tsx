'use client'

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react'
import { Gift, Heart } from 'lucide-react'
import { traduire } from '@/lib/i18n'
import { fonce, pale } from '@/lib/teinte'

// ─────────────────────────────────────────────────────────────────────────────
// LA CARTE DE FIDÉLITÉ, LA MÊME QUE DANS L'APP (3.0, 27 sept. 2026)
//
// Copie web de components/CarteFidelite.tsx de l'app : fond rose pâle, fleur
// Glamia effacée dans les ronds vides et en couleurs dans les ronds faits,
// contour rose et badge cadeau sur les ronds qui récompensent, avec leur
// libellé dessous. Une rangée jusqu'à 6 ronds, deux rangées équilibrées
// au-delà (7 = 4 + 3, 9 = 5 + 4…). La cliente voit la carte que sa pro voit.
// ─────────────────────────────────────────────────────────────────────────────

const ROSE_GLAMIA = '#C2779E'
const ROSE_FONCE_GLAMIA = '#8E4E72'

export type Palier = { position: number; type: string; valeur: number }

function rangees(nb: number): number[][] {
  const positions = Array.from({ length: nb }, (_, i) => i + 1)
  if (nb <= 6) return [positions]
  const haut = Math.ceil(nb / 2)
  return [positions.slice(0, haut), positions.slice(haut)]
}

export default function CarteFidelite({ nbRonds, paliers, tampons, libelle, droite, pied, couleur }: {
  /** La couleur de la page de la pro (Ultra) ; rose Glamia sinon. */
  couleur?: string | null
  nbRonds: number
  paliers: Palier[]
  tampons: number
  libelle: (p: Palier) => string
  droite?: ReactNode
  pied?: ReactNode
}) {
  const parPosition = new Map(paliers.map(p => [p.position, p]))
  const ROSE = couleur ?? ROSE_GLAMIA
  const ROSE_FONCE = couleur ? fonce(couleur) : ROSE_FONCE_GLAMIA
  const FOND = couleur ? pale(couleur, 0.92) : '#FBEFF4'
  const BORD = couleur ? pale(couleur, 0.8) : '#F3DCE7'
  const lignes = rangees(nbRonds)
  const plusLongue = Math.max(...lignes.map(l => l.length))
  // Les ronds prennent la place qu'il y a, plafonnés comme dans l'app.
  const taille = `min(56px, calc((100% - ${(plusLongue - 1) * 10}px) / ${plusLongue}))`

  return (
    <div style={{ background: FOND, borderRadius: 20, border: `1px solid ${BORD}`, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, minHeight: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 13, background: '#fff', display: 'grid', placeItems: 'center' }}>
            <Heart size={13} color={ROSE_FONCE} fill={ROSE_FONCE} />
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6b7280', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{traduire('resa.carteFidelite')}</span>
        </div>
        {droite}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {lignes.map((rangee, r) => {
          const avecLibelle = rangee.some(pos => parPosition.has(pos))
          return (
            <div key={r} style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              {rangee.map(pos => {
                const palier = parPosition.get(pos)
                const fait = pos <= tampons
                return (
                  <div key={pos} style={{ width: taille, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '50%',
                      background: fait ? '#F6DCE8' : '#fff',
                      border: `${palier || fait ? 2 : 1.5}px solid ${palier || fait ? ROSE : '#F0D9E3'}`,
                      boxShadow: fait ? '0 3px 6px rgba(142,78,114,0.18)' : 'none',
                      display: 'grid', placeItems: 'center', boxSizing: 'border-box',
                    }}>
                      <img src="/glamia-fleur.png" alt="" style={{ width: '58%', height: '58%', objectFit: 'contain', opacity: fait ? 1 : 0.22 }} />
                      {palier && (
                        <span style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, background: ROSE_FONCE, border: `2px solid ${FOND}`, display: 'grid', placeItems: 'center' }}>
                          <Gift size={11} color="#fff" strokeWidth={2.4} />
                        </span>
                      )}
                    </div>
                    {palier
                      ? <span style={{ marginTop: 5, fontSize: 10.5, fontWeight: 700, color: ROSE_FONCE, whiteSpace: 'nowrap' }}>{libelle(palier)}</span>
                      : avecLibelle ? <span style={{ height: 19 }} /> : null}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {pied ? <div style={{ marginTop: 12, textAlign: 'center' }}>{pied}</div> : null}
    </div>
  )
}
