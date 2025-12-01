document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('site-search');
  if (!form) return;
  const input = document.getElementById('search-input');
  const resultsDrop = document.getElementById('search-dropdown');
  const countEl = document.getElementById('search-count');
  const toggleBtn = document.getElementById('search-toggle');

  // load global search index (optional). If missing, fall back to page-local behavior
  let globalIndex = null;
  fetch('data/search-index.json').then(r => {
    if (!r.ok) throw new Error('no index');
    return r.json();
  }).then(list => globalIndex = list).catch(()=> { /* no global index available */ });

  function normalize(s){return (s||'').toString().trim().toLowerCase();}

  function clearSearchState(){
    document.querySelectorAll('.search-match').forEach(el => el.classList.remove('search-match'));
    document.querySelectorAll('.no-match').forEach(el => el.classList.remove('no-match'));
    if (resultsDrop){
      resultsDrop.innerHTML = '';
      resultsDrop.setAttribute('aria-hidden','true');
    }
    if (countEl) countEl.textContent = '';
  }

  function doSearch(q){
    clearSearchState();
    const query = normalize(q);
    if (!query) return;

    // First, if there's a global index then search across pages and show results
    if (globalIndex){
      const matches = globalIndex.filter(entry => normalize(entry.title + ' ' + entry.excerpt + ' ' + (entry.tags||[]).join(' ')).includes(query));
      // show count and dropdown entries
      if (countEl) countEl.textContent = matches.length ? `${matches.length} resultado(s)` : '0 resultados';
      if (resultsDrop){
        resultsDrop.innerHTML = '';
        resultsDrop.setAttribute('aria-hidden', 'false');
        if (!matches.length){
          resultsDrop.innerHTML = '<div class="no-results">No se encontraron resultados.</div>';
          return;
        }
        matches.forEach(m => {
          const div = document.createElement('a');
          div.className = 'search-result-item';
          div.href = m.url;
          div.innerHTML = `<strong>${m.title}</strong><div class="sr-excerpt">${m.excerpt}</div>`;
          resultsDrop.appendChild(div);
        });
      }
      // still fall through to per-page behavior so local items are highlighted
    }

    // 1) News (index page)
    const lista = document.getElementById('lista-noticias');
    if (lista){
      const items = Array.from(lista.querySelectorAll('.noticia'));
      let any = false;
      items.forEach(item => {
        const text = normalize(item.textContent);
        if (text.includes(query)){
          item.classList.add('search-match');
          any = true;
        } else {
          item.classList.add('no-match');
        }
      });
      return;
    }

    // 2) Gallery
    const gal = document.getElementById('galeria');
    if (gal){
      const items = Array.from(gal.querySelectorAll('.galeria-item'));
      items.forEach(item => {
        const t = normalize(item.textContent + (item.querySelector('img')?.alt || ''));
        if (t.includes(query)){
          item.classList.add('search-match');
        } else {
          item.classList.add('no-match');
        }
      });
      return;
    }

    // 3) Presupuesto (forms) — highlight matching labels/options
    const formPres = document.getElementById('form-presupuesto');
    if (formPres){
      // look for matching labels and options
      const labels = Array.from(formPres.querySelectorAll('label'));
      labels.forEach(lbl => {
        const txt = normalize(lbl.textContent);
        if (txt.includes(query)) lbl.classList.add('search-match');
      });

      // products
      const prod = document.getElementById('producto');
      if (prod){
        Array.from(prod.options).forEach(opt => {
          if (normalize(opt.text).includes(query)) opt.classList.add('search-match');
        });
      }
      return;
    }

    // 4) Contact page and any other page — highlight first match in main
    const main = document.querySelector('main');
    if (main){
      const elements = Array.from(main.querySelectorAll('h1,h2,p,li,section'));
      elements.forEach(el => {
        if (normalize(el.textContent).includes(query)) el.classList.add('search-match');
      });
    }
  }

  // live search while typing
  input.addEventListener('input', e => {
    const q = e.target.value;
    if (!q) clearSearchState();
    doSearch(q);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    doSearch(input.value);
  });

  // keyboard: Escape clears
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){
      input.value = '';
      clearSearchState();
    }
  });

  // implement mobile toggle: clicking the toggle shows/hides the form on small screens
  if (toggleBtn){
    toggleBtn.addEventListener('click', () => {
      const isSmall = window.matchMedia('(max-width:640px)').matches;
      const hasValue = input.value && input.value.trim().length > 0;
      if (isSmall){
        // toggle mobile search overlay
        form.classList.toggle('open');
        if (form.classList.contains('open')){
          input.focus();
        } else {
          input.value = '';
          clearSearchState();
          if (resultsDrop) resultsDrop.setAttribute('aria-hidden', 'true');
          if (countEl) countEl.textContent = '';
        }
        return;
      }

      // desktop/touch: if there's a query, run search, otherwise focus input
      if (hasValue){
        doSearch(input.value);
      } else {
        input.focus();
      }
    });
  }
});
