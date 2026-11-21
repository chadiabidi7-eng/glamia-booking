'use client'
// Le bouton « Enregistrer en PDF » du dossier de contestation : ouvre l'impression du navigateur
// (sur iPhone et Android : partager → enregistrer en PDF). Caché à l'impression.
import { FileDown } from 'lucide-react'

export default function BoutonImprimer({ libelle }: { libelle: string }) {
  return (
    <button className="dossier-imprimer" onClick={() => window.print()}>
      <FileDown size={17} strokeWidth={2} />{libelle}
    </button>
  )
}
