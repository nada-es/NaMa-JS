document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form-presupuesto");
  const totalSpan = document.getElementById("total");
  const productoSelect = document.getElementById("producto");
  const plazoInput = document.getElementById("plazo");
  const extras = document.querySelectorAll(".extra");
  const condiciones = document.getElementById("condiciones");
  const mensaje = document.getElementById("mensaje-resultado");

  function soloLetras(valor) {
    return /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(valor);
  }

  function soloNumeros(valor) {
    return /^[0-9]+$/.test(valor);
  }

  function validarContacto() {
    let ok = true;
    const nombre = document.getElementById("nombre");
    const apellidos = document.getElementById("apellidos");
    const telefono = document.getElementById("telefono");
    const email = document.getElementById("email");

    if (!soloLetras(nombre.value) || nombre.value.length > 15) {
      ok = false;
      nombre.classList.add("error");
    } else {
      nombre.classList.remove("error");
    }

    if (!soloLetras(apellidos.value) || apellidos.value.length > 40) {
      ok = false;
      apellidos.classList.add("error");
    } else {
      apellidos.classList.remove("error");
    }

    if (!soloNumeros(telefono.value) || telefono.value.length > 9) {
      ok = false;
      telefono.classList.add("error");
    } else {
      telefono.classList.remove("error");
    }

    const emailReg = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailReg.test(email.value)) {
      ok = false;
      email.classList.add("error");
    } else {
      email.classList.remove("error");
    }

    return ok;
  }

  function calcularPresupuesto() {
    let base = parseFloat(
      productoSelect.options[productoSelect.selectedIndex].dataset.precio
    );

    extras.forEach(chk => {
      if (chk.checked) {
        base += parseFloat(chk.dataset.precio);
      }
    });

    const plazo = parseInt(plazoInput.value || "0", 10);
    let descuento = 0;

    if (plazo >= 12 && plazo < 18) {
      descuento = 0.05;
    } else if (plazo >= 18) {
      descuento = 0.1;
    }

    const total = base - base * descuento;
    totalSpan.textContent = total.toFixed(2);
  }

  productoSelect.addEventListener("change", calcularPresupuesto);
  plazoInput.addEventListener("input", calcularPresupuesto);
  extras.forEach(chk => chk.addEventListener("change", calcularPresupuesto));

  calcularPresupuesto();

  form.addEventListener("submit", e => {
    e.preventDefault();
    // reset message classes
    mensaje.classList.remove('msg-error','msg-success');
    mensaje.textContent = "";

    const valido = validarContacto();
    if (!valido) {
      mensaje.textContent = "Revisa los datos de contacto.";
      mensaje.classList.add('msg-error');
      return;
    }

    if (!condiciones.checked) {
      mensaje.textContent = "Debes aceptar las condiciones de privacidad.";
      mensaje.classList.add('msg-error');
      return;
    }

    mensaje.textContent = "Formulario enviado correctamente (simulado).";
    mensaje.classList.add('msg-success');
  });
});
