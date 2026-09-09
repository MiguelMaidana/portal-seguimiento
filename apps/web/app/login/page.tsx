import { LoginForm } from "./LoginForm";

export const metadata = { title: "Ingresar · Tablero" };

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow narrow">Acceso personal</p>
        <h1>Tablero</h1>
        <p>Ingresá para consultar y actualizar tu seguimiento.</p>
        <LoginForm />
      </section>
    </main>
  );
}
