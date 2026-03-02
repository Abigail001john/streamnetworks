// ============================================================
// SHARED SIDEBAR + TOPBAR RENDERER
// Include this AFTER supabase-config.js on every dashboard page.
// Call: await initLayout('earn') — pass the active module key.
// ============================================================

const NAV_MODULES = [
  { key: 'dashboard', label: 'Dashboard',  icon: 'fa-house',          href: 'dashboard.html' },
  { key: 'wish-hub',  label: 'Wish Hub',   icon: 'fa-star',           href: 'wish-hub.html'  },
  { key: 'bazaar',    label: 'Bazaar',      icon: 'fa-bag-shopping',   href: 'bazaar.html'    },
  { key: 'earn',      label: 'Earn',        icon: 'fa-coins',          href: 'earn.html'      },
  { key: 'video',     label: 'Video',       icon: 'fa-clapperboard',   href: 'video.html'     },
  { key: 'audio',     label: 'Audio',       icon: 'fa-headphones',     href: 'audio.html'     },
  { key: 'files',     label: 'Files',       icon: 'fa-folder-open',    href: 'files.html'     },
];

const BOTTOM_MODULES = [
  { key: 'dashboard', label: 'Home',     icon: 'fa-house',      href: 'dashboard.html' },
  { key: 'wish-hub',  label: 'Wishes',   icon: 'fa-star',       href: 'wish-hub.html'  },
  { key: 'earn',      label: 'Earn',     icon: 'fa-coins',      href: 'earn.html'      },
  { key: 'audio',     label: 'Audio',    icon: 'fa-headphones', href: 'audio.html'     },
  { key: 'profile',   label: 'Profile',  icon: 'fa-user',       href: 'profile.html'   },
];

async function initLayout(activeKey = 'dashboard') {
  // Auth guard — approved users only
  const result = await requireAuth('approved');
  if (!result) return null;
  const { profile } = result;

  _injectLayoutStyles();
  _renderTopbar(profile, activeKey);
  _renderSidebar(profile, activeKey);
  _renderBottomNav(activeKey);
  _renderOverlay();

  return { profile };
}

// ── Topbar ────────────────────────────────────────────────
function _renderTopbar(profile, activeKey) {
  const initial = (profile.full_name || profile.username || 'U')[0].toUpperCase();
  const module  = NAV_MODULES.find(m => m.key === activeKey) || NAV_MODULES[0];

  const bar = document.createElement('header');
  bar.id = 'appTopbar';
  bar.innerHTML = `
    <button class="topbar-hamburger" id="sidebarToggle" aria-label="Menu">
      <i class="fas fa-bars"></i>
    </button>
    <div class="topbar-brand">
      <img src="logo.png" alt="Logo" class="topbar-logo"/>
      <span class="topbar-title">${module.label}</span>
    </div>
    <div class="topbar-actions">
      <button class="topbar-icon-btn" title="Notifications">
        <i class="fas fa-bell"></i>
        <span class="notif-dot"></span>
      </button>
      <div class="topbar-avatar" id="avatarBtn">${initial}</div>
      <div class="avatar-dropdown" id="avatarDropdown">
        <div class="avatar-dropdown-header">
          <div class="avatar-dropdown-avatar">${initial}</div>
          <div>
            <div class="avatar-dropdown-name">${profile.full_name || profile.username || 'User'}</div>
            <div class="avatar-dropdown-email">${profile.email || ''}</div>
          </div>
        </div>
        <div class="avatar-dropdown-divider"></div>
        <a href="profile.html" class="avatar-dropdown-item"><i class="fas fa-user"></i> My Profile</a>
        <a href="dashboard.html" class="avatar-dropdown-item"><i class="fas fa-house"></i> Dashboard</a>
        <div class="avatar-dropdown-divider"></div>
        <button class="avatar-dropdown-item danger" onclick="signOut()"><i class="fas fa-right-from-bracket"></i> Sign Out</button>
      </div>
    </div>`;
  document.body.prepend(bar);

  // Toggle avatar dropdown
  document.getElementById('avatarBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('avatarDropdown').classList.toggle('open');
  });
  document.addEventListener('click', () => {
    document.getElementById('avatarDropdown')?.classList.remove('open');
  });

  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('appSidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  });
}

