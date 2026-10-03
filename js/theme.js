// Aplica el tema (claro/oscuro) antes de que se dibuje la página, para que no parpadee.
// Se carga como script normal en el <head> de cada página.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  // Por defecto, oscuro (es la identidad del sitio); el modo claro queda guardado si lo elegís
  var theme = saved === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
})();
