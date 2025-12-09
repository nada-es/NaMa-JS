document.addEventListener("DOMContentLoaded", () => {
  const noticiasContainer = document.getElementById("lista-noticias");
  if (!noticiasContainer) return;

  // try a few candidate paths for noticias.json so pages served from nested folders still load it
  (async function(){
    const candidates = ["js/noticias.json","./js/noticias.json","../js/noticias.json","/js/noticias.json"];
    let noticias = null;
    for (const p of candidates){
      try{
        const r = await fetch(p);
        if (!r.ok) continue;
        noticias = await r.json();
        break;
      }catch(e){}
    }
    if (!noticias){
      // fallback embedded noticias so the site shows news even if fetch fails (file:// or other issues)
      noticias = [
        {
          "id": 1,
          "titulo": "Lanzamiento de nueva colección",
          "fecha": "2025-12-01",
          "resumen": "Presentamos nuestra nueva línea de productos con envío a todo el país.",
          "url": "views/galeria.html"
        },
        {
          "id": 2,
          "titulo": "Oferta de fin de año",
          "fecha": "2025-11-20",
          "resumen": "Descuentos especiales en servicios seleccionados durante diciembre.",
          "url": "views/presupuesto.html"
        }
      ];
    }
    noticias.forEach(n => {
        const card = document.createElement("article");
        card.className = "noticia";
        // make the card keyboard-focusable and clickable
        card.tabIndex = 0;
        card.style.cursor = n.url ? 'pointer' : 'default';
        // use resumen field if available; fall back to 'texto' for backwards compatibility
        const resumen = n.resumen || n.texto || '';
        const link = n.url ? `<p><a href="${n.url}">Leer más →</a></p>` : '';
        card.innerHTML = `
          <h3>${n.titulo}</h3>
          <p><small>${n.fecha}</small></p>
          <p>${resumen}</p>
          ${link}
        `;
        // If a URL is provided, wrap the whole card in a proper anchor so it's
        // keyboard-accessible and behaves like a real link across browsers.
        if (n.url){
          const wrapper = document.createElement('a');
          wrapper.href = n.url;
          wrapper.className = 'noticia-link';
          wrapper.style.textDecoration = 'none';
          wrapper.style.color = 'inherit';
          // ensure the article remains semantic inside the anchor
          wrapper.appendChild(card);
          // make the title itself a link for semantics (assistive tech)
          const h3 = card.querySelector('h3');
          if (h3){
            const a = document.createElement('a');
            a.href = n.url;
            a.textContent = h3.textContent;
            // replace heading text with the link
            h3.textContent = '';
            h3.appendChild(a);
          }
          noticiasContainer.appendChild(wrapper);
        } else {
          noticiasContainer.appendChild(card);
        }
      });
    })().catch(() => { noticiasContainer.textContent = "No se pudieron cargar las noticias."; });
});
