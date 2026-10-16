// TaskBoard Client Authentication & Session Management

const Auth = {
  getToken() {
    return localStorage.getItem('taskboard_token');
  },

  getUser() {
    const raw = localStorage.getItem('taskboard_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setAuth(token, user) {
    localStorage.setItem('taskboard_token', token);
    localStorage.setItem('taskboard_user', JSON.stringify(user));
  },

  clearAuth() {
    localStorage.removeItem('taskboard_token');
    localStorage.removeItem('taskboard_user');
  },

  logout() {
    this.clearAuth();
    window.location.href = 'login.html';
  },

  requireAuth() {
    const token = this.getToken();
    if (!token) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  },

  requireGuest() {
    const token = this.getToken();
    if (token) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  },

  getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  initTheme() {
    const savedTheme = localStorage.getItem('taskboard_theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
    themeToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        if (next === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('taskboard_theme', next);
      });
    });
  },

  initUserNavbar() {
    const user = this.getUser();
    if (!user) return;

    // Set initials in avatars
    const avatarEls = document.querySelectorAll('.user-avatar-initials');
    avatarEls.forEach(el => el.textContent = this.getInitials(user.name));

    // Set user names and emails
    const userNameEls = document.querySelectorAll('.user-display-name');
    userNameEls.forEach(el => el.textContent = user.name);

    const userEmailEls = document.querySelectorAll('.user-display-email');
    userEmailEls.forEach(el => el.textContent = user.email);

    // Dropdown toggle
    const avatarBtn = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (avatarBtn && dropdown) {
      avatarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }
  }
};

window.Auth = Auth;

// Run theme setup immediately to avoid FOUC
document.addEventListener('DOMContentLoaded', () => {
  Auth.initTheme();
});
