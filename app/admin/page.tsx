'use client'

import { useCallback, useEffect, useState } from 'react'

type User = {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  pseudo: string | null
  telephone: string | null
  slug: string | null
  adresse: string | null
  is_pro: boolean
  trial_ends_at: string | null
  created_at: string
  last_sign_in_at: string | null
  nb_clientes: number
  nb_rdv: number
  statut: 'pro' | 'essai' | 'expire'
}

type Stats = {
  total: number
  newToday: number
  newThisWeek: number
  abonnees: number
  enEssai: number
  expirees: number
  totalRdv: number
  totalClientes: number
}

type Filter = 'all' | 'pro' | 'essai' | 'expire'

const PINK = '#C2779E'
const BG = '#FAF7F5'

function formatDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateShort(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function timeAgo(d: string | null) {
  if (!d) return 'Jamais'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "A l'instant"
  if (mins < 60) return `Il y a ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  return formatDateShort(d)
}

function daysLeft(d: string | null) {
  if (!d) return null
  const diff = new Date(d).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [sortBy, setSortBy] = useState<'recent' | 'rdv' | 'clientes' | 'last_active'>('recent')

  const fetchData = useCallback(async (pwd: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin', {
        headers: { 'x-admin-password': pwd },
      })
      if (!res.ok) {
        if (res.status === 401) { setError('Mot de passe incorrect'); setAuthenticated(false) }
        else setError('Erreur serveur')
        return
      }
      const data = await res.json()
      setStats(data.stats)
      setUsers(data.users)
      setAuthenticated(true)
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    fetchData(password.trim())
  }

  // Auto-refresh every 60s
  useEffect(() => {
    if (!authenticated) return
    const interval = setInterval(() => fetchData(password), 60000)
    return () => clearInterval(interval)
  }, [authenticated, password, fetchData])

  const filtered = users
    .filter(u => filter === 'all' || u.statut === filter)
    .filter(u => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        (u.prenom ?? '').toLowerCase().includes(q) ||
        (u.nom ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.pseudo ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'rdv') return b.nb_rdv - a.nb_rdv
      if (sortBy === 'clientes') return b.nb_clientes - a.nb_clientes
      if (sortBy === 'last_active') return new Date(b.last_sign_in_at ?? 0).getTime() - new Date(a.last_sign_in_at ?? 0).getTime()
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{
          background: '#fff', borderRadius: 16, padding: 40, boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column', gap: 16, width: 360,
        }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Glamia Admin</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>Tableau de bord fondateur</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe admin"
            autoFocus
            style={{
              padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e0d6cf',
              fontSize: 15, outline: 'none', background: BG,
            }}
          />
          {error && <p style={{ color: '#e53935', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            padding: '12px 0', borderRadius: 10, border: 'none', background: PINK,
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Chargement...' : 'Accéder'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e0da', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
          <span style={{ color: PINK }}>Glamia</span> Admin
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => fetchData(password)} style={{
            padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${PINK}`,
            background: 'transparent', color: PINK, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Actualiser
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        {/* Stats cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="Total utilisatrices" value={stats.total} color="#1a1a1a" />
            <StatCard label="Nouvelles aujourd'hui" value={stats.newToday} color="#4CAF50" />
            <StatCard label="Cette semaine" value={stats.newThisWeek} color="#2196F3" />
            <StatCard label="Abonnees Pro" value={stats.abonnees} color={PINK} />
            <StatCard label="En essai" value={stats.enEssai} color="#FF9800" />
            <StatCard label="Essai expire" value={stats.expirees} color="#e53935" />
            <StatCard label="Total RDV" value={stats.totalRdv} color="#7C4DFF" />
            <StatCard label="Total clientes" value={stats.totalClientes} color="#00BCD4" />
          </div>
        )}

        {/* Filters + Search */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16,
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['all', 'Toutes'], ['essai', 'En essai'], ['expire', 'Expirées'], ['pro', 'Abonnées']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: filter === key ? PINK : '#f0ebe7', color: filter === key ? '#fff' : '#6b5d4f',
              }}>
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{
              flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 8,
              border: '1.5px solid #e0d6cf', fontSize: 14, outline: 'none', background: BG,
            }}
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e0d6cf',
              fontSize: 13, background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="recent">Plus recentes</option>
            <option value="last_active">Derniere connexion</option>
            <option value="rdv">Plus de RDV</option>
            <option value="clientes">Plus de clientes</option>
          </select>
        </div>

        {/* Results count */}
        <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
          {filtered.length} utilisatrice{filtered.length > 1 ? 's' : ''}
        </p>

        {/* User list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(user => (
            <UserRow key={user.id} user={user} onClick={() => setSelectedUser(user)} />
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selectedUser && (
        <UserDetail user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <p style={{ fontSize: 28, fontWeight: 700, color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontWeight: 500 }}>{label}</p>
    </div>
  )
}

function StatutBadge({ statut }: { statut: User['statut'] }) {
  const conf = {
    pro: { bg: '#e8f5e9', color: '#2e7d32', label: 'Pro' },
    essai: { bg: '#fff3e0', color: '#e65100', label: 'Essai' },
    expire: { bg: '#ffebee', color: '#c62828', label: 'Expiré' },
  }[statut]
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: conf.bg, color: conf.color,
    }}>
      {conf.label}
    </span>
  )
}

function UserRow({ user, onClick }: { user: User; onClick: () => void }) {
  const days = daysLeft(user.trial_ends_at)
  const trialWarning = user.statut === 'essai' && days !== null && days <= 3

  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '14px 20px', cursor: 'pointer',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 16,
      border: trialWarning ? '1.5px solid #FF9800' : '1px solid transparent',
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)')}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: 20, background: `${PINK}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 700, color: PINK, flexShrink: 0,
      }}>
        {(user.prenom ?? '?')[0].toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>
            {user.pseudo || `${user.prenom ?? ''} ${user.nom ?? ''}`}
          </span>
          <StatutBadge statut={user.statut} />
          {trialWarning && (
            <span style={{ fontSize: 11, color: '#e65100', fontWeight: 600 }}>
              {days! <= 0 ? 'Expire auj.' : `${days}j restant${days! > 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}
        </p>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{user.nb_rdv}</p>
          <p style={{ fontSize: 10, color: '#888', margin: 0 }}>RDV</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{user.nb_clientes}</p>
          <p style={{ fontSize: 10, color: '#888', margin: 0 }}>Clientes</p>
        </div>
      </div>

      {/* Last active */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 90 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{timeAgo(user.last_sign_in_at)}</p>
        <p style={{ fontSize: 10, color: '#aaa', margin: '2px 0 0' }}>Inscrite le {formatDateShort(user.created_at)}</p>
      </div>
    </div>
  )
}

