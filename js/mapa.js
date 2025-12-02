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
  let userMarker = null;
  let userLocation = null;
  let fallbackLine = null;

  const input = document.getElementById('route-input');
  const calcBtn = document.getElementById('calc-route');
  const clearBtn = document.getElementById('clear-route');
  const distanceEl = document.getElementById('distance-output');

  // calculate geodesic distance (meters) between two [lat,lng] points using Haversine
  function haversineDistance(a, b){
    if (!a || !b) return null;
    const toRad = v => v * Math.PI / 180;
    const lat1 = a[0], lon1 = a[1];
    const lat2 = b[0], lon2 = b[1];
    const R = 6371000; // Earth radius meters
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const sa = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
               Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa));
    return R * c; // meters
  }

  function clearRoute(){
    if (routeControl){
      map.removeControl(routeControl);
      routeControl = null;
    }
    if (destMarker){
      map.removeLayer(destMarker);
      destMarker = null;
    }
    // remove any fallback polyline used when routing library isn't available
    if (fallbackLine){
      map.removeLayer(fallbackLine);
      fallbackLine = null;
    }
    if (distanceEl) distanceEl.textContent = 'Distancia: —';
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
    clearRoute();

    // If routing library is available use it and show the detailed route (and distance)
    if (typeof L.Routing !== 'undefined'){
      routeControl = L.Routing.control({
        waypoints: [L.latLng(coords), L.latLng(destLatLng)],
        showAlternatives: false,
        lineOptions: {styles: [{color: '#3fe65b', opacity: 0.8, weight: 6}]},
        router: L.Routing.osrmv1({serviceUrl: 'https://router.project-osrm.org/route/v1'})
      }).addTo(map);

      // update distance when routes found
      routeControl.on('routesfound', function(e){
        try{
          const summary = e.routes && e.routes[0] && e.routes[0].summary;
          const meters = summary && (summary.totalDistance || summary.total_distance || summary.totalMeters) || null;
          if (meters && distanceEl){
            const km = (meters/1000).toFixed(2);
            distanceEl.textContent = `Distancia: ${km} km (${Math.round(meters)} m)`;
          } else if (distanceEl){
            // fallback to haversine if route summary doesn't include distance
            const meters2 = haversineDistance(coords, destLatLng);
            if (meters2) distanceEl.textContent = `Distancia: ${(meters2/1000).toFixed(2)} km`;
          }
        }catch(err){
          // ignore
        }
      });

      return;
    }

    // fallback: draw a simple polyline between the two points and compute geodesic distance
    if (fallbackLine) map.removeLayer(fallbackLine);
    fallbackLine = L.polyline([coords, destLatLng], {color:'#3fe65b', weight:5, opacity:0.75}).addTo(map);
    map.fitBounds(L.latLngBounds([coords, destLatLng]), {padding:[40,40]});
    if (distanceEl){
      const meters = haversineDistance(coords, destLatLng);
      distanceEl.textContent = meters ? `Distancia: ${(meters/1000).toFixed(2)} km (${Math.round(meters)} m)` : 'Distancia: —';
    }
  }

  // --- default automatic route between two known points ---
  // If you want the map to show a route without user interaction, define a
  // default destination and calculate a route on init. We'll also add a
  // destination marker and draw a fallback line if the routing library is
  // unavailable.
  const defaultDest = [40.4212, -3.7075]; // secondary location (nearby)

  // add a visible marker for the default destination
  const defaultMarker = L.marker(defaultDest).addTo(map);
  defaultMarker.bindPopup('<strong>Sucursal</strong><br>Ubicación secundaria');

  // If routing is available, calculate the route to the default destination
  if (typeof L.Routing !== 'undefined'){
    // calculate route and ensure it fits in view
    calculateRouteTo(defaultDest);
  } else {
    // fallback: draw a simple polyline between the two points
    const line = L.polyline([coords, defaultDest], {color:'#3fe65b', weight:5, opacity:0.75}).addTo(map);
    // fit the map to show both points
    map.fitBounds(L.latLngBounds([coords, defaultDest]), {padding:[40,40]});
  }

  // --- permission-aware location handling ---
  const locateBtn = document.getElementById('locate-me');
  const locationStatus = document.getElementById('location-status');
  let geoPermissionState = null;

  function setLocationStatus(text){
    if (locationStatus) locationStatus.textContent = `Estado: ${text}`;
  }

  function handleLocationSuccess(pos){
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    userLocation = [lat, lng];

    // add a user marker (distinct icon could be configured if desired)
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker(userLocation, {title: 'Tu ubicación'}).addTo(map);
    userMarker.bindPopup('<strong>Tu ubicación</strong>').openPopup();

    // clear the default destination markers/lines (we prefer user-centric route)
    if (defaultMarker) { map.removeLayer(defaultMarker); }
    if (fallbackLine) { map.removeLayer(fallbackLine); fallbackLine = null; }

    // compute route from company to user automatically
    calculateRouteTo(userLocation);
    setLocationStatus('ubicación detectada');
  }

  function handleLocationError(err){
    if (!err) return setLocationStatus('no disponible');
    // code 1 == PERMISSION_DENIED
    if (err.code === 1){
      setLocationStatus('permiso denegado');
    } else if (err.code === 2){
      setLocationStatus('no fue posible obtener la ubicación');
    } else if (err.code === 3){
      setLocationStatus('tiempo de espera agotado');
    } else {
      setLocationStatus('error');
    }
    console.warn('Geolocation error', err && err.message);
  }

  function requestUserLocation(){
    if (!navigator || !navigator.geolocation) return handleLocationError();

    // If we already know the permission state is 'denied', don't prompt — show guidance
    if (geoPermissionState === 'denied'){
      setLocationStatus('bloqueado (cambia en la configuración del navegador)');
      return;
    }

    navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, {enableHighAccuracy:true, timeout:10000});
  }

  // check permission state first — querying Permissions API does not trigger a prompt
  if (navigator && navigator.permissions && navigator.permissions.query){
    try{
      navigator.permissions.query({name:'geolocation'}).then(p => {
        geoPermissionState = p.state; // 'granted', 'denied' or 'prompt'
        if (p.state === 'granted'){
          // permission already granted — it's safe to obtain location without prompting
          requestUserLocation();
        } else {
          // do not auto-request if permission is 'prompt' or 'denied'
          setLocationStatus(p.state === 'prompt' ? 'no activada' : 'permiso denegado');
        }
        p.onchange = () => {
          geoPermissionState = p.state;
          if (p.state === 'granted') requestUserLocation();
        };
      }).catch(() => {
        // Permissions query failed — to avoid unexpected prompts, don't auto-request
        setLocationStatus('no activada');
      });
    }catch(e){
      setLocationStatus('no activada');
    }
  } else {
    // Permissions API not available: avoid auto-request so the page won't prompt unexpectedly
    setLocationStatus('no activada');
  }

  // allow manual request via button (will prompt if browser state is 'prompt')
  if (locateBtn){
    locateBtn.addEventListener('click', () => requestUserLocation());
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
