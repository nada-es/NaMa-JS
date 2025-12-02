document.addEventListener("DOMContentLoaded", () => {
  const imagenes = [
    { src: "../img/foto1.svg", titulo: "Proyecto 1" },
    { src: "../img/foto2.svg", titulo: "Proyecto 2" },
    { src: "../img/foto3.svg", titulo: "Proyecto 3" },
    { src: "../img/foto4.svg", titulo: "Proyecto 4" },
    { src: "../img/foto5.svg", titulo: "Proyecto 5" },
    { src: "../img/foto6.svg", titulo: "Proyecto 6" }
  ];

  const galeriaDiv = document.getElementById("galeria");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const cerrarBtn = document.getElementById("cerrar-lightbox");

  imagenes.forEach((img, i) => {
    const item = document.createElement("div");
    item.className = "galeria-item";
    // add tabindex for keyboard focus and ARIA attributes for accessibility
    item.innerHTML = `
      <img src="${img.src}" alt="${img.titulo}" data-titulo="${img.titulo}" loading="lazy" tabindex="0" role="button" aria-label="Ver ${img.titulo}">
      <div class="galeria-caption">${img.titulo}</div>
    `;
    galeriaDiv.appendChild(item);
  });

  galeriaDiv.addEventListener("click", e => {
    if (e.target.tagName === "IMG") {
      openLightboxWith(e.target.src, e.target.dataset.titulo);
    }
  });

  // keyboard support on items
  galeriaDiv.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target;
      if (target && target.tagName === 'IMG') {
        openLightboxWith(target.src, target.dataset.titulo);
      }
    }
  });

  function openLightboxWith(src, caption){
    lightboxImg.src = src;
    lightboxImg.alt = caption || 'Imagen de la galería';
    lightboxCaption.textContent = caption || '';
    lightbox.classList.remove('hidden');
    // focus close button so keyboard users can close easily
    cerrarBtn.focus();
  }

  cerrarBtn.addEventListener("click", () => {
    lightbox.classList.add("hidden");
  });

  // close with Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
      lightbox.classList.add('hidden');
    }
  });

  lightbox.addEventListener("click", e => {
    if (e.target === lightbox) {
      lightbox.classList.add("hidden");
    }
  });
});
