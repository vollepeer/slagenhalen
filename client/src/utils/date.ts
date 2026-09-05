const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timezonePattern = /(Z|[+-]\d{2}:?\d{2})$/;

const pad = (value: number) => value.toString().padStart(2, "0");

export function formatEventDate(value: string) {
  if (!value) return "";

  if (dateOnlyPattern.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const useUtc = timezonePattern.test(normalized);
  const day = pad(useUtc ? date.getUTCDate() : date.getDate());
  const month = pad(useUtc ? date.getUTCMonth() + 1 : date.getMonth() + 1);
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const hours = pad(useUtc ? date.getUTCHours() : date.getHours());
  const minutes = pad(useUtc ? date.getUTCMinutes() : date.getMinutes());

  return `${day}/${month}/${year} - ${hours}u${minutes}`;
}
