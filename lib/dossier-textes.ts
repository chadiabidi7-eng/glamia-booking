// Les textes du dossier de contestation, en 4 langues (21 nov. 2026).
// Le dossier destiné à Mollie se donne en anglais ; la pro le lit dans sa langue.
export type Langue = 'fr' | 'en' | 'es' | 'it'
const NOMS_LANGUES: Record<string, Record<string, string>> = {
  fr: { fr: 'français', en: 'anglais', es: 'espagnol', it: 'italien' },
  en: { fr: 'French', en: 'English', es: 'Spanish', it: 'Italian' },
  es: { fr: 'francés', en: 'inglés', es: 'español', it: 'italiano' },
  it: { fr: 'francese', en: 'inglese', es: 'spagnolo', it: 'italiano' },
}
export const nomLangue = (dans: string, langue: string) => NOMS_LANGUES[dans]?.[langue] ?? langue.toUpperCase()
const T = {
  fr: {
    titre: 'Dossier de contestation', rdvDu: 'Rendez-vous du {date} chez {pro}',
    genere: 'Généré le {date} par Glamia, à partir des données enregistrées automatiquement au moment du paiement. Rien n\'a été saisi à la main.',
    imprimer: 'Enregistrer en PDF', anglais: 'English version',
    resume: 'En résumé',
    rPaye: '{cliente} a payé {total} à {pro} pour ce rendez-vous, le {date}.',
    rAccord: 'Avant de payer, elle a coché une case acceptant explicitement le montant et les conditions d\'annulation, le {date} (heure du serveur Glamia). Le bouton « Payer » restait inactif tant que la case n\'était pas cochée.',
    r3ds: 'Le paiement a été authentifié par sa banque (3-D Secure).',
    rAnnuleCliente: 'Le rendez-vous a été annulé par la cliente le {date}.',
    rAnnulePro: 'Le rendez-vous a été annulé par la professionnelle le {date}.',
    rAbsente: 'La cliente ne s\'est pas présentée : absence notée par la professionnelle le {date}.',
    rConfirme: 'La cliente a confirmé sa venue en répondant au rappel, le {date}.',
    rRembourse: 'Montant déjà remboursé à la cliente : {montant}.',
    paiement: 'Le paiement', acompte: 'Acompte', jour: 'Paiement du jour', frais: 'Frais de réservation', total: 'Total payé', payeLe: 'Payé le',
    moyen: 'Moyen de paiement', auth: 'Authentification par la banque', authOui: 'Oui (3-D Secure)', authNon: 'Non demandée par la banque', pays: 'Pays de la carte',
    ref: 'Référence Mollie', rembourse: 'Remboursé', aucun: 'Aucun', etat: 'État',
    etats: { paye: 'Payé', rembourse: 'Remboursé', rembourse_partiel: 'Remboursé en partie', conteste: 'Contesté' } as Record<string, string>,
    accord: 'Ce que la cliente a vu et accepté',
    traduction: 'Traduction exacte', affichee: 'Textes affichés à la cliente en {langue}. Sous chacun, sa traduction exacte, avec les mêmes valeurs.',
    accordIntro: 'Textes affichés juste au-dessus du bouton « Payer », enregistrés mot pour mot au moment du paiement.',
    regle: 'Règle d\'annulation affichée', quiPaie: 'Qui encaisse et qui rembourse', caseCochee: 'Case cochée par la cliente',
    accepteLe: 'Acceptée le', page: 'Page', pageResa: 'Page de réservation de la professionnelle', pageLien: 'Lien d\'acompte envoyé par la professionnelle',
    langue: 'Langue affichée', conditions: 'Conditions applicables aux clientes', version: 'version du {v}', politique: 'Politique d\'annulation', ip: 'Adresse IP', appareil: 'Appareil',
    sansPreuve: 'Paiement antérieur au 21 novembre 2026 : seul le texte de la case cochée et son heure ont été conservés.',
    rdv: 'Le rendez-vous', prestation: 'Prestation', date: 'Date', prix: 'Prix', reserveLe: 'Réservé le', rappel: 'Rappel envoyé le', confirmeLe: 'Venue confirmée par la cliente le',
    decaleLe: 'Décalé le', ancienneDate: 'ancienne date : {date}', annuleLe: 'Annulé le', par: 'par', laCliente: 'la cliente', laPro: 'la professionnelle', absenteLe: 'Absence notée le',
    cliente: 'La cliente', nom: 'Nom', mail: 'E-mail', tel: 'Téléphone',
    pied: 'Glamia fournit l\'outil de réservation. La professionnelle vend la prestation et encaisse le paiement par Mollie B.V., établissement de paiement agréé ; Glamia ne détient jamais les fonds.',
    perime: 'Ce lien n\'est plus valable. Redemandez le dossier depuis la fiche du rendez-vous, dans l\'app Glamia.',
  },
  en: {
    titre: 'Chargeback dispute file', rdvDu: 'Appointment on {date} with {pro}',
    genere: 'Generated on {date} by Glamia from data recorded automatically at the time of payment. Nothing was entered by hand.',
    imprimer: 'Save as PDF', anglais: 'English version',
    resume: 'Summary',
    rPaye: '{cliente} paid {total} to {pro} for this appointment on {date}.',
    rAccord: 'Before paying, she ticked a box explicitly accepting the amount and the cancellation terms, on {date} (Glamia server time). The "Pay" button stayed disabled until the box was ticked.',
    r3ds: 'The payment was authenticated by her bank (3-D Secure).',
    rAnnuleCliente: 'The appointment was cancelled by the client on {date}.',
    rAnnulePro: 'The appointment was cancelled by the professional on {date}.',
    rAbsente: 'The client did not show up: no-show recorded by the professional on {date}.',
    rConfirme: 'The client confirmed she would attend by replying to the reminder, on {date}.',
    rRembourse: 'Amount already refunded to the client: {montant}.',
    paiement: 'Payment', acompte: 'Deposit', jour: 'Same-day payment', frais: 'Booking fee', total: 'Total paid', payeLe: 'Paid on',
    moyen: 'Payment method', auth: 'Bank authentication', authOui: 'Yes (3-D Secure)', authNon: 'Not requested by the bank', pays: 'Card country',
    ref: 'Mollie reference', rembourse: 'Refunded', aucun: 'None', etat: 'Status',
    etats: { paye: 'Paid', rembourse: 'Refunded', rembourse_partiel: 'Partly refunded', conteste: 'Disputed' } as Record<string, string>,
    accord: 'What the client saw and accepted',
    traduction: 'Exact translation', affichee: 'Texts shown to the client in {langue}. Under each one, its exact translation with the same values.',
    accordIntro: 'Texts displayed just above the "Pay" button, recorded word for word at the time of payment.',
    regle: 'Cancellation rule displayed', quiPaie: 'Who collects and who refunds', caseCochee: 'Box ticked by the client',
    accepteLe: 'Accepted on', page: 'Page', pageResa: 'Professional\'s booking page', pageLien: 'Deposit link sent by the professional',
    langue: 'Display language', conditions: 'Terms applicable to clients', version: 'version of {v}', politique: 'Cancellation policy', ip: 'IP address', appareil: 'Device',
    sansPreuve: 'Payment made before 21 November 2026: only the text of the ticked box and its time were kept.',
    rdv: 'The appointment', prestation: 'Service', date: 'Date', prix: 'Price', reserveLe: 'Booked on', rappel: 'Reminder sent on', confirmeLe: 'Attendance confirmed by the client on',
    decaleLe: 'Rescheduled on', ancienneDate: 'previous date: {date}', annuleLe: 'Cancelled on', par: 'by', laCliente: 'the client', laPro: 'the professional', absenteLe: 'No-show recorded on',
    cliente: 'The client', nom: 'Name', mail: 'Email', tel: 'Phone',
    pied: 'Glamia provides the booking tool. The professional sells the service and collects the payment through Mollie B.V., a licensed payment institution; Glamia never holds the funds.',
    perime: 'This link has expired. Request the file again from the appointment screen in the Glamia app.',
  },
  es: {
    titre: 'Expediente de contracargo', rdvDu: 'Cita del {date} con {pro}',
    genere: 'Generado el {date} por Glamia a partir de los datos registrados automáticamente en el momento del pago. Nada se ha introducido a mano.',
    imprimer: 'Guardar en PDF', anglais: 'English version',
    resume: 'Resumen',
    rPaye: '{cliente} pagó {total} a {pro} por esta cita el {date}.',
    rAccord: 'Antes de pagar, marcó una casilla aceptando expresamente el importe y las condiciones de cancelación, el {date} (hora del servidor de Glamia). El botón «Pagar» permanecía inactivo mientras la casilla no estuviera marcada.',
    r3ds: 'El pago fue autenticado por su banco (3-D Secure).',
    rAnnuleCliente: 'La cita fue cancelada por la clienta el {date}.',
    rAnnulePro: 'La cita fue cancelada por la profesional el {date}.',
    rAbsente: 'La clienta no se presentó: ausencia registrada por la profesional el {date}.',
    rConfirme: 'La clienta confirmó su asistencia respondiendo al recordatorio, el {date}.',
    rRembourse: 'Importe ya reembolsado a la clienta: {montant}.',
    paiement: 'El pago', acompte: 'Señal', jour: 'Pago del día', frais: 'Gastos de reserva', total: 'Total pagado', payeLe: 'Pagado el',
    moyen: 'Medio de pago', auth: 'Autenticación bancaria', authOui: 'Sí (3-D Secure)', authNon: 'No solicitada por el banco', pays: 'País de la tarjeta',
    ref: 'Referencia Mollie', rembourse: 'Reembolsado', aucun: 'Nada', etat: 'Estado',
    etats: { paye: 'Pagado', rembourse: 'Reembolsado', rembourse_partiel: 'Reembolsado en parte', conteste: 'Disputado' } as Record<string, string>,
    accord: 'Lo que la clienta vio y aceptó',
    traduction: 'Traducción exacta', affichee: 'Textos mostrados a la clienta en {langue}. Bajo cada uno, su traducción exacta con los mismos valores.',
    accordIntro: 'Textos mostrados justo encima del botón «Pagar», registrados palabra por palabra en el momento del pago.',
    regle: 'Regla de cancelación mostrada', quiPaie: 'Quién cobra y quién reembolsa', caseCochee: 'Casilla marcada por la clienta',
    accepteLe: 'Aceptada el', page: 'Página', pageResa: 'Página de reserva de la profesional', pageLien: 'Enlace de señal enviado por la profesional',
    langue: 'Idioma mostrado', conditions: 'Condiciones aplicables a las clientas', version: 'versión del {v}', politique: 'Política de cancelación', ip: 'Dirección IP', appareil: 'Dispositivo',
    sansPreuve: 'Pago anterior al 21 de noviembre de 2026: solo se conservaron el texto de la casilla marcada y su hora.',
    rdv: 'La cita', prestation: 'Servicio', date: 'Fecha', prix: 'Precio', reserveLe: 'Reservada el', rappel: 'Recordatorio enviado el', confirmeLe: 'Asistencia confirmada por la clienta el',
    decaleLe: 'Cambiada el', ancienneDate: 'fecha anterior: {date}', annuleLe: 'Cancelada el', par: 'por', laCliente: 'la clienta', laPro: 'la profesional', absenteLe: 'Ausencia registrada el',
    cliente: 'La clienta', nom: 'Nombre', mail: 'Correo', tel: 'Teléfono',
    pied: 'Glamia proporciona la herramienta de reserva. La profesional vende el servicio y cobra el pago mediante Mollie B.V., entidad de pago autorizada; Glamia nunca posee los fondos.',
    perime: 'Este enlace ya no es válido. Vuelva a solicitar el expediente desde la ficha de la cita en la app Glamia.',
  },
  it: {
    titre: 'Fascicolo di contestazione', rdvDu: 'Appuntamento del {date} con {pro}',
    genere: 'Generato il {date} da Glamia a partire dai dati registrati automaticamente al momento del pagamento. Nulla è stato inserito a mano.',
    imprimer: 'Salva in PDF', anglais: 'English version',
    resume: 'In sintesi',
    rPaye: '{cliente} ha pagato {total} a {pro} per questo appuntamento il {date}.',
    rAccord: 'Prima di pagare, ha spuntato una casella accettando esplicitamente l\'importo e le condizioni di cancellazione, il {date} (ora del server Glamia). Il pulsante «Paga» restava inattivo finché la casella non era spuntata.',
    r3ds: 'Il pagamento è stato autenticato dalla sua banca (3-D Secure).',
    rAnnuleCliente: 'L\'appuntamento è stato annullato dalla cliente il {date}.',
    rAnnulePro: 'L\'appuntamento è stato annullato dalla professionista il {date}.',
    rAbsente: 'La cliente non si è presentata: assenza registrata dalla professionista il {date}.',
    rConfirme: 'La cliente ha confermato la sua presenza rispondendo al promemoria, il {date}.',
    rRembourse: 'Importo già rimborsato alla cliente: {montant}.',
    paiement: 'Il pagamento', acompte: 'Acconto', jour: 'Pagamento del giorno', frais: 'Spese di prenotazione', total: 'Totale pagato', payeLe: 'Pagato il',
    moyen: 'Metodo di pagamento', auth: 'Autenticazione bancaria', authOui: 'Sì (3-D Secure)', authNon: 'Non richiesta dalla banca', pays: 'Paese della carta',
    ref: 'Riferimento Mollie', rembourse: 'Rimborsato', aucun: 'Nessuno', etat: 'Stato',
    etats: { paye: 'Pagato', rembourse: 'Rimborsato', rembourse_partiel: 'Rimborsato in parte', conteste: 'Contestato' } as Record<string, string>,
    accord: 'Ciò che la cliente ha visto e accettato',
    traduction: 'Traduzione esatta', affichee: 'Testi mostrati alla cliente in {langue}. Sotto ciascuno, la sua traduzione esatta con gli stessi valori.',
    accordIntro: 'Testi mostrati appena sopra il pulsante «Paga», registrati parola per parola al momento del pagamento.',
    regle: 'Regola di cancellazione mostrata', quiPaie: 'Chi incassa e chi rimborsa', caseCochee: 'Casella spuntata dalla cliente',
    accepteLe: 'Accettata il', page: 'Pagina', pageResa: 'Pagina di prenotazione della professionista', pageLien: 'Link di acconto inviato dalla professionista',
    langue: 'Lingua mostrata', conditions: 'Condizioni applicabili alle clienti', version: 'versione del {v}', politique: 'Politica di cancellazione', ip: 'Indirizzo IP', appareil: 'Dispositivo',
    sansPreuve: 'Pagamento anteriore al 21 novembre 2026: sono stati conservati solo il testo della casella spuntata e la sua ora.',
    rdv: 'L\'appuntamento', prestation: 'Prestazione', date: 'Data', prix: 'Prezzo', reserveLe: 'Prenotato il', rappel: 'Promemoria inviato il', confirmeLe: 'Presenza confermata dalla cliente il',
    decaleLe: 'Spostato il', ancienneDate: 'data precedente: {date}', annuleLe: 'Annullato il', par: 'da', laCliente: 'la cliente', laPro: 'la professionista', absenteLe: 'Assenza registrata il',
    cliente: 'La cliente', nom: 'Nome', mail: 'E-mail', tel: 'Telefono',
    pied: 'Glamia fornisce lo strumento di prenotazione. La professionista vende la prestazione e incassa il pagamento tramite Mollie B.V., istituto di pagamento autorizzato; Glamia non detiene mai i fondi.',
    perime: 'Questo link non è più valido. Richiedi di nuovo il fascicolo dalla scheda dell\'appuntamento nell\'app Glamia.',
  },
}
export type Textes = typeof T.fr

