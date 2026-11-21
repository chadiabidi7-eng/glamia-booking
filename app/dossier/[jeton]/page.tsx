// ─────────────────────────────────────────────────────────────────────────────
// LE DOSSIER DE CONTESTATION D'UN RENDEZ-VOUS PAYÉ (3.3.0, 21 nov. 2026)
//
// Mis en forme à la demande, à partir de ce qui a été gardé automatiquement au
// paiement (lib/dossier-contestation.ts). La pro l'ouvre depuis la fiche du
// rendez-vous et l'enregistre en PDF pour le déposer chez Mollie ; Glamia le joint
// au Dossier Réclamation Mollie (version anglaise, ?lang=en). Jamais indexé.
// ─────────────────────────────────────────────────────────────────────────────
import type { Metadata } from 'next'
import { lireDossier, verifierJeton, type Paiement } from '@/lib/dossier-contestation'
import { encadreTraduit, LOCALES, nomLangue, textesDossier, type Langue } from '@/lib/dossier-textes'
import BoutonImprimer from '@/components/BoutonImprimer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Glamia', robots: { index: false, follow: false } }

const ROSE = '#B0578A'
const remplir = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

function appareilLisible(ua: string | null): string | null {
  if (!ua) return null
  const sys = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : null
  const nav = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null
  return [sys, nav].filter(Boolean).join(' · ') || null
}

