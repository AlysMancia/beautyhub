'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
export { formatAddress } from '../lib/format';

const MapPin = dynamic(() => import('./MapPin'), { ssr: false, loading: () => <div className="map-box loading">Loading map…</div> });

const fetchList = async (path) => {
  const response = await fetch(`/api/psgc/${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || 'Could not load addresses.');
  return data;
};

const geocode = async (q) => {
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

/**
 * Philippine address picker (Region → Province → City/Municipality → Barangay)
 * from PSGC, plus postal code, street address and a map pin.
 * `value` / `onChange` use the same field names as the stores table.
 */
export default function LocationPicker({ value, onChange }) {
  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState(null); // null = not loaded, [] = region has none (NCR)
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [mapCenter, setMapCenter] = useState(null);
  const [locating, setLocating] = useState(false);

  const set = (patch) => onChange({ ...value, ...patch });

  const load = async (what, path, setter) => {
    setLoading(what);
    setError('');
    try {
      setter(await fetchList(path));
    } catch (e) {
      setError(e.message);
    }
    setLoading('');
  };

  // Initial lists for an already-saved address.
  useEffect(() => {
    load('regions', 'regions', setRegions);
    if (value.region_code) {
      fetchList(`regions/${value.region_code}/provinces`)
        .then((list) => {
          setProvinces(list);
          const cityPath = list.length === 0 || !value.province_code
            ? `regions/${value.region_code}/cities-municipalities`
            : `provinces/${value.province_code}/cities-municipalities`;
          return fetchList(cityPath).then(setCities);
        })
        .catch((e) => setError(e.message));
    }
    if (value.city_code) fetchList(`cities-municipalities/${value.city_code}/barangays`).then(setBarangays).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickRegion = async (code) => {
    const region = regions.find((r) => r.code === code);
    set({
      region_code: code, region_name: region?.name ?? '',
      province_code: '', province_name: '', city_code: '', city_name: '', barangay_code: '', barangay_name: '', postal_code: '',
    });
    setProvinces(null);
    setCities([]);
    setBarangays([]);
    if (!code) return;
    setLoading('provinces');
    try {
      const list = await fetchList(`regions/${code}/provinces`);
      setProvinces(list);
      if (list.length === 0) await load('cities', `regions/${code}/cities-municipalities`, setCities);
    } catch (e) {
      setError(e.message);
    }
    setLoading('');
  };

  const pickProvince = (code) => {
    const province = provinces.find((p) => p.code === code);
    set({ province_code: code, province_name: province?.name ?? '', city_code: '', city_name: '', barangay_code: '', barangay_name: '', postal_code: '' });
    setCities([]);
    setBarangays([]);
    if (code) load('cities', `provinces/${code}/cities-municipalities`, setCities);
  };

  const pickCity = (code) => {
    const city = cities.find((c) => c.code === code);
    set({ city_code: code, city_name: city?.name ?? '', barangay_code: '', barangay_name: '', postal_code: city?.zip_code || '' });
    setBarangays([]);
    if (!code) return;
    load('barangays', `cities-municipalities/${code}/barangays`, setBarangays);
    geocode(`${city.name}, ${value.province_name || value.region_name}, Philippines`).then((c) => c && setMapCenter(c));
  };

  const pickBarangay = (code) => {
    const brgy = barangays.find((b) => b.code === code);
    set({ barangay_code: code, barangay_name: brgy?.name ?? '' });
    if (brgy) {
      geocode(`${brgy.name}, ${value.city_name}, ${value.province_name || value.region_name}, Philippines`)
        .then((c) => c && setMapCenter(c));
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Your browser cannot share its location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        set({ latitude: c.lat, longitude: c.lng });
        setMapCenter(c);
        setLocating(false);
      },
      () => {
        setError('Could not get your location. You can place the pin on the map instead.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const hasProvinces = provinces === null || provinces.length > 0;
  const pin = value.latitude != null && value.longitude != null ? { lat: Number(value.latitude), lng: Number(value.longitude) } : null;

  const select = (label, current, items, onPick, { disabled, busy, placeholder }) => (
    <label>
      {label}
      <select className="dash-select full" value={current || ''} onChange={(e) => onPick(e.target.value)} disabled={disabled || busy}>
        <option value="">{busy ? 'Loading…' : placeholder}</option>
        {items.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="location-picker">
      <div className="form-grid">
        {select('Region *', value.region_code, regions, pickRegion, { busy: loading === 'regions', placeholder: 'Choose region…' })}
        {hasProvinces
          ? select('Province *', value.province_code, provinces ?? [], pickProvince, {
              disabled: !value.region_code, busy: loading === 'provinces', placeholder: 'Choose province…',
            })
          : (
            <label>
              Province
              <input className="dash-input" value="None (Metro Manila)" disabled />
            </label>
          )}
        {select('City / Municipality *', value.city_code, cities, pickCity, {
          disabled: hasProvinces ? !value.province_code : !value.region_code, busy: loading === 'cities', placeholder: 'Choose city…',
        })}
        {select('Barangay *', value.barangay_code, barangays, pickBarangay, {
          disabled: !value.city_code, busy: loading === 'barangays', placeholder: 'Choose barangay…',
        })}
        <label>
          Postal code
          <input
            className="dash-input"
            inputMode="numeric"
            maxLength={4}
            value={value.postal_code || ''}
            onChange={(e) => set({ postal_code: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 4027"
          />
          <small className="muted">Filled in from your city. Please check it, as some are missing or outdated.</small>
        </label>
        <label>
          House no. / street / building
          <input
            className="dash-input"
            maxLength={255}
            value={value.street_address || ''}
            onChange={(e) => set({ street_address: e.target.value })}
            placeholder="e.g. Unit 2, 123 Rizal St."
          />
        </label>
      </div>

      <div className="map-head">
        <div>
          <strong>Exact location</strong>
          <p className="muted" style={{ margin: 0 }}>
            {pin ? 'Drag the pin to adjust.' : 'Click the map where your store is, or use your current location.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="dash-btn small ghost" onClick={useMyLocation} disabled={locating}>
            <i className="fa-solid fa-location-crosshairs" /> {locating ? 'Locating…' : 'Use my current location'}
          </button>
          {pin && (
            <button type="button" className="dash-btn small ghost" onClick={() => set({ latitude: null, longitude: null })}>
              Remove pin
            </button>
          )}
        </div>
      </div>
      <MapPin value={pin} center={mapCenter} onChange={(p) => set({ latitude: p.lat, longitude: p.lng })} />
      {pin && <p className="muted" style={{ margin: '6px 0 0' }}>Pinned at {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</p>}

      {error && <p className="dash-error">{error}</p>}
    </div>
  );
}
