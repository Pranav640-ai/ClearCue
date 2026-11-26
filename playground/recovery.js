/* ClearCue Accessibility Playground — Stage 5 recovery workflows.
 *
 * The defects are deliberate: visual-only errors, a visual-only success panel,
 * an aria-hidden toast and an ambiguous account error summary. This file never
 * contacts a network and never stores field values outside the page.
 */
(function () {
  "use strict";

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* ------------------------------------------------------- Scholarship flagship */
  function initScholarshipRecovery() {
    var form = document.getElementById("scholarship-form");
    if (!form) return;

    var number = document.getElementById("reg-number");
    var email = document.getElementById("applicant-email");
    var summary = document.getElementById("reg-summary");
    var summaryList = document.getElementById("reg-summary-list");
    var numberError = document.getElementById("reg-error");
    var emailError = document.getElementById("email-error");
    var success = document.getElementById("reg-success");
    var toggle = form.querySelector('[data-action="toggle-accessible"]');
    var note = document.getElementById("comparison-note");
    var accessible = false;
    var helpToggle = document.getElementById("scholarship-help-toggle");
    var help = document.getElementById("scholarship-help");
    helpToggle.addEventListener("click", function () {
      help.hidden = !help.hidden;
      helpToggle.setAttribute("aria-expanded", String(!help.hidden));
    });

    function setAccessible(on) {
      accessible = on;
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.textContent = "Accessible comparison: " + (on ? "on" : "off");
      note.textContent = on
        ? "Accessible version: the error summary is a real alert, focus moves to it, and the success panel is a status region. ClearCue must not repeat either announcement."
        : "Inaccessible version: errors and success are visual only, with no live region and no focus move.";
      if (on) {
        summary.setAttribute("role", "alert");
        summary.setAttribute("aria-live", "assertive");
        success.setAttribute("role", "status");
        success.setAttribute("aria-live", "polite");
      } else {
        summary.removeAttribute("role");
        summary.removeAttribute("aria-live");
        success.removeAttribute("role");
        success.removeAttribute("aria-live");
      }
    }

    function clearErrors() {
      summary.hidden = true;
      summaryList.innerHTML = "";
      numberError.hidden = true;
      emailError.hidden = true;
      number.removeAttribute("aria-invalid");
      email.removeAttribute("aria-invalid");
    }

    function showErrors(messages, invalid) {
      summaryList.innerHTML = "";
      messages.forEach(function (message) {
        var item = document.createElement("li");
        item.textContent = message;
        summaryList.appendChild(item);
      });
      numberError.hidden = !invalid.number;
      emailError.hidden = !invalid.email;
      if (invalid.number) number.setAttribute("aria-invalid", "true");
      else number.removeAttribute("aria-invalid");
      if (invalid.email) email.setAttribute("aria-invalid", "true");
      else email.removeAttribute("aria-invalid");
      summary.hidden = false;
      if (accessible) {
        summary.setAttribute("tabindex", "-1");
        summary.focus();
      }
    }

    function validate() {
      var messages = [];
      var numberValue = number.value.trim();
      var emailValue = email.value.trim();
      var numberInvalid = !/^NF-[A-Z0-9]{5}$/i.test(numberValue);
      var emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
      if (numberInvalid) {
        messages.push("Enter the eight-character registration number from your invitation.");
      }
      if (emailInvalid) {
        messages.push("Enter an email address in the format name@example.com.");
      }
      if (messages.length > 0) {
        showErrors(messages, { number: numberInvalid, email: emailInvalid });
        return false;
      }
      clearErrors();
      return true;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validate()) return;
      form.hidden = true;
      success.hidden = false;
      if (accessible) {
        var heading = success.querySelector("h2");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus();
        }
      }
    });

    form.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action]");
      if (!button) return;
      var action = button.dataset.action;
      if (action === "toggle-accessible") {
        setAccessible(!accessible);
      } else if (action === "reset-scholarship" || button.closest("#reg-success")) {
        form.hidden = false;
        success.hidden = true;
        number.value = "";
        email.value = "";
        clearErrors();
        var heading = document.getElementById("scholarship-heading");
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus();
        }
      }
    });

    success.addEventListener("click", function (event) {
      if (!event.target.closest('[data-action="reset-scholarship"]')) return;
      form.hidden = false;
      success.hidden = true;
      number.value = "";
      email.value = "";
      clearErrors();
    });
  }

  /* ------------------------------------------------------------- Shopping toast */
  function initShoppingRecovery() {
    var buttons = qsa("[data-add-item]");
    if (buttons.length === 0) return;

    var toast = document.getElementById("cart-toast");
    var count = document.getElementById("cart-count");
    var items = 0;
    var timer = null;

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var item = button.dataset.addItem;
        if (item === "soldout") {
          toast.textContent = "Sorry, this item is sold out. It could not be added.";
        } else {
          items += 1;
          count.textContent = items + (items === 1 ? " item" : " items");
          toast.textContent = item === "blanket" ? "Wool blanket added to your basket." : "Driftwood lantern added to your basket.";
        }
        toast.hidden = false;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          toast.hidden = true;
        }, 6000);
      });
    });
  }

  /* --------------------------------------------------------- Account ambiguity */
  function initAccountRecovery() {
    var form = document.getElementById("account-recovery-form");
    if (!form) return;

    var email = document.getElementById("account-email");
    var phone = document.getElementById("account-phone");
    var summary = document.getElementById("account-summary");
    var saved = document.getElementById("account-saved");

    function reset() {
      summary.hidden = true;
      saved.hidden = true;
      email.removeAttribute("aria-invalid");
      phone.removeAttribute("aria-invalid");
      email.value = "";
      phone.value = "";
      email.closest(".field-row").classList.remove("field-invalid");
      phone.closest(".field-row").classList.remove("field-invalid");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var missing = !email.value.trim() || !phone.value.trim();
      saved.hidden = true;
      if (missing) {
        // No aria-describedby and no aria-invalid on either field. The summary
        // names two possible fields, so ClearCue must not choose one.
        summary.hidden = false;
        if (!email.value.trim()) email.closest(".field-row").classList.add("field-invalid");
        if (!phone.value.trim()) phone.closest(".field-row").classList.add("field-invalid");
        return;
      }
      summary.hidden = true;
      email.closest(".field-row").classList.remove("field-invalid");
      phone.closest(".field-row").classList.remove("field-invalid");
      saved.hidden = false;
    });

    form.addEventListener("click", function (event) {
      if (event.target.closest('[data-action="reset-account"]')) reset();
    });
  }

  initScholarshipRecovery();
  initShoppingRecovery();
  initAccountRecovery();
})();
