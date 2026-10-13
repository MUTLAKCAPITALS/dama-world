/* Sign-in is the entry point. The game is loaded only after Firebase restores a real account. */
(function () {
  'use strict';
  const CONFIG = {apiKey:'AIzaSyAHsUMKUr1dDgUXFUCk1SNj0hpwuoKNw8A',authDomain:'dama-world.firebaseapp.com',projectId:'dama-world',storageBucket:'dama-world.firebasestorage.app',messagingSenderId:'751728629330',appId:'1:751728629330:web:3f0e015059b1e646a6b18b'};
  const SDK = 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/';
  const INTENT = 'dama.auth.intent', PENDING = 'acc.pendingRestore';
  const scripts = new Map();
  let auth, initPromise, hooks, userId, injected = false, launching = false, entering = false;
  let busy = false, fatal = false, formMode = 'login';
  const $ = id => document.getElementById(id);
  const real = user => !!user && !user.isAnonymous;
  const gate = window.DAMA_AUTH = {config:CONFIG, entered:false, uid:null, attach, syncResult};

  function storage(action, key, value) {
    try { return localStorage[action](key, value); }
    catch (_) { throw Object.assign(new Error('storage'), {code:'storage'}); }
  }
  function message(error) {
    const code = error && (error.code || error.message) || '';
    return ({
      'auth/invalid-email':'اكتب الإيميل بشكل صحيح.',
      'auth/invalid-credential':'الإيميل أو كلمة المرور غير صحيحة.',
      'auth/wrong-password':'الإيميل أو كلمة المرور غير صحيحة.',
      'auth/user-not-found':'الإيميل أو كلمة المرور غير صحيحة.',
      'auth/email-already-in-use':'هذا الإيميل مسجّل. اختر تسجيل الدخول.',
      'auth/weak-password':'كلمة المرور لازم تكون ٦ أحرف على الأقل.',
      'auth/popup-closed-by-user':'سكّرت نافذة Google. تقدر تحاول مرة ثانية.',
      'auth/popup-blocked':'المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة وحاول مرة ثانية.',
      'auth/account-exists-with-different-credential':'هذا الإيميل مربوط بطريقة دخول ثانية. استخدم طريقة تسجيلك السابقة.',
      'auth/too-many-requests':'محاولات كثيرة. انتظر شوي وحاول مرة ثانية.',
      'auth/unauthorized-domain':'تسجيل الدخول غير متاح من هذا الرابط.',
      'auth/operation-not-allowed':'طريقة الدخول هذي غير مفعّلة حاليًا.',
      'storage':'تعذّر الوصول للتخزين على جهازك. تأكد من توفر مساحة ومن السماح ببيانات الموقع، ثم أعد المحاولة.',
      'session':'انتهت جلسة الدخول. حدّث الصفحة وسجّل دخولك من جديد.',
      'game':'تعذّر تشغيل رسومات اللعبة في هذا المتصفح. حدّث الصفحة أو جرّب متصفحًا يدعم WebGL.'
    })[code] || 'ما قدرنا نكمل الاتصال. تأكد من الإنترنت وحاول مرة ثانية.';
  }
  function state(kind, text) {
    const shell = $('authGate');
    shell.hidden = false;
    shell.dataset.state = kind;
    $('authFormArea').hidden = kind !== 'login';
    $('authWait').hidden = kind === 'login';
    $('authStatus').textContent = text || '';
    $('authSpinner').hidden = kind === 'error';
    $('authRetry').hidden = kind !== 'error';
  }
  function formStatus(text, ok) {
    $('authFormStatus').textContent = text || '';
    $('authFormStatus').classList.toggle('ok', !!ok);
  }
  function setBusy(value) {
    busy = value;
    $('authFormArea').setAttribute('aria-busy', String(value));
    $('authFormArea').querySelectorAll('button,input').forEach(el => { el.disabled = value; });
    $('authPassword').disabled = value || formMode === 'reset';
  }
  function mode(value) {
    if (busy) return;
    formMode = value;
    const reset = value === 'reset', register = value === 'register';
    $('authTitle').textContent = reset ? 'نسيت كلمة المرور؟' : register ? 'حسابك الجديد' : 'حيّاك في عالم الدامة';
    $('authSubtitle').textContent = reset ? 'نرسل لك رابط الاستعادة على إيميلك.' : 'سجّل دخولك وكمل اللعب من وين وقفت.';
    $('authPasswordRow').hidden = reset;
    $('authGoogle').hidden = reset;
    $('authDivider').hidden = reset;
    $('authForgot').hidden = reset || register;
    $('authSubmit').textContent = reset ? 'إرسال رابط الاستعادة' : register ? 'إنشاء حساب' : 'تسجيل الدخول';
    $('authSwitch').textContent = register || reset ? 'عندي حساب — تسجيل الدخول' : 'ما عندك حساب؟ أنشئ حسابك';
    $('authPassword').autocomplete = register ? 'new-password' : 'current-password';
    $('authPassword').required = !reset;
    $('authPassword').disabled = reset;
    formStatus('');
  }
  function loadScript(src) {
    if (scripts.has(src)) return scripts.get(src);
    const p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('network')), 20000);
      function finish(error) {
        clearTimeout(timer); el.onload = el.onerror = null;
        if (error) { el.remove(); scripts.delete(src); reject(error); } else resolve();
      }
      el.src = src; el.async = false;
      el.onload = () => finish(); el.onerror = () => finish(new Error('network'));
      document.head.appendChild(el);
    });
    scripts.set(src, p);
    return p;
  }
  function restoredUser(service) {
    return new Promise((resolve, reject) => {
      let off = () => {}, done = false;
      const timer = setTimeout(() => finish(null, new Error('network')), 15000);
      function finish(user, error) {
        if (done) return;
        done = true; clearTimeout(timer); off();
        if (error) reject(error); else resolve(user);
      }
      off = service.onAuthStateChanged(user => finish(user), error => finish(null, error));
      if (done) off();
    });
  }
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!window.firebase) await loadScript(SDK + 'firebase-app-compat.js');
      if (!firebase.auth) await loadScript(SDK + 'firebase-auth-compat.js');
      if (!firebase.firestore) await loadScript(SDK + 'firebase-firestore-compat.js');
      if (!firebase.apps.length) firebase.initializeApp(CONFIG);
      auth = firebase.auth();
      await restoredUser(auth);
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      return auth;
    })().catch(error => { initPromise = null; throw error; });
    return initPromise;
  }
  async function begin() {
    state('loading', 'جارٍ التحقق من حسابك…');
    try {
      await init();
      if (real(auth.currentUser)) await launch(auth.currentUser);
      else { state('login'); mode('login'); }
    } catch (error) { state('error', message(error)); }
  }
  async function launch(user) {
    if (launching || injected) return;
    if (!real(user)) throw Object.assign(new Error('session'), {code:'session'});
    launching = true; gate.uid = userId = user.uid;
    state('loading', 'جارٍ استرجاع تقدمك…');
    try {
      /* Persist the intent before sign-in; pin it to the resulting UID before loading any game code. */
      const intent = storage('getItem', INTENT);
      if (intent) { try { sessionStorage.removeItem('accLoadedAt'); } catch (_) {} }
      if (intent === 'restore') storage('setItem', PENDING, user.uid);
      if (intent === 'new') storage('removeItem', PENDING);
      storage('removeItem', INTENT);
      for (const dep of document.querySelectorAll('script[data-game-src]')) await loadScript(dep.dataset.gameSrc);
      if (!real(auth.currentUser) || auth.currentUser.uid !== userId) throw Object.assign(new Error('session'), {code:'session'});
      const source = $('damaGameSource');
      if (!source) throw Object.assign(new Error('game'), {code:'game'});
      const script = document.createElement('script');
      script.textContent = source.textContent;
      injected = true;
      document.head.appendChild(script);
      if (!hooks) throw Object.assign(new Error('game'), {code:'game'});
    } finally { launching = false; }
  }
  async function signIn(google) {
    if (busy) return;
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (!google && (!$('authForm').reportValidity())) return;
    setBusy(true); formStatus(google ? 'جارٍ فتح Google…' : 'لحظة…');
    try {
      /* init() is complete before the buttons appear; popup opens directly from the click. */
      if (!auth) throw new Error('network');
      if (formMode === 'reset' && !google) {
        await auth.sendPasswordResetEmail(email);
        formStatus('إذا الإيميل مسجّل، يوصلك رابط الاستعادة. شيّك الوارد والبريد غير المرغوب.', true);
        return;
      }
      storage('setItem', INTENT, !google && formMode === 'register' ? 'new' : 'restore');
      if (google) {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          if (auth.currentUser && auth.currentUser.isAnonymous) await auth.currentUser.linkWithPopup(provider);
          else await auth.signInWithPopup(provider);
        } catch (error) {
          if (error.code === 'auth/credential-already-in-use' && error.credential) await auth.signInWithCredential(error.credential);
          else throw error;
        }
      } else if (formMode === 'register') {
        if (auth.currentUser && auth.currentUser.isAnonymous) await auth.currentUser.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, password));
        else await auth.createUserWithEmailAndPassword(email, password);
      } else await auth.signInWithEmailAndPassword(email, password);
      $('authPassword').value = '';
      await launch(auth.currentUser);
    } catch (error) {
      if (auth && real(auth.currentUser)) state('error', message(error));
      else {
        try { storage('removeItem', INTENT); } catch (_) {}
        formStatus(message(error));
      }
    } finally { setBusy(false); }
  }
  function attach(callbacks) {
    hooks = callbacks;
    Promise.resolve().then(() => hooks.retry()).catch(error => state('error', message(error)));
  }
  function syncResult(result) {
    if (gate.entered || entering) return;
    if (result === 'cloud') { state('loading', 'تم استرجاع تقدمك…'); return; }
    if (result === 'fail') { state('error', 'ما قدرنا نقرأ حفظك من السيرفر. تأكد من الاتصال، وبنحاول مرة ثانية.'); return; }
    if (result === 'adopt-fail') { state('error', 'ما قدرنا نسترجع حفظك على الجهاز. تأكد من مساحة التخزين ثم أعد المحاولة. حفظ السيرفر ما تغيّر.'); return; }
    if (result !== 'local' || !hooks || !real(auth.currentUser) || auth.currentUser.uid !== userId) {
      state('error', message({code:'session'})); return;
    }
    entering = true; state('loading', 'جارٍ تجهيز اللعبة…');
    Promise.resolve().then(() => hooks.enter()).then(() => {
      if (!real(auth.currentUser) || auth.currentUser.uid !== userId) throw Object.assign(new Error('session'), {code:'session'});
      gate.entered = true; $('authGate').hidden = true;
      document.body.classList.remove('auth-pending');
      if (hooks.afterEnter) hooks.afterEnter();
    }).catch(() => { entering = false; fatal = true; state('error', message({code:'game'})); });
  }
  async function retry() {
    if (busy || entering) return;
    if (injected && (!real(auth.currentUser) || auth.currentUser.uid !== userId)) { location.reload(); return; }
    if (fatal || injected && !hooks) { location.reload(); return; }
    if (hooks) {
      state('loading', 'جارٍ استرجاع تقدمك…');
      try { await hooks.retry(); } catch (error) { state('error', message(error)); }
    } else await begin();
  }
  $('authForm').addEventListener('submit', event => { event.preventDefault(); signIn(false); });
  $('authGoogle').addEventListener('click', () => signIn(true));
  $('authSwitch').addEventListener('click', () => mode(formMode === 'login' ? 'register' : 'login'));
  $('authForgot').addEventListener('click', () => mode('reset'));
  $('authRetry').addEventListener('click', retry);
  begin();
})();
