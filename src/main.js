// Navegação entre telas: mostra a tela pedida e esconde as outras.

const screens = document.querySelectorAll(".screen");

function showScreen(id) {
  for (const screen of screens) {
    screen.hidden = screen.id !== id;
  }
}

// Todo botão com data-goto leva para a tela indicada.
for (const button of document.querySelectorAll("[data-goto]")) {
  button.addEventListener("click", () => showScreen(button.dataset.goto));
}
