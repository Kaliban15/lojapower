(() => {
  const WA_URL = "https://wa.me/+5511948609350?text=Ol%C3%A1%2C%20vim%20da%20Loja%20Powertech%20e%20gostaria%20de%20informa%C3%A7%C3%B5es%2C%20pode%20me%20ajudar%3F";

  function shouldOffsetForSticky() {
    const sticky = document.querySelector(".sticky-checkout");
    if (!sticky) return false;
    const styles = window.getComputedStyle(sticky);
    if (styles.display === "none") return false;
    return styles.position === "fixed";
  }

  function createButton() {
    if (!document.body || document.querySelector(".wa-float")) return;

    const button = document.createElement("a");
    button.className = "wa-float";
    button.href = WA_URL;
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    button.setAttribute("aria-label", "Falar no WhatsApp");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.48 0 .12 5.35.12 11.93c0 2.1.55 4.14 1.6 5.94L0 24l6.3-1.65a11.8 11.8 0 0 0 5.65 1.44h.01c6.57 0 11.93-5.35 11.93-11.93 0-3.18-1.24-6.17-3.37-8.38Zm-8.56 18.3h-.01a9.88 9.88 0 0 1-5.02-1.37l-.36-.22-3.74.98 1-3.65-.23-.37a9.9 9.9 0 0 1-1.52-5.23C2.08 6.44 6.5 2.02 11.97 2.02c2.64 0 5.1 1.03 6.97 2.9a9.8 9.8 0 0 1 2.89 6.97c0 5.48-4.42 9.9-9.87 9.9Zm5.43-7.43c-.3-.15-1.8-.89-2.07-.99-.28-.1-.48-.15-.68.15-.2.3-.78.99-.95 1.19-.18.2-.35.22-.65.07-.3-.15-1.24-.46-2.37-1.46a8.77 8.77 0 0 1-1.64-2.04c-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.68-1.64-.93-2.25-.24-.58-.49-.5-.68-.5h-.58c-.2 0-.52.08-.79.37-.27.3-1.03 1.01-1.03 2.47s1.05 2.87 1.2 3.07c.15.2 2.04 3.11 4.95 4.36.69.3 1.23.48 1.66.62.7.23 1.33.2 1.84.12.56-.08 1.8-.74 2.05-1.45.25-.72.25-1.33.17-1.45-.08-.13-.27-.2-.57-.35Z" />
      </svg>
    `;

    document.body.appendChild(button);

    const updateOffset = () => {
      button.classList.toggle("wa-float--offset", shouldOffsetForSticky());
    };

    updateOffset();
    window.addEventListener("resize", updateOffset, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButton, { once: true });
  } else {
    createButton();
  }
})();
