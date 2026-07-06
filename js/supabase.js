/* ═══════════════════════════════════════════════════════
   SUPABASE CONFIG
   Replace the two values below with your project credentials.
   Dashboard → Settings → API
   ═══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://jptxloelwjvvqfzqozfa.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwdHhsb2Vsd2p2dnFmenFvemZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NjgzNjYsImV4cCI6MjA5ODI0NDM2Nn0.vFMTL_IDNDLniPy6PBfgPAFYNibZXeki1GZkb1VT9aw'

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

/* ── Auth helpers ── */
async function getSession() {
  const { data: { session } } = await sb.auth.getSession()
  return session
}

async function getProfile() {
  const session = await getSession()
  if (!session) return null
  const { data } = await sb.from('users').select('*').eq('id', session.user.id).single()
  return data
}

async function requireAuth() {
  const session = await getSession()
  if (!session) { location.href = 'login.html'; return null }
  return session
}

/* ── Role-based routing ──
   dashboardFor() is the single source of truth for "where does this role
   land after login" — used by login.html and by every requireRole() redirect,
   so a misrouted user always ends up on THEIR OWN dashboard, never a
   one-size-fits-all fallback page. */
function dashboardFor(role) {
  if (role === 'admin')  return 'admin.html'
  if (role === 'vendor') return 'vendor-dashboard.html'
  return 'student-dashboard.html'
}

async function requireRole(expectedRole) {
  const profile = await getProfile()
  if (!profile) { location.href = 'login.html'; return null }
  if (profile.role !== expectedRole) { location.href = dashboardFor(profile.role); return null }
  return profile
}

async function requireAdmin()  { return requireRole('admin') }
async function requireVendor() { return requireRole('vendor') }
async function requireStudent(){ return requireRole('student') }

async function logout() {
  await sb.auth.signOut()
  location.href = 'login.html'
}

/* ── Role-based sidebar nav ──
   One shared definition per role instead of the same nav block copy-pasted
   into every page (which is how marketplace.html ended up with dead
   href="#" links that were never updated when orders.html/settings.html
   were added). Every page with a sidebar now renders an empty
   <nav id="sidebarNav"> and gets it filled in here, driven by the actual
   logged-in user's role — so a vendor browsing a shared page like
   marketplace.html still sees the vendor nav, not a generic one. */
const SIDEBAR_NAV = {
  student: [
    { label: 'Dashboard',      icon: '🏠',  href: 'student-dashboard.html' },
    { label: 'Products',      icon: '🏪',  href: 'marketplace.html' },
    { label: 'Categories',    icon: '🏷️', href: 'marketplace.html' },
    { label: 'Events',        icon: '📅',  href: 'events.html' },
    { label: 'Announcements', icon: '📰',  href: 'news.html' },
    { label: 'Profile',       icon: '⚙️',  href: 'settings.html' },
  ],
  vendor: [
    { label: 'Dashboard',     icon: '🏠',  href: 'vendor-dashboard.html' },
    { label: 'My Products',   icon: '🏷️', href: 'my-shop.html' },
    { label: 'Add Product',   icon: '➕',  href: 'my-shop.html?action=add' },
    { label: 'Edit Product',  icon: '✏️',  href: 'my-shop.html' },
    { label: 'Profile',       icon: '⚙️',  href: 'settings.html' },
  ],
  admin: [
    { label: 'Dashboard',     icon: '📊',  href: 'admin.html' },
    { label: 'Users',         icon: '👥',  href: 'admin-users.html' },
    { label: 'Vendors',       icon: '🏪',  href: 'admin-vendors.html' },
    { label: 'Products',     icon: '📦',  href: 'admin-products.html' },
    { label: 'Categories',    icon: '🏷️', href: 'admin-categories.html' },
    { label: 'Events',        icon: '📅',  href: 'admin-events.html' },
    { label: 'Announcements', icon: '📰',  href: 'admin-announcements.html' },
    { label: 'Reports',       icon: '📈',  href: 'admin-reports.html' },
    { label: 'Settings',      icon: '⚙️',  href: 'settings.html' },
  ],
}

