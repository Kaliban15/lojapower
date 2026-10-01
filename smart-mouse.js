(() => {
  const downloadButton = document.querySelector("#downloadButton");
  const status = document.querySelector("#downloadStatus");
  const currentYear = document.querySelector("#currentYear");

  if (currentYear) currentYear.textContent = String(new Date().getFullYear());

  downloadButton?.addEventListener("click", () => {
    status.textContent = "Download iniciado. Verifique a pasta de downloads do navegador.";
    window.setTimeout(() => {
      status.textContent = "";
    }, 9000);
  });
})();
