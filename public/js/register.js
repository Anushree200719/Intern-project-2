// TaskBoard Register Controller

document.addEventListener('DOMContentLoaded', () => {
  Auth.requireGuest();

  const form = document.getElementById('register-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const alertBox = document.getElementById('auth-alert');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertBox) alertBox.style.display = 'none';

      const nameInput = document.getElementById('name');
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const confirmPasswordInput = document.getElementById('confirmPassword');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

      if (!name || !email || !password || !confirmPassword) {
        if (alertBox) {
          alertBox.textContent = 'All fields are required.';
          alertBox.style.display = 'block';
        }
        return;
      }

      if (password.length < 6) {
        if (alertBox) {
          alertBox.textContent = 'Password must be at least 6 characters long.';
          alertBox.style.display = 'block';
        }
        return;
      }

      if (password !== confirmPassword) {
        if (alertBox) {
          alertBox.textContent = 'Passwords do not match.';
          alertBox.style.display = 'block';
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Creating account...';

      try {
        const data = await API.post('/api/auth/register', { name, email, password, confirmPassword });
        Auth.setAuth(data.token, data.user);
        showToast('Account created successfully!', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 400);
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'Registration failed.';
          alertBox.style.display = 'block';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Create Account';
      }
    });
  }
});
