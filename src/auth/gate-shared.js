// Teile des Passwortschutzes, die auch die Login-Seite im Browser braucht.

/** Nur relative Pfade auf derselben Seite als Rücksprungziel (kein Open Redirect). */
export function safeNext(value) {
  return typeof value === "string" && /^\/(?!\/)[^\\\s]*$/.test(value) ? value : "/";
}
