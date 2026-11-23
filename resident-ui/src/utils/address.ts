/** "Hoofdstraat 12 A, 3511 AB Utrecht", or null when there is no address. */
export const formatAddress = (address: {
  street_name: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  zip_code: string | null;
  city: string | null;
}): string | null => {
  if (!address.street_name) return null;
  const line = [address.street_name, [address.house_number, address.house_number_suffix].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' ');
  const place = [address.zip_code, address.city].filter(Boolean).join(' ');
  return place ? `${line}, ${place}` : line;
};