function buildSidebarNavHtml(role) {
  const items = SIDEBAR_NAV[role] || SIDEBAR_NAV.student
  const links = items.map(i =>
    `<a class="nav-item" href="${i.href}"><span class="nav-icon">${i.icon}</span>${i.label}</a>`
  ).join('')
  const signOut = `<a class="nav-item" href="#" onclick="logout();return false" style="margin-top:auto;color:var(--red)"><span class="nav-icon">🚪</span>Sign Out</a>`
  return links + signOut
}

/* Self-contained on purpose: js/main.js's highlightNav() IIFE runs
   synchronously the instant main.js parses, which is BEFORE this async
   sidebar fetch resolves — so it would never see these injected nav-items.
   Highlighting the sidebar has to happen right here, right after injection. */
function highlightSidebarNav() {
  const path = location.pathname.split('/').pop() || 'index.html'
  document.querySelectorAll('#sidebarNav .nav-item').forEach(item => {
    const hrefPath = (item.getAttribute('href') || '').split('?')[0].split('/').pop()
    if (hrefPath && hrefPath === path) item.classList.add('active')
  })
}

function renderSidebar(profile) {
  const el = document.getElementById('sidebarNav')
  if (!el) return
  el.innerHTML = buildSidebarNavHtml(profile.role)
  highlightSidebarNav()
}

/* ── Sidebar population ── */
async function populateSidebar() {
  const profile = await getProfile()
  if (!profile) return null
  const initials = (profile.full_name || profile.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const el = document.getElementById('sidebarAvatar')
  const nm = document.getElementById('sidebarName')
  const rl = document.getElementById('sidebarRole')
  const ft = document.getElementById('sidebarFoot')
  if (el) el.textContent = initials
  if (nm) nm.textContent = profile.full_name || profile.email
  if (rl) rl.textContent = profile.role === 'admin' ? 'Administrator' : profile.role === 'vendor' ? 'Verified Vendor' : 'Student'
  if (ft) ft.textContent = 'Student ID: ' + (profile.student_id || profile.id.slice(0, 8))
  renderSidebar(profile)
  return profile
}

/* ── Categories (live DB table, cached after first fetch this page load) ──
   Replaces the hardcoded category lists previously duplicated across
   marketplace.html/my-shop.html/js/supabase.js. */
let _categoriesCache = null
async function getCategories() {
  if (_categoriesCache) return _categoriesCache
  const { data, error } = await sb.from('categories').select('*').order('name')
  _categoriesCache = (!error && data) ? data : []
  return _categoriesCache
}

/* ── Rendering helpers ── */
function catEmoji(cat) {
  const slug = (cat || '').toLowerCase()
  if (_categoriesCache) {
    const found = _categoriesCache.find(c => c.slug === slug)
    if (found) return found.icon
  }
  // Fallback for the brief window before getCategories() resolves, or if it fails.
  const map = { textbooks: '📚', electronics: '💻', furniture: '🪑',
    accessories: '💼', clothing: '👕', 'lab-gear': '🔬', books: '📖', shoes: '👟', food: '🍎', default: '🏷️' }
  return map[slug] || map.default
}

function fmtPrice(n) {
  return 'KES ' + Number(n).toLocaleString('en-KE')
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60)   return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400)return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })
}

function statusBadge(status) {
  const map = {
    active:  '<span class="badge badge-green">Active</span>',
    sold:    '<span class="badge badge-red">Sold Out</span>',
    pending: '<span class="badge badge-yellow">Pending</span>',
    inactive:'<span class="badge badge-gray">Inactive</span>',
  }
  return map[status] || `<span class="badge badge-gray">${status}</span>`
}

function tagClass(tag) {
  const map = { policy:'tag-policy', event:'tag-event', alert:'tag-alert', tips:'tag-tips', success:'tag-success' }
  return map[(tag||'').toLowerCase()] || 'tag-policy'
}

