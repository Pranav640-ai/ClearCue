const permit = document.getElementById("permit");
const feedback = document.getElementById("permit-feedback");
const code = document.getElementById("ferry-code");
permit.addEventListener("submit", (event) => {
  event.preventDefault();
  feedback.hidden = true;
  setTimeout(() => {
    code.setAttribute("aria-invalid", "true");
    feedback.hidden = false;
  }, 125);
});
document.getElementById("send-receipt").addEventListener("click", () => {
  document.getElementById("receipt-status").textContent = "Receipt uploaded successfully.";
});
document.getElementById("tick").addEventListener("click", () => {
  document.getElementById("clock").textContent = "10:01";
});
