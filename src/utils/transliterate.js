/**
 * O'zbek tili Lotin <-> Kirill alifbolari o'rtasida konvertatsiya qilish
 */

const LATIN_TO_CYRILLIC_MAP = [
  // Murakkab harf birikmalari (oldin tekshiriladi)
  { lat: "ye", cyr: "е", latUpper: "Ye", cyrUpper: "Е" },
  { lat: "yo", cyr: "ё", latUpper: "Yo", cyrUpper: "Ё" },
  { lat: "yu", cyr: "ю", latUpper: "Yu", cyrUpper: "Ю" },
  { lat: "ya", cyr: "я", latUpper: "Ya", cyrUpper: "Я" },
  { lat: "ch", cyr: "ч", latUpper: "Ch", cyrUpper: "Ч" },
  { lat: "sh", cyr: "ш", latUpper: "Sh", cyrUpper: "Ш" },
  { lat: "o'", cyr: "ў", latUpper: "O'", cyrUpper: "Ў" },
  { lat: "oʻ", cyr: "ў", latUpper: "Oʻ", cyrUpper: "Ў" },
  { lat: "o`", cyr: "ў", latUpper: "O`", cyrUpper: "Ў" },
  { lat: "g'", cyr: "ғ", latUpper: "G'", cyrUpper: "Ғ" },
  { lat: "gʻ", cyr: "ғ", latUpper: "Gʻ", cyrUpper: "Ғ" },
  { lat: "g`", cyr: "ғ", latUpper: "G`", cyrUpper: "Ғ" },

  // Oddiy harflar
  { lat: "a", cyr: "а" },
  { lat: "b", cyr: "б" },
  { lat: "d", cyr: "д" },
  { lat: "e", cyr: "э" },
  { lat: "f", cyr: "ф" },
  { lat: "g", cyr: "г" },
  { lat: "h", cyr: "ҳ" },
  { lat: "i", cyr: "и" },
  { lat: "j", cyr: "ж" },
  { lat: "k", cyr: "к" },
  { lat: "l", cyr: "л" },
  { lat: "m", cyr: "м" },
  { lat: "n", cyr: "н" },
  { lat: "o", cyr: "о" },
  { lat: "p", cyr: "п" },
  { lat: "q", cyr: "қ" },
  { lat: "r", cyr: "р" },
  { lat: "s", cyr: "с" },
  { lat: "t", cyr: "т" },
  { lat: "u", cyr: "у" },
  { lat: "v", cyr: "в" },
  { lat: "x", cyr: "х" },
  { lat: "y", cyr: "й" },
  { lat: "z", cyr: "з" },
  { lat: "'", cyr: "ъ" },
  { lat: "ʻ", cyr: "ъ" }
];

export function latinToCyrillic(text) {
  if (!text) return "";
  let result = text;

  // So'z boshidagi 'E' / 'e' uchun qoida: so'z boshida bo'lsa 'Э' / 'э', unlidan keyin bo'lsa 'Е'/'е'
  result = result.replace(/(^|[\s\p{P}])e/gu, "$1э");
  result = result.replace(/(^|[\s\p{P}])E/gu, "$1Э");

  // Diphthongs & specific pairs first
  for (const item of LATIN_TO_CYRILLIC_MAP) {
    if (item.latUpper) {
      const regUpper = new RegExp(item.latUpper, "g");
      result = result.replace(regUpper, item.cyrUpper);
      const regAllUpper = new RegExp(item.lat.toUpperCase(), "g");
      result = result.replace(regAllUpper, item.cyrUpper);
    }
    const regLower = new RegExp(item.lat, "g");
    result = result.replace(regLower, item.cyr);
    const regSimpleUpper = new RegExp(item.lat.toUpperCase(), "g");
    result = result.replace(regSimpleUpper, item.cyr.toUpperCase());
  }

  return result;
}

const CYRILLIC_TO_LATIN_MAP = [
  { cyr: "ё", lat: "yo", cyrUpper: "Ё", latUpper: "Yo" },
  { cyr: "ю", lat: "yu", cyrUpper: "Ю", latUpper: "Yu" },
  { cyr: "я", lat: "ya", cyrUpper: "Я", latUpper: "Ya" },
  { cyr: "ч", lat: "ch", cyrUpper: "Ч", latUpper: "Ch" },
  { cyr: "ш", lat: "sh", cyrUpper: "Ш", latUpper: "Sh" },
  { cyr: "ў", lat: "o'", cyrUpper: "Ў", latUpper: "O'" },
  { cyr: "ғ", lat: "g'", cyrUpper: "Ғ", latUpper: "G'" },
  { cyr: "ц", lat: "ts", cyrUpper: "Ц", latUpper: "Ts" },

  { cyr: "а", lat: "a" },
  { cyr: "б", lat: "b" },
  { cyr: "в", lat: "v" },
  { cyr: "г", lat: "g" },
  { cyr: "д", lat: "d" },
  { cyr: "е", lat: "e" },
  { cyr: "ж", lat: "j" },
  { cyr: "з", lat: "z" },
  { cyr: "и", lat: "i" },
  { cyr: "й", lat: "y" },
  { cyr: "к", lat: "k" },
  { cyr: "қ", lat: "q" },
  { cyr: "л", lat: "l" },
  { cyr: "м", lat: "m" },
  { cyr: "н", lat: "n" },
  { cyr: "о", lat: "o" },
  { cyr: "п", lat: "p" },
  { cyr: "р", lat: "r" },
  { cyr: "с", lat: "s" },
  { cyr: "т", lat: "t" },
  { cyr: "у", lat: "u" },
  { cyr: "ф", lat: "f" },
  { cyr: "х", lat: "x" },
  { cyr: "ҳ", lat: "h" },
  { cyr: "э", lat: "e" },
  { cyr: "ъ", lat: "'" },
  { cyr: "ь", lat: "" }
];

export function cyrillicToLatin(text) {
  if (!text) return "";
  let result = text;

  for (const item of CYRILLIC_TO_LATIN_MAP) {
    if (item.cyrUpper) {
      const regUpper = new RegExp(item.cyrUpper, "g");
      result = result.replace(regUpper, item.latUpper);
    }
    const regLower = new RegExp(item.cyr, "g");
    result = result.replace(regLower, item.lat);
    const regSimpleUpper = new RegExp(item.cyr.toUpperCase(), "g");
    result = result.replace(regSimpleUpper, item.lat.toUpperCase());
  }

  return result;
}