function UserDetail({ user, onClose }: { user: User; onClose: () => void }) {
  const days = daysLeft(user.trial_ends_at)
  const bookingUrl = user.slug ? `https://booking.glamia.pro/reserve/${user.slug}` : null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 32, maxWidth: 500, width: '100%',
        maxHeight: '80vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
              {user.pseudo || `${user.prenom ?? ''} ${user.nom ?? ''}`}
            </h2>
            {user.pseudo && (
              <p style={{ fontSize: 13, color: '#888', margin: '2px 0 0' }}>{user.prenom} {user.nom}</p>
            )}
          </div>
          <StatutBadge statut={user.statut} />
        </div>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <DetailItem label="Email" value={user.email} />
          <DetailItem label="Telephone" value={user.telephone} />
          <DetailItem label="Inscrite le" value={formatDate(user.created_at)} />
          <DetailItem label="Derniere connexion" value={timeAgo(user.last_sign_in_at)} />
          <DetailItem label="Fin d'essai" value={
            user.trial_ends_at
              ? `${formatDate(user.trial_ends_at)}${days !== null ? ` (${days > 0 ? `${days}j restants` : 'expiré'})` : ''}`
              : 'Aucun'
          } />
          <DetailItem label="Adresse" value={user.adresse} />
        </div>

        {/* Metrics */}
        <div style={{
          display: 'flex', gap: 16, marginBottom: 20, padding: '16px 0',
          borderTop: '1px solid #f0ebe7', borderBottom: '1px solid #f0ebe7',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: PINK, margin: 0 }}>{user.nb_rdv}</p>
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Rendez-vous</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: PINK, margin: 0 }}>{user.nb_clientes}</p>
            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Clientes</p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {user.email && (
            <a href={`mailto:${user.email}?subject=Glamia - Votre essai gratuit`} style={{
              display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10,
              background: PINK, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              Envoyer un email
            </a>
          )}
          {bookingUrl && (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10,
              border: `1.5px solid ${PINK}`, color: PINK, fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}>
              Voir page de reservation
            </a>
          )}
        </div>

        <button onClick={onClose} style={{
          marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 10,
          border: '1px solid #e0d6cf', background: 'transparent', color: '#888',
          fontSize: 13, cursor: 'pointer',
        }}>
          Fermer
        </button>
      </div>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#888', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ fontSize: 14, color: '#1a1a1a', margin: '2px 0 0', wordBreak: 'break-all' }}>{value || '-'}</p>
    </div>
  )
}