export default async function DossierPage({ params, searchParams }: { params: Promise<{ jeton: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { jeton } = await params
  const { lang } = await searchParams
  const langue: Langue = (['fr', 'en', 'es', 'it'] as const).includes(lang as Langue) ? lang as Langue : 'fr'
  const t = textesDossier(langue)
  const rdvId = verifierJeton(jeton)
  const d = rdvId ? await lireDossier(rdvId) : null
  if (!d || !d.paiements.length) return <Cadre><p style={{ fontSize: 15, lineHeight: 1.6, textAlign: 'center', margin: '40px 0' }}>{t.perime}</p></Cadre>

  const loc = LOCALES[langue]
  const fuseau = d.pro.timezone || 'Europe/Paris'
  // Un instant réel (paiement, rappel…) : affiché à l'heure de la pro, fuseau précisé.
  const instant = (iso: unknown) => typeof iso === 'string' && iso
    ? new Date(iso).toLocaleString(loc, { timeZone: fuseau, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })
    : null
  // L'heure d'un rendez-vous : écrite telle qu'affichée chez la pro (convention de la base).
  const heureRdv = (iso: unknown) => typeof iso === 'string' && iso
    ? new Date(String(iso).replace(' ', 'T').slice(0, 19) + 'Z').toLocaleString(loc, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null
  const euros = (c: number, devise = 'EUR') => (c / 100).toLocaleString(loc, { style: 'currency', currency: devise })

  const r = d.rdv
  const nomPro = d.pro.pseudo || [d.pro.prenom, d.pro.nom].filter(Boolean).join(' ') || '—'
  const nomCliente = d.cliente ? [d.cliente.prenom, d.cliente.nom].filter(Boolean).join(' ') : null
  const premier = d.paiements[0]
  const totalPaye = d.paiements.reduce((s, p) => s + p.total_cliente, 0)
  const totalRembourse = d.paiements.reduce((s, p) => s + (p.montant_rembourse || 0), 0)
  const devise = premier.devise || 'EUR'
  const accepteLe = premier.preuve?.acceptee_le ?? premier.politique_acceptee_le
  const authentifie = d.paiements.some(p => p.preuve?.mollie?.securite === '3dsecure')
  const prestation = (r.technique as string | null) || (Array.isArray(r.techniques) ? (r.techniques as { nom?: string }[]).map(x => x?.nom).filter(Boolean).join(', ') : null)

  const resume = [
    remplir(t.rPaye, { cliente: nomCliente || premier.cliente_mail || '—', total: euros(totalPaye, devise), pro: nomPro, date: instant(premier.paye_le) ?? '—' }),
    accepteLe ? remplir(t.rAccord, { date: instant(accepteLe)! }) : null,
    authentifie ? t.r3ds : null,
    r.rappel_confirme_at ? remplir(t.rConfirme, { date: instant(r.rappel_confirme_at)! }) : null,
    r.annule_le && r.statut === 'annule' ? remplir(r.annule_par === 'pro' ? t.rAnnulePro : t.rAnnuleCliente, { date: instant(r.annule_le)! }) : null,
    r.absente_le ? remplir(t.rAbsente, { date: instant(r.absente_le)! }) : null,
    totalRembourse > 0 ? remplir(t.rRembourse, { montant: euros(totalRembourse, devise) }) : null,
  ].filter(Boolean) as string[]

  const autreLangue = langue === 'en' ? null : `?lang=en`

  return (
    <Cadre>
      <div className="dossier-actions">
        <BoutonImprimer libelle={t.imprimer} />
        {autreLangue && <a href={autreLangue} className="dossier-lien">{t.anglais}</a>}
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px', letterSpacing: -0.3, textWrap: 'balance' }}>{t.titre}</h1>
      <p style={{ fontSize: 15, color: '#374151', margin: '0 0 6px' }}>{remplir(t.rdvDu, { date: heureRdv(r.date) ?? '—', pro: nomPro })}</p>
      <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 28px', lineHeight: 1.5 }}>{remplir(t.genere, { date: instant(new Date().toISOString()) ?? '' })}</p>

      <Bloc titre={t.resume} fond="#FBF1F6">
        {resume.map((s, i) => <p key={i} style={{ margin: i ? '8px 0 0' : 0, fontSize: 14.5, lineHeight: 1.6, textAlign: 'justify', hyphens: 'none' }}>{s}</p>)}
      </Bloc>

      {d.paiements.map(p => <BlocPaiement key={p.id} p={p} t={t} langue={langue} instant={instant} euros={euros} />)}

      <Bloc titre={t.rdv}>
        <Lignes l={[
          [t.prestation, prestation],
          [t.date, heureRdv(r.date)],
          // Pas de « prix » : celui de la fiche ignore les remises (fidélité, offre). Seul compte ce qui a été payé, plus haut.
          [t.reserveLe, instant(r.created_at)],
          [t.rappel, instant(r.rappel_envoye_at)],
          [t.confirmeLe, instant(r.rappel_confirme_at)],
          [t.decaleLe, r.decale_le ? `${instant(r.decale_le)}${r.date_avant ? ` (${remplir(t.ancienneDate, { date: heureRdv(r.date_avant) ?? '' })})` : ''}` : null],
          [t.annuleLe, r.annule_le && r.statut === 'annule' ? `${instant(r.annule_le)} — ${t.par} ${r.annule_par === 'pro' ? t.laPro : t.laCliente}` : null],
          [t.absenteLe, instant(r.absente_le)],
        ]} />
      </Bloc>

      <Bloc titre={t.cliente}>
        <Lignes l={[[t.nom, nomCliente], [t.mail, d.cliente?.email || premier.cliente_mail], [t.tel, d.cliente?.telephone]]} />
      </Bloc>

      <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, margin: '28px 0 0', textAlign: 'justify', hyphens: 'none' }}>{t.pied}</p>
    </Cadre>
  )
}

function BlocPaiement({ p, t, langue, instant, euros }: { p: Paiement; t: ReturnType<typeof textesDossier>; langue: Langue; instant: (v: unknown) => string | null; euros: (c: number, d?: string) => string }) {
  const m = p.preuve?.mollie
  // Le moyen seulement : aucune donnée de carte n'est gardée chez Glamia (la référence Mollie suffit à les retrouver).
  const moyen = m ? (m.portefeuille === 'applepay' ? 'Apple Pay' : m.portefeuille === 'googlepay' ? 'Google Pay' : m.methode === 'creditcard' ? t.carteBancaire : m.methode ?? null) : null
  const pr = p.preuve
  // Lu dans une autre langue que celle qu'a vue la cliente : la traduction exacte sous chaque texte.
  const traduit = pr?.langue && pr.langue !== langue ? encadreTraduit(langue, pr.encadre?.valeurs) : null
  const legende = traduit ? t.traduction : null
  const conditionsUrl = `https://booking.glamia.pro/conditions-clientes${pr?.langue && pr.langue !== 'fr' ? `?lang=${pr.langue}` : ''}`
  return (
    <>
      <Bloc titre={`${t.paiement} — ${p.type === 'jour' ? t.jour : t.acompte}`}>
        <Lignes l={[
          [p.type === 'jour' ? t.jour : t.acompte, euros(p.montant, p.devise)],
          [t.frais, euros(p.frais_reservation, p.devise)],
          [t.total, euros(p.total_cliente, p.devise)],
          [t.payeLe, instant(p.paye_le)],
          [t.moyen, moyen],
          // Mollie ne dit pas toujours si la banque a vérifié : sans réponse, la ligne n'apparaît pas.
          [t.auth, m?.securite === '3dsecure' ? t.authOui : m?.securite === 'normal' ? t.authNon : null],
          [t.ref, p.mollie_paiement_id],
          [t.rembourse, p.montant_rembourse > 0 ? euros(p.montant_rembourse, p.devise) : t.aucun],
          [t.etat, t.etats[p.statut] ?? p.statut],
        ]} />
      </Bloc>
      <Bloc titre={t.accord}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{pr ? t.accordIntro : t.sansPreuve}</p>
        {traduit && <p style={{ margin: '-6px 0 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{t.affichee.replace('{langue}', nomLangue(langue, pr!.langue!))}</p>}
        {pr?.encadre?.regle && <Citation titre={t.regle} texte={pr.encadre.regle} traduction={traduit?.regle ?? null} legende={legende} />}
        {pr?.encadre?.paiement && <Citation titre={t.quiPaie} texte={pr.encadre.paiement} traduction={traduit?.paiement} legende={legende} />}
        {(pr?.encadre?.case || p.politique_texte) && <Citation titre={t.caseCochee} texte={`☑ ${pr?.encadre?.case || p.politique_texte}`} traduction={traduit ? `☑ ${traduit.case}` : null} legende={legende} />}
        <Lignes l={[
          [t.accepteLe, instant(pr?.acceptee_le ?? p.politique_acceptee_le)],
          [t.page, pr ? (pr.page === 'lien_acompte' ? t.pageLien : pr.page === 'lien_jour' ? t.pageJour : t.pageResa) : null],
          [t.langue, pr?.langue?.toUpperCase() ?? null],
          [t.conditions, pr?.conditions_version ? <><a href={conditionsUrl} style={{ color: ROSE }}>{remplir(t.version, { v: pr.conditions_version })}</a></> : null],
          [t.politique, p.politique_version],
          [t.ip, pr?.ip ?? null],
          [t.appareil, pr?.appareil ? <>{appareilLisible(pr.appareil) ?? ''}<span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', wordBreak: 'break-all', marginTop: 2 }}>{pr.appareil}</span></> : null],
        ]} />
      </Bloc>
    </>
  )
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#FAF7F5', fontFamily: 'system-ui, sans-serif', color: '#1f2937', WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        .dossier-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
        .dossier-imprimer { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border: none; border-radius: 12px; background: ${ROSE}; color: #fff; font-size: 14.5px; font-weight: 600; cursor: pointer; transition-property: scale; transition-duration: 120ms; }
        .dossier-imprimer:active { scale: 0.96; }
        .dossier-lien { font-size: 14px; font-weight: 600; color: ${ROSE}; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; }
        @media print {
          .dossier-actions, .dossier-entete-lien { display: none !important; }
          .dossier-fond { background: #fff !important; }
          .dossier-carte { box-shadow: none !important; padding: 0 !important; }
          .dossier-bloc { break-inside: avoid; }
        }
      `}</style>
      <header style={{ background: '#fff', borderBottom: '1px solid #F0E6EA' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/glamia-logo-net.png" alt="Glamia" width={682} height={176} style={{ height: 30, width: 'auto' }} />
          <a className="dossier-entete-lien" href="https://glamia.pro" style={{ fontSize: 13.5, fontWeight: 600, color: ROSE, textDecoration: 'none' }}>glamia.pro</a>
        </div>
      </header>
      <main className="dossier-fond" style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div className="dossier-carte" style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.05)' }}>
          {children}
        </div>
      </main>
    </div>
  )
}

function Bloc({ titre, fond, children }: { titre: string; fond?: string; children: React.ReactNode }) {
  return (
    <section className="dossier-bloc" style={{ marginTop: 28, ...(fond ? { background: fond, borderRadius: 14, padding: '18px 18px' } : {}) }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>{titre}</h2>
      {children}
    </section>
  )
}

function Citation({ titre, texte, traduction, legende }: { titre: string; texte: string; traduction?: string | null; legende?: string | null }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af' }}>{titre}</p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#1f2937', borderLeft: `3px solid ${ROSE}`, padding: '2px 0 2px 12px', textAlign: 'justify', hyphens: 'none' }}>{texte}</p>
      {traduction && (
        <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#4b5563', borderLeft: '3px solid #E8DCE2', padding: '2px 0 2px 12px', textAlign: 'justify', hyphens: 'none' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#9ca3af', marginBottom: 2 }}>{legende}</span>{traduction}
        </p>
      )}
    </div>
  )
}

function Lignes({ l }: { l: [string, React.ReactNode][] }) {
  const visibles = l.filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(140px, 38%) 1fr', columnGap: 16, rowGap: 0 }}>
      {visibles.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt style={{ fontSize: 13.5, color: '#6b7280', padding: '9px 0', borderTop: i ? '1px solid #F3EDEA' : 'none' }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 14, color: '#1f2937', padding: '9px 0', borderTop: i ? '1px solid #F3EDEA' : 'none', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
