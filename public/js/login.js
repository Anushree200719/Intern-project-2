// TaskBoard Login Controller

document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  Auth.requireGuest();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('expired')) {
    const alertBox = document.getElementById('auth-alert');
    if (alertBox) {
      alertBox.textContent = 'Your session has expired. Please log in again.';
      alertBox.style.display = 'block';
    }
  }

  // Bind demo user buttons via safe event listeners
  const demoButtons = document.querySelectorAll('.demo-user-btn');
  demoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-demo-email');
      const pass = btn.getAttribute('data-demo-password');
      if (email && pass) {
        document.getElementById('email').value = email;
        document.getElementById('password').value = pass;
      }
    });
  });

  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const alertBox = document.getElementById('auth-alert');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertBox) alertBox.style.display = 'none';

      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!email || !password) {
        if (alertBox) {
          alertBox.textContent = 'Please provide both email and password.';
          alertBox.style.display = 'block';
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Signing in...';

      try {
        const data = await API.post('/api/auth/login', { email, password });
        Auth.setAuth(data.token, data.user);
        showToast('Login successful! Welcome back.', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 400);
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Login failed. Please check your credentials.';
          alertBox.style.display = 'block';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Sign In';
      }
    });
  }
});
