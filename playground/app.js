/* ClearCue Accessibility Playground — shared interactions.
 *
 * Deliberate, documented defects are reproduced here where they are behavioural
 * (silent updates, missing announcements). Structural defects live in the HTML.
 * Nothing here contacts a network or stores data beyond this page's lifetime.
 */
(function () {
  "use strict";

  var page = document.body.dataset.page;

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function money(value) {
    return "£" + value.toFixed(2);
  }

  /* ---------------------------------------------------------------- Scholarship */
  function initScholarship() {
    var form = document.getElementById("application");
    if (!form) return;

    var steps = qsa("[data-step]", form);
    var progress = qsa("[data-progress]");
    var errorBox = document.getElementById("form-error");
    var errorList = document.getElementById("form-error-list");
    var success = document.getElementById("success");
    var nameInput = document.getElementById("full-name");
    var emailInput = document.getElementById("email");
    var dobInput = document.getElementById("dob");
    var statement = document.getElementById("statement");
    var wordCount = document.getElementById("word-count");
    var transcript = document.getElementById("transcript");
    var fileRow = document.getElementById("file-row");
    var fileName = document.getElementById("file-name");

    function showStep(step) {
      steps.forEach(function (section) {
        section.hidden = Number(section.dataset.step) !== step;
      });
      progress.forEach(function (item) {
        if (Number(item.dataset.progress) === step) {
          item.setAttribute("aria-current", "step");
        } else {
          item.removeAttribute("aria-current");
        }
      });
      var heading = form.querySelector('[data-step="' + step + '"] h2');
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: false });
      }
    }

    function clearErrors() {
      errorBox.hidden = true;
      errorList.innerHTML = "";
      [nameInput, emailInput].forEach(function (input) {
        input.removeAttribute("aria-invalid");
      });
    }

    /* D-03: the summary appears but is not a live region and focus does not move. */
    function showErrors(messages) {
      errorList.innerHTML = "";
      messages.forEach(function (message) {
        var item = document.createElement("li");
        item.textContent = message;
        errorList.appendChild(item);
      });
      errorBox.hidden = false;
    }

    function validateStepOne() {
      var messages = [];
      if (!nameInput.value.trim()) {
        messages.push("Enter your full name.");
        nameInput.setAttribute("aria-invalid", "true");
      }
      if (!emailInput.value.trim()) {
        messages.push("Enter your email address.");
        emailInput.setAttribute("aria-invalid", "true");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) {
        messages.push("Enter an email address in the format name@example.com.");
        emailInput.setAttribute("aria-invalid", "true");
      }
      if (messages.length > 0) {
        showErrors(messages);
        return false;
      }
      clearErrors();
      return true;
    }

    function renderReview() {
      document.getElementById("review-name").textContent = nameInput.value.trim() || "—";
      document.getElementById("review-email").textContent = emailInput.value.trim() || "—";
      document.getElementById("review-dob").textContent = dobInput.value || "Not provided";
      document.getElementById("review-statement").textContent = statement.value.trim() || "Not provided";
    }

    statement.addEventListener("input", function () {
      var words = statement.value.trim() ? statement.value.trim().split(/\s+/).length : 0;
      wordCount.textContent = words + " of 400 words";
    });

    transcript.addEventListener("change", function () {
      if (transcript.files && transcript.files.length > 0) {
        fileName.textContent = transcript.files[0].name;
        fileRow.hidden = false;
      } else {
        fileRow.hidden = true;
      }
    });

    form.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action]");
      if (!button) return;
      var action = button.dataset.action;

      if (action === "next") {
        var active = steps.find(function (section) {
          return !section.hidden;
        });
        var step = active ? Number(active.dataset.step) : 1;
        if (step === 1 && !validateStepOne()) return;
        showStep(step + 1);
      } else if (action === "back") {
        var current = steps.find(function (section) {
          return !section.hidden;
        });
        showStep(Math.max(1, (current ? Number(current.dataset.step) : 2) - 1));
      } else if (action === "remove-file") {
        transcript.value = "";
        fileRow.hidden = true;
        /* D-04: an icon-only control; nothing announces that the file was removed. */
      } else if (action === "submit") {
        if (!validateStepOne()) {
          showStep(1);
          return;
        }
        document.getElementById("success-name").textContent = nameInput.value.trim();
        document.getElementById("success-email").textContent = emailInput.value.trim();
        form.hidden = true;
        success.hidden = false;
        /* D-06: the focused submit button disappears and nothing is announced. */
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  }

  /* ------------------------------------------------------------------- Shopping */
  function initShopping() {
    if (!document.getElementById("basket-list")) return;

    var catalogue = {
      lantern: { name: "Driftwood lantern", price: 38 },
      blanket: { name: "Harbour wool blanket", price: 64 },
      mug: { name: "Field enamel mug", price: 14.5 },
    };
    var basket = {};
    var list = document.getElementById("basket-list");
    var total = document.getElementById("basket-total");
    var toast = document.getElementById("toast");
    var toastTimer = null;

    function render() {
      var ids = Object.keys(basket);
      list.innerHTML = "";

      if (ids.length === 0) {
        var empty = document.createElement("li");
        empty.className = "hint";
        empty.textContent = "Nothing in the basket yet.";
        list.appendChild(empty);
      }

      ids.forEach(function (id) {
        var product = catalogue[id];
        var item = document.createElement("li");

        var label = document.createElement("span");
        label.textContent = product.name + " × " + basket[id];

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button-link";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", "Remove " + product.name + " from basket");
        remove.addEventListener("click", function () {
          delete basket[id];
          render();
        });

        item.appendChild(label);
        item.appendChild(remove);
        list.appendChild(item);
      });

      var sum = ids.reduce(function (accumulator, id) {
        return accumulator + catalogue[id].price * basket[id];
      }, 0);
      /* D-08: total changes without any live region. */
      total.textContent = money(sum);
    }

    function showToast() {
      /* D-09: visual toast only; aria-hidden and no live region. */
      toast.hidden = false;
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () {
        toast.hidden = true;
      }, 2200);
    }

    document.addEventListener("click", function (event) {
      var addButton = event.target.closest("[data-add]");
      if (addButton) {
        var id = addButton.dataset.add;
        var select = document.querySelector('[data-qty="' + id + '"]');
        var quantity = select ? Number(select.value) : 1;
        basket[id] = (basket[id] || 0) + quantity;
        render();
        showToast();
        return;
      }

      var actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;

      if (actionButton.dataset.action === "checkout") {
        document.getElementById("checkout-note").textContent = Object.keys(basket).length
          ? "Checkout is demonstration-only. No order was placed."
          : "Your basket is empty, so there is nothing to check out.";
      } else if (actionButton.dataset.action === "reset") {
        basket = {};
        render();
        toast.hidden = true;
        document.getElementById("checkout-note").textContent = "";
      }
    });
  }

  /* -------------------------------------------------------------------- Account */
  function initAccount() {
    var form = document.getElementById("settings-form");
    if (!form) return;

    var switches = qsa("[role='switch']", form);

    function toggle(element) {
      var next = element.getAttribute("aria-checked") !== "true";
      element.setAttribute("aria-checked", String(next));
    }

    switches.forEach(function (element) {
      element.addEventListener("click", function () {
        toggle(element);
      });
      element.addEventListener("keydown", function (event) {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          toggle(element);
        }
      });
    });

    form.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-action]");
      if (!button) return;
      var action = button.dataset.action;

      if (action === "save") {
        var tick = document.getElementById("saved-tick");
        tick.hidden = false;
        /* D-12: icon-only confirmation, removed again without an announcement. */
        window.setTimeout(function () {
          tick.hidden = true;
        }, 2500);
      } else if (action === "delete") {
        if (window.confirm("Delete this account? Bookings are cancelled and this cannot be undone.")) {
          document.getElementById("delete-note").textContent = "Account scheduled for deletion. This is a demonstration, so nothing was deleted.";
        }
      } else if (action === "reset") {
        window.location.reload();
      }
    });
  }

  var resetters = qsa("[data-action='reset']");
  resetters.forEach(function (button) {
    button.addEventListener("click", function () {
      if (page === "shopping") return; // handled by the page-specific handler
      window.location.reload();
    });
  });

  if (page === "scholarship") initScholarship();
  if (page === "shopping") initShopping();
  if (page === "account") initAccount();
})();
