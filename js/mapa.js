document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (typeof maplibregl === 'undefined'){
    console.warn('MapLibre GL not loaded — map unavailable');
    mapEl.innerHTML = '<p style="padding:1rem;color:#444;background:#fff;border-radius:6px;">El mapa no está disponible (librería no cargada).</p>';
    return;
  }

  // Company location (lon, lat)
  const companyLonLat = [-3.7038, 40.4168];
  const defaultDestLonLat = [-3.7075, 40.4212];

  // basic raster style using OpenStreetMap tiles
  const style = {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  };

  const map = new maplibregl.Map({ container: mapEl, style, center: companyLonLat, zoom: 13 });

  // add basic zoom/rotate controls
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // DOM elements
  const input = document.getElementById('route-input');
  const calcBtn = document.getElementById('calc-route');
  const clearBtn = document.getElementById('clear-route');
  const distanceEl = document.getElementById('distance-output');
  const locationStatus = document.getElementById('location-status');

  // map state
  let userMarker = null;
  let destMarker = null;
  let routeSourceId = 'route-source';
  let accuracySourceId = 'accuracy-source';
  let confirmEl = null;
  let adjustMode = false;
  let watchId = null;
  let lastAccuracy = Infinity;
  const DESIRED_ACCURACY_METERS = 50;
  let lastDetected = null; // {lat, lon, acc}

  function setLocationStatus(text){ if (locationStatus) locationStatus.textContent = `Estado: ${text}`; }

  function haversineDistance(a, b){ if (!a || !b) return null; const toRad = v => v * Math.PI / 180; const lat1 = a[0], lon1 = a[1]; const lat2 = b[0], lon2 = b[1]; const R = 6371000; const dLat = toRad(lat2-lat1); const dLon = toRad(lon2-lon1); const sa = Math.pow(Math.sin(dLat/2),2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLon/2),2); const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa)); return R * c; }

  function makeIconSVG(color, size=24){ return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`); }

  function addOrMoveMarker(markerRef, lnglat, color){
    if (markerRef && markerRef.getLngLat){
      markerRef.setLngLat(lnglat);
      return markerRef;
    }
    const el = document.createElement('div');
    el.style.width = '28px'; el.style.height = '28px'; el.style.background = 'transparent';
    const img = document.createElement('img'); img.src = makeIconSVG(color, 28); img.style.width='28px'; img.style.height='28px';
    el.appendChild(img);
    return new maplibregl.Marker({ element: el }).setLngLat(lnglat).addTo(map);
  }

  // draw a route on the map. Accepts either a GeoJSON LineString feature or two coordinate pairs
  function drawRoute(routeGeoOrFromTo){
    let data;
    if (routeGeoOrFromTo && routeGeoOrFromTo.type && routeGeoOrFromTo.geometry){
      // full GeoJSON feature
      data = routeGeoOrFromTo;
    } else if (Array.isArray(routeGeoOrFromTo) && routeGeoOrFromTo.length === 2 && Array.isArray(routeGeoOrFromTo[0])){
      // [from, to]
      data = { type: 'Feature', geometry: { type: 'LineString', coordinates: [routeGeoOrFromTo[0], routeGeoOrFromTo[1]] } };
    } else {
      return;
    }

    if (map.getSource(routeSourceId)) {
      map.getSource(routeSourceId).setData(data);
    } else {
      map.addSource(routeSourceId, { type: 'geojson', data });
      map.addLayer({ id: 'route-line', type: 'line', source: routeSourceId, layout: { 'line-join': 'round','line-cap':'round' }, paint: { 'line-color':'#3fe65b','line-width':4 } });
    }

    // fit bounds to the route geometry
    try{
      const coords = data.geometry.coordinates;
      const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach(c => bounds.extend(c));
      map.fitBounds(bounds, { padding:40, maxZoom:16, duration:700 });
    }catch(e){}
  }

  function createCircleGeoJSON(lon, lat, radiusMeters, steps=64){
    const coords = [];
    const R = 6378137; // earth radius in meters
    for (let i=0;i<=steps;i++){
      const ang = (i/steps) * 2 * Math.PI;
      const dx = radiusMeters * Math.cos(ang);
      const dy = radiusMeters * Math.sin(ang);
      const latRadians = lat * Math.PI / 180;
      const dLon = dx / (R * Math.cos(latRadians));
      const dLat = dy / R;
      const pointLat = lat + (dLat * 180 / Math.PI);
      const pointLon = lon + (dLon * 180 / Math.PI);
      coords.push([pointLon, pointLat]);
    }
    return { type:'Feature', geometry: { type:'Polygon', coordinates: [coords] } };
  }

  function drawAccuracy(lon, lat, radiusMeters){
    const circle = createCircleGeoJSON(lon, lat, Math.min(radiusMeters, 1000));
    if (map.getSource(accuracySourceId)) map.getSource(accuracySourceId).setData(circle);
    else {
      map.addSource(accuracySourceId, { type:'geojson', data: circle });
      map.addLayer({ id:'accuracy-fill', type:'fill', source: accuracySourceId, paint:{ 'fill-color':'rgba(43,156,255,0.08)','fill-outline-color':'#2b9cff' } });
    }
  }

  function clearRoute(){
    // Remove drawn route but keep the destination marker (the 'to') — clear the 'from' (user) instead
    if (map.getLayer('route-line')) try{ map.removeLayer('route-line'); }catch(e){}
    if (map.getSource(routeSourceId)) try{ map.removeSource(routeSourceId);}catch(e){}
    // remove user marker and accuracy area
    if (userMarker) try{ userMarker.remove(); }catch(e){}
    userMarker = null;
    if (map.getLayer('accuracy-fill')) try{ map.removeLayer('accuracy-fill'); }catch(e){}
    if (map.getSource(accuracySourceId)) try{ map.removeSource(accuracySourceId);}catch(e){}
    if (distanceEl) distanceEl.textContent = 'Distancia: —';
    // clear steps container if present
    const stepsEl = document.getElementById('route-steps'); if (stepsEl) stepsEl.innerHTML = '';
  }

  async function calculateRouteAndDistanceTo(lat, lon){
    // Try to fetch a routed path with steps from OSRM (public demo). Falls back to straight line.
    // start by clearing existing route visuals but keep destination
    if (map.getLayer('route-line')) try{ map.removeLayer('route-line'); }catch(e){}
    if (map.getSource(routeSourceId)) try{ map.removeSource(routeSourceId);}catch(e){}
    const company = companyLonLat.slice(); // [lon,lat]
    const companyLngLat = [company[0], company[1]];
    const destLngLat = [lon, lat];

    // show a loading distance placeholder
    if (distanceEl) distanceEl.textContent = 'Calculando ruta...';

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${companyLngLat[0]},${companyLngLat[1]};${destLngLat[0]},${destLngLat[1]}?overview=full&geometries=geojson&steps=true`;
    let usedGeo = null;
    let stepsHtml = '';
    try{
      const ctrl = new AbortController(); const id = setTimeout(()=>ctrl.abort(),8000);
      const res = await fetch(osrmUrl, { signal: ctrl.signal }); clearTimeout(id);
      if (res.ok){
        const j = await res.json();
        if (j.routes && j.routes.length){
          const route = j.routes[0];
          usedGeo = { type:'Feature', geometry: route.geometry };
          // parse steps
          const legs = route.legs || [];
          legs.forEach((leg, li) => {
            (leg.steps||[]).forEach((s, si) => {
              const instr = s.maneuver && s.maneuver.instruction ? s.maneuver.instruction : (s.name || 'Ir');
              const stepDist = s.distance ? Math.round(s.distance) : 0;
              stepsHtml += `<li><strong>${instr}</strong> — ${stepDist} m</li>`;
            });
          });
        }
      }
    }catch(e){
      // routing failed — fall back to straight line
      usedGeo = null;
    }

    if (usedGeo){
      drawRoute(usedGeo);
      // update steps UI
      let stepsEl = document.getElementById('route-steps');
      if (!stepsEl){
        const parent = document.getElementById('route-controls') || mapEl;
        stepsEl = document.createElement('ol'); stepsEl.id = 'route-steps'; stepsEl.style.marginTop = '8px'; stepsEl.style.paddingLeft = '18px'; parent.appendChild(stepsEl);
      }
      stepsEl.innerHTML = stepsHtml || '<li>Ruta calculada.</li>';
      // distance from route summary
      if (distanceEl){ const meters = (usedGeo && usedGeo.geometry && usedGeo.geometry.coordinates) ? haversineDistance([company[1],company[0]],[lat,lon]) : null; distanceEl.textContent = meters ? `Distancia: ${(meters/1000).toFixed(2)} km (${Math.round(meters)} m)` : 'Distancia: —'; }
    } else {
      // fallback: straight line
      drawRoute([companyLngLat, destLngLat]);
      const meters = haversineDistance([company[1], company[0]], [lat, lon]);
      if (distanceEl) distanceEl.textContent = meters ? `Distancia: ${(meters/1000).toFixed(2)} km (${Math.round(meters)} m)` : 'Distancia: —';
      const stepsEl = document.getElementById('route-steps'); if (stepsEl) stepsEl.innerHTML = '<li>Ruta directa (sin pasos)</li>';
    }
  }

  // confirmation UI
  function createConfirmUI(){
    if (confirmEl) return;
    confirmEl = document.createElement('div');
    confirmEl.id = 'loc-confirm';
    confirmEl.style.cssText = 'position:absolute;right:12px;top:12px;background:#fff;padding:10px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.12);z-index:2000;max-width:320px;font-size:.95rem;color:#111;';
    // build buttons with white background and black text for contrast
    confirmEl.innerHTML = `
      <div id="loc-confirm-text">Ubicación encontrada</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="loc-confirm-move" class="loc-btn">Mover aquí</button>
        <button id="loc-confirm-adjust" class="loc-btn">Ajustar</button>
        <button id="loc-confirm-cancel" class="loc-btn">Cerrar</button>
      </div>
      <small id="loc-confirm-hint" style="display:block;margin-top:6px;color:#666;">Pulsa "Ajustar" y haz click en el mapa para corregir la posición.</small>
    `;
    // ensure contrast
    mapEl.style.position = mapEl.style.position || 'relative';
    confirmEl.style.display = 'none';
    mapEl.appendChild(confirmEl);

    // apply styles to .loc-btn
    const styleBtn = (btn) => {
      btn.style.padding = '6px';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid #d1d5db';
      btn.style.background = '#fff';
      btn.style.color = '#000';
      btn.style.cursor = 'pointer';
    };

    const moveBtn = confirmEl.querySelector('#loc-confirm-move');
    const adjustBtn = confirmEl.querySelector('#loc-confirm-adjust');
    const cancelBtn = confirmEl.querySelector('#loc-confirm-cancel');
    [moveBtn, adjustBtn, cancelBtn].forEach(b => { if (b) styleBtn(b); });

    moveBtn.addEventListener('click', () => {
      adjustMode = false;
      confirmEl.style.display = 'none';
      setLocationStatus('ubicación confirmada');
      if (lastDetected){
        const { lat, lon } = lastDetected;
        if (!userMarker) userMarker = addOrMoveMarker(null, [lon, lat], '#2b9cff'); else userMarker = addOrMoveMarker(userMarker, [lon, lat], '#2b9cff');
        calculateRouteAndDistanceTo(lat, lon);
        map.flyTo({ center: [lon, lat], zoom: 15, speed: 0.8 });
      }
    });

    adjustBtn.addEventListener('click', () => {
      adjustMode = true;
      confirmEl.querySelector('#loc-confirm-text').textContent = 'Modo ajuste: haz click en el mapa para mover la marca de usuario';
      confirmEl.querySelector('#loc-confirm-hint').textContent = 'Pulsa "Mover aquí" o "Confirmar" cuando hayas terminado.';
    });

    cancelBtn.addEventListener('click', () => {
      adjustMode = false;
      confirmEl.style.display = 'none';
    });
  }

  function showConfirmUI(lat, lon, acc){
    lastDetected = { lat, lon, acc };
    createConfirmUI();
    confirmEl.style.display = 'block';
    const txt = confirmEl.querySelector('#loc-confirm-text');
    txt.textContent = `Detectado: ${lat.toFixed(5)}, ${lon.toFixed(5)} (≈ ${Math.round(acc||0)} m)`;
    confirmEl.querySelector('#loc-confirm-hint').textContent = 'Pulsa "Ajustar" y haz click en el mapa para corregir la posición, o pulsa "Mover aquí" para usar esta ubicación.';
  }

  // geolocation
  async function handleLocationSuccess(pos){
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const acc = pos.coords.accuracy;
    lastAccuracy = (typeof acc === 'number') ? acc : lastAccuracy;
    // store the detected location, show accuracy area and ask user whether to move the pin
    lastDetected = { lat, lon, acc };
    drawAccuracy(lon, lat, acc || 80);
    setLocationStatus(`ubicación detectada (≈ ${Math.round(acc||0)} m)`);
    // show confirmation UI so user can move the pin or adjust
    showConfirmUI(lat, lon, acc);
  }

  function handleLocationError(err){
    if (!err) return setLocationStatus('no disponible');
    if (err.code === 1){
      setLocationStatus('permiso denegado'); // show retry
      const parent = document.getElementById('route-controls') || mapEl;
      if (!document.getElementById('retry-locate')){
        const btn = document.createElement('button');
        btn.id = 'retry-locate';
        btn.type = 'button';
        btn.textContent = 'Reintentar ubicación';
        btn.style.marginLeft = '8px';
        btn.style.padding = '6px';
        btn.style.borderRadius = '6px';
        btn.style.border = '1px solid #d1d5db';
        btn.style.background = '#fff';
        btn.style.color = '#000';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', ()=>startGeolocation());
        parent.appendChild(btn);
      }
    } else if (err.code === 2){
      setLocationStatus('no fue posible obtener la ubicación');
    } else if (err.code === 3){
      setLocationStatus('tiempo de espera agotado');
    } else {
      setLocationStatus('error');
    }
    console.warn('Geolocation error', err && err.message);
  }

  let geoWatchId = null; let watchTimeout = null;
  function startGeolocation(){
    if (!navigator || !navigator.geolocation) return handleLocationError();
    setLocationStatus('solicitando permiso...');
    // immediate prompt
    try{ navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy:true, timeout:10000 }); }catch(e){}
    // then watch for better accuracy
    try{ geoWatchId = navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy:true, maximumAge:0 }); }catch(e){ geoWatchId = null; }
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(()=>{ if (geoWatchId){ try{ navigator.geolocation.clearWatch(geoWatchId);}catch(e){} geoWatchId=null; } try{ navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy:true, timeout:10000 }); }catch(e){} }, 25000);
  }

  // map click behaviour: if adjustMode -> move user marker; else -> set destination and calc route
  map.on('click', (e) => {
    const lnglat = [e.lngLat.lng, e.lngLat.lat];
    if (adjustMode){
      if (!userMarker) userMarker = addOrMoveMarker(null, lnglat, '#2b9cff'); else userMarker = addOrMoveMarker(userMarker, lnglat, '#2b9cff');
      setLocationStatus('ubicación ajustada');
      adjustMode = false;
      if (confirmEl) confirmEl.style.display='none';
      calculateRouteAndDistanceTo(lnglat[1], lnglat[0]);
      return;
    }
    // set dest marker
    if (destMarker) try{ destMarker.remove(); }catch(e){}
    destMarker = addOrMoveMarker(null, lnglat, '#ff7a7a');
    if (input) input.value = `${lnglat[1].toFixed(5)}, ${lnglat[0].toFixed(5)}`;
    calculateRouteAndDistanceTo(lnglat[1], lnglat[0]);
  });

  // default route to initial destination
  map.on('load', () => {
    destMarker = addOrMoveMarker(null, [defaultDestLonLat[0], defaultDestLonLat[1]], '#ff7a7a');
    calculateRouteAndDistanceTo(defaultDestLonLat[1], defaultDestLonLat[0]);
    // start geolocation automatically
    startGeolocation();
  });

  const locateBtn = document.getElementById('locate-me'); if (locateBtn) locateBtn.addEventListener('click', () => startGeolocation());
  if (calcBtn){ calcBtn.addEventListener('click', () => { const v = (input && input.value) ? input.value.trim() : ''; if (!v) return alert('Escribe lat,lng o pulsa en el mapa para seleccionar un destino.'); const parts = v.split(',').map(p => p.trim()); if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))){ const lat = parseFloat(parts[0]); const lng = parseFloat(parts[1]); calculateRouteAndDistanceTo(lat, lng); } else { alert('Formato incorrecto. Introduce coordenadas "lat,lng" (por ejemplo: 40.4168,-3.7038).'); } }); }
  if (clearBtn){ clearBtn.addEventListener('click', () => { clearRoute(); if (input) input.value = ''; /* keep destination (to) as requested */ }); }
});
