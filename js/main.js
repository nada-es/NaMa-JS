document.addEventListener("DOMContentLoaded", () => {
  const noticiasContainer = document.getElementById("lista-noticias");
  if (!noticiasContainer) return;

  fetch("js/noticias.json")
    .then(res => res.json())
    .then(noticias => {
      noticias.forEach(n => {
        const card = document.createElement("article");
        card.className = "noticia";
        // use resumen field if available; fall back to 'texto' for backwards compatibility
        const resumen = n.resumen || n.texto || '';
        const link = n.url ? `<p><a href="${n.url}">Leer más →</a></p>` : '';
        card.innerHTML = `
          <h3>${n.titulo}</h3>
          <p><small>${n.fecha}</small></p>
          <p>${resumen}</p>
          ${link}
        `;
        noticiasContainer.appendChild(card);
      });
    })
    .catch(() => {
      noticiasContainer.textContent = "No se pudieron cargar las noticias.";
    });
});