/* ── Product card templates ── */
function productStackCard(p) {
  const badge = p.is_negotiable
    ? `<span class="product-badge badge-neg" style="background:rgba(255,255,255,.9);color:#111">NEGOTIABLE</span>` : ''
  const img = p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%;height:100%;object-fit:cover">` : `<span>${catEmoji(p.category)}</span>`
  return `
  <div class="product-card">
    <div class="product-card-img">
      ${img}
      ${badge}
    </div>
    <div class="product-card-body">
      <div class="product-card-cat">${p.category || 'General'}</div>
      <div class="product-card-name">${p.title}</div>
      <div class="product-card-desc">${p.description || ''}</div>
      <div class="product-card-foot">
        <span class="product-price">${fmtPrice(p.price)}</span>
        <a href="product.html?id=${p.id}" class="btn btn-outline btn-sm">View Details</a>
      </div>
    </div>
  </div>`
}

function productGridCard(p) {
  const isNew = (Date.now() - new Date(p.created_at)) < 3 * 86400 * 1000
  const badge = p.is_negotiable
    ? `<span class="product-badge badge-neg" style="top:10px;left:10px;position:absolute;background:rgba(255,255,255,.9);color:#111">Negotiable</span>`
    : isNew ? `<span class="product-badge badge-new" style="top:10px;left:10px;position:absolute">New Listing</span>` : ''
  const img = p.image_url ? `<img src="${p.image_url}" alt="${p.title}" style="width:100%;height:100%;object-fit:cover">` : catEmoji(p.category)
  return `
  <div class="pgrid-card">
    <div class="pgrid-img">
      ${img}
      ${badge}
    </div>
    <div class="pgrid-body">
      <div class="pgrid-name-row">
        <span class="pgrid-name">${p.title}</span>
        <button class="heart-btn">♡</button>
      </div>
      <div class="pgrid-desc">${p.description || ''}</div>
      <div class="pgrid-foot">
        <span class="product-price">${fmtPrice(p.price)}</span>
        <a href="product.html?id=${p.id}" class="btn btn-primary btn-sm">View Details</a>
      </div>
    </div>
  </div>`
}

function verticalCard(p) {
  return `
  <div class="v-product-card" data-cat="${p.category}">
    <div class="v-product-img">${catEmoji(p.category)}</div>
    <div class="v-product-body">
      <div class="v-product-name">${p.title}</div>
      <div class="v-product-cat">${p.category || 'General'}</div>
      <div class="v-product-row">
        <span class="v-product-price">${fmtPrice(p.price)}</span>
        <div class="seller-chip">
          <div class="avatar-xs">${(p.users?.full_name||'?')[0]}</div>
          <span>${p.users?.full_name?.split(' ')[0] || 'Seller'}</span>
        </div>
      </div>
      <button class="quick-view">Quick View</button>
    </div>
  </div>`
}

function eventListItem(e) {
  return `
  <div class="event-list-item">
    <div class="event-icon">🎪</div>
    <div class="event-info">
      <div class="event-title">${e.name}</div>
      <div class="event-meta">${e.location || ''} · ${e.start_time || ''}</div>
    </div>
    <span class="event-chip">${(e.status||'upcoming').toUpperCase()}</span>
  </div>`
}

function newsPill(a) {
  return `
  <div class="news-pill">
    <div class="news-dot"></div>
    <div>
      <div class="news-pill-title">${a.title}</div>
      <div class="news-pill-body">${(a.body||'').slice(0,100)}${a.body&&a.body.length>100?'…':''}</div>
    </div>
  </div>`
}

function newsCard(a) {
  const author = a.users?.full_name || 'Admin'
  const initials = author.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)
  return `
  <div class="news-card">
    <div class="news-ch">
      <span class="news-tag ${tagClass(a.tag)}">${(a.tag||'update').toUpperCase()}</span>
      <span class="news-date">${fmtDate(a.created_at)}</span>
    </div>
    <div class="news-title">${a.title}</div>
    <div class="news-body">${a.body || ''}</div>
    <div class="news-author">
      <div class="avatar avatar-sm">${initials}</div>
      <span>${author}</span>
    </div>
  </div>`
}

/* ── Loading state helpers ── */
function showLoading(el, msg = 'Loading…') {
  el.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div><p class="text-gray text-sm">${msg}</p></div>`
}

function showError(el, msg) {
  el.innerHTML = `<div class="alert alert-error">${msg}</div>`
}

function showEmpty(el, msg = 'Nothing here yet.') {
  el.innerHTML = `<div class="spinner-wrap"><p class="text-gray text-sm">${msg}</p></div>`
}
