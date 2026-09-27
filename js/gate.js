// Pide iniciar sesión antes de ver el sitio.
// Corre en el <head> (antes de dibujar la página): si no hay una sesión guardada,
// manda directo a login.html y después te devuelve a la página donde estabas.
// La comprobación completa (sesión válida y perfil) la hace js/core/layout.js.
(function () {
  document.documentElement.dataset.gate = '1';
  try {
    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return;
    }
  } catch (e) { return; } // sin almacenamiento: que decida layout.js
  var page = location.pathname.split('/').pop() || 'index.html';
  location.replace('login.html?next=' + encodeURIComponent(page + location.search + location.hash));
})();