// ── L'ENCADRÉ, TRADUIT À L'IDENTIQUE ─────────────────────────────────────────
// La cliente a vu l'encadré dans sa langue ; le dossier peut être lu dans une autre
// (l'anglais pour Mollie). On reconstruit alors le même encadré, avec les mêmes
// valeurs, à partir des textes officiels de la page de réservation dans la langue
// du dossier : c'est une traduction exacte, pas une interprétation.
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'
import it from '@/locales/it.json'
const RESA: Record<string, Record<string, string>> = { fr: fr.resa, en: en.resa, es: es.resa, it: it.resa } as unknown as Record<string, Record<string, string>>
export type Valeurs = { delai?: number | null; acompte?: number | null; frais?: number | null; total?: number | null; pro?: string | null }
export function encadreTraduit(langue: string, v: Valeurs | null | undefined): { regle: string; paiement: string; case: string } | null {
  const r = RESA[langue]
  if (!r || !v || v.delai == null || v.acompte == null || v.frais == null || v.total == null || !v.pro) return null
  const eur = (c: number) => (c / 100).toLocaleString(LOCALES[langue as Langue] ?? 'en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 })
  const p: Record<string, string> = { delai: String(v.delai), somme: eur(v.acompte), pro: v.pro, acompte: eur(v.acompte), frais: eur(v.frais), conditions: r.conditionsClientes }
  const f = (cle: string, extra: Record<string, string> = {}) => (r[cle] ?? '').replace(/%\{(\w+)\}/g, (_, k) => ({ ...p, ...extra })[k] ?? '')
  return { regle: f('condMollieTitre') + f('condMollieTexte'), paiement: f('paiementProMollie'), case: f('consentMollie', { somme: eur(v.total) }) }
}
export const textesDossier = (l: string): Textes => (T as Record<string, Textes>)[l] ?? T.fr
export const LOCALES: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', it: 'it-IT' }
