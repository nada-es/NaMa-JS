document.addEventListener("DOMContentLoaded", () => {
  const mapEl = document.getElementById("map");
  if (!mapEl) return; // page doesn't include a map container

  if (typeof L === "undefined") {
    // Leaflet library not loaded — provide a helpful message instead of throwing
    console.warn("Leaflet is not available; map cannot be initialized.");
    mapEl.innerHTML = '<p style="padding:1rem;color:#444;background:#fff;border-radius:6px;">El mapa no está disponible en este momento (librería no cargada).</p>';
    return;
  }

  const coords = [40.4168, -3.7038]; // Madrid - adjust as needed
  const map = L.map(mapEl).setView(coords, 13);

  const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // sometimes Leaflet needs a reflow call when it is initialized inside elements
  // that might not be fully sized yet (especially in dev preview). Invalidate size
  // shortly after init to ensure tiles and controls are placed correctly.
  setTimeout(() => map.invalidateSize(), 250);

  // keep the map responsive to layout changes and ensure controls stay visible
  window.addEventListener('resize', () => map.invalidateSize());

  const marker = L.marker(coords).addTo(map);
  marker.bindPopup('<strong>NaMa</strong><br>Calle Falsa 123, Ciudad');

  // open popup once on first render
  marker.once('add', () => marker.openPopup());

  // --- routing support (uses leaflet-routing-machine if available) ---
  let routeControl = null;
  let destMarker = null;

  const input = document.getElementById('route-input');
  const calcBtn = document.getElementById('calc-route');
  const clearBtn = document.getElementById('clear-route');

  function clearRoute(){
    if (routeControl){
      map.removeControl(routeControl);
      routeControl = null;
    }
    if (destMarker){
      map.removeLayer(destMarker);
      destMarker = null;
    }
  }

  // allow user to set destination by clicking on the map
  map.on('click', e => {
    const latlng = e.latlng;
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker(latlng, {title: 'Destino'}).addTo(map);
    input.value = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  });

  // ask the routing library to calculate the route
  function calculateRouteTo(destLatLng){
    if (typeof L.Routing === 'undefined'){
      alert('El cálculo de rutas no está disponible (falta la librería).');
      return;
    }

    clearRoute();

    routeControl = L.Routing.control({
      waypoints: [L.latLng(coords), L.latLng(destLatLng)],
      showAlternatives: false,
      lineOptions: {styles: [{color: '#3fe65b', opacity: 0.8, weight: 6}]},
      router: L.Routing.osrmv1({serviceUrl: 'https://router.project-osrm.org/route/v1'})
    }).addTo(map);
  }

  if (calcBtn){
    calcBtn.addEventListener('click', () => {
      const v = (input && input.value) ? input.value.trim() : '';
      if (!v) return alert('Escribe lat,lng o pulsa en el mapa para seleccionar un destino.');
      const parts = v.split(',').map(p => p.trim());
      if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))){
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        calculateRouteTo([lat, lng]);
      } else {
        alert('Formato incorrecto. Introduce coordenadas "lat,lng" (por ejemplo: 40.4168,-3.7038).');
      }
    });
  }

  if (clearBtn){
    clearBtn.addEventListener('click', () => {
      clearRoute();
      if (input) input.value = '';
    });
  }

  // if tiles fail to load, show a small message in the map container
  tileLayer.on('tileerror', () => {
    console.warn('Tile loading error');
    // append non-intrusive note if it doesn't already exist
    if (!mapEl.querySelector('.map-error')){
      const n = document.createElement('div');
      n.className = 'map-error';
      n.style.cssText = 'position:absolute;left:12px;top:12px;background:rgba(255,255,255,0.9);padding:8px 10px;border-radius:6px;color:#333;box-shadow:0 6px 18px rgba(0,0,0,0.06);z-index:1200;';
      n.innerText = 'Problema: mapas temporariamente no disponibles.';
      mapEl.appendChild(n);
    }
  });
});
