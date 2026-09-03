import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppStateService } from '../core/app-state.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="login-page">
      <article class="login-card">
        <div class="login-showcase" aria-hidden="true">
          <div class="showcase-glow"></div>
          <img src="assets/img/LOGOFUDY.png" alt="FUDY" class="showcase-logo" />
              </div>

        <div class="login-form-panel">
          <div class="login-brand">
            <h1>Iniciar sesion</h1>
            <p>Accede con tu usuario autorizado</p>
          </div>

          <form class="login-form" (ngSubmit)="signIn()">
            <label>
              Correo
              <input type="email" [(ngModel)]="email" name="email" placeholder="usuario@fudy.com" required />
            </label>

            <label>
              Clave
              <div class="password-field">
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  name="password"
                  placeholder="Tu clave"
                  required
                />
                <button
                  type="button"
                  class="toggle-password"
                  (click)="togglePasswordVisibility()"
                  [attr.aria-label]="showPassword() ? 'Ocultar clave' : 'Mostrar clave'"
                >
                  @if (showPassword()) {
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.5 5.3A11.8 11.8 0 0 1 12 5c5.5 0 9.4 4.4 10 5-.4.5-2.1 2.6-4.8 4" />
                      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
                      <path d="M6.2 6.2C3.8 7.8 2.4 9.5 2 10c.6.6 4.5 5 10 5a11 11 0 0 0 3.2-.4" />
                    </svg>
                  } @else {
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  }
                </button>
              </div>
            </label>

            @if (error()) {
              <p class="error">{{ error() }}</p>
            }

            <button type="submit" class="login-submit" [disabled]="isSubmitting()">
              @if (isSubmitting()) {
                <span class="login-submit-content">
                  <span class="login-spinner" aria-hidden="true"></span>
                  <span>Entrando...</span>
                </span>
              } @else {
                <span>Entrar</span>
              }
            </button>
          </form>
        </div>
      </article>
    </section>
  `,
  styles: `
    .login-page {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 1.1rem;
      background:
        radial-gradient(circle at 10% 8%, #baffc7 0%, transparent 36%),
        radial-gradient(circle at 95% 15%, #fff4cf 0%, transparent 34%),
        linear-gradient(135deg, #f1ffea 0%, #effff7 48%, #fdf8e8 100%);
    }

    .login-card {
      width: min(860px, 100%);
      min-height: 440px;
      border-radius: 1.35rem;
      border: 1px solid #d2def8;
      background: #f5f9ff;
      box-shadow: 0 34px 70px rgba(53, 72, 119, 0.23);
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      position: relative;
      overflow: hidden;
    }

    .login-showcase {
      background:
        radial-gradient(circle at 16% 24%, rgba(86, 214, 118, 0.22) 0%, transparent 42%),
        radial-gradient(circle at 84% 78%, rgba(34, 175, 91, 0.18) 0%, transparent 38%),
        linear-gradient(145deg, #ffffff 0%, #f3fff5 55%, #ebfff0 100%);
      color: #2d5d3b;
      padding: 1.5rem;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 1rem;
      position: relative;
      border-right: 1px solid #d7ebdc;
    }

    .showcase-glow {
      position: absolute;
      width: 260px;
      height: 260px;
      border-radius: 50%;
      left: -130px;
      bottom: -120px;
      background: rgba(74, 204, 109, 0.13);
    }

    .showcase-logo {
      width: min(340px, 90%);
      max-height: 220px;
      object-fit: contain;
      filter: drop-shadow(0 14px 24px rgba(37, 104, 58, 0.2));
      z-index: 1;
    }

    .login-showcase p {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      z-index: 1;
      color: #2e6a41;
    }

    .login-form-panel {
      background: #ffffff;
      padding: 1.35rem 1.2rem;
      display: grid;
      align-content: center;
      border-left: 1px solid #e4ecff;
    }

    .login-brand {
      display: grid;
      gap: 0.2rem;
      margin-bottom: 1rem;
    }

    .login-brand h1 {
      margin: 0;
      font-size: 1.55rem;
      color: #1f2a4e;
      letter-spacing: 0.01em;
    }

    .login-brand p {
      margin: 0;
      color: #647098;
      font-size: 0.88rem;
    }

    .login-form {
      display: grid;
      gap: 0.9rem;
    }

    .login-form label {
      display: grid;
      gap: 0.35rem;
      color: #4f5a82;
      font-size: 0.9rem;
      font-weight: 700;
    }

    .login-form input {
      min-height: 46px;
      border-radius: 0.8rem;
      border: 1px solid #d8e4ff;
      background: #fff;
      padding: 0.68rem 0.75rem;
      font-size: 0.94rem;
      color: #2a355d;
    }

    .login-form input:focus {
      outline: none;
      border-color: #7bcf8f;
      box-shadow: 0 0 0 3px rgba(123, 207, 143, 0.24);
    }

    .password-field {
      position: relative;
      display: grid;
    }

    .password-field input {
      padding-right: 3.2rem;
    }

    .toggle-password {
      position: absolute;
      right: 0.42rem;
      top: 50%;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      border-radius: 0.65rem;
      border: 1px solid #dce6ff;
      background: #f5f8ff;
      color: #3f4c78;
      display: grid;
      place-items: center;
      padding: 0;
    }

    .toggle-password svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .error {
      margin: 0;
      color: #a93f45;
      font-size: 0.84rem;
      font-weight: 700;
      background: #fff3f3;
      border: 1px solid #ffd6d6;
      border-radius: 0.7rem;
      padding: 0.55rem 0.6rem;
    }

    .login-submit {
      min-height: 48px;
      border-radius: 0.9rem;
      font-size: 0.96rem;
      font-weight: 900;
      letter-spacing: 0.02em;
      background: linear-gradient(135deg, #08d620 0%, #17b136 100%);
      border: 1px solid transparent;
      color: #fff;
      box-shadow: 0 16px 28px rgba(7, 149, 40, 0.27);
    }

    .login-submit[disabled] {
      opacity: 0.88;
      cursor: wait;
    }

    .login-submit-content {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
    }

    .login-spinner {
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: #fff;
      animation: login-spin 0.8s linear infinite;
    }

    @keyframes login-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 860px) {
      .login-card {
        grid-template-columns: 1fr;
        min-height: 0;
      }

      .login-showcase {
        min-height: 180px;
        padding: 1.1rem;
      }

      .showcase-logo {
        width: min(240px, 78%);
        max-height: 140px;
      }

      .login-form-panel {
        border-left: 0;
        border-top: 1px solid #e4ecff;
      }
    }

    @media (max-width: 520px) {
      .login-form-panel {
        padding: 1rem;
      }
    }
  `
})
export class LoginPageComponent {
  private readonly state = inject(AppStateService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  email = '';
  password = '';

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  async signIn(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }

    this.error.set('');
    this.isSubmitting.set(true);

    const result = await Promise.race([
      this.state.signIn(this.email, this.password),
      new Promise<'network_error'>((resolve) => {
        setTimeout(() => resolve('network_error'), 30_000);
      })
    ]).catch(() => 'network_error' as const);

    this.isSubmitting.set(false);

    if (result === 'invalid_credentials') {
      this.error.set('Credenciales invalidas. Revisa correo y clave.');
      return;
    }

    if (result !== 'success') {
      this.error.set('Error de red. Revisa la conexion e intenta de nuevo.');
      return;
    }

    this.error.set('');
    this.password = '';

    if (this.state.canAccessModule('dashboard')) {
      void this.router.navigate(['/dashboard']);
      return;
    }

    if (this.state.canAccessModule('operacion')) {
      void this.router.navigate(['/operacion']);
      return;
    }

    if (this.state.canAccessModule('comandas')) {
      void this.router.navigate(['/comandas']);
      return;
    }

    void this.router.navigate(['/login']);
  }
}