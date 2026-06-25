const KEY = "saved_address";

export type SavedAddress = {
  name: string;
  phone: string;
  address: string;
  cityId: number;
  cityName: string;
  zoneId: number;
  zoneName: string;
  areaId: number | null;
  areaName: string | null;
};

export function getSavedAddress(): SavedAddress | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}

export function saveAddress(a: SavedAddress) {
  localStorage.setItem(KEY, JSON.stringify(a));
}

export function clearSavedAddress() {
  localStorage.removeItem(KEY);
}
