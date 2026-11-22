(() => {
  'use strict';

  const SUPABASE_URL = 'https://pmrrslmkrulhuapxtltm.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_yqDwOCq3n3rZ7E0WOMLUtg_84VOefBt';
  const USERNAME_DOMAIN = 'accounts.saymosaldo.app';
  const SESSION_KEY = 'saymosaldo_auth_session';
  const $ = id => document.getElementById(id);

  let session = null;
  let username = '';
  let syncTimer = null;
  let refreshTimer = null;
  let syncBusy = false;
  let syncPromise = null;
  let refreshPromise = null;
  let syncAgain = false;
  let loggingOut = false;
  let retryDelay = 2000;
  let recoveryUsername = '';

  function normalizeUsername(value) {
    if (typeof value !== 'string') return null;
    const result = value.trim().toLowerCase();
    return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(result) ? result : null;
  }

  function usernameEmail(value) {
    const normalized = normalizeUsername(value);
    return normalized ? normalized + '@' + USERNAME_DOMAIN : null;
  }

  // Keep accounts created by the earlier email-based login reachable.
  // New registrations still create username-only accounts.
  function loginEmail(value) {
    if (typeof value !== 'string') return null;
    const identifier = value.trim();
    if (identifier.includes('@')) {
      const email = identifier.toLowerCase();
      return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    }
    return usernameEmail(identifier);
  }

  function validPassword(value) {
    return typeof value === 'string' && value.length >= 12 && value.length <= 72;
  }

  const GOOGLE_PKCE_KEY = 'saymosaldo_google_pkce_verifier';

  function randomVerifier() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  async function createCodeChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    let binary = '';
    for (const value of new Uint8Array(digest)) binary += String.fromCharCode(value);
    return btoa(binary).split('+').join('-').split('/').join('_').replace(/=+$/, '');
  }

  function googleAuthorizeUrl(challenge, redirectTo) {
    const url = new URL(SUPABASE_URL + '/auth/v1/authorize');
    url.searchParams.set('provider', 'google');
    url.searchParams.set('redirect_to', redirectTo);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 's256');
    url.searchParams.set('scopes', 'openid email profile');
    return url.toString();
  }

  async function startGoogleLogin() {
    const button = $('googleSignInButton');
    if (button) { button.disabled = true; button.textContent = 'Переходим к Google…'; }
    try {
      const verifier = randomVerifier();
      const challenge = await createCodeChallenge(verifier);
      sessionStorage.setItem(GOOGLE_PKCE_KEY, verifier);
      const redirectTo = window.location.origin + window.location.pathname;
      window.location.assign(googleAuthorizeUrl(challenge, redirectTo));
    } catch (error) {
      if (button) { button.disabled = false; button.textContent = 'Продолжить с Google'; }
      setNotice('Не удалось начать безопасный вход. Проверьте соединение и попробуйте снова.', 'error');
    }
  }

  function cleanOAuthUrl() {
    const url = new URL(window.location.href);
    ['code', 'error', 'error_description', 'error_code', 'state'].forEach(key => url.searchParams.delete(key));
    window.history.replaceState(window.history.state, '', url.toString());
  }

  async function consumeGoogleCallback() {
    const url = new URL(window.location.href);
    const providerError = url.searchParams.get('error');
    if (providerError) {
      try { sessionStorage.removeItem(GOOGLE_PKCE_KEY); } catch (error) {}
      cleanOAuthUrl();
      setNotice(/access_denied/i.test(providerError)
        ? 'Вход через Google отменён. Вы можете попробовать ещё раз.'
        : 'Google не смог завершить вход. Попробуйте ещё раз позже.', 'error');
      return false;
    }

    const code = url.searchParams.get('code');
    if (!code) return false;
    const verifier = sessionStorage.getItem(GOOGLE_PKCE_KEY);
    if (!verifier) {
      cleanOAuthUrl();
      setNotice('Не найден ключ безопасного входа. Нажмите «Продолжить с Google» ещё раз.', 'error');
      return false;
    }

    const value = await apiRequest('/auth/v1/token?grant_type=pkce', {
      method: 'POST',
      body: { auth_code: code, code_verifier: verifier }
    });
    sessionStorage.removeItem(GOOGLE_PKCE_KEY);
    storeSession(value);
    cleanOAuthUrl();
    return true;
  }

  function normalizeCloudData(input) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      tx: Array.isArray(value.tx) ? value.tx : [],
      goals: Array.isArray(value.goals) ? value.goals : [],
      budgets: Array.isArray(value.budgets) ? value.budgets : [],
      recurring: Array.isArray(value.recurring) ? value.recurring : [],
      debts: Array.isArray(value.debts) ? value.debts : [],
      chat_finance: Array.isArray(value.chat_finance) ? value.chat_finance :
        Array.isArray(value.chatFinance) ? value.chatFinance : []
    };
  }

  function hasData(value) {
    const data = normalizeCloudData(value);
    return ['tx', 'goals', 'budgets', 'recurring', 'debts', 'chat_finance'].some(key => data[key].length > 0);
  }

  function apiErrorMessage(payload, status) {
    const value = String(payload && (payload.error || payload.code || payload.msg || payload.message || payload.error_description) || '');
    if (/username_taken/i.test(value)) return 'Этот логин уже занят. Придумайте другой.';
    if (/username_invalid/i.test(value)) return 'Логин: 3–24 символа, латинские буквы, цифры, точка, дефис или подчёркивание.';
    if (/password_invalid/i.test(value)) return 'Пароль должен содержать от 12 до 72 символов.';
    if (/recovery_invalid/i.test(value)) return 'Логин или код восстановления не подошли. Проверьте их и попробуйте ещё раз.';
    if (/rate_limited/i.test(value) || status === 429) return 'Слишком много попыток. Подождите 10 минут и попробуйте снова.';
    if (/temporarily_unavailable/i.test(value)) return 'Сервис временно недоступен. Попробуйте ещё раз чуть позже.';
    if (/origin_not_allowed/i.test(value)) return 'Запрос отклонён настройками безопасности. Откройте официальный сайт SaymoSaldo.';
    if (/invalid login credentials|invalid_grant|invalid_credentials/i.test(value)) return 'Неверный логин или пароль.';
    if (/email not confirmed/i.test(value)) return 'Аккаунт не активирован. Обратитесь в поддержку.';
    return status === 0 ? 'Нет соединения. Проверьте интернет и повторите попытку.' :
      'Не удалось выполнить действие. Попробуйте ещё раз позже.';
  }

  async function apiRequest(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let response;
    let raw;
    try {
      const headers = {
        apikey: PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (options.token) headers.Authorization = 'Bearer ' + options.token;
      response = await fetch(SUPABASE_URL + path, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit'
      });
      // Keep the same deadline active while the response body is being read.
      raw = await response.text();
    } catch (error) {
      const failure = new Error(error && error.name === 'AbortError'
        ? 'Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз.'
        : 'Нет соединения с сервером. Проверьте интернет.');
      failure.status = 0;
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch (error) { throw new Error('Сервер вернул некорректный ответ. Попробуйте позже.'); }
    if (!response.ok) {
      const failure = new Error(apiErrorMessage(payload, response.status));
      failure.status = response.status;
      failure.code = payload.error || payload.code || '';
      throw failure;
    }
    return payload;
  }

  async function callUsernameFunction(body) {
    return apiRequest('/functions/v1/username-auth', { method: 'POST', body });
  }

  function readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value && value.access_token && value.refresh_token ? value : null;
    } catch (error) {
      return null;
    }
  }

  function storeSession(value) {
    if (!value || !value.access_token || !value.refresh_token || !value.user || !value.user.id) {
      throw new Error('Сервер не вернул полноценную сессию. Попробуйте войти ещё раз.');
    }
    session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      token_type: value.token_type || 'bearer',
      expires_in: Number(value.expires_in) || 3600,
      expires_at: Number(value.expires_at) || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600),
      user: value.user
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      session = null;
      throw new Error('Браузер не смог сохранить вход. Освободите место в хранилище и попробуйте снова.');
    }
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (error) {}
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    if (!session || !session.refresh_token) throw new Error('Сессия завершилась. Войдите снова.');
    const sessionAtStart = session;
    const refreshToken = session.refresh_token;
    refreshPromise = (async () => {
      const value = await apiRequest('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: refreshToken }
      });
      // A concurrent sign-in or logout must never be overwritten by an older refresh response.
      if (session !== sessionAtStart || !session || session.refresh_token !== refreshToken) return session;
      storeSession(value);
      scheduleRefresh();
      return session;
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function ensureFreshSession() {
    if (!session) throw new Error('Войдите в аккаунт.');
    if (session.expires_at <= Math.floor(Date.now() / 1000) + 90) await refreshSession();
    return session;
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!session) return;
    const delay = Math.max(5000, (session.expires_at - Math.floor(Date.now() / 1000) - 60) * 1000);
    refreshTimer = setTimeout(async () => {
      try {
        await refreshSession();
      } catch (error) {
        if (error.status === 0) {
          if (window.SaymoSaldoApp) window.SaymoSaldoApp.setSyncStatus('Нет сети — сохранённые данные останутся на устройстве');
          refreshTimer = setTimeout(() => scheduleRefresh(), 30000);
        } else {
          await expireSession();
        }
      }
    }, delay);
  }

  async function expireSession() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    syncAgain = false;
    clearSession();
    $('recoveryCode').textContent = '';
    if (window.SaymoSaldoApp) window.SaymoSaldoApp.reset();
    showAuth();
    setNotice('Сеанс завершился. Войдите снова — ваши сохранённые записи останутся в аккаунте.', 'error');
  }

  function setNotice(message, kind = '') {
    const el = $('authNotice');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'auth-notice' + (message ? ' on' : '') + (kind ? ' ' + kind : '');
  }

  function showView(view) {
    for (const name of ['login', 'register', 'reset']) {
      const form = $('auth' + name[0].toUpperCase() + name.slice(1) + 'Form');
      if (form) form.hidden = name !== view;
    }
    $('recoveryPanel').hidden = true;
    $('recoveryCode').textContent = '';
    $('authTitle').textContent = view === 'login' ? 'Войти в SaymoSaldo' :
      view === 'register' ? 'Создать аккаунт' : 'Восстановить пароль';
    setNotice('');
  }

  function showAuth() {
    $('authRoot').hidden = false;
    $('appShell').hidden = true;
    showView('login');
  }

  function setBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? 'Подождите…' : button.dataset.idleText;
    }
  }

  function rememberButtonLabels() {
    document.querySelectorAll('.auth-form button[type="submit"]').forEach(button => {
      button.dataset.idleText = button.textContent;
    });
  }

  function setRecoveryCode(code, message, user) {
    recoveryUsername = user || '';
    $('authLoginForm').hidden = true;
    $('authRegisterForm').hidden = true;
    $('authResetForm').hidden = true;
    $('recoveryPanel').hidden = false;
    $('authTitle').textContent = 'Сохраните код восстановления';
    $('recoveryMessage').textContent = message;
    $('recoveryCode').textContent = code;
    setNotice('Это единственный показ кода. Скопируйте его и сохраните в надёжном месте.', 'success');
  }

  async function copyRecoveryCode() {
    const code = $('recoveryCode').textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice('Код скопирован. Сохраните его отдельно от телефона.', 'success');
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = code;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        const ok = document.execCommand('copy');
        setNotice(ok ? 'Код скопирован. Сохраните его отдельно от телефона.' : 'Выделите код и скопируйте его вручную.', ok ? 'success' : 'error');
      } catch (copyError) {
        setNotice('Выделите код и скопируйте его вручную.', 'error');
      }
      area.remove();
    }
  }

  function localEmptyData() {
    return { tx: [], goals: [], budgets: [], recurring: [], debts: [], chat_finance: [] };
  }

  async function loadRemoteData(userId) {
    const token = (await ensureFreshSession()).access_token;
    const rows = await apiRequest('/rest/v1/user_data?select=data,updated_at&user_id=eq.' +
      encodeURIComponent(userId) + '&limit=1', { token });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  function scheduleCloudSave() {
    if (!session || !window.SaymoSaldoApp || loggingOut) return;
    window.SaymoSaldoApp.setSyncStatus('Синхронизируем с аккаунтом…');
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; syncCloudData(); }, 700);
  }

  async function syncCloudData() {
    if (!session || !window.SaymoSaldoApp) return;
    if (syncBusy) { syncAgain = true; return syncPromise; }
    syncBusy = true;
    syncPromise = (async () => {
      try {
        await ensureFreshSession();
        const userId = session.user.id;
        const localVersion = window.SaymoSaldoApp.getLocalModifiedAt();
        const data = normalizeCloudData(window.SaymoSaldoApp.getData());
        const payload = {
          user_id: userId,
          data: {
            tx: data.tx,
            goals: data.goals,
            budgets: data.budgets,
            recurring: data.recurring,
            debts: data.debts,
            chat_finance: data.chat_finance
          },
          updated_at: new Date().toISOString()
        };
        await apiRequest('/rest/v1/user_data?on_conflict=user_id', {
          method: 'POST',
          token: session.access_token,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: payload
        });
        retryDelay = 2000;
        if (window.SaymoSaldoApp.getLocalModifiedAt() === localVersion) {
          window.SaymoSaldoApp.markSynced();
        } else {
          syncAgain = true;
        }
        window.SaymoSaldoApp.setSyncStatus('Синхронизировано');
      } catch (error) {
        window.SaymoSaldoApp.setSyncStatus('Нет синхронизации — записи пока сохранены на этом устройстве');
        if (!loggingOut) {
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => { syncTimer = null; syncCloudData(); }, retryDelay);
          retryDelay = Math.min(60000, retryDelay * 2);
        }
      }
    })();
    try {
      await syncPromise;
    } finally {
      syncBusy = false;
      syncPromise = null;
      if (syncAgain && !loggingOut) { syncAgain = false; scheduleCloudSave(); }
    }
  }

  function showAppStatus(offline) {
    if (window.SaymoSaldoApp) {
      window.SaymoSaldoApp.setSyncStatus(offline
        ? 'Нет связи с облаком — работаем с сохранённой копией на этом устройстве'
        : 'Аккаунт подключён · синхронизация включена');
    }
  }

  async function openApp(user) {
    const app = window.SaymoSaldoApp;
    if (!app) throw new Error('Приложение не загрузилось. Обновите страницу.');
    const userId = user.id;
    username = String(user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name) ||
      String(user.email || '').split('@')[0] || 'Пользователь').trim().slice(0, 80) || 'Пользователь';

    let remote = null;
    let remoteFailed = false;
    try { remote = await loadRemoteData(userId); }
    catch (error) { remoteFailed = true; }

    const local = app.getLocalUserData(userId);
    let chosen = localEmptyData();
    let updatedAt = new Date().toISOString();
    let needsSync = false;

    if (remote && remote.data) {
      const localTime = local ? Date.parse(local.updated_at || 0) : 0;
      const remoteTime = Date.parse(remote.updated_at || 0);
      if (local && (local.pending_sync || localTime > remoteTime)) {
        chosen = normalizeCloudData(local.data);
        updatedAt = local.updated_at;
        needsSync = true;
      } else {
        chosen = normalizeCloudData(remote.data);
        updatedAt = remote.updated_at;
      }
    } else if (local) {
      chosen = normalizeCloudData(local.data);
      updatedAt = local.updated_at;
      needsSync = true;
    } else if (!remoteFailed) {
      // Fresh accounts always start empty. Legacy guest/device data is never imported.
      chosen = localEmptyData();
      needsSync = false;
    } else {
      throw new Error('Не удалось загрузить данные аккаунта. Проверьте интернет и попробуйте снова.');
    }

    if (!app.activate(userId, chosen, updatedAt, needsSync)) {
      throw new Error('Не удалось сохранить данные аккаунта на устройстве. Проверьте свободное место в браузере.');
    }
    app.setCloudSaveHandler(scheduleCloudSave);
    $('authRoot').hidden = true;
    $('appShell').hidden = false;
    showAppStatus(remoteFailed);
    scheduleRefresh();
    if (needsSync) scheduleCloudSave();
  }

  async function login(usernameValue, password) {
    const email = loginEmail(usernameValue);
    if (!email) throw new Error('Введите логин (3–24 символа) или корректный адрес старого аккаунта.');
    if (typeof password !== 'string' || password.length < 1 || password.length > 72) throw new Error('Введите пароль длиной не более 72 символов.');
    const value = await apiRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
    storeSession(value);
    await openApp(session.user);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true);
    setNotice('');
    try {
      await login(data.get('username'), data.get('password'));
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось войти. Проверьте логин и пароль.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const normalized = normalizeUsername(data.get('username'));
    const password = data.get('password');
    if (!normalized) return setNotice('Логин: 3–24 символа, латинские буквы, цифры, точка, дефис или подчёркивание.', 'error');
    if (!validPassword(password)) return setNotice('Пароль должен содержать от 12 до 72 символов.', 'error');
    if (password !== data.get('passwordConfirm')) return setNotice('Пароли не совпадают.', 'error');
    setBusy(form, true);
    setNotice('');
    try {
      const result = await callUsernameFunction({ action: 'register', username: normalized, password });
      if (!result.ok || !result.recovery_code) throw new Error('Аккаунт не создан полностью. Попробуйте ещё раз.');
      setRecoveryCode(result.recovery_code,
        'Этот код понадобится, если вы забудете пароль. Он не отправляется по почте и больше не будет показан.',
        normalized);
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось создать аккаунт.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const normalized = normalizeUsername(data.get('username'));
    const password = data.get('password');
    const recoveryCode = String(data.get('recoveryCode') || '').trim().toLowerCase();
    if (!normalized) return setNotice('Проверьте логин.', 'error');
    if (!/^[0-9a-f]{48}$/.test(recoveryCode)) return setNotice('Код восстановления должен содержать 48 символов.', 'error');
    if (!validPassword(password)) return setNotice('Новый пароль должен содержать от 12 до 72 символов.', 'error');
    if (password !== data.get('passwordConfirm')) return setNotice('Пароли не совпадают.', 'error');
    setBusy(form, true);
    setNotice('');
    try {
      const result = await callUsernameFunction({
        action: 'reset_password', username: normalized, password, recovery_code: recoveryCode
      });
      if (!result.ok || !result.recovery_code) throw new Error('Пароль не обновлён. Попробуйте ещё раз.');
      setRecoveryCode(result.recovery_code,
        'Пароль изменён. Код восстановления остаётся действующим — сохраните его надёжно.',
        normalized);
      form.reset();
    } catch (error) {
      setNotice(error.message || 'Не удалось восстановить пароль.', 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function finishRecovery() {
    const savedUsername = recoveryUsername;
    $('recoveryPanel').hidden = true;
    $('recoveryCode').textContent = '';
    showView('login');
    const loginForm = $('authLoginForm');
    loginForm.elements.username.value = savedUsername;
    loginForm.elements.password.value = '';
    setNotice('Код сохранён. Теперь войдите с логином и паролем.', 'success');
  }

  async function logout() {
    loggingOut = true;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    try {
      if (syncBusy && syncPromise) await syncPromise;
      if (syncAgain) syncAgain = false;
      await syncCloudData();
    } catch (error) {}
    if (session) {
      try { await apiRequest('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch (error) {}
    }
    clearSession();
    if (window.SaymoSaldoApp) window.SaymoSaldoApp.reset();
    loggingOut = false;
    showAuth();
    setNotice('Вы вышли из аккаунта.', 'success');
  }

  function isInvalidSessionError(error) {
    if (!error) return false;
    if (error.status === 401) return true;
    return error.status === 400 && /invalid_grant|refresh.token.not.found|invalid.refresh.token/i
      .test(String(error.code || '') + ' ' + String(error.message || ''));
  }

  async function bootstrap() {
    rememberButtonLabels();
    showAuth();
    try {
      await consumeGoogleCallback();
    } catch (error) {
      try { sessionStorage.removeItem(GOOGLE_PKCE_KEY); } catch (ignore) {}
      cleanOAuthUrl();
      setNotice(error.message || 'Не удалось завершить вход через Google. Попробуйте ещё раз.', 'error');
      return;
    }
    session = readSession();
    if (!session) return;

    // Validate/refresh authentication separately from loading financial data.
    // A temporary REST/database error must not destroy a valid login session.
    try {
      if (session.expires_at <= Math.floor(Date.now() / 1000) + 90) {
        await refreshSession();
      } else {
        const user = await apiRequest('/auth/v1/user', { token: session.access_token });
        session.user = user;
        storeSession(session);
      }
    } catch (error) {
      if (error.status === 0 || (error.status >= 500 && error.status < 600) || error.status === 429) {
        setNotice('Не удалось проверить сессию из-за временной ошибки связи. Повторите загрузку страницы — вход сохранён.', 'error');
        return;
      }
      try {
        await refreshSession();
      } catch (refreshError) {
        if (!isInvalidSessionError(refreshError)) {
          setNotice('Сервер временно не отвечает. Вход сохранён — попробуйте обновить страницу позже.', 'error');
          return;
        }
        clearSession();
        setNotice('Сеанс завершился. Войдите снова.', 'error');
        return;
      }
    }

    try {
      await openApp(session.user);
    } catch (error) {
      showAuth();
      setNotice(error.message || 'Не удалось загрузить данные аккаунта. Вход сохранён — попробуйте ещё раз.', 'error');
    }
  }

  function bindUi() {
    $('authLoginForm').addEventListener('submit', handleLogin);
    $('authRegisterForm').addEventListener('submit', handleRegister);
    $('authResetForm').addEventListener('submit', handleReset);
    document.addEventListener('click', event => {
      const view = event.target.closest('[data-auth-view]');
      if (view) { showView(view.dataset.authView); return; }
      const action = event.target.closest('[data-auth-action]');
      if (action && action.dataset.authAction === 'logout') logout();
      if (action && action.dataset.authAction === 'google') startGoogleLogin();
    });
    $('copyRecovery').addEventListener('click', copyRecoveryCode);
    $('recoveryContinue').addEventListener('click', finishRecovery);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && session) {
        ensureFreshSession().then(scheduleCloudSave).catch(error => {
          if (error.status === 0) showAppStatus(true);
          else expireSession();
        });
      }
    });
    window.addEventListener('online', scheduleCloudSave);
  }

  const publicApi = {
    normalizeUsername,
    usernameEmail,
    googleAuthorizeUrl,
    loginEmail,
    validPassword,
    normalizeCloudData,
    hasData,
    apiRequest,
    get username() { return username; }
  };
  window.SaymoSaldoAuth = publicApi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindUi(); bootstrap(); }, { once: true });
  } else {
    bindUi();
    bootstrap();
  }
})();