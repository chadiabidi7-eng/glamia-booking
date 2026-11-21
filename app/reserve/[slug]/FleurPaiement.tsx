'use client'
// ─────────────────────────────────────────────────────────────────────────────
// LA FLEUR DU PAIEMENT (3.3.0, 21 nov. 2026, maquette validée par Chadi)
//
// La fleur du logo Glamia, dans la couleur de la pro (rose Glamia sans choix).
//   · attente : elle tourne doucement, respire, ses pétales s'allument un à un ;
//   · valide  : les pétales se replient au centre, un rond plein apparaît et une
//               coche blanche s'y dessine ;
//   · echec   : elle s'arrête et pâlit.
// Sans animation si la cliente a demandé moins de mouvement.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

const ANGLES = [0, 72, 144, 216, 288]

const STYLE = `
.gp-fleur { width: 112px; height: 112px; margin: 0 auto 20px; display: block; overflow: visible; }
.gp-tourne { transform-origin: 60px 60px; animation: gp-tourne 7s linear infinite; }
.gp-respire { transform-origin: 60px 60px; animation: gp-respire 2.4s ease-in-out infinite; }
.gp-petale { transform-origin: 60px 60px; opacity: .35; animation: gp-allume 1.5s ease-in-out infinite; transition: transform .5s cubic-bezier(.4,0,.2,1), opacity .4s ease-out; }
.gp-anneau { fill: none; stroke-width: 5; transition: opacity .3s ease-out; }
.gp-rond { transform-origin: 60px 60px; transform: scale(.18); opacity: 0; transition: transform .5s cubic-bezier(.34,1.4,.64,1), opacity .2s ease-out; }
.gp-coche { fill: none; stroke: #fff; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 60; stroke-dashoffset: 60; transition: stroke-dashoffset .45s cubic-bezier(.65,0,.35,1); }
@keyframes gp-tourne { to { transform: rotate(360deg); } }
@keyframes gp-respire { 0%, 100% { transform: scale(.94); } 50% { transform: scale(1.04); } }
@keyframes gp-allume { 0%, 100% { opacity: .35; } 40% { opacity: 1; } }
.gp-valide .gp-tourne, .gp-valide .gp-respire, .gp-valide .gp-petale { animation-play-state: paused; }
.gp-valide .gp-petale { transform: scale(0); opacity: 0; }
.gp-valide .gp-anneau { opacity: 0; }
.gp-valide .gp-rond { transform: scale(1); opacity: 1; transition-delay: .35s; }
.gp-valide .gp-coche { stroke-dashoffset: 0; transition-delay: .75s; }
.gp-echec .gp-tourne, .gp-echec .gp-respire { animation-play-state: paused; }
.gp-echec .gp-petale { animation: none; opacity: .22; }
.gp-apparait { animation: gp-apparait .35s ease-out both; }
@keyframes gp-apparait { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) {
  .gp-tourne, .gp-respire, .gp-petale, .gp-apparait { animation: none !important; }
  .gp-petale { opacity: 1; }
  .gp-fleur * { transition-duration: .01ms !important; transition-delay: 0s !important; }
}`

/** Délai, en millisecondes, avant d'afficher ce qui suit la coche (le temps qu'elle se dessine). */
export const APRES_COCHE = 1100

export default function FleurPaiement({ etat, couleur }: { etat: 'attente' | 'valide' | 'echec'; couleur: string }) {
  // La fleur s'affiche d'abord ouverte, puis passe à son état final : la transition se voit.
  const [affiche, setAffiche] = useState<'attente' | 'valide' | 'echec'>('attente')
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAffiche(etat)))
    return () => cancelAnimationFrame(id)
  }, [etat])

  return (
    <>
      <style>{STYLE}</style>
      <svg className={`gp-fleur ${affiche === 'valide' ? 'gp-valide' : affiche === 'echec' ? 'gp-echec' : ''}`} viewBox="0 0 120 120" aria-hidden="true">
        <g className="gp-respire"><g className="gp-tourne">
          {ANGLES.map((a, i) => (
            <g key={a} transform={`rotate(${a} 60 60)`}>
              <ellipse className="gp-petale" cx="60" cy="31" rx="13" ry="24" fill={couleur} style={{ animationDelay: `${i * 0.3}s` }} />
            </g>
          ))}
          <circle className="gp-anneau" cx="60" cy="60" r="9" stroke={couleur} />
        </g></g>
        <circle className="gp-rond" cx="60" cy="60" r="40" fill={couleur} />
        <path className="gp-coche" d="M42 61 L54 73 L79 47" />
      </svg>
    </>
  )
}
