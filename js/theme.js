// Aplica el tema (claro/oscuro) antes de que se dibuje la página, para que no parpadee.
// Se carga como script normal en el <head> de cada página.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  var theme = saved === 'light' || saved === 'dark'
    ? saved
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
})();
