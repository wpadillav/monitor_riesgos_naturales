// Tema inicial sin parpadeo (HU-09, AM-36). Script clásico y bloqueante en <head>: se ejecuta
// antes del primer pintado y fija data-tema en <html>. La CSP prohíbe scripts en línea, por eso
// es un archivo. La lógica completa (cambiar de tema y seguir al sistema) está en js/main.js.
(function () {
  var tema;
  try {
    tema = window.localStorage.getItem('tema');
  } catch {
    tema = null;
  }
  if (tema !== 'oscuro' && tema !== 'dia') {
    var claro = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    tema = claro ? 'dia' : 'oscuro';
  }
  document.documentElement.setAttribute('data-tema', tema);
})();
