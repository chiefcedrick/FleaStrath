/* ── Sidebar Toggle ── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

/* Public pages use a simple mobile nav drawer */
function toggleMobileMenu() {
  /* No full drawer on public pages — placeholder for future nav */
}

/* ── Close sidebar on desktop resize ── */
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    closeSidebar();
  }
});

/* ── Quick View modal placeholder ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('quick-view')) {
    const card  = e.target.closest('[data-cat]') || e.target.closest('.v-product-card');
    const name  = card?.querySelector('.v-product-name')?.textContent || 'Item';
    const price = card?.querySelector('.v-product-price')?.textContent || '';
    showToast(`👁️ Quick View: ${name} — ${price}`);
  }
});

/* ── Cart button feedback ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('cart-btn')) {
    showToast('🛒 Added to cart!');
  }
  if (e.target.closest('.product-card-foot .icon-btn')) {
    showToast('🛒 Added to cart!');
  }
});

/* ── Calendar day selection ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('cal-day') && !e.target.classList.contains('dim')) {
    document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('today'));
    e.target.classList.add('today');
  }
});

/* ── Role tab switching (generic) ── */
document.querySelectorAll('.role-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const group = tab.closest('.role-tabs');
    group.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

/* ── Pill filter (generic) ── */
document.querySelectorAll('.pill-row').forEach(row => {
  row.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      row.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });
});

/* ── Toast notification ── */
let toastTimer;
function showToast(msg) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--navy)', color: 'white',
      padding: '10px 20px', borderRadius: '20px',
      fontSize: '0.85rem', fontWeight: '600',
      zIndex: '9999', whiteSpace: 'nowrap',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)',
      opacity: '0', transition: 'opacity .2s ease',
      fontFamily: 'inherit',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

/* ── Active nav highlight ── */
(function highlightNav() {
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = (item.getAttribute('href') || '').split('/').pop();
    if (href === path) {
      item.classList.add('active');
    }
  });
  document.querySelectorAll('.bnav-item').forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    if (onclick.includes(path)) {
      item.classList.add('active');
    }
  });
})();

/* ── Pagination ── */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('pag-btn') && !e.target.textContent.includes('‹') && !e.target.textContent.includes('›')) {
    const container = e.target.closest('.pagination');
    if (container) {
      container.querySelectorAll('.pag-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    }
  }
});
