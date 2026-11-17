import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';

import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { SupabaseService } from '@core/services/supabase.service';
import { mensajeErrorAuth } from '@shared/utils/auth-error.util';

/**
 * Pagina puente del login con Google en la WEB.
 *
 * Google redirige a `http://localhost:8100/auth/callback?code=...`.
 * El cliente de Supabase (creado con `detectSessionInUrl: true` en web) suele
 * canjear el `code` automaticamente; aqui lo forzamos ademas de forma explicita
 * para no depender del timing, y luego navegamos segun haya sesion o no.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content class="callback">
      <div class="box">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Conectando con Google...</p>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .callback {
        --background: var(--rod-bg-base);
      }
      .box {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        color: var(--rod-text-secondary);
        font-family: var(--rod-font-body);
      }
      ion-spinner {
        --color: var(--ion-color-primary);
        transform: scale(1.4);
      }
    `,
  ],
})
export class CallbackPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      // Supabase devuelve los errores (p. ej. otp_expired) en la query o en el hash.
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const errorParam =
        url.searchParams.get('error_description') ??
        hash.get('error_description') ??
        url.searchParams.get('error') ??
        hash.get('error');

      if (errorParam) throw new Error(errorParam);

      if (code) {
        // Idempotente: si el SDK (detectSessionInUrl) ya canjeo el codigo, esto
        // falla y comprobamos la sesion abajo.
        const { error } = await this.supabase.client.auth.exchangeCodeForSession(code);
        if (error) console.warn('[CallbackPage] exchangeCodeForSession:', error.message);
      }

      const { data } = await this.supabase.client.auth.getSession();
      // Un enlace de "recuperar contrasena" que aterriza aqui (en vez de en
      // /auth/restablecer) se redirige a la pantalla de nueva contrasena.
      const destino = !data.session
        ? '/login'
        : this.auth.enRecuperacion()
          ? '/auth/restablecer'
          : '/app/inicio';
      await this.router.navigateByUrl(destino, { replaceUrl: true });
    } catch (error) {
      console.error('[CallbackPage]', error);
      await this.notify.error(mensajeErrorAuth(error));
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }
}