// ── Sidebar ───────────────────────────────────────────────
function _renderSidebar(profile, activeKey) {
  const initial = (profile.full_name || profile.username || 'U')[0].toUpperCase();

  const nav = document.createElement('nav');
  nav.id = 'appSidebar';
  nav.innerHTML = `
    <div class="sidebar-header">
      <img src="logo.png" alt="Logo" class="sidebar-logo"/>
      <button class="sidebar-close" id="sidebarClose"><i class="fas fa-xmark"></i></button>
    </div>
    <div class="sidebar-profile">
      <div class="sidebar-avatar">${initial}</div>
      <div class="sidebar-profile-info">
        <div class="sidebar-profile-name">${profile.full_name || profile.username || 'User'}</div>
        <div class="sidebar-profile-status">
          <span class="status-dot"></span> Approved
        </div>
      </div>
    </div>
    <div class="sidebar-divider"></div>
    <ul class="sidebar-nav">
      ${NAV_MODULES.map(m => `
        <li>
          <a href="${m.href}" class="sidebar-nav-item ${m.key === activeKey ? 'active' : ''}">
            <span class="sidebar-nav-icon"><i class="fas ${m.icon}"></i></span>
            <span class="sidebar-nav-label">${m.label}</span>
            ${m.key === activeKey ? '<span class="sidebar-nav-active-bar"></span>' : ''}
          </a>
        </li>`).join('')}
    </ul>
    <div class="sidebar-divider"></div>
    <div class="sidebar-footer">
      <a href="profile.html" class="sidebar-nav-item ${activeKey === 'profile' ? 'active' : ''}">
        <span class="sidebar-nav-icon"><i class="fas fa-user"></i></span>
        <span class="sidebar-nav-label">Profile</span>
      </a>
      <button class="sidebar-nav-item sidebar-signout" onclick="signOut()">
        <span class="sidebar-nav-icon"><i class="fas fa-right-from-bracket"></i></span>
        <span class="sidebar-nav-label">Sign Out</span>
      </button>
    </div>`;
  document.body.prepend(nav);

  document.getElementById('sidebarClose').addEventListener('click', () => {
    document.getElementById('appSidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  });
}

// ── Bottom Nav (mobile) ───────────────────────────────────
function _renderBottomNav(activeKey) {
  const nav = document.createElement('nav');
  nav.id = 'appBottomNav';
  nav.innerHTML = BOTTOM_MODULES.map(m => `
    <a href="${m.href}" class="bottom-nav-item ${m.key === activeKey ? 'active' : ''}">
      <i class="fas ${m.icon}"></i>
      <span>${m.label}</span>
    </a>`).join('');
  document.body.appendChild(nav);
}

// ── Overlay (mobile sidebar backdrop) ────────────────────
function _renderOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'sidebarOverlay';
  overlay.addEventListener('click', () => {
    document.getElementById('appSidebar').classList.remove('open');
    overlay.classList.remove('open');
  });
  document.body.appendChild(overlay);
}

// ── Styles ────────────────────────────────────────────────
function _injectLayoutStyles() {
  if (document.getElementById('layoutStyles')) return;
  const style = document.createElement('style');
  style.id = 'layoutStyles';
  style.textContent = `
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --sidebar-w: 240px;
      --topbar-h: 60px;
      --accent: #2dd4bf;
      --accent2: #8b5cf6;
      --bg: #f7f3ed;
      --card: #ffffff;
      --text: #1a1a2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --shadow: 0 2px 12px rgba(0,0,0,0.07);
    }

    /* ── Topbar ── */
    #appTopbar {
      position: fixed; top: 0; left: 0; right: 0;
      height: var(--topbar-h);
      background: #fff;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center;
      padding: 0 16px; gap: 12px;
      z-index: 1000;
      box-shadow: 0 1px 8px rgba(0,0,0,0.06);
    }
    .topbar-hamburger {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: var(--text);
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 8px; transition: background .2s;
    }
    .topbar-hamburger:hover { background: #f3f4f6; }
    .topbar-brand { display: flex; align-items: center; gap: 10px; flex: 1; }
    .topbar-logo { height: 32px; object-fit: contain; }
    .topbar-title { font-size: 16px; font-weight: 700; color: var(--text); }
    .topbar-actions { display: flex; align-items: center; gap: 8px; position: relative; }
    .topbar-icon-btn {
      background: none; border: none; cursor: pointer;
      font-size: 17px; color: var(--muted);
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 8px; transition: background .2s; position: relative;
    }
    .topbar-icon-btn:hover { background: #f3f4f6; }
    .notif-dot {
      position: absolute; top: 6px; right: 6px;
      width: 8px; height: 8px;
      background: #ef4444; border-radius: 50%;
      border: 2px solid #fff;
    }
    .topbar-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff; font-size: 14px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; user-select: none;
      transition: transform .2s;
    }
    .topbar-avatar:hover { transform: scale(1.08); }

    /* Avatar dropdown */
    .avatar-dropdown {
      position: absolute; top: calc(100% + 10px); right: 0;
      background: #fff; border: 1px solid var(--border);
      border-radius: 14px; min-width: 220px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      display: none; flex-direction: column;
      padding: 8px; z-index: 2000;
    }
    .avatar-dropdown.open { display: flex; }
    .avatar-dropdown-header {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 8px 14px;
    }
    .avatar-dropdown-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff; font-size: 15px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .avatar-dropdown-name { font-size: 14px; font-weight: 600; color: var(--text); }
    .avatar-dropdown-email { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .avatar-dropdown-divider { height: 1px; background: var(--border); margin: 4px 0; }
    .avatar-dropdown-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 8px;
      font-size: 13px; font-weight: 500; color: var(--text);
      text-decoration: none; background: none; border: none;
      cursor: pointer; width: 100%; text-align: left;
      transition: background .15s;
    }
    .avatar-dropdown-item:hover { background: #f9fafb; }
    .avatar-dropdown-item.danger { color: #ef4444; }
    .avatar-dropdown-item i { width: 16px; color: var(--muted); }
    .avatar-dropdown-item.danger i { color: #ef4444; }

    /* ── Sidebar ── */
    #appSidebar {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: var(--sidebar-w);
      background: #fff;
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      z-index: 900; padding: 0;
      transform: translateX(-100%);
      transition: transform .28s cubic-bezier(.4,0,.2,1);
      box-shadow: 2px 0 16px rgba(0,0,0,0.06);
    }
    #appSidebar.open { transform: translateX(0); }

    @media (min-width: 900px) {
      #appSidebar { transform: translateX(0); }
      #appTopbar { left: var(--sidebar-w); }
      .page-content { margin-left: var(--sidebar-w); }
      .topbar-hamburger { display: none; }
    }

    .sidebar-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-logo { height: 36px; object-fit: contain; }
    .sidebar-close {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: var(--muted);
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 8px; transition: background .2s;
    }
    .sidebar-close:hover { background: #f3f4f6; }
    @media (min-width: 900px) { .sidebar-close { display: none; } }

    .sidebar-profile {
      display: flex; align-items: center; gap: 10px;
      padding: 16px;
    }
    .sidebar-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff; font-size: 16px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .sidebar-profile-name { font-size: 13px; font-weight: 700; color: var(--text); }
    .sidebar-profile-status {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: #10b981; margin-top: 2px; font-weight: 500;
    }
    .status-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #10b981; display: inline-block;
    }
    .sidebar-divider { height: 1px; background: var(--border); margin: 4px 0; }

    .sidebar-nav { list-style: none; padding: 8px; margin: 0; flex: 1; overflow-y: auto; }
    .sidebar-nav li { margin-bottom: 2px; }
    .sidebar-nav-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 12px; border-radius: 10px;
      font-size: 13.5px; font-weight: 500; color: var(--muted);
      text-decoration: none; background: none; border: none;
      cursor: pointer; width: 100%; text-align: left;
      transition: background .15s, color .15s;
      position: relative;
    }
    .sidebar-nav-item:hover { background: #f9fafb; color: var(--text); }
    .sidebar-nav-item.active {
      background: linear-gradient(135deg, rgba(45,212,191,0.12), rgba(139,92,246,0.08));
      color: var(--accent);
      font-weight: 700;
    }
    .sidebar-nav-icon {
      width: 32px; height: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; background: #f3f4f6; flex-shrink: 0;
      transition: background .15s;
    }
    .sidebar-nav-item.active .sidebar-nav-icon {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff;
    }
    .sidebar-nav-active-bar {
      position: absolute; right: 0; top: 50%;
      transform: translateY(-50%);
      width: 3px; height: 20px;
      background: var(--accent); border-radius: 2px;
    }

    .sidebar-footer { padding: 8px; border-top: 1px solid var(--border); }
    .sidebar-signout { color: #ef4444 !important; }
    .sidebar-signout .sidebar-nav-icon { background: #fef2f2; color: #ef4444; }
    .sidebar-signout:hover { background: #fef2f2 !important; }

    /* ── Overlay ── */
    #sidebarOverlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.4); z-index: 850;
    }
    #sidebarOverlay.open { display: block; }
    @media (min-width: 900px) { #sidebarOverlay { display: none !important; } }

    /* ── Bottom Nav ── */
    #appBottomNav {
      position: fixed; bottom: 0; left: 0; right: 0;
      height: 64px; background: #fff;
      border-top: 1px solid var(--border);
      display: flex; align-items: center;
      z-index: 800;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
    }
    @media (min-width: 900px) { #appBottomNav { display: none; } }
    .bottom-nav-item {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 3px;
      text-decoration: none; color: var(--muted);
      font-size: 10px; font-weight: 500;
      transition: color .15s; padding: 4px 0;
    }
    .bottom-nav-item i { font-size: 18px; }
    .bottom-nav-item.active { color: var(--accent); }
    .bottom-nav-item.active i { 
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }

    /* ── Page content wrapper ── */
    .page-content {
      padding-top: calc(var(--topbar-h) + 20px);
      padding-bottom: 80px;
      padding-left: 20px;
      padding-right: 20px;
      min-height: 100vh;
      background: var(--bg);
    }
    @media (min-width: 900px) {
      .page-content { padding-bottom: 32px; }
    }
  `;
  document.head.appendChild(style);
}
