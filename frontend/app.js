// frontend/app.js — keystroke capture + API calls

// Toggle handled in index.html inline script

// --- Keystroke timing capture factory
function createTimingCapture(inputEl) {
  let lastTime = null;
  let downTimes = {};
  const latencies = [];
  const dwell = [];

  function onKeyDown(e) {
    const now = performance.now();
    if (lastTime !== null) latencies.push(now - lastTime);
    downTimes[e.code] = now;
  }
  function onKeyUp(e) {
    const now = performance.now();
    if (downTimes[e.code] != null) {
      dwell.push(now - downTimes[e.code]);
      lastTime = now;
      delete downTimes[e.code];
    }
  }
  inputEl.addEventListener('keydown', onKeyDown);
  inputEl.addEventListener('keyup', onKeyUp);
  return () => ({ latencies: [...latencies], dwell: [...dwell] });
}

// --- Login flow
const loginForm = document.getElementById('login-form');
const loginUser = document.getElementById('login-username');
const loginPass = document.getElementById('login-password');
const loginResult = document.getElementById('login-result');
const captureLogin = createTimingCapture(loginPass);

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginResult.textContent = 'Checking...';
  loginResult.className = 'result';

  const attempt = captureLogin();
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUser.value.trim(),
        password: loginPass.value,
        attempt
      })
    });
    const data = await res.json();
    if (data.ok) {
      // คำนวณเปอร์เซ็นต์ความเหมือน (ยิ่ง score ต่ำ = ยิ่ง match มาก)
      const score = data.score || 0;
      const threshold = data.threshold || 1.75;
      const matchPercent = Math.max(0, Math.min(100, ((threshold - score) / threshold) * 100)).toFixed(1);
    
      // เปลี่ยนหน้าไป success.html พร้อมส่งเปอร์เซ็นต์
      window.location.href = `/success.html?match=${matchPercent}`;
    } else {
      loginResult.textContent = `❌ ${data.error || data.message || 'Login failed'}`;
      loginResult.classList.add('bad');
    }
  } catch (err) {
    loginResult.textContent = 'Network error.';
    loginResult.classList.add('bad');
  }
});

// --- Register flow
const regForm = document.getElementById('register-form');
const regUser = document.getElementById('reg-username');
const regP1 = document.getElementById('reg-password-1');
const regP2 = document.getElementById('reg-password-2');
const regP3 = document.getElementById('reg-password-3');
const regResult = document.getElementById('reg-result');

const cap1 = createTimingCapture(regP1);
const cap2 = createTimingCapture(regP2);
const cap3 = createTimingCapture(regP3);

regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  regResult.textContent = 'Creating account...';
  regResult.className = 'result';

  if (regP1.value !== regP2.value || regP1.value !== regP3.value) {
    regResult.textContent = 'All three passwords must match exactly.';
    regResult.classList.add('bad');
    return;
  }

  const samples = {
    latencies: [cap1().latencies, cap2().latencies, cap3().latencies],
    dwell: [cap1().dwell, cap2().dwell, cap3().dwell]
  };

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUser.value.trim(),
        password: regP1.value,
        samples
      })
    });
    const data = await res.json();
    if (data.ok) {
      regResult.textContent = '✅ ' + data.message;
      regResult.classList.add('ok');
    } else {
      regResult.textContent = '❌ ' + (data.error || 'Failed to register');
      regResult.classList.add('bad');
    }
  } catch (err) {
    regResult.textContent = 'Network error.';
    regResult.classList.add('bad');
  }
});
