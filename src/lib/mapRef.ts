import type L from "leaflet";

let _map: L.Map | null = null;

export function setMapInstance(map: L.Map) {
  _map = map;
}

export function getMapInstance(): L.Map | null {
  return _map;
}
