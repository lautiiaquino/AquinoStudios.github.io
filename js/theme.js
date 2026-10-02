// Aplica el tema (claro/oscuro) antes de que se dibuje la página, para que no parpadee.
// Se carga como script normal en el <head> de cada página.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  // Por defecto, claro (papel); el modo oscuro queda guardado si lo elegís
  var theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
