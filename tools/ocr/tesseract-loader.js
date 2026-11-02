// Klassischer Worker vor dem tesseract.js-Worker (kein Modul, tesseract nutzt importScripts).
// tesseract.js lädt Sprachdaten als `${langPath}/${lang}.traineddata.gz`. Vite hängt an
// ausgelieferte Dateien aber einen Hash an, deshalb biegt dieser Lader die Anfragen auf die
// echten, selbst ausgelieferten URLs um. Konfiguration kommt als JSON im URL-Fragment.
(() => {
  const config = JSON.parse(decodeURIComponent(self.location.hash.slice(1)));
  const files = config.files;
  const nativeFetch = self.fetch.bind(self);
  self.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const name = url.split("/").pop();
    if (!Object.hasOwn(files, name)) return Promise.reject(new Error(`Unbekannte Datei: ${name}`));
    return nativeFetch(files[name], init);
  };
  self.importScripts(config.worker);
})();
