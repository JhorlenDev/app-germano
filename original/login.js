const form = document.querySelector('form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button'), error = document.getElementById('error');
  button.disabled = true; error.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gm-app' },
      body: JSON.stringify({ email: form.email.value, password: form.password.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    location.assign('/');
  } catch (e) { error.textContent = e.message; }
  finally { button.disabled = false; }
});
