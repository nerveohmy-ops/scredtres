import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  X,
  LocateFixed,
  MapPin,
  Search,
  Loader2,
  Clock,
  Check,
  List,
  Map as MapIcon,
  RefreshCw
} from 'lucide-react';
import { fetchCdekPvz, reverseGeocodePvz } from '../utils/api';
import { haptic } from '../utils/telegram';

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${meters} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

function createPvzIcon(isSelected) {
  const size = isSelected ? 34 : 24;
  return L.divIcon({
    className: 'scred-pvz-marker',
    html: isSelected
      ? `<div style="width:34px;height:34px;border-radius:9999px;background:#ffffff;color:#000000;border:3px solid #22c55e;box-shadow:0 4px 16px rgba(34,197,94,0.55);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;font-family:sans-serif;">ПВЗ</div>`
      : `<div style="width:24px;height:24px;border-radius:9999px;background:#111111;color:#ffffff;border:2px solid #22c55e;box-shadow:0 2px 10px rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;font-family:sans-serif;">С</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function createUserLocationIcon() {
  return L.divIcon({
    className: 'scred-user-marker',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#3b82f6;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(59,130,246,0.28);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

export default function CdekPvzMapModal({
  isOpen,
  onClose,
  initialCity = 'Москва',
  onSelectPvz
}) {
  const [cityInput, setCityInput] = useState(initialCity || 'Москва');
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const [points, setPoints] = useState([]);
  const [selectedPvz, setSelectedPvz] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mapMoved, setMapMoved] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const abortRef = useRef(null);

  const loadPoints = useCallback(async ({ city, lat, lon, panToCenter = true }) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setErrorMsg('');
    setMapMoved(false);

    const res = await fetchCdekPvz({ city, lat, lon, signal: controller.signal });
    if (controller.signal.aborted) return;

    setLoading(false);
    if (!res.ok) {
      setErrorMsg('Не удалось загрузить карту ПВЗ СДЭК. Попробуйте ещё раз.');
      return;
    }

    if (res.city) {
      setCityInput(res.city);
    }

    setPoints(res.points);
    if (res.points.length === 0) {
      setErrorMsg('В этой области ПВЗ СДЭК не найдены. Переместите карту или введите другой город.');
    }

    if (panToCenter && mapRef.current && res.center) {
      mapRef.current.setView([res.center.lat, res.center.lon], lat !== undefined ? 13 : 12, {
        animate: true
      });
    }
  }, []);

  // Initialize Leaflet map when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setCityInput(initialCity || 'Москва');
    setSelectedPvz(null);
    setViewMode('map');
    setErrorMsg('');

    const initTimer = setTimeout(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [55.7558, 37.6173],
        zoom: 11,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      map.on('dragend', () => setMapMoved(true));

      mapRef.current = map;
      loadPoints({ city: initialCity || 'Москва', panToCenter: true });
    }, 60);

    return () => {
      clearTimeout(initTimer);
      if (abortRef.current) abortRef.current.abort();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
        userMarkerRef.current = null;
      }
    };
  }, [isOpen, initialCity, loadPoints]);

  // Keep map layout valid when toggling back from list view
  useEffect(() => {
    if (viewMode === 'map' && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 60);
    }
  }, [viewMode]);

  // Render PVZ markers whenever points or selectedPvz changes
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const pvz of points) {
      const isSelected = selectedPvz?.id === pvz.id;
      const marker = L.marker([pvz.lat, pvz.lon], {
        icon: createPvzIcon(isSelected),
        zIndexOffset: isSelected ? 1000 : 0
      });
      marker.on('click', () => {
        haptic.select();
        setSelectedPvz(pvz);
        mapRef.current?.panTo([pvz.lat, pvz.lon], { animate: true });
      });
      marker.addTo(layer);
    }
  }, [points, selectedPvz]);

  // Render user GPS location pin
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lon]);
    } else {
      userMarkerRef.current = L.marker([userCoords.lat, userCoords.lon], {
        icon: createUserLocationIcon(),
        interactive: false,
        zIndexOffset: 900
      }).addTo(mapRef.current);
    }
  }, [userCoords]);

  const handleLocateMe = () => {
    if (locating) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Геолокация не поддерживается на этом устройстве. Введите город вручную.');
      haptic.error();
      return;
    }

    haptic.medium();
    setLocating(true);
    setErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };
        setUserCoords(coords);
        setViewMode('map');
        loadPoints({ lat: coords.lat, lon: coords.lon, panToCenter: true });
      },
      (err) => {
        setLocating(false);
        haptic.error();
        if (err?.code === 1) {
          setErrorMsg('Доступ к геолокации запрещён. Разрешите его в настройках или введите город вручную.');
        } else {
          setErrorMsg('Не удалось определить геолокацию. Введите город в поиске выше.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleCitySearch = (e) => {
    e.preventDefault();
    const clean = cityInput.trim();
    if (clean.length < 2) return;
    haptic.light();
    setSelectedPvz(null);
    loadPoints({ city: clean, panToCenter: true });
  };

  const handleSearchInArea = () => {
    if (!mapRef.current) return;
    haptic.light();
    const c = mapRef.current.getCenter();
    loadPoints({ lat: c.lat, lon: c.lng, panToCenter: false });
  };

  const handleConfirmSelected = async () => {
    if (!selectedPvz || confirming) return;
    setConfirming(true);
    haptic.success();

    let finalCity = selectedPvz.city || cityInput.trim() || 'Москва';
    let finalAddress = selectedPvz.address || '';

    // If OSM node lacked an explicit house number, reverse-geocode its exact building coordinates
    if (!selectedPvz.hasHouse || !/\d/.test(finalAddress)) {
      const resolved = await reverseGeocodePvz(selectedPvz.lat, selectedPvz.lon);
      if (resolved?.city) finalCity = resolved.city;
      if (resolved?.address) finalAddress = resolved.address;
    }

    const labelWithCode = selectedPvz.code
      ? `${finalAddress} (ПВЗ ${selectedPvz.code})`
      : finalAddress;

    setConfirming(false);
    onSelectPvz?.({
      city: finalCity,
      address: labelWithCode || `ПВЗ СДЭК (${selectedPvz.lat.toFixed(5)}, ${selectedPvz.lon.toFixed(5)})`,
      pvzCode: selectedPvz.code || '',
      workTime: selectedPvz.workTime || '',
      lat: selectedPvz.lat,
      lon: selectedPvz.lon
    });
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full h-full sm:h-[88vh] sm:max-w-2xl bg-[#080808] sm:border sm:border-[#222222] sm:rounded-2xl z-10 flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#181818] bg-black flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-[#22c55e] shrink-0" />
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-white truncate">
              Выбор ПВЗ СДЭК на карте
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic.light();
              onClose();
            }}
            aria-label="Закрыть карту"
            className="w-8 h-8 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#888888] hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Geolocation Toolbar */}
        <div className="p-3 border-b border-[#181818] bg-[#060606] space-y-2 shrink-0">
          <form onSubmit={handleCitySearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder="Введите город (напр. Москва)"
                className="w-full bg-black border border-[#222222] focus:border-white text-white text-xs pl-8 pr-3 py-2 rounded-full outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
            >
              Найти
            </button>
          </form>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={locating}
              className="px-3.5 py-1.5 rounded-full bg-[#111111] border border-[#2a2a2a] hover:border-white text-[11px] font-medium text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {locating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#22c55e]" />
              ) : (
                <LocateFixed className="w-3.5 h-3.5 text-[#22c55e]" />
              )}
              <span>{locating ? 'Определяем...' : 'Моя геолокация'}</span>
            </button>

            <div className="flex items-center gap-1 bg-black border border-[#222222] rounded-full p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  haptic.select();
                  setViewMode('map');
                }}
                className={`px-3 py-1 rounded-full inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'map'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#888888] hover:text-white'
                }`}
              >
                <MapIcon className="w-3 h-3" />
                <span>Карта</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic.select();
                  setViewMode('list');
                }}
                className={`px-3 py-1 rounded-full inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#888888] hover:text-white'
                }`}
              >
                <List className="w-3 h-3" />
                <span>Список ({points.length})</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="text-[11px] text-[#e5e5e5] bg-[#141414] border border-[#2c2c2c] rounded-xl px-3 py-2">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Map / List Body */}
        <div className="relative flex-1 min-h-0 bg-black">
          {/* Keep Leaflet container mounted so state persists across map/list toggle */}
          <div
            ref={mapContainerRef}
            className={`w-full h-full ${viewMode === 'map' ? 'block' : 'hidden'}`}
          />

          {/* Loading overlay */}
          {loading && viewMode === 'map' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] px-3.5 py-1.5 rounded-full bg-black/90 border border-[#2c2c2c] text-[11px] text-white inline-flex items-center gap-2 shadow-xl">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#22c55e]" />
              <span>Загружаем ПВЗ СДЭК...</span>
            </div>
          )}

          {/* Search in current viewport button after dragging */}
          {mapMoved && !loading && viewMode === 'map' && (
            <button
              type="button"
              onClick={handleSearchInArea}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-full bg-white text-black hover:bg-[#dddddd] text-[11px] font-semibold inline-flex items-center gap-1.5 shadow-2xl cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Искать ПВЗ в этой области</span>
            </button>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <div className="w-full h-full overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="py-12 text-center text-xs text-[#777777] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Загрузка пунктов выдачи...</span>
                </div>
              ) : points.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#777777]">
                  Пункты выдачи СДЭК не найдены. Попробуйте поиск по городу или геолокацию.
                </div>
              ) : (
                points.map((pvz) => {
                  const active = selectedPvz?.id === pvz.id;
                  return (
                    <button
                      key={pvz.id}
                      type="button"
                      onClick={() => {
                        haptic.select();
                        setSelectedPvz(pvz);
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-colors cursor-pointer space-y-1 ${
                        active
                          ? 'bg-[#141414] border-white'
                          : 'bg-[#080808] border-[#1a1a1a] hover:border-[#333333]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {pvz.address}
                        </span>
                        {Number.isFinite(pvz.distance) && (
                          <span className="text-[10px] font-mono text-[#22c55e] shrink-0">
                            {formatDistance(pvz.distance)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#888888]">
                        <span>{pvz.city}</span>
                        {pvz.code && <span className="font-mono text-[#aaaaaa]">#{pvz.code}</span>}
                        {pvz.workTime && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{pvz.workTime}</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Selected PVZ Bottom Confirmation Bar */}
        <div className="p-3.5 border-t border-[#1c1c1c] bg-black shrink-0">
          {selectedPvz ? (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#22c55e] font-semibold">
                    <Check className="w-3 h-3" />
                    <span>Выбранный ПВЗ СДЭК</span>
                    {Number.isFinite(selectedPvz.distance) && (
                      <span className="text-[#888888] font-mono">
                        · {formatDistance(selectedPvz.distance)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-white truncate">
                    {selectedPvz.city ? `${selectedPvz.city}, ` : ''}
                    {selectedPvz.address}
                  </p>
                  {selectedPvz.workTime && (
                    <p className="text-[11px] text-[#777777] flex items-center gap-1 truncate">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{selectedPvz.workTime}</span>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={confirming}
                onClick={handleConfirmSelected}
                className="w-full py-3 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                {confirming ? 'Уточняем адрес...' : 'Выбрать этот ПВЗ'}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-[#777777] text-center py-1">
              Нажмите на зелёный маркер ПВЗ СДЭК на карте или выберите пункт в списке.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
